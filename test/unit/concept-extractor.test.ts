import { describe, it, expect } from "vitest";
import { extractConcepts } from "../../src/learning/concept-extractor.js";
import { parsePatch } from "../../src/utils/diff-parser.js";

describe("concept-extractor", () => {
  it("extracts language concepts from file extensions", () => {
    const files = [
      parsePatch("src/auth/login.ts", "+const x = 1;", "modified"),
    ];
    const concepts = extractConcepts(files, "authentication check");

    expect(concepts).toContain("typescript");
  });

  it("extracts directory-based concepts", () => {
    const files = [
      parsePatch("src/auth/middleware/check.ts", "+const x = 1;", "modified"),
    ];
    const concepts = extractConcepts(files, "check auth");

    expect(concepts).toContain("authentication");
    expect(concepts).toContain("middleware");
  });

  it("extracts keyword concepts from review text", () => {
    const files = [parsePatch("index.ts", "+const x = 1;", "modified")];
    const concepts = extractConcepts(
      files,
      "This function has a potential memory leak in the event handler"
    );

    expect(concepts).toContain("typescript");
    // Should extract meaningful words
    expect(concepts.some((c) => c.length > 4)).toBe(true);
  });

  it("caps at 10 concepts", () => {
    const files = [
      parsePatch("src/api/routes/auth/middleware/hooks/components/test.tsx", "+x", "modified"),
    ];
    const concepts = extractConcepts(
      files,
      "performance security authentication routing middleware hooks components"
    );

    expect(concepts.length).toBeLessThanOrEqual(10);
  });
});
