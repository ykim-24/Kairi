import { randomUUID } from "crypto";
import { getOctokit } from "../github/client.js";
import { fetchPRFiles, parseFiles, type PRContext } from "../github/pulls.js";
import { postReview, dismissPreviousReviews } from "../github/reviews.js";
import { loadRepoConfig } from "../config-loader/loader.js";
import { runRules } from "../rules/engine.js";
import { reviewWithLLM } from "../llm/reviewer.js";
import { isLearningEnabled, loadEnv } from "../config/env.js";
import {
  retrieveLearningContext,
  formatLearningContext,
} from "../learning/recall.js";
import { storeInteraction as vectorStore } from "../learning/vector-store.js";
import { storeInteraction as graphStore } from "../learning/graph-store.js";
import { extractConcepts } from "../learning/concept-extractor.js";
import { collectReviewMetrics } from "../metrics/collector.js";
import { estimateFileTokens } from "../llm/chunker.js";
import type { InlineComment, ReviewResult } from "./types.js";
import type { ParsedFile } from "../utils/diff-parser.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "orchestrator" });

export async function orchestrateReview(
  ctx: PRContext,
  isSynchronize: boolean
): Promise<void> {
  const startTime = Date.now();
  const octokit = await getOctokit(ctx.installationId);

  // 1. Load repo config
  const config = await loadRepoConfig(
    octokit,
    ctx.owner,
    ctx.repo,
    ctx.headRef
  );
  if (!config.enabled) {
    log.info({ pr: ctx.pullNumber }, "Kairi disabled for this repo");
    return;
  }

  // 2. Dismiss previous reviews on synchronize
  if (isSynchronize && config.review.dismissOnUpdate) {
    await dismissPreviousReviews(octokit, ctx);
  }

  // 3. Fetch and parse PR files
  const rawFiles = await fetchPRFiles(octokit, ctx);
  const filteredFiles = filterFiles(rawFiles, config);
  const parsedFiles = parseFiles(filteredFiles);

  if (parsedFiles.length === 0) {
    log.info({ pr: ctx.pullNumber }, "No reviewable files in PR");
    return;
  }

  // 4. Run rule engine
  const { comments: ruleComments, rulesRun } = runRules(parsedFiles, config);

  // 5. Retrieve learning context (if enabled)
  let learningPrompt: string | undefined;
  const env = loadEnv();
  if (isLearningEnabled(env) && config.learning.enabled) {
    const repo = `${ctx.owner}/${ctx.repo}`;
    const learningCtx = await retrieveLearningContext(parsedFiles, repo);
    learningPrompt = formatLearningContext(learningCtx);
  }

  // 6. Run LLM review
  let llmComments: InlineComment[] = [];
  let llmSummary = "";
  let chunksUsed = 0;

  if (config.llm.enabled) {
    const llmResult = await reviewWithLLM(
      parsedFiles,
      config,
      learningPrompt
    );
    llmComments = llmResult.comments;
    llmSummary = llmResult.summary;
    chunksUsed = llmResult.chunksUsed;
  }

  // 7. Combine results
  const allComments = deduplicateComments([...ruleComments, ...llmComments]);
  const highestSeverity = getHighestSeverity(allComments);

  const result: ReviewResult = {
    summary: buildSummary(llmSummary, ruleComments, llmComments, parsedFiles),
    inlineComments: allComments,
    severity: highestSeverity,
    ruleFindings: ruleComments,
    llmFindings: llmComments,
    metadata: {
      filesReviewed: parsedFiles.length,
      rulesRun,
      llmChunks: chunksUsed,
      durationMs: Date.now() - startTime,
    },
  };

  // 8. Post review
  const reviewId = await postReview(octokit, ctx, result);

  // 9. Record metrics
  const repo = `${ctx.owner}/${ctx.repo}`;
  collectReviewMetrics({
    repo,
    pullNumber: ctx.pullNumber,
    totalComments: allComments.length,
    ruleComments: ruleComments.length,
    llmComments: llmComments.length,
    filesReviewed: parsedFiles.length,
    errorCount: allComments.filter((c) => c.severity === "error").length,
    warningCount: allComments.filter((c) => c.severity === "warning").length,
    infoCount: allComments.filter((c) => c.severity === "info").length,
    llmChunks: chunksUsed,
    llmTokensEstimated: parsedFiles.reduce((sum, f) => sum + estimateFileTokens(f), 0),
    llmParseSuccess: llmComments.length > 0 || llmSummary.length > 0,
    durationMs: result.metadata.durationMs,
    patternsRecalled: learningPrompt ? (learningPrompt.match(/^- \*\*/gm)?.length ?? 0) : 0,
    approvedPatternsUsed: learningPrompt ? (learningPrompt.match(/well-received/g)?.length ?? 0) > 0 ? 1 : 0 : 0,
    rejectedPatternsUsed: learningPrompt ? (learningPrompt.match(/dismissed/g)?.length ?? 0) > 0 ? 1 : 0 : 0,
  });

  // 10. Store interactions for learning
  if (isLearningEnabled(env) && config.learning.enabled) {
    await storeReviewInteractions(ctx, parsedFiles, allComments, reviewId);
  }

  log.info(
    {
      pr: ctx.pullNumber,
      reviewId,
      ruleFindings: ruleComments.length,
      llmFindings: llmComments.length,
      totalComments: allComments.length,
      durationMs: result.metadata.durationMs,
    },
    "Review complete"
  );
}

function filterFiles(
  files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>,
  config: ReturnType<typeof import("../config-loader/schema.js").parseRepoConfig>
) {
  return files.filter((f) => {
    // Check exclude patterns
    for (const pattern of config.filters.excludePaths ?? []) {
      if (matchGlob(f.filename, pattern)) return false;
    }

    // Check include patterns (if specified)
    if (config.filters.includePaths && config.filters.includePaths.length > 0) {
      const included = config.filters.includePaths.some((p) =>
        matchGlob(f.filename, p)
      );
      if (!included) return false;
    }

    // Check file size
    const maxKB = config.filters.maxFileSizeKB ?? 200;
    const estimatedKB = (f.patch?.length ?? 0) / 1024;
    if (estimatedKB > maxKB) return false;

    return true;
  }).slice(0, config.filters.maxFiles ?? 50);
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(path);
}

function deduplicateComments(comments: InlineComment[]): InlineComment[] {
  const seen = new Map<string, InlineComment>();
  for (const c of comments) {
    const key = `${c.path}:${c.line}`;
    const existing = seen.get(key);
    // Keep the higher-severity one, or LLM over rule for same severity
    if (
      !existing ||
      severityRank(c.severity) > severityRank(existing.severity)
    ) {
      seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

function severityRank(s: string): number {
  return s === "error" ? 3 : s === "warning" ? 2 : 1;
}

function getHighestSeverity(
  comments: InlineComment[]
): "error" | "warning" | "info" {
  if (comments.some((c) => c.severity === "error")) return "error";
  if (comments.some((c) => c.severity === "warning")) return "warning";
  return "info";
}

function buildSummary(
  llmSummary: string,
  ruleComments: InlineComment[],
  llmComments: InlineComment[],
  files: ParsedFile[]
): string {
  const parts: string[] = [];

  if (llmSummary) {
    parts.push(llmSummary);
  }

  parts.push(
    `\n---\n**Kairi Review Stats**: ${files.length} files reviewed | ${ruleComments.length} rule findings | ${llmComments.length} LLM findings`
  );

  return parts.join("\n");
}

async function storeReviewInteractions(
  ctx: PRContext,
  files: ParsedFile[],
  comments: InlineComment[],
  _reviewId: number
): Promise<void> {
  const repo = `${ctx.owner}/${ctx.repo}`;

  for (const comment of comments) {
    const file = files.find((f) => f.filename === comment.path);
    if (!file) continue;

    // Build diff context around the commented line
    const diffContext = file.hunks
      .flatMap((h) => h.lines)
      .filter(
        (l) =>
          l.newLineNumber !== null &&
          Math.abs(l.newLineNumber - comment.line) <= 5
      )
      .map((l) => `${l.type === "add" ? "+" : l.type === "del" ? "-" : " "} ${l.content}`)
      .join("\n");

    const interactionId = randomUUID();
    const interaction = {
      id: interactionId,
      repo,
      pullNumber: ctx.pullNumber,
      diffContext,
      reviewComment: comment.body,
      filePath: comment.path,
      line: comment.line,
      category: (comment as any).category ?? comment.ruleId ?? "general",
      approved: null,
      concepts: extractConcepts([file], comment.body),
      timestamp: new Date().toISOString(),
      source: comment.source,
      severity: comment.severity,
    };

    // Store in both backends (fire and forget, don't block the review)
    vectorStore(interaction).catch(() => {});
    graphStore(interaction).catch(() => {});
  }
}
