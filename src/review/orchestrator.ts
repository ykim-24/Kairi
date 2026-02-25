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
import { enrichFindings } from "../learning/enrich.js";
import { collectReviewMetrics } from "../metrics/collector.js";
import { getFeatureFlag, insertPendingReview } from "../metrics/pg-store.js";
import { estimateFileTokens } from "../llm/chunker.js";
import { filterFindings } from "./filter.js";
import { buildReviewBody } from "./body-builder.js";
import { formatInlineComment } from "./inline-formatter.js";
import type { ReviewFinding, ReviewResult } from "./types.js";
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
  let llmComments: ReviewFinding[] = [];
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

  // 7. Combine into unified ReviewFinding[] and deduplicate
  const allFindings = deduplicateFindings([...ruleComments, ...llmComments]);

  // 8. Partition into inline-worthy vs body-only
  const { inline, bodyOnly } = filterFindings(allFindings, config);

  // 9. Enrich inline findings with graph DB context
  const repo = `${ctx.owner}/${ctx.repo}`;
  let enrichedInline = inline;
  if (isLearningEnabled(env) && config.learning.enabled) {
    enrichedInline = await enrichFindings(inline, repo, parsedFiles);
  }

  // 10. Build structured review body with all findings
  const durationMs = Date.now() - startTime;
  const bodyMarkdown = buildReviewBody({
    llmSummary,
    findings: [...enrichedInline, ...bodyOnly],
    inlineCount: enrichedInline.length,
    metadata: {
      filesReviewed: parsedFiles.length,
      rulesRun,
      llmFindings: llmComments.length,
      ruleFindings: ruleComments.length,
      durationMs,
    },
  });

  // 11. Format inline comments
  const formattedInline = enrichedInline.map((f) => ({
    ...f,
    body: formatInlineComment(f),
  }));

  // 12. Determine event type
  const hasErrors = allFindings.some((f) => f.severity === "error");
  const event = hasErrors ? "REQUEST_CHANGES" as const : "COMMENT" as const;

  const result: ReviewResult = {
    bodyMarkdown,
    inlineComments: formattedInline,
    event,
    metadata: {
      filesReviewed: parsedFiles.length,
      rulesRun,
      llmChunks: chunksUsed,
      durationMs,
    },
  };

  // 13. Check review gate — hold review for manual approval if enabled
  const gated = await getFeatureFlag("review_gate");
  if (gated) {
    await insertPendingReview(
      repo,
      ctx.pullNumber,
      ctx.headSha,
      ctx.owner,
      ctx.installationId,
      result
    );
    log.info(
      { pr: ctx.pullNumber, repo },
      "Review gated — held for manual approval"
    );
    return;
  }

  // 14. Post review
  const reviewId = await postReview(octokit, ctx, result);

  // 15. Record metrics
  collectReviewMetrics({
    repo,
    pullNumber: ctx.pullNumber,
    totalComments: allFindings.length,
    ruleComments: ruleComments.length,
    llmComments: llmComments.length,
    filesReviewed: parsedFiles.length,
    errorCount: allFindings.filter((c) => c.severity === "error").length,
    warningCount: allFindings.filter((c) => c.severity === "warning").length,
    infoCount: allFindings.filter((c) => c.severity === "info").length,
    llmChunks: chunksUsed,
    llmTokensEstimated: parsedFiles.reduce((sum, f) => sum + estimateFileTokens(f), 0),
    llmParseSuccess: llmComments.length > 0 || llmSummary.length > 0,
    durationMs,
    patternsRecalled: learningPrompt ? (learningPrompt.match(/^- \*\*/gm)?.length ?? 0) : 0,
    approvedPatternsUsed: learningPrompt ? (learningPrompt.match(/well-received/g)?.length ?? 0) > 0 ? 1 : 0 : 0,
    rejectedPatternsUsed: learningPrompt ? (learningPrompt.match(/dismissed/g)?.length ?? 0) > 0 ? 1 : 0 : 0,
  });

  // 16. Store interactions for learning
  if (isLearningEnabled(env) && config.learning.enabled) {
    await storeReviewInteractions(ctx, parsedFiles, allFindings, reviewId);
  }

  log.info(
    {
      pr: ctx.pullNumber,
      reviewId,
      ruleFindings: ruleComments.length,
      llmFindings: llmComments.length,
      totalFindings: allFindings.length,
      inlinePosted: formattedInline.length,
      bodyOnlyCount: bodyOnly.length,
      durationMs,
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

function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Map<string, ReviewFinding>();
  for (const f of findings) {
    const key = `${f.path}:${f.line}`;
    const existing = seen.get(key);
    // Keep the higher-severity one, or LLM over rule for same severity
    if (
      !existing ||
      severityRank(f.severity) > severityRank(existing.severity)
    ) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

function severityRank(s: string): number {
  return s === "error" ? 3 : s === "warning" ? 2 : 1;
}

async function storeReviewInteractions(
  ctx: PRContext,
  files: ParsedFile[],
  comments: ReviewFinding[],
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
      category: comment.category ?? comment.ruleId ?? "general",
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
