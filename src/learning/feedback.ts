import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { updateApproval as vectorUpdateApproval } from "./vector-store.js";
import { updateApproval as graphUpdateApproval } from "./graph-store.js";
import { collectFeedbackMetrics } from "../metrics/collector.js";
import { isLearningEnabled, loadEnv } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "learning-feedback" });

const KAIRI_TAG = "<!-- kairi-review -->";
const INTERACTION_ID_PATTERN = /<!-- kairi-id:(\S+) -->/;

// Positive reactions
const POSITIVE_REACTIONS = new Set(["+1", "heart", "rocket"]);
// Negative reactions
const NEGATIVE_REACTIONS = new Set(["-1", "confused"]);

/**
 * Handle GitHub webhook events that carry feedback signals:
 * - pull_request_review: dismissed reviews = negative signal
 * - pull_request_review_comment: reactions on inline comments
 */
export async function handleReviewFeedback(
  event: EmitterWebhookEvent<"pull_request_review"> | EmitterWebhookEvent<"pull_request_review_comment">
): Promise<void> {
  const env = loadEnv();
  if (!isLearningEnabled(env)) return;

  const { payload } = event;

  // Handle review dismissal (negative signal)
  if ("review" in payload && (payload as any).action === "dismissed") {
    const review = (payload as any).review;
    if (!review?.body?.includes(KAIRI_TAG)) return;

    const idMatch = review.body.match(INTERACTION_ID_PATTERN);
    if (!idMatch) return;

    const repo = `${(payload as any).repository?.full_name ?? ""}`;
    const prNum = (payload as any).pull_request?.number ?? 0;
    log.info({ interactionId: idMatch[1] }, "Review dismissed - negative feedback");
    await recordFeedback(idMatch[1], false, "dismissed", repo, prNum);
    return;
  }

  // Handle review submitted (if someone responds to our review)
  if ("review" in payload && (payload as any).action === "submitted") {
    const review = (payload as any).review;
    // If someone submits an approval on a PR we reviewed, that's a positive signal
    if (review?.state === "approved") {
      // We'd need to check if we have a review on this PR
      // For now, skip — the main signals are reactions and dismissals
    }
    return;
  }

  // Handle comment reactions (would need a separate webhook for issue_comment or pull_request_review_comment)
  // GitHub doesn't send webhook events for reactions by default,
  // but we can check when comments are edited or resolved
  if ("comment" in payload) {
    const comment = (payload as any).comment;
    if (!comment?.body) return;

    const idMatch = comment.body.match(INTERACTION_ID_PATTERN);
    if (!idMatch) return;

    const action = (payload as any).action;

    const repo = `${(payload as any).repository?.full_name ?? ""}`;
    const prNum = (payload as any).pull_request?.number ?? 0;

    // Comment resolved = positive (user acknowledged and addressed it)
    if (action === "resolved") {
      log.info({ interactionId: idMatch[1] }, "Comment resolved - positive feedback");
      await recordFeedback(idMatch[1], true, "resolved", repo, prNum);
    }

    // Comment deleted = negative (user didn't want it)
    if (action === "deleted") {
      log.info({ interactionId: idMatch[1] }, "Comment deleted - negative feedback");
      await recordFeedback(idMatch[1], false, "dismissed", repo, prNum);
    }
  }
}

async function recordFeedback(
  interactionId: string,
  positive: boolean,
  feedbackType: "resolved" | "dismissed" | "reaction_positive" | "reaction_negative" | "merged" = "resolved",
  repo = "",
  pullNumber = 0
): Promise<void> {
  await Promise.all([
    vectorUpdateApproval(interactionId, positive),
    graphUpdateApproval(interactionId, positive),
  ]);

  collectFeedbackMetrics({
    repo,
    pullNumber,
    interactionId,
    feedbackType,
    commentSource: "llm", // default; ideally we'd look up the original source
    category: "general",
    positive,
  });

  log.info({ interactionId, positive }, "Recorded feedback in both stores + metrics");
}
