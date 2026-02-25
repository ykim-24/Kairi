import { z } from "zod";
import { getAnthropicClient } from "./client.js";
import { chunkFiles, type FileChunk } from "./chunker.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";
import type { InlineComment, LLMReviewResponse } from "../review/types.js";
import { withRetry } from "../utils/retry.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "llm-reviewer" });

const llmCommentSchema = z.object({
  path: z.string(),
  line: z.number(),
  body: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  category: z.string(),
});

const llmResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(llmCommentSchema),
});

export async function reviewWithLLM(
  files: ParsedFile[],
  config: RepoConfig,
  learningContext?: string
): Promise<{ comments: InlineComment[]; summary: string; chunksUsed: number }> {
  const chunks = chunkFiles(files, config.llm.maxTokenBudget);
  log.info({ chunkCount: chunks.length, fileCount: files.length }, "Starting LLM review");

  const allComments: InlineComment[] = [];
  const summaries: string[] = [];

  const systemPrompt = buildSystemPrompt(config, learningContext);

  for (const chunk of chunks) {
    const result = await reviewChunk(chunk, systemPrompt, config);
    if (result) {
      allComments.push(...result.comments);
      summaries.push(result.summary);
    }
  }

  const summary =
    summaries.length === 1
      ? summaries[0]
      : summaries.map((s, i) => `**Part ${i + 1}:** ${s}`).join("\n\n");

  return { comments: allComments, summary, chunksUsed: chunks.length };
}

async function reviewChunk(
  chunk: FileChunk,
  systemPrompt: string,
  config: RepoConfig
): Promise<{ summary: string; comments: InlineComment[] } | null> {
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

    const parsed = parseResponse(text);
    if (!parsed) {
      log.warn("Failed to parse LLM response, using raw text as summary");
      return { summary: text.slice(0, 500), comments: [] };
    }

    // Validate line numbers exist in the actual diff
    const validFiles = new Set(chunk.files.map((f) => f.filename));
    const validComments: InlineComment[] = parsed.comments
      .filter((c) => validFiles.has(c.path))
      .map((c) => ({
        path: c.path,
        line: c.line,
        body: `\`${c.severity}\` **[${c.category}]** ${c.body}`,
        source: "llm" as const,
        severity: c.severity,
      }));

    return { summary: parsed.summary, comments: validComments };
  } catch (err) {
    log.error({ err }, "LLM review chunk failed");
    return null;
  }
}

function parseResponse(text: string): LLMReviewResponse | null {
  // Extract JSON from code block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    const raw = JSON.parse(jsonStr);
    return llmResponseSchema.parse(raw);
  } catch {
    // Try to find any JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*"summary"[\s\S]*"comments"[\s\S]*\}/);
    if (objectMatch) {
      try {
        const raw = JSON.parse(objectMatch[0]);
        return llmResponseSchema.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  }
}
