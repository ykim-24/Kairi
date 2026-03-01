import type {
  Summary,
  TrendPoint,
  ReviewTrendPoint,
  RepoBreakdown,
  ConceptRate,
  FileHotspot,
  KnowledgeBaseStats,
  Installation,
  SyncProgress,
  SyncFlag,
  PendingReview,
  ReviewGateFlag,
  DiffFile,
} from "./types";

const BASE = "/dashboard/api";

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const api = {
  getSummary: (repo?: string, period = "week") =>
    get<Summary>(`/metrics/summary${qs({ repo, period })}`),

  getApprovalTrend: (repo?: string, period = "week", points = 12) =>
    get<TrendPoint[]>(
      `/metrics/approval-trend${qs({ repo, period, points: String(points) })}`
    ),

  getReviewTrend: (repo?: string, period = "week", points = 12) =>
    get<ReviewTrendPoint[]>(
      `/metrics/review-trend${qs({ repo, period, points: String(points) })}`
    ),

  getRepos: () => get<RepoBreakdown[]>("/metrics/repos"),

  getConcepts: (repo?: string) =>
    get<ConceptRate[]>(`/metrics/concepts${qs({ repo })}`),

  getFileHotspots: (repo?: string) =>
    get<FileHotspot[]>(`/metrics/file-hotspots${qs({ repo })}`),

  getKnowledgeBase: (repo?: string) =>
    get<KnowledgeBaseStats>(`/metrics/knowledge-base${qs({ repo })}`),

  getInstallations: () => get<Installation[]>("/installations"),

  getSyncStatus: () => get<SyncProgress>("/sync/status"),

  getSyncFlag: () => get<SyncFlag>("/flags/sync"),

  setSyncFlag: (enabled: boolean) =>
    post<{ ok: boolean; enabled: boolean }>("/flags/sync", { enabled }),

  startSync: (repo: string, installationId: number) =>
    post<{ ok: boolean; error?: string }>("/sync", { repo, installationId }),

  clearLearning: (repo: string) =>
    del<{ ok: boolean; repo: string; graphDeleted: number }>(`/learning/${repo}`),

  getReviewGateFlag: () => get<ReviewGateFlag>("/flags/review-gate"),

  setReviewGateFlag: (enabled: boolean) =>
    post<{ ok: boolean; enabled: boolean }>("/flags/review-gate", { enabled }),

  getPendingReviews: (status?: string) =>
    get<PendingReview[]>(`/pending-reviews${qs({ status })}`),

  approvePendingReview: (id: number) =>
    post<{ ok: boolean; error?: string }>(`/pending-reviews/${id}/approve`, {}),

  rejectPendingReview: (id: number) =>
    post<{ ok: boolean; error?: string }>(`/pending-reviews/${id}/reject`, {}),

  reprocessPendingReview: (id: number) =>
    post<{ ok: boolean; error?: string }>(`/pending-reviews/${id}/reprocess`, {}),

  getPendingReviewDiff: (id: number) =>
    get<{ ok: boolean; diff: DiffFile[] }>(`/pending-reviews/${id}/diff`),
};
