import { describe, it, expect } from "vitest";
import { filterFindings } from "../../src/review/filter.js";
import type { ReviewFinding } from "../../src/review/types.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";

function makeFinding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    path: "test.ts",
    line: 1,
    body: "Test finding",
    source: "llm",
    severity: "warning",
    category: "bugs",
    confidence: 0.8,
    ...overrides,
  };
}

describe("filterFindings", () => {
  it("always inlines error-severity findings", () => {
    const findings = [makeFinding({ severity: "error", confidence: 0.3 })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(1);
    expect(bodyOnly).toHaveLength(0);
  });

  it("always inlines security category regardless of confidence", () => {
    const findings = [makeFinding({ category: "security", confidence: 0.2, severity: "info" })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(1);
    expect(bodyOnly).toHaveLength(0);
  });

  it("always inlines bugs category regardless of confidence", () => {
    const findings = [makeFinding({ category: "bugs", confidence: 0.1, severity: "info" })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(1);
    expect(bodyOnly).toHaveLength(0);
  });

  it("inlines warnings above threshold", () => {
    const findings = [makeFinding({ severity: "warning", category: "performance", confidence: 0.8 })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(1);
    expect(bodyOnly).toHaveLength(0);
  });

  it("puts low-confidence warnings in body only", () => {
    const findings = [makeFinding({ severity: "warning", category: "readability", confidence: 0.5 })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(0);
    expect(bodyOnly).toHaveLength(1);
  });

  it("puts info-level findings in body only (unless security/bugs)", () => {
    const findings = [makeFinding({ severity: "info", category: "style", confidence: 1.0 })];
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(0);
    expect(bodyOnly).toHaveLength(1);
  });

  it("caps inline comments at maxInlineComments", () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ line: i + 1, severity: "error", confidence: 0.9 })
    );
    const { inline, bodyOnly } = filterFindings(findings, DEFAULT_CONFIG);

    expect(inline).toHaveLength(5); // default maxInlineComments
    expect(bodyOnly).toHaveLength(5);
  });

  it("prioritizes errors over warnings when capping", () => {
    const findings = [
      makeFinding({ line: 1, severity: "warning", category: "performance", confidence: 0.9 }),
      makeFinding({ line: 2, severity: "error", confidence: 0.7 }),
      makeFinding({ line: 3, severity: "warning", category: "performance", confidence: 0.95 }),
      makeFinding({ line: 4, severity: "error", confidence: 0.9 }),
    ];

    const config = { ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, maxInlineComments: 2 } };
    const { inline, bodyOnly } = filterFindings(findings, config);

    expect(inline).toHaveLength(2);
    expect(inline.every((f) => f.severity === "error")).toBe(true);
    expect(bodyOnly).toHaveLength(2);
  });

  it("handles empty findings", () => {
    const { inline, bodyOnly } = filterFindings([], DEFAULT_CONFIG);

    expect(inline).toHaveLength(0);
    expect(bodyOnly).toHaveLength(0);
  });

  it("respects custom inlineThreshold", () => {
    const findings = [makeFinding({ severity: "warning", category: "performance", confidence: 0.6 })];

    const strictConfig = { ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, inlineThreshold: 0.9 } };
    const { inline: strictInline } = filterFindings(findings, strictConfig);
    expect(strictInline).toHaveLength(0);

    const looseConfig = { ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, inlineThreshold: 0.5 } };
    const { inline: looseInline } = filterFindings(findings, looseConfig);
    expect(looseInline).toHaveLength(1);
  });
});
