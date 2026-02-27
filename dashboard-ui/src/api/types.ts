export interface Summary {
  approvalRate: number;
  approvalRateDelta: number;
  totalReviews: number;
  avgCommentsPerReview: number;
  avgDurationMs: number;
  llmParseSuccessRate: number;
  avgTokensPerReview: number;
  avgPatternsRecalled: number;
  totalFeedback: number;
  approvalRateBySource: { rule: number; llm: number };
  approvalRateByCategory: Record<string, number>;
  severityDistribution: { error: number; warning: number; info: number };
}

export interface TrendPoint {
  date: string;
  approvalRate: number;
}

export interface ReviewTrendPoint {
  date: string;
  reviews: number;
  avgComments: number;
}

export interface RepoBreakdown {
  repo: string;
  totalReviews: number;
  avgCommentsPerReview: number;
  approvalRate: number;
  trend: number[];
}

export interface ConceptRate {
  concept: string;
  total: number;
  rate: number;
}

export interface FileHotspot {
  file: string;
  commentCount: number;
  topConcepts: string[];
}

export interface KnowledgeBaseStats {
  approved: number;
  rejected: number;
  pending: number;
  totalConcepts: number;
}

export interface Installation {
  full_name: string;
  installationId: number;
}

export interface SyncProgress {
  status: "idle" | "running" | "done" | "error";
  repo?: string;
  totalPRs: number;
  processedPRs: number;
  commentsIngested: number;
  error?: string;
}

export interface SyncFlag {
  enabled: boolean;
}

export interface PendingReview {
  id: number;
  created_at: string;
  repo: string;
  pull_number: number;
  head_sha: string;
  owner: string;
  installation_id: number;
  result_json: {
    bodyMarkdown: string;
    inlineComments: Array<{
      path: string;
      line: number;
      body: string;
      severity: string;
    }>;
    event: string;
    metadata: {
      filesReviewed: number;
      rulesRun: number;
      llmChunks: number;
      durationMs: number;
    };
  };
  status: string;
  resolved_at: string | null;
}

export interface ReviewGateFlag {
  enabled: boolean;
}

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}
