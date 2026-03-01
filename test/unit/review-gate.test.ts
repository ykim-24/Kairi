import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg-store before importing orchestrator
vi.mock("../../src/metrics/pg-store.js", () => ({
  getFeatureFlag: vi.fn(),
  insertPendingReview: vi.fn(),
}));

// Mock everything else the orchestrator imports
vi.mock("../../src/github/client.js", () => ({
  getOctokit: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../src/github/pulls.js", () => ({
  fetchPRFiles: vi.fn().mockResolvedValue([
    {
      filename: "src/app.ts",
      status: "modified",
      additions: 5,
      deletions: 2,
      changes: 7,
      patch: "@@ -1,3 +1,5 @@\n+const x = 1;\n+console.log(x);",
    },
  ]),
  parseFiles: vi.fn().mockReturnValue([
    {
      filename: "src/app.ts",
      status: "modified",
      hunks: [
        {
          header: "@@ -1,3 +1,5 @@",
          lines: [
            { type: "add", content: "const x = 1;", oldLineNumber: null, newLineNumber: 2 },
          ],
        },
      ],
    },
  ]),
}));
vi.mock("../../src/config-loader/loader.js", () => ({
  loadRepoConfig: vi.fn().mockResolvedValue({
    enabled: true,
    review: { dismissOnUpdate: false },
    filters: { excludePaths: [], maxFiles: 50 },
    llm: { enabled: false },
    learning: { enabled: false },
  }),
}));
vi.mock("../../src/rules/engine.js", () => ({
  runRules: vi.fn().mockReturnValue({ comments: [], rulesRun: 0 }),
}));
vi.mock("../../src/llm/reviewer.js", () => ({
  reviewWithLLM: vi.fn(),
}));
vi.mock("../../src/learning/vector-store.js", () => ({
  storeInteraction: vi.fn(),
}));
vi.mock("../../src/learning/graph-store.js", () => ({
  storeInteraction: vi.fn(),
}));
vi.mock("../../src/learning/concept-extractor.js", () => ({
  extractConcepts: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/metrics/collector.js", () => ({
  collectReviewMetrics: vi.fn(),
}));
vi.mock("../../src/llm/chunker.js", () => ({
  estimateFileTokens: vi.fn().mockReturnValue(100),
}));
vi.mock("../../src/review/filter.js", () => ({
  filterFindings: vi.fn().mockReturnValue({ inline: [], bodyOnly: [] }),
}));
vi.mock("../../src/review/body-builder.js", () => ({
  buildReviewBody: vi.fn().mockReturnValue("## Review\nLooks good"),
}));
vi.mock("../../src/review/inline-formatter.js", () => ({
  formatInlineComment: vi.fn().mockReturnValue("formatted"),
}));
vi.mock("../../src/github/reviews.js", () => ({
  postReview: vi.fn().mockResolvedValue(42),
  dismissPreviousReviews: vi.fn(),
}));
vi.mock("../../src/config/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({}),
  isLearningEnabled: vi.fn().mockReturnValue(false),
}));

import { orchestrateReview } from "../../src/review/orchestrator.js";
import { getFeatureFlag, insertPendingReview } from "../../src/metrics/pg-store.js";
import { postReview } from "../../src/github/reviews.js";
import { collectReviewMetrics } from "../../src/metrics/collector.js";

const ctx = {
  owner: "test-org",
  repo: "test-repo",
  pullNumber: 7,
  headSha: "abc123",
  headRef: "feature-branch",
  baseRef: "main",
  installationId: 999,
};

describe("review gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts review directly when gate is OFF", async () => {
    vi.mocked(getFeatureFlag).mockResolvedValue(false);

    await orchestrateReview(ctx, false);

    expect(getFeatureFlag).toHaveBeenCalledWith("review_gate");
    expect(insertPendingReview).not.toHaveBeenCalled();
    expect(postReview).toHaveBeenCalled();
    expect(collectReviewMetrics).toHaveBeenCalled();
  });

  it("holds review in pending queue when gate is ON", async () => {
    vi.mocked(getFeatureFlag).mockResolvedValue(true);
    vi.mocked(insertPendingReview).mockResolvedValue(1);

    await orchestrateReview(ctx, false);

    expect(getFeatureFlag).toHaveBeenCalledWith("review_gate");
    expect(insertPendingReview).toHaveBeenCalledWith(
      "test-org/test-repo",
      7,
      "abc123",
      "test-org",
      999,
      expect.objectContaining({
        bodyMarkdown: expect.any(String),
        inlineComments: expect.any(Array),
        event: expect.any(String),
      })
    );
    expect(postReview).not.toHaveBeenCalled();
    expect(collectReviewMetrics).not.toHaveBeenCalled();
  });
});
