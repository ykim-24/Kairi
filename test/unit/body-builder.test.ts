import { describe, it, expect } from "vitest";
import { buildReviewBody } from "../../src/review/body-builder.js";
import type { ReviewFinding } from "../../src/review/types.js";

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    path: "test.ts",
    line: 1,
    body: "Test issue",
    source: "llm",
    severity: "warning",
    category: "bugs",
    confidence: 0.8,
    ...overrides,
  };
}

const defaultMetadata = {
  filesReviewed: 3,
  rulesRun: 5,
  llmFindings: 2,
  ruleFindings: 3,
  durationMs: 1500,
};

describe("buildReviewBody", () => {
  it("includes kairi-review tag", () => {
    const body = buildReviewBody({
      llmSummary: "Looks good",
      findings: [],
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("<!-- kairi-review -->");
  });

  it("includes LLM summary", () => {
    const body = buildReviewBody({
      llmSummary: "Overall the code is clean.",
      findings: [],
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("Overall the code is clean.");
  });

  it("groups findings by severity", () => {
    const findings = [
      makeFinding({ severity: "error", path: "a.ts", body: "Error issue" }),
      makeFinding({ severity: "warning", path: "b.ts", body: "Warning issue" }),
      makeFinding({ severity: "info", path: "c.ts", body: "Info issue" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 1,
      metadata: defaultMetadata,
    });

    expect(body).toContain("### Errors");
    expect(body).toContain("### Warnings");
    expect(body).toContain("### Suggestions");
    expect(body).toContain("Error issue");
    expect(body).toContain("Warning issue");
    expect(body).toContain("Info issue");
  });

  it("uses bullet lists for all severities", () => {
    const findings = [
      makeFinding({ severity: "error", path: "a.ts", line: 10, body: "Bad code" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 1,
      metadata: defaultMetadata,
    });

    expect(body).toContain("- **`a.ts`** L10");
    expect(body).toContain("Bad code");
  });

  it("formats info items as bullet list", () => {
    const findings = [
      makeFinding({ severity: "info", path: "c.ts", line: 5, body: "Consider this" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("- **`c.ts`** L5 — Consider this");
  });

  it("shows compact stats footer", () => {
    const body = buildReviewBody({
      llmSummary: "",
      findings: [],
      inlineCount: 2,
      metadata: { ...defaultMetadata, filesReviewed: 5, ruleFindings: 3, llmFindings: 4 },
    });

    expect(body).toContain("5 files");
    expect(body).toContain("7 findings");
    expect(body).toContain("2 inline");
  });

  it("shows no issues message when findings are empty", () => {
    const body = buildReviewBody({
      llmSummary: "",
      findings: [],
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("No issues found.");
  });

  it("handles pipe characters in finding bodies", () => {
    const findings = [
      makeFinding({ severity: "error", body: "Use a | b instead" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    // Bullet list format, no pipe escaping needed
    expect(body).toContain("Use a | b instead");
  });
});
