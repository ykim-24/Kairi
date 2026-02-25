export interface InlineComment {
  path: string;
  line: number;
  body: string;
  source: "rule" | "llm";
  severity: "error" | "warning" | "info";
  ruleId?: string;
}

export interface ReviewResult {
  summary: string;
  inlineComments: InlineComment[];
  severity: "error" | "warning" | "info";
  ruleFindings: InlineComment[];
  llmFindings: InlineComment[];
  metadata: {
    filesReviewed: number;
    rulesRun: number;
    llmChunks: number;
    durationMs: number;
  };
}

export interface LLMComment {
  path: string;
  line: number;
  body: string;
  severity: "error" | "warning" | "info";
  category: string;
}

export interface LLMReviewResponse {
  summary: string;
  comments: LLMComment[];
}
