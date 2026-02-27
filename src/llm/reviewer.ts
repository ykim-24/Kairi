import { z } from "zod";
import { getAnthropicClient } from "./client.js";
import { chunkFiles, estimateFileTokens, type FileChunk } from "./chunker.js";
import {
  buildFileAnalysisPrompt,
  buildCrossFilePrompt,
  buildUserPrompt,
} from "./prompts.js";
import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";
import type { ReviewFinding } from "../review/types.js";
import { withRetry } from "../utils/retry.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "llm-reviewer" });

const llmCommentSchema = z.object({
  path: z.string(),
  line: z.number(),
  body: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  category: z.string(),
  confidence: z.number().min(0).max(1).optional().default(0.7),
  suggestedFix: z.string().optional(),
});

const fileAnalysisResponseSchema = z.object({
  fileSummary: z.string(),
  comments: z.array(llmCommentSchema),
});

const crossFileResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(llmCommentSchema),
});

interface FileAnalysis {
  filename: string;
  summary: string;
  comments: ReviewFinding[];
}

/**
 * Two-phase LLM review:
 *   Phase 1 — Per-file: Assess each file individually for quality, patterns, issues
 *   Phase 2 — Cross-file: Analyze how changes connect, affect each other, overall flow
 */
export async function reviewWithLLM(
  files: ParsedFile[],
  config: RepoConfig,
  learningContext?: string
): Promise<{ comments: ReviewFinding[]; summary: string; chunksUsed: number }> {
  log.info({ fileCount: files.length }, "Starting two-phase LLM review");

  // Phase 1: Per-file analysis
  const fileAnalyses = await runFileAnalysis(files, config, learningContext);

  const phase1Comments = fileAnalyses.flatMap((a) => a.comments);
  let chunksUsed = fileAnalyses.length;

  // Phase 2: Cross-file analysis (only when multiple files changed)
  let crossFileSummary = "";
  let phase2Comments: ReviewFinding[] = [];

  if (files.length > 1) {
    const crossResult = await runCrossFileAnalysis(
      files,
      fileAnalyses,
      config,
      learningContext
    );
    if (crossResult) {
      crossFileSummary = crossResult.summary;
      phase2Comments = crossResult.comments;
      chunksUsed++;
    }
  }

  // Combine summaries
  const fileSummaries = fileAnalyses
    .filter((a) => a.summary)
    .map((a) => `**${a.filename}**: ${a.summary}`);

  const summaryParts: string[] = [];
  if (crossFileSummary) {
    summaryParts.push(crossFileSummary);
  }
  if (fileSummaries.length > 0) {
    summaryParts.push("\n<details><summary>Per-file analysis</summary>\n");
    summaryParts.push(...fileSummaries.map((s) => `- ${s}`));
    summaryParts.push("\n</details>");
  }

  const summary = summaryParts.join("\n") || "No significant issues found.";
  const allComments = [...phase1Comments, ...phase2Comments];

  log.info(
    {
      phase1Findings: phase1Comments.length,
      phase2Findings: phase2Comments.length,
      chunksUsed,
    },
    "Two-phase LLM review complete"
  );

  return { comments: allComments, summary, chunksUsed };
}

// ---------------------------------------------------------------------------
// Phase 1: Per-file analysis
// ---------------------------------------------------------------------------

async function runFileAnalysis(
  files: ParsedFile[],
  config: RepoConfig,
  learningContext?: string
): Promise<FileAnalysis[]> {
  const systemPrompt = buildFileAnalysisPrompt(config, learningContext);
  const analyses: FileAnalysis[] = [];

  // Chunk files — small files get grouped, large files go alone
  const chunks = chunkFiles(files, config.llm.maxTokenBudget);

  for (const chunk of chunks) {
    // If the chunk has a single file, review it solo for best per-file focus.
    // If multiple small files are in a chunk, review them together but the
    // prompt still asks for per-file assessment.
    const results = await reviewFileChunk(chunk, systemPrompt, config);
    if (results) {
      analyses.push(...results);
    }
  }

  return analyses;
}

async function reviewFileChunk(
  chunk: FileChunk,
  systemPrompt: string,
  config: RepoConfig
): Promise<FileAnalysis[] | null> {
  const userPrompt = buildUserPrompt(chunk.files);
  const client = getAnthropicClient();

  try {
    const response = await withRetry(
      () =>
        client.messages.create({
          model: config.llm.model,
          max_tokens: 4096,
          temperature: config.llm.temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      {
        maxAttempts: 2,
        retryOn: (err: any) => err?.status === 529 || err?.status === 500,
      }
    );

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseFileAnalysisResponse(text);
    if (!parsed) {
      log.warn("Failed to parse per-file LLM response");
      // Return a basic analysis for each file in the chunk
      return chunk.files.map((f) => ({
        filename: f.filename,
        summary: "",
        comments: [],
      }));
    }

    const validFiles = new Set(chunk.files.map((f) => f.filename));
    const comments: ReviewFinding[] = parsed.comments
      .filter((c) => validFiles.has(c.path))
      .map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
        source: "llm" as const,
        severity: c.severity,
        category: c.category,
        confidence: c.confidence,
        suggestedFix: c.suggestedFix,
      }));

    // If single file in chunk, assign summary directly.
    // If multiple, the summary covers all of them.
    if (chunk.files.length === 1) {
      return [{
        filename: chunk.files[0].filename,
        summary: parsed.fileSummary,
        comments,
      }];
    }

    // Multiple files in chunk: split comments by file, share the summary
    return chunk.files.map((f) => ({
      filename: f.filename,
      summary: parsed.fileSummary,
      comments: comments.filter((c) => c.path === f.filename),
    }));
  } catch (err) {
    log.error({ err }, "Per-file LLM review chunk failed");
    return null;
  }
}

function parseFileAnalysisResponse(
  text: string
): z.infer<typeof fileAnalysisResponseSchema> | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    const raw = JSON.parse(jsonStr);
    return fileAnalysisResponseSchema.parse(raw);
  } catch {
    const objectMatch = text.match(
      /\{[\s\S]*"fileSummary"[\s\S]*"comments"[\s\S]*\}/
    );
    if (objectMatch) {
      try {
        return fileAnalysisResponseSchema.parse(JSON.parse(objectMatch[0]));
      } catch {
        return null;
      }
    }
    // Fallback: try parsing as the old format (summary instead of fileSummary)
    try {
      const raw = JSON.parse(jsonStr);
      if (raw.summary && raw.comments) {
        return fileAnalysisResponseSchema.parse({
          fileSummary: raw.summary,
          comments: raw.comments,
        });
      }
    } catch {
      // ignore
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Cross-file analysis
// ---------------------------------------------------------------------------

async function runCrossFileAnalysis(
  files: ParsedFile[],
  fileAnalyses: FileAnalysis[],
  config: RepoConfig,
  learningContext?: string
): Promise<{ summary: string; comments: ReviewFinding[] } | null> {
  const systemPrompt = buildCrossFilePrompt(
    config,
    fileAnalyses.map((a) => ({
      filename: a.filename,
      summary: a.summary || "No issues found.",
    })),
    learningContext
  );

  // Build a condensed view of all files for the cross-file pass.
  // If total tokens are within budget, send all files.
  // Otherwise, truncate to fit.
  const totalTokens = files.reduce((s, f) => s + estimateFileTokens(f), 0);
  let filesToSend = files;
  if (totalTokens > config.llm.maxTokenBudget) {
    // Prioritize files that had findings in phase 1
    const filesWithFindings = new Set(
      fileAnalyses.filter((a) => a.comments.length > 0).map((a) => a.filename)
    );
    const sorted = [...files].sort((a, b) => {
      const aHas = filesWithFindings.has(a.filename) ? 1 : 0;
      const bHas = filesWithFindings.has(b.filename) ? 1 : 0;
      return bHas - aHas;
    });
    // Take files until budget is hit
    filesToSend = [];
    let tokens = 0;
    for (const f of sorted) {
      const ft = estimateFileTokens(f);
      if (tokens + ft > config.llm.maxTokenBudget) break;
      filesToSend.push(f);
      tokens += ft;
    }
  }

  if (filesToSend.length === 0) return null;

  const userPrompt = buildUserPrompt(filesToSend);
  const client = getAnthropicClient();

  try {
    const response = await withRetry(
      () =>
        client.messages.create({
          model: config.llm.model,
          max_tokens: 4096,
          temperature: config.llm.temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      {
        maxAttempts: 2,
        retryOn: (err: any) => err?.status === 529 || err?.status === 500,
      }
    );

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseCrossFileResponse(text);
    if (!parsed) {
      log.warn("Failed to parse cross-file LLM response");
      return { summary: text.slice(0, 500), comments: [] };
    }

    const validFiles = new Set(filesToSend.map((f) => f.filename));
    const comments: ReviewFinding[] = parsed.comments
      .filter((c) => validFiles.has(c.path))
      .map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
        source: "llm" as const,
        severity: c.severity,
        category: c.category,
        confidence: c.confidence,
        suggestedFix: c.suggestedFix,
      }));

    return { summary: parsed.summary, comments };
  } catch (err) {
    log.error({ err }, "Cross-file LLM review failed");
    return null;
  }
}

function parseCrossFileResponse(
  text: string
): z.infer<typeof crossFileResponseSchema> | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    return crossFileResponseSchema.parse(JSON.parse(jsonStr));
  } catch {
    const objectMatch = text.match(
      /\{[\s\S]*"summary"[\s\S]*"comments"[\s\S]*\}/
    );
    if (objectMatch) {
      try {
        return crossFileResponseSchema.parse(JSON.parse(objectMatch[0]));
      } catch {
        return null;
      }
    }
    return null;
  }
}
