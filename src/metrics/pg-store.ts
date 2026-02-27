import pg from "pg";
import type { ReviewMetric, FeedbackMetric, AggregatedMetrics, RepoMetrics } from "./types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "metrics-pg" });

let _pool: pg.Pool | null = null;

export async function initMetricsDb(connectionString?: string): Promise<void> {
  const connStr = connectionString ?? process.env.POSTGRES_URL;
  if (!connStr) {
    log.warn("POSTGRES_URL not set — metrics storage disabled");
    return;
  }

  _pool = new pg.Pool({ connectionString: connStr, max: 10 });

  // Verify connectivity and create tables
  const client = await _pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        total_comments INTEGER NOT NULL,
        rule_comments INTEGER NOT NULL,
        llm_comments INTEGER NOT NULL,
        files_reviewed INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        warning_count INTEGER NOT NULL,
        info_count INTEGER NOT NULL,
        llm_chunks INTEGER NOT NULL,
        llm_tokens_estimated INTEGER NOT NULL,
        llm_parse_success BOOLEAN NOT NULL,
        duration_ms INTEGER NOT NULL,
        patterns_recalled INTEGER NOT NULL DEFAULT 0,
        approved_patterns_used INTEGER NOT NULL DEFAULT 0,
        rejected_patterns_used INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS feedback_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        interaction_id TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        comment_source TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        positive BOOLEAN NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_review_repo_ts ON review_metrics(repo, timestamp);
      CREATE INDEX IF NOT EXISTS idx_feedback_repo_ts ON feedback_metrics(repo, timestamp);
      CREATE INDEX IF NOT EXISTS idx_feedback_interaction ON feedback_metrics(interaction_id);

      CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO feature_flags (key, enabled)
      VALUES ('sync_enabled', false)
      ON CONFLICT (key) DO NOTHING;

      INSERT INTO feature_flags (key, enabled)
      VALUES ('review_gate', true)
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS pending_reviews (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        repo TEXT NOT NULL,
        pull_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        owner TEXT NOT NULL,
        installation_id INTEGER NOT NULL,
        result_json JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        resolved_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_pending_reviews_status ON pending_reviews(status);
    `);
    log.info("Metrics PostgreSQL tables initialized");
  } finally {
    client.release();
  }
}

export async function closeMetricsDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export async function recordReview(metric: ReviewMetric): Promise<void> {
  if (!_pool) return;
  try {
    await _pool.query(
      `INSERT INTO review_metrics (
        repo, pull_number, total_comments, rule_comments, llm_comments,
        files_reviewed, error_count, warning_count, info_count,
        llm_chunks, llm_tokens_estimated, llm_parse_success, duration_ms,
        patterns_recalled, approved_patterns_used, rejected_patterns_used
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        metric.repo, metric.pullNumber, metric.totalComments,
        metric.ruleComments, metric.llmComments, metric.filesReviewed,
        metric.errorCount, metric.warningCount, metric.infoCount,
        metric.llmChunks, metric.llmTokensEstimated,
        metric.llmParseSuccess, metric.durationMs,
        metric.patternsRecalled, metric.approvedPatternsUsed,
        metric.rejectedPatternsUsed,
      ]
    );
  } catch (err) {
    log.warn({ err }, "Failed to record review metric");
  }
}

export async function recordFeedback(metric: FeedbackMetric): Promise<void> {
  if (!_pool) return;
  try {
    await _pool.query(
      `INSERT INTO feedback_metrics (
        repo, pull_number, interaction_id, feedback_type,
        comment_source, category, positive
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        metric.repo, metric.pullNumber, metric.interactionId,
        metric.feedbackType, metric.commentSource, metric.category,
        metric.positive,
      ]
    );
  } catch (err) {
    log.warn({ err }, "Failed to record feedback metric");
  }
}

// ─── Aggregation queries ───

export async function getAggregatedMetrics(
  repo?: string,
  period: "day" | "week" | "month" = "week",
  lookback = 12
): Promise<AggregatedMetrics> {
  if (!_pool) return emptyAggregation(period);

  const daysBack = period === "day" ? lookback : period === "week" ? lookback * 7 : lookback * 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const prevSince = new Date(Date.now() - daysBack * 2 * 86400000).toISOString();

  const repoClause = repo ? "AND repo = $2" : "";
  const params = repo ? [since, repo] : [since];
  const prevParams = repo ? [prevSince, since, repo] : [prevSince, since];
  const prevRepoClause = repo ? `AND repo = $3` : "";

  // Review aggregates
  const reviews = (await _pool.query(
    `SELECT
      COUNT(*)::int as total_reviews,
      COALESCE(SUM(total_comments), 0)::int as total_comments,
      COALESCE(AVG(total_comments), 0)::float as avg_comments,
      COALESCE(AVG(duration_ms), 0)::float as avg_duration,
      COALESCE(SUM(error_count), 0)::int as errors,
      COALESCE(SUM(warning_count), 0)::int as warnings,
      COALESCE(SUM(info_count), 0)::int as infos,
      COALESCE(AVG(llm_tokens_estimated), 0)::float as avg_tokens,
      COALESCE(AVG(llm_parse_success::int), 0)::float as parse_rate,
      COALESCE(AVG(patterns_recalled), 0)::float as avg_patterns
    FROM review_metrics
    WHERE timestamp >= $1 ${repoClause}`,
    params
  )).rows[0];

  // Feedback aggregates
  const feedback = (await _pool.query(
    `SELECT
      COUNT(*)::int as total,
      COALESCE(SUM(CASE WHEN positive THEN 1 ELSE 0 END), 0)::int as positive_count
    FROM feedback_metrics
    WHERE timestamp >= $1 ${repoClause}`,
    params
  )).rows[0];

  // By source
  const bySourceRows = (await _pool.query(
    `SELECT
      comment_source,
      COUNT(*)::int as total,
      SUM(CASE WHEN positive THEN 1 ELSE 0 END)::int as positive_count
    FROM feedback_metrics
    WHERE timestamp >= $1 ${repoClause}
    GROUP BY comment_source`,
    params
  )).rows;

  // By category
  const byCategoryRows = (await _pool.query(
    `SELECT
      category,
      COUNT(*)::int as total,
      SUM(CASE WHEN positive THEN 1 ELSE 0 END)::int as positive_count
    FROM feedback_metrics
    WHERE timestamp >= $1 ${repoClause}
    GROUP BY category`,
    params
  )).rows;

  // Previous period feedback
  const prevFeedback = (await _pool.query(
    `SELECT
      COUNT(*)::int as total,
      COALESCE(SUM(CASE WHEN positive THEN 1 ELSE 0 END), 0)::int as positive_count
    FROM feedback_metrics
    WHERE timestamp >= $1 AND timestamp < $2 ${prevRepoClause}`,
    prevParams
  )).rows[0];

  const currentApproval = feedback.total > 0 ? feedback.positive_count / feedback.total : 0;
  const prevApproval = prevFeedback.total > 0 ? prevFeedback.positive_count / prevFeedback.total : 0;

  const sourceRates: Record<string, number> = {};
  for (const s of bySourceRows) {
    sourceRates[s.comment_source] = s.total > 0 ? s.positive_count / s.total : 0;
  }

  const categoryRates: Record<string, number> = {};
  for (const c of byCategoryRows) {
    categoryRates[c.category] = c.total > 0 ? c.positive_count / c.total : 0;
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

  return {
    period,
    startDate,
    endDate,
    totalReviews: reviews.total_reviews,
    totalComments: reviews.total_comments,
    totalFeedback: feedback.total,
    approvalRate: currentApproval,
    approvalRateBySource: {
      rule: sourceRates["rule"] ?? 0,
      llm: sourceRates["llm"] ?? 0,
    },
    approvalRateByCategory: categoryRates,
    approvalRateDelta: currentApproval - prevApproval,
    commentsPerReviewDelta: 0,
    avgCommentsPerReview: reviews.avg_comments,
    avgDurationMs: reviews.avg_duration,
    severityDistribution: {
      error: reviews.errors,
      warning: reviews.warnings,
      info: reviews.infos,
    },
    avgTokensPerReview: reviews.avg_tokens,
    llmParseSuccessRate: reviews.parse_rate,
    totalInteractions: reviews.total_comments,
    avgPatternsRecalled: reviews.avg_patterns,
    knowledgeBaseApprovalRate: currentApproval,
  };
}

export async function getApprovalTrend(
  repo?: string,
  period: "day" | "week" | "month" = "week",
  points = 12
): Promise<Array<{ date: string; approvalRate: number; totalFeedback: number }>> {
  if (!_pool) return [];

  const daysBack = period === "day" ? points : period === "week" ? points * 7 : points * 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const truncExpr = period === "day" ? "day" : period === "week" ? "week" : "month";
  const repoClause = repo ? "AND repo = $2" : "";
  const params = repo ? [since, repo] : [since];

  const rows = (await _pool.query(
    `SELECT
      date_trunc('${truncExpr}', timestamp)::date as period_date,
      COUNT(*)::int as total,
      SUM(CASE WHEN positive THEN 1 ELSE 0 END)::int as positive_count
    FROM feedback_metrics
    WHERE timestamp >= $1 ${repoClause}
    GROUP BY period_date
    ORDER BY period_date ASC`,
    params
  )).rows;

  return rows.map((r: any) => ({
    date: r.period_date.toISOString().split("T")[0],
    approvalRate: r.total > 0 ? r.positive_count / r.total : 0,
    totalFeedback: r.total,
  }));
}

export async function getReviewTrend(
  repo?: string,
  period: "day" | "week" | "month" = "week",
  points = 12
): Promise<Array<{ date: string; reviews: number; avgComments: number; avgDuration: number }>> {
  if (!_pool) return [];

  const daysBack = period === "day" ? points : period === "week" ? points * 7 : points * 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const truncExpr = period === "day" ? "day" : period === "week" ? "week" : "month";
  const repoClause = repo ? "AND repo = $2" : "";
  const params = repo ? [since, repo] : [since];

  const rows = (await _pool.query(
    `SELECT
      date_trunc('${truncExpr}', timestamp)::date as period_date,
      COUNT(*)::int as reviews,
      AVG(total_comments)::float as avg_comments,
      AVG(duration_ms)::float as avg_duration
    FROM review_metrics
    WHERE timestamp >= $1 ${repoClause}
    GROUP BY period_date
    ORDER BY period_date ASC`,
    params
  )).rows;

  return rows.map((r: any) => ({
    date: r.period_date.toISOString().split("T")[0],
    reviews: r.reviews,
    avgComments: Math.round(r.avg_comments * 10) / 10,
    avgDuration: Math.round(r.avg_duration),
  }));
}

export async function getRepoBreakdown(): Promise<RepoMetrics[]> {
  if (!_pool) return [];

  const repos = (await _pool.query(
    `SELECT DISTINCT repo FROM review_metrics ORDER BY repo`
  )).rows;

  const results: RepoMetrics[] = [];
  for (const { repo } of repos) {
    const reviews = (await _pool.query(
      `SELECT COUNT(*)::int as total, AVG(total_comments)::float as avg_comments
       FROM review_metrics WHERE repo = $1`,
      [repo]
    )).rows[0];

    const feedback = (await _pool.query(
      `SELECT COUNT(*)::int as total,
              SUM(CASE WHEN positive THEN 1 ELSE 0 END)::int as positive
       FROM feedback_metrics WHERE repo = $1`,
      [repo]
    )).rows[0];

    const trend = await getApprovalTrend(repo, "week", 8);

    results.push({
      repo,
      totalReviews: reviews.total,
      approvalRate: feedback.total > 0 ? feedback.positive / feedback.total : 0,
      avgCommentsPerReview: Math.round((reviews.avg_comments ?? 0) * 10) / 10,
      trend: trend.map((t) => t.approvalRate),
    });
  }

  return results;
}

// ─── Feature flags ───

export async function getFeatureFlag(key: string): Promise<boolean> {
  if (!_pool) return false;
  try {
    const { rows } = await _pool.query(
      "SELECT enabled FROM feature_flags WHERE key = $1",
      [key]
    );
    return rows.length > 0 ? rows[0].enabled : false;
  } catch (err) {
    log.warn({ err, key }, "Failed to read feature flag");
    return false;
  }
}

export async function setFeatureFlag(
  key: string,
  enabled: boolean
): Promise<void> {
  if (!_pool) return;
  try {
    await _pool.query(
      `INSERT INTO feature_flags (key, enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET enabled = $2, updated_at = NOW()`,
      [key, enabled]
    );
  } catch (err) {
    log.warn({ err, key }, "Failed to set feature flag");
  }
}

// ─── Pending reviews (review gate) ───

export interface PendingReviewRow {
  id: number;
  created_at: string;
  repo: string;
  pull_number: number;
  head_sha: string;
  owner: string;
  installation_id: number;
  result_json: import("../review/types.js").ReviewResult;
  status: string;
  resolved_at: string | null;
}

export async function insertPendingReview(
  repo: string,
  pullNumber: number,
  headSha: string,
  owner: string,
  installationId: number,
  result: import("../review/types.js").ReviewResult
): Promise<number> {
  if (!_pool) throw new Error("Database not initialized");
  const { rows } = await _pool.query(
    `INSERT INTO pending_reviews (repo, pull_number, head_sha, owner, installation_id, result_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [repo, pullNumber, headSha, owner, installationId, JSON.stringify(result)]
  );
  return rows[0].id;
}

export async function listPendingReviews(
  status?: string
): Promise<PendingReviewRow[]> {
  if (!_pool) return [];
  const where = status ? "WHERE status = $1" : "";
  const params = status ? [status] : [];
  const { rows } = await _pool.query(
    `SELECT * FROM pending_reviews ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

export async function resolvePendingReview(
  id: number,
  resolution: "approved" | "rejected"
): Promise<PendingReviewRow | null> {
  if (!_pool) return null;
  const { rows } = await _pool.query(
    `UPDATE pending_reviews
     SET status = $1, resolved_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [resolution, id]
  );
  return rows[0] ?? null;
}

function emptyAggregation(period: string): AggregatedMetrics {
  return {
    period,
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    totalReviews: 0, totalComments: 0, totalFeedback: 0,
    approvalRate: 0,
    approvalRateBySource: { rule: 0, llm: 0 },
    approvalRateByCategory: {},
    approvalRateDelta: 0, commentsPerReviewDelta: 0,
    avgCommentsPerReview: 0, avgDurationMs: 0,
    severityDistribution: { error: 0, warning: 0, info: 0 },
    avgTokensPerReview: 0, llmParseSuccessRate: 0,
    totalInteractions: 0, avgPatternsRecalled: 0,
    knowledgeBaseApprovalRate: 0,
  };
}
