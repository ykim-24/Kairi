/** Raw metric event recorded after every review or feedback signal */
export interface MetricEvent {
  id?: number;
  timestamp: string;
  repo: string;
  pullNumber: number;
  eventType: MetricEventType;
  data: Record<string, unknown>;
}

export type MetricEventType =
  | "review_completed"
  | "feedback_received"
  | "llm_call"
  | "rule_run";

/** Recorded once per review */
export interface ReviewMetric {
  repo: string;
  pullNumber: number;
  // Activity
  totalComments: number;
  ruleComments: number;
  llmComments: number;
  filesReviewed: number;
  // Severity breakdown
  errorCount: number;
  warningCount: number;
  infoCount: number;
  // LLM
  llmChunks: number;
  llmTokensEstimated: number;
  llmParseSuccess: boolean;
  // Timing
  durationMs: number;
  // Learning
  patternsRecalled: number;
  approvedPatternsUsed: number;
  rejectedPatternsUsed: number;
}

/** Recorded for each feedback signal */
export interface FeedbackMetric {
  repo: string;
  pullNumber: number;
  interactionId: string;
  feedbackType: "resolved" | "dismissed" | "reaction_positive" | "reaction_negative" | "merged";
  commentSource: "rule" | "llm";
  category: string;
  positive: boolean;
}

/** Aggregated stats for a time window */
export interface AggregatedMetrics {
  period: string; // "day" | "week" | "month"
  startDate: string;
  endDate: string;
  // Core quality
  totalReviews: number;
  totalComments: number;
  totalFeedback: number;
  approvalRate: number; // 0-1
  approvalRateBySource: { rule: number; llm: number };
  approvalRateByCategory: Record<string, number>;
  // Trend (compared to previous period)
  approvalRateDelta: number;
  commentsPerReviewDelta: number;
  // Activity
  avgCommentsPerReview: number;
  avgDurationMs: number;
  severityDistribution: { error: number; warning: number; info: number };
  // LLM
  avgTokensPerReview: number;
  llmParseSuccessRate: number;
  // Learning health
  totalInteractions: number;
  avgPatternsRecalled: number;
  knowledgeBaseApprovalRate: number;
}

/** Per-repo breakdown */
export interface RepoMetrics {
  repo: string;
  totalReviews: number;
  approvalRate: number;
  avgCommentsPerReview: number;
  trend: number[]; // approval rate over last N periods
}
