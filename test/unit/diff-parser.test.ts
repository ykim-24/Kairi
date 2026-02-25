import { describe, it, expect } from "vitest";
import { parsePatch, getAddedLineNumbers } from "../../src/utils/diff-parser.js";
import { SIMPLE_PATCH, MULTI_HUNK_PATCH } from "../fixtures/sample-patch.js";

describe("diff-parser", () => {
  it("parses a simple patch with additions and deletions", () => {
    const result = parsePatch("test.ts", SIMPLE_PATCH, "modified");

    expect(result.filename).toBe("test.ts");
    expect(result.status).toBe("modified");
    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBeGreaterThan(0);
    expect(result.hunks).toHaveLength(1);
  });

  it("extracts correct line numbers for added lines", () => {
    const result = parsePatch("test.ts", SIMPLE_PATCH, "modified");
    const addedLines = getAddedLineNumbers(result);

    expect(addedLines.length).toBeGreaterThan(0);
    // All added line numbers should be positive
    for (const line of addedLines) {
      expect(line).toBeGreaterThan(0);
    }
  });

  it("parses multi-hunk patches", () => {
    const result = parsePatch("utils.ts", MULTI_HUNK_PATCH, "modified");

    expect(result.hunks).toHaveLength(2);
    expect(result.additions).toBeGreaterThan(0);
  });

  it("handles empty patch gracefully", () => {
    const result = parsePatch("empty.ts", undefined, "added");

    expect(result.filename).toBe("empty.ts");
    expect(result.status).toBe("added");
    expect(result.hunks).toHaveLength(0);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("normalizes file status correctly", () => {
    expect(parsePatch("a.ts", "", "added").status).toBe("added");
    expect(parsePatch("b.ts", "", "removed").status).toBe("removed");
    expect(parsePatch("c.ts", "", "renamed").status).toBe("renamed");
    expect(parsePatch("d.ts", "", "modified").status).toBe("modified");
    expect(parsePatch("e.ts", "", "changed").status).toBe("modified");
  });
});
