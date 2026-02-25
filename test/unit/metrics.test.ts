import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import {
  initMetricsDb,
  closeMetricsDb,
  recordReview,
  recordFeedback,
  getAggregatedMetrics,
  getApprovalTrend,
  getReviewTrend,
  getRepoBreakdown,
} from "../../src/metrics/pg-store.js";
import type { ReviewMetric, FeedbackMetric } from "../../src/metrics/types.js";

const TEST_DB_URL = process.env.TEST_POSTGRES_URL ?? process.env.POSTGRES_URL;

// Skip all tests if no Postgres is available
const describeWithDb = TEST_DB_URL ? describe : describe.skip;

describeWithDb("metrics pg store", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    await initMetricsDb(TEST_DB_URL);
    pool = new pg.Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    // Clean up test data
    if (pool) {
      await pool.query("DELETE FROM review_metrics WHERE repo LIKE 'test/%'");
      await pool.query("DELETE FROM feedback_metrics WHERE repo LIKE 'test/%'");
      await pool.end();
    }
    await closeMetricsDb();
  });

  beforeEach(async () => {
    if (pool) {
      await pool.query("DELETE FROM review_metrics WHERE repo LIKE 'test/%'");
      await pool.query("DELETE FROM feedback_metrics WHERE repo LIKE 'test/%'");
    }
  });

  const sampleReview: ReviewMetric = {
    repo: "test/repo",
    pullNumber: 1,
    totalComments: 5,
    ruleComments: 2,
    llmComments: 3,
    filesReviewed: 10,
    errorCount: 1,
    warningCount: 3,
    infoCount: 1,
    llmChunks: 2,
    llmTokensEstimated: 15000,
    llmParseSuccess: true,
    durationMs: 5400,
    patternsRecalled: 3,
    approvedPatternsUsed: 2,
    rejectedPatternsUsed: 1,
  };

  const sampleFeedback: FeedbackMetric = {
    repo: "test/repo",
    pullNumber: 1,
    interactionId: "test-id-1",
    feedbackType: "resolved",
    commentSource: "llm",
    category: "bugs",
    positive: true,
  };

  it("records and retrieves review metrics", async () => {
    await recordReview(sampleReview);
    await recordReview({ ...sampleReview, pullNumber: 2, totalComments: 3 });

    const agg = await getAggregatedMetrics("test/repo", "week");
    expect(agg.totalReviews).toBe(2);
    expect(agg.totalComments).toBe(8);
  });

  it("records and retrieves feedback metrics", async () => {
    await recordFeedback(sampleFeedback);
    await recordFeedback({ ...sampleFeedback, interactionId: "test-id-2", positive: false });

    const agg = await getAggregatedMetrics("test/repo", "week");
    expect(agg.totalFeedback).toBe(2);
    expect(agg.approvalRate).toBe(0.5);
  });

  it("calculates approval rate by source", async () => {
    await recordFeedback({ ...sampleFeedback, commentSource: "rule", positive: true });
    await recordFeedback({ ...sampleFeedback, interactionId: "2", commentSource: "rule", positive: true });
    await recordFeedback({ ...sampleFeedback, interactionId: "3", commentSource: "llm", positive: false });

    const agg = await getAggregatedMetrics("test/repo", "week");
    expect(agg.approvalRateBySource.rule).toBe(1);
    expect(agg.approvalRateBySource.llm).toBe(0);
  });

  it("returns empty aggregation for no data", async () => {
    const agg = await getAggregatedMetrics("nonexistent/repo", "week");
    expect(agg.totalReviews).toBe(0);
    expect(agg.approvalRate).toBe(0);
  });

  it("returns repo breakdown", async () => {
    await recordReview(sampleReview);
    await recordReview({ ...sampleReview, repo: "test/other" });

    const repos = await getRepoBreakdown();
    const testRepos = repos.filter((r) => r.repo.startsWith("test/"));
    expect(testRepos.length).toBe(2);
  });
});

// Always-run test that doesn't need a DB
describe("metrics types", () => {
  it("has correct type definitions", () => {
    const metric: ReviewMetric = {
      repo: "org/repo",
      pullNumber: 1,
      totalComments: 0,
      ruleComments: 0,
      llmComments: 0,
      filesReviewed: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      llmChunks: 0,
      llmTokensEstimated: 0,
      llmParseSuccess: true,
      durationMs: 0,
      patternsRecalled: 0,
      approvedPatternsUsed: 0,
      rejectedPatternsUsed: 0,
    };
    expect(metric.repo).toBe("org/repo");
  });
});
