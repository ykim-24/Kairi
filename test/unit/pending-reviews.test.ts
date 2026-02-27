import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import {
  initMetricsDb,
  closeMetricsDb,
  insertPendingReview,
  listPendingReviews,
  resolvePendingReview,
  getFeatureFlag,
  setFeatureFlag,
} from "../../src/metrics/pg-store.js";
import type { ReviewResult } from "../../src/review/types.js";

const TEST_DB_URL = process.env.TEST_POSTGRES_URL ?? process.env.POSTGRES_URL;

const describeWithDb = TEST_DB_URL ? describe : describe.skip;

const sampleResult: ReviewResult = {
  bodyMarkdown: "## Review\nLooks good",
  inlineComments: [
    {
      path: "src/app.ts",
      line: 10,
      body: "Consider using const",
      source: "rule",
      severity: "warning",
      category: "style",
      confidence: 0.9,
      ruleId: "prefer-const",
    },
  ],
  event: "COMMENT",
  metadata: {
    filesReviewed: 3,
    rulesRun: 5,
    llmChunks: 2,
    durationMs: 1200,
  },
};

describeWithDb("pending reviews", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    await initMetricsDb(TEST_DB_URL);
    pool = new pg.Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM pending_reviews WHERE repo LIKE 'test/%'");
      await pool.end();
    }
    await closeMetricsDb();
  });

  beforeEach(async () => {
    if (pool) {
      await pool.query("DELETE FROM pending_reviews WHERE repo LIKE 'test/%'");
    }
  });

  it("inserts a pending review and returns its id", async () => {
    const id = await insertPendingReview(
      "test/repo", 1, "sha123", "test-org", 100, sampleResult
    );
    expect(id).toBeGreaterThan(0);
  });

  it("lists pending reviews", async () => {
    await insertPendingReview("test/repo", 1, "sha1", "test-org", 100, sampleResult);
    await insertPendingReview("test/repo", 2, "sha2", "test-org", 100, sampleResult);

    const all = await listPendingReviews();
    const testRows = all.filter((r) => r.repo === "test/repo");
    expect(testRows.length).toBe(2);
    expect(testRows[0].status).toBe("pending");
  });

  it("filters by status", async () => {
    const id = await insertPendingReview("test/repo", 1, "sha1", "test-org", 100, sampleResult);
    await insertPendingReview("test/repo", 2, "sha2", "test-org", 100, sampleResult);
    await resolvePendingReview(id, "approved");

    const pending = await listPendingReviews("pending");
    const testPending = pending.filter((r) => r.repo === "test/repo");
    expect(testPending.length).toBe(1);
    expect(testPending[0].pull_number).toBe(2);
  });

  it("approves a pending review", async () => {
    const id = await insertPendingReview("test/repo", 5, "sha5", "test-org", 100, sampleResult);

    const resolved = await resolvePendingReview(id, "approved");
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("approved");
    expect(resolved!.resolved_at).not.toBeNull();
    expect(resolved!.result_json).toEqual(sampleResult);
  });

  it("rejects a pending review", async () => {
    const id = await insertPendingReview("test/repo", 6, "sha6", "test-org", 100, sampleResult);

    const resolved = await resolvePendingReview(id, "rejected");
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("rejected");
  });

  it("returns null when resolving already-resolved review", async () => {
    const id = await insertPendingReview("test/repo", 7, "sha7", "test-org", 100, sampleResult);
    await resolvePendingReview(id, "approved");

    const again = await resolvePendingReview(id, "rejected");
    expect(again).toBeNull();
  });

  it("stores and retrieves result_json correctly", async () => {
    const id = await insertPendingReview("test/repo", 8, "sha8", "test-org", 100, sampleResult);
    const rows = await listPendingReviews();
    const row = rows.find((r) => r.id === id);

    expect(row).toBeDefined();
    expect(row!.result_json.bodyMarkdown).toBe("## Review\nLooks good");
    expect(row!.result_json.inlineComments).toHaveLength(1);
    expect(row!.result_json.inlineComments[0].path).toBe("src/app.ts");
  });
});

describeWithDb("review_gate feature flag", () => {
  beforeAll(async () => {
    await initMetricsDb(TEST_DB_URL);
  });

  afterAll(async () => {
    await setFeatureFlag("review_gate", false);
    await closeMetricsDb();
  });

  it("defaults to false", async () => {
    const enabled = await getFeatureFlag("review_gate");
    expect(enabled).toBe(false);
  });

  it("can be toggled on and off", async () => {
    await setFeatureFlag("review_gate", true);
    expect(await getFeatureFlag("review_gate")).toBe(true);

    await setFeatureFlag("review_gate", false);
    expect(await getFeatureFlag("review_gate")).toBe(false);
  });
});
