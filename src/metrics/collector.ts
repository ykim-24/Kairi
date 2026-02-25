import type { ReviewMetric, FeedbackMetric } from "./types.js";
import {
  recordReview as pgRecordReview,
  recordFeedback as pgRecordFeedback,
} from "./pg-store.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "metrics-collector" });

/**
 * Record a completed review's metrics.
 * Called from the orchestrator after posting a review.
 */
export function collectReviewMetrics(metric: ReviewMetric): void {
  pgRecordReview(metric).catch((err) => {
    log.warn({ err }, "Failed to collect review metrics");
  });
  log.debug(
    { repo: metric.repo, pr: metric.pullNumber, comments: metric.totalComments },
    "Recorded review metrics"
  );
}

/**
 * Record a feedback signal.
 * Called from the feedback handler when a review comment gets feedback.
 */
export function collectFeedbackMetrics(metric: FeedbackMetric): void {
  pgRecordFeedback(metric).catch((err) => {
    log.warn({ err }, "Failed to collect feedback metrics");
  });
  log.debug(
    { repo: metric.repo, interactionId: metric.interactionId, positive: metric.positive },
    "Recorded feedback metrics"
  );
}
