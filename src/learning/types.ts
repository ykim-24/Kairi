/** A stored review interaction for learning */
export interface ReviewInteraction {
  id: string;
  /** The repo this review was for */
  repo: string;
  /** PR number */
  pullNumber: number;
  /** The diff context that was reviewed */
  diffContext: string;
  /** The review comment that was posted */
  reviewComment: string;
  /** File path the comment was on */
  filePath: string;
  /** Line number */
  line: number;
  /** Category of the review (bugs, security, etc.) */
  category: string;
  /** Whether the review was positively or negatively received */
  approved: boolean | null;
  /** Extracted concepts for graph lookup */
  concepts: string[];
  /** Timestamp */
  timestamp: string;
  /** Source: rule-engine, llm, or human reviewer */
  source: "rule" | "llm" | "human";
  /** The severity assigned */
  severity: "error" | "warning" | "info";
}

/** Feedback signal from GitHub events */
export interface FeedbackSignal {
  interactionId: string;
  type: "reaction" | "resolved" | "dismissed" | "merged";
  positive: boolean;
  details?: string;
}

/** Retrieved learning context to inject into LLM prompt */
export interface LearningContext {
  approvedPatterns: RetrievedPattern[];
  rejectedPatterns: RetrievedPattern[];
}

export interface RetrievedPattern {
  diffSnippet: string;
  reviewComment: string;
  filePath: string;
  category: string;
  score: number;
  approved?: boolean | null;
  pullNumber?: number;
  source?: "rule" | "llm" | "human";
}
