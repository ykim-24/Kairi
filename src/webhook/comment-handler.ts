import { randomUUID } from "crypto";
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { getOctokit } from "../github/client.js";
import { isLearningEnabled, loadEnv } from "../config/env.js";
import { storeInteraction as vectorStore } from "../learning/vector-store.js";
import { storeInteraction as graphStore } from "../learning/graph-store.js";
import { extractConcepts } from "../learning/concept-extractor.js";
import { getRelatedInteractions, getFileHistory } from "../learning/graph-store.js";
import type { ReviewInteraction, RetrievedPattern } from "../learning/types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "comment-handler" });

const KAIRI_TAG = "<!-- kairi-review -->";

// Dedup guard: track recently processed comment IDs to prevent double-processing
// from webhook retries or overlapping event delivery
const _recentlyProcessed = new Set<number>();
const DEDUP_TTL_MS = 60_000;

function isDuplicate(commentId: number): boolean {
  if (_recentlyProcessed.has(commentId)) return true;
  _recentlyProcessed.add(commentId);
  setTimeout(() => _recentlyProcessed.delete(commentId), DEDUP_TTL_MS);
  return false;
}

/**
 * Handles issue_comment events on PRs.
 * - Ignores bot comments
 * - Stores human comments as learning interactions
 * - Replies if Kairi has relevant context from past reviews
 */
export async function handleIssueComment(
  event: EmitterWebhookEvent<"issue_comment">
): Promise<void> {
  const { payload } = event;

  // Only handle new comments, not edits or deletions
  if (payload.action !== "created") return;

  // Only handle comments on pull requests (issues have no pull_request key)
  if (!(payload.issue as any).pull_request) return;

  const comment = payload.comment;
  const user = comment.user;

  // Skip bot comments — only learn from humans
  if (!user || user.type === "Bot") return;

  // Skip our own comments
  if (comment.body?.includes(KAIRI_TAG)) return;

  // Skip very short comments (reactions, "+1", etc)
  if (!comment.body || comment.body.trim().length < 15) return;

  // Dedup: skip if we've already processed this comment
  if (isDuplicate(comment.id)) return;

  const env = loadEnv();
  if (!isLearningEnabled(env)) return;

  const repo = payload.repository.full_name;
  const pullNumber = payload.issue.number;
  const installationId = (payload as any).installation?.id;

  log.info(
    { repo, pr: pullNumber, user: user.login, commentId: comment.id },
    "Processing human PR comment"
  );

  // Store the human comment as a learning interaction
  const interactionId = randomUUID();
  const concepts = extractConcepts([], comment.body);

  const interaction: ReviewInteraction = {
    id: interactionId,
    repo,
    pullNumber,
    diffContext: "", // no diff context for general PR comments
    reviewComment: comment.body,
    filePath: "", // general comment, not file-specific
    line: 0,
    category: categorizeComment(comment.body),
    approved: true, // human comments are treated as ground truth
    concepts,
    timestamp: new Date().toISOString(),
    source: "human",
    severity: "info",
  };

  // Store in both backends
  vectorStore(interaction).catch((err) =>
    log.warn({ err }, "Failed to store human comment in vector store")
  );
  graphStore(interaction).catch((err) =>
    log.warn({ err }, "Failed to store human comment in graph store")
  );

  // Check if we have relevant context to reply with
  if (!installationId) return;

  try {
    const related = await getRelatedInteractions(concepts, repo, 3);
    // Only reply if we have approved patterns that are relevant
    const approved = related.filter(
      (r) => r.approved === true && r.source !== "human" && r.score >= 2
    );

    if (approved.length > 0) {
      await postContextReply(
        installationId,
        repo,
        pullNumber,
        comment.id,
        approved
      );
    }
  } catch (err) {
    log.warn({ err }, "Failed to check for relevant context to reply");
  }
}

/**
 * Handles pull_request_review_comment events (inline comments on diffs).
 * Same logic: ignore bots, learn from humans, optionally reply.
 */
export async function handleInlineComment(
  event: EmitterWebhookEvent<"pull_request_review_comment">
): Promise<void> {
  const { payload } = event;

  if (payload.action !== "created") return;

  const comment = payload.comment;
  const user = comment.user;

  if (!user || user.type === "Bot") return;
  if (comment.body?.includes(KAIRI_TAG)) return;
  if (!comment.body || comment.body.trim().length < 15) return;

  // Dedup: skip if we've already processed this comment
  if (isDuplicate(comment.id)) return;

  const env = loadEnv();
  if (!isLearningEnabled(env)) return;

  const repo = payload.repository.full_name;
  const pullNumber = payload.pull_request.number;
  const filePath = comment.path ?? "";
  const line = comment.line ?? comment.original_line ?? 0;

  log.info(
    { repo, pr: pullNumber, user: user.login, file: filePath, line },
    "Processing human inline comment"
  );

  // Build diff context from the comment's diff_hunk if available
  const diffContext = (comment as any).diff_hunk ?? "";

  const interactionId = randomUUID();
  // Create a fake ParsedFile for concept extraction from the file path
  const fakeParsedFile = {
    filename: filePath,
    status: "modified" as const,
    hunks: [],
    additions: 0,
    deletions: 0,
  };
  const concepts = extractConcepts(
    filePath ? [fakeParsedFile] : [],
    comment.body
  );

  const interaction: ReviewInteraction = {
    id: interactionId,
    repo,
    pullNumber,
    diffContext: diffContext.slice(0, 2000),
    reviewComment: comment.body,
    filePath,
    line,
    category: categorizeComment(comment.body),
    approved: true,
    concepts,
    timestamp: new Date().toISOString(),
    source: "human",
    severity: "info",
  };

  vectorStore(interaction).catch((err) =>
    log.warn({ err }, "Failed to store human inline comment in vector store")
  );
  graphStore(interaction).catch((err) =>
    log.warn({ err }, "Failed to store human inline comment in graph store")
  );
}

/**
 * Posts a reply when Kairi has relevant context from past reviews.
 */
async function postContextReply(
  installationId: number,
  repo: string,
  pullNumber: number,
  commentId: number,
  patterns: RetrievedPattern[]
): Promise<void> {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) return;

  const octokit = await getOctokit(installationId);

  const contextLines = patterns.map((p) => {
    const parts: string[] = [];
    parts.push(`- **${p.category}**`);
    if (p.filePath) parts[0] += ` on \`${p.filePath}\``;
    if (p.pullNumber) parts[0] += ` (PR #${p.pullNumber})`;
    parts[0] += `: ${p.reviewComment.slice(0, 150)}`;
    return parts[0];
  });

  const body = `${KAIRI_TAG}

> I found some related context from past reviews that might be relevant:

${contextLines.join("\n")}`;

  try {
    await octokit.issues.createComment({
      owner,
      repo: repoName,
      issue_number: pullNumber,
      body,
    });
    log.info({ repo, pr: pullNumber }, "Posted context reply to human comment");
  } catch (err) {
    log.warn({ err }, "Failed to post context reply");
  }
}

/**
 * Simple keyword-based categorization of human comments.
 */
export function categorizeComment(body: string): string {
  const lower = body.toLowerCase();
  if (/\b(security|secret|credential|auth|token|password|xss|injection|cve)\b/.test(lower)) return "security";
  if (/\b(bug|error|crash|null|undefined|typo|wrong|broken|fix)\b/.test(lower)) return "bugs";
  if (/\b(performance|slow|memory|leak|optimize|cache|latency)\b/.test(lower)) return "performance";
  if (/\b(test|coverage|spec|assert|mock|stub)\b/.test(lower)) return "testing";
  if (/\b(refactor|clean|readab|naming|pattern|structure|architect)\b/.test(lower)) return "readability";
  return "general";
}
