import { describe, it, expect } from "vitest";
import { formatInlineComment } from "../../src/review/inline-formatter.js";
import type { ReviewFinding } from "../../src/review/types.js";

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    path: "test.ts",
    line: 42,
    body: "Hardcoded API key found.",
    source: "llm",
    severity: "error",
    category: "security",
    confidence: 0.85,
    ...overrides,
  };
}

describe("formatInlineComment", () => {
  it("includes severity label", () => {
    const result = formatInlineComment(makeFinding({ severity: "error" }));
    expect(result).toContain("**Error**");
  });

  it("includes warning label for warnings", () => {
    const result = formatInlineComment(makeFinding({ severity: "warning" }));
    expect(result).toContain("**Warning**");
  });

  it("includes category and confidence", () => {
    const result = formatInlineComment(makeFinding({ category: "security", confidence: 0.85 }));
    expect(result).toContain("security");
    expect(result).toContain("0.85");
  });

  it("includes body text", () => {
    const result = formatInlineComment(makeFinding({ body: "Use env vars instead." }));
    expect(result).toContain("Use env vars instead.");
  });

  it("includes suggestion block when suggestedFix is present", () => {
    const result = formatInlineComment(
      makeFinding({ suggestedFix: 'const key = process.env.API_KEY;' })
    );
    expect(result).toContain("```suggestion");
    expect(result).toContain("const key = process.env.API_KEY;");
    expect(result).toContain("```");
  });

  it("omits suggestion block when no suggestedFix", () => {
    const result = formatInlineComment(makeFinding({ suggestedFix: undefined }));
    expect(result).not.toContain("```suggestion");
  });

  it("includes graph context when present", () => {
    const result = formatInlineComment(
      makeFinding({ graphContext: "Similar hardcoded secrets in src/config.ts were flagged and fixed." })
    );
    expect(result).toContain("> Similar hardcoded secrets");
  });

  it("omits graph context when not present", () => {
    const result = formatInlineComment(makeFinding({ graphContext: undefined }));
    // Only the header + body, no blockquote
    expect(result).not.toContain("> ");
  });

  it("formats a full finding with all fields", () => {
    const result = formatInlineComment(
      makeFinding({
        severity: "error",
        category: "security",
        confidence: 0.92,
        body: "Hardcoded secret detected.",
        suggestedFix: 'const key = process.env.API_KEY;',
        graphContext: "Past reviews: Similar secrets in `src/config.ts` were flagged and fixed.",
      })
    );

    expect(result).toContain("**Error**");
    expect(result).toContain("security");
    expect(result).toContain("0.92");
    expect(result).toContain("Hardcoded secret detected.");
    expect(result).toContain("```suggestion");
    expect(result).toContain("const key = process.env.API_KEY;");
    expect(result).toContain("> Past reviews");
  });
});
