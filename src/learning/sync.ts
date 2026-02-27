import { createHash } from "crypto";
import type { Octokit } from "@octokit/rest";
import { getOctokit } from "../github/client.js";
import { storeInteraction as vectorStore } from "./vector-store.js";
import { storeInteraction as graphStore } from "./graph-store.js";
import { extractConcepts } from "./concept-extractor.js";
import { categorizeComment } from "../webhook/comment-handler.js";
import type { ReviewInteraction } from "./types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "sync" });

const KAIRI_TAG = "<!-- kairi-review -->";
const MAX_PRS = 200;
const RATE_LIMIT_DELAY_MS = 50;

export interface SyncProgress {
  status: "idle" | "running" | "done" | "error";
  repo: string;
  totalPRs: number;
  processedPRs: number;
  commentsIngested: number;
  startedAt?: string;
  error?: string;
}

let _progress: SyncProgress = {
  status: "idle",
  repo: "",
  totalPRs: 0,
  processedPRs: 0,
  commentsIngested: 0,
};

export function getSyncProgress(): SyncProgress {
  return { ..._progress };
}

/** Generate a deterministic UUID from a stable string key */
function stableUUID(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  // Format as UUID v4-like: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backfill the knowledge graph from historical PR comments.
 * Fetches up to MAX_PRS most recently updated PRs, extracts human comments,
 * and stores them in both vector and graph stores.
 */
export async function syncRepoHistory(
  installationId: number,
  repo: string
): Promise<void> {
  if (_progress.status === "running") {
    throw new Error("Sync already in progress");
  }

  _progress = {
    status: "running",
    repo,
    totalPRs: 0,
    processedPRs: 0,
    commentsIngested: 0,
    startedAt: new Date().toISOString(),
  };

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    _progress.status = "error";
    _progress.error = `Invalid repo format: ${repo}`;
    return;
  }

  try {
    const octokit = await getOctokit(installationId);

    // Fetch PRs (paginated, up to MAX_PRS)
    const prs: Array<{ number: number }> = [];
    for (let page = 1; prs.length < MAX_PRS; page++) {
      const { data } = await octokit.pulls.list({
        owner,
        repo: repoName,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });
      if (data.length === 0) break;
      prs.push(...data.map((pr) => ({ number: pr.number })));
      if (data.length < 100) break;
    }

    _progress.totalPRs = prs.length;
    log.info({ repo, totalPRs: prs.length }, "Starting sync");

    for (const pr of prs) {
      await processPR(octokit, owner, repoName, repo, pr.number);
      _progress.processedPRs++;
      await delay(RATE_LIMIT_DELAY_MS);
    }

    _progress.status = "done";
    log.info(
      { repo, processedPRs: _progress.processedPRs, commentsIngested: _progress.commentsIngested },
      "Sync complete"
    );
  } catch (err) {
    _progress.status = "error";
    _progress.error = err instanceof Error ? err.message : String(err);
    log.error({ err, repo }, "Sync failed");
  }
}

async function processPR(
  octokit: InstanceType<typeof Octokit>,
  owner: string,
  repoName: string,
  repo: string,
  pullNumber: number
): Promise<void> {
  // Fetch review comments (inline on diffs)
  try {
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
      owner,
      repo: repoName,
      pull_number: pullNumber,
      per_page: 100,
    });

    for (const comment of reviewComments) {
      if (!isHumanComment(comment.user?.type, comment.body)) continue;

      const stableId = stableUUID(`sync-${repo}-review-${comment.id}`);
      const filePath = comment.path ?? "";
      const line = comment.line ?? (comment as any).original_line ?? 0;
      const diffContext = (comment as any).diff_hunk ?? "";

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
        id: stableId,
        repo,
        pullNumber,
        diffContext: diffContext.slice(0, 2000),
        reviewComment: comment.body,
        filePath,
        line,
        category: categorizeComment(comment.body),
        approved: true,
        concepts,
        timestamp: comment.created_at,
        source: "human",
        severity: "info",
      };

      await storeInteractionSafe(interaction);
      _progress.commentsIngested++;
    }
  } catch (err) {
    log.warn({ err, pullNumber }, "Failed to fetch review comments");
  }

  // Fetch issue comments (general PR comments)
  try {
    const { data: issueComments } = await octokit.issues.listComments({
      owner,
      repo: repoName,
      issue_number: pullNumber,
      per_page: 100,
    });

    for (const comment of issueComments) {
      if (!comment.body || !isHumanComment(comment.user?.type, comment.body))
        continue;

      const stableId = stableUUID(`sync-${repo}-issue-${comment.id}`);
      const concepts = extractConcepts([], comment.body);

      const interaction: ReviewInteraction = {
        id: stableId,
        repo,
        pullNumber,
        diffContext: "",
        reviewComment: comment.body,
        filePath: "",
        line: 0,
        category: categorizeComment(comment.body),
        approved: true,
        concepts,
        timestamp: comment.created_at,
        source: "human",
        severity: "info",
      };

      await storeInteractionSafe(interaction);
      _progress.commentsIngested++;
    }
  } catch (err) {
    log.warn({ err, pullNumber }, "Failed to fetch issue comments");
  }
}

function isHumanComment(
  userType: string | undefined,
  body: string | undefined
): boolean {
  if (!body) return false;
  if (userType === "Bot") return false;
  if (body.includes(KAIRI_TAG)) return false;
  if (body.trim().length < 15) return false;
  return true;
}

async function storeInteractionSafe(
  interaction: ReviewInteraction
): Promise<void> {
  await Promise.all([
    vectorStore(interaction).catch((err) =>
      log.warn({ err, id: interaction.id }, "Failed to store in vector store")
    ),
    graphStore(interaction).catch((err) =>
      log.warn({ err, id: interaction.id }, "Failed to store in graph store")
    ),
  ]);
}
