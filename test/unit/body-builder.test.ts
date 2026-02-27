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

    expect(body).toContain("### Errors (must fix)");
    expect(body).toContain("### Warnings");
    expect(body).toContain("### Info / Suggestions");
    expect(body).toContain("Error issue");
    expect(body).toContain("Warning issue");
    expect(body).toContain("Info issue");
  });

  it("uses tables for errors and warnings", () => {
    const findings = [
      makeFinding({ severity: "error", path: "a.ts", line: 10, body: "Bad code" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 1,
      metadata: defaultMetadata,
    });

    expect(body).toContain("| `a.ts` | L10 | Bad code |");
  });

  it("uses bullet list for info items", () => {
    const findings = [
      makeFinding({ severity: "info", path: "c.ts", line: 5, body: "Consider this" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("- `c.ts:5` — Consider this");
  });

  it("shows stats footer", () => {
    const body = buildReviewBody({
      llmSummary: "",
      findings: [],
      inlineCount: 2,
      metadata: { ...defaultMetadata, filesReviewed: 5, ruleFindings: 3, llmFindings: 4 },
    });

    expect(body).toContain("5 files reviewed");
    expect(body).toContain("3 rule findings");
    expect(body).toContain("4 LLM findings");
    expect(body).toContain("2 inline comments posted");
  });

  it("shows no issues message when findings are empty", () => {
    const body = buildReviewBody({
      llmSummary: "",
      findings: [],
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("No issues found. Looks good!");
  });

  it("escapes pipe characters in finding bodies", () => {
    const findings = [
      makeFinding({ severity: "error", body: "Use a | b instead" }),
    ];

    const body = buildReviewBody({
      llmSummary: "",
      findings,
      inlineCount: 0,
      metadata: defaultMetadata,
    });

    expect(body).toContain("Use a \\| b instead");
  });
});
