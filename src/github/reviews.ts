import type { Octokit } from "@octokit/rest";
import type { PRContext } from "./pulls.js";
import type { ReviewResult } from "../review/types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "github-reviews" });

const BOT_REVIEW_TAG = "<!-- kairi-review -->";

export async function postReview(
  octokit: Octokit,
  ctx: PRContext,
  result: ReviewResult
): Promise<number> {
  const comments = result.inlineComments
    .filter((c) => c.line > 0)
    .map((c) => ({
      path: c.path,
      line: c.line,
      side: "RIGHT" as const,
      body: c.body,
    }));

  // Body already includes the kairi-review tag from body-builder
  const body = result.bodyMarkdown;

  const { data } = await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    commit_id: ctx.headSha,
    body,
    event: result.event,
    comments,
  });

  log.info(
    {
      pr: ctx.pullNumber,
      reviewId: data.id,
      event: result.event,
      commentCount: comments.length,
    },
    "Posted review"
  );
  return data.id;
}

export async function dismissPreviousReviews(
  octokit: Octokit,
  ctx: PRContext
): Promise<void> {
  const { data: reviews } = await octokit.pulls.listReviews({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
  });

  // Find our own previous reviews by the tag in the body
  const ours = reviews.filter(
    (r) =>
      r.body?.includes(BOT_REVIEW_TAG) &&
      (r.state === "CHANGES_REQUESTED" || r.state === "COMMENTED")
  );

  for (const review of ours) {
    try {
      await octokit.pulls.dismissReview({
        owner: ctx.owner,
        repo: ctx.repo,
        pull_number: ctx.pullNumber,
        review_id: review.id,
        message: "Superseded by new review after push.",
      });
      log.info({ reviewId: review.id }, "Dismissed old review");
    } catch (err) {
      // Can only dismiss CHANGES_REQUESTED reviews
      log.debug({ reviewId: review.id, err }, "Could not dismiss review");
    }
  }
}
