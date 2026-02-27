/** A unified finding from either rule engine or LLM review */
export interface ReviewFinding {
  path: string;
  line: number;
  body: string;
  source: "rule" | "llm" | "human";
  severity: "error" | "warning" | "info";
  category: string;
  confidence: number;
  suggestedFix?: string;
  ruleId?: string;
  graphContext?: string;
}

/** Final review result ready for posting */
export interface ReviewResult {
  bodyMarkdown: string;
  inlineComments: ReviewFinding[];
  event: "COMMENT" | "REQUEST_CHANGES";
  metadata: {
    filesReviewed: number;
    rulesRun: number;
    llmChunks: number;
    durationMs: number;
  };
}

/** Backward-compatible alias used by rules and learning system */
export type InlineComment = ReviewFinding;

export interface LLMComment {
  path: string;
  line: number;
  body: string;
  severity: "error" | "warning" | "info";
  category: string;
  confidence: number;
  suggestedFix?: string;
}

export interface LLMReviewResponse {
  summary: string;
  comments: LLMComment[];
}
