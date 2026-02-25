import { describe, it, expect } from "vitest";
import { chunkFiles, estimateFileTokens } from "../../src/llm/chunker.js";
import { parsePatch } from "../../src/utils/diff-parser.js";

describe("chunker", () => {
  const makeFile = (name: string, lineCount: number) => {
    const lines = Array.from({ length: lineCount }, (_, i) => `+const x${i} = ${i};`);
    const patch = `@@ -0,0 +1,${lineCount} @@\n${lines.join("\n")}`;
    return parsePatch(name, patch, "added");
  };

  it("groups small files into a single chunk", () => {
    const files = [
      makeFile("a.ts", 10),
      makeFile("b.ts", 10),
      makeFile("c.ts", 10),
    ];
    const chunks = chunkFiles(files, 10000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toHaveLength(3);
  });

  it("splits files across chunks when budget is exceeded", () => {
    const files = [
      makeFile("a.ts", 200),
      makeFile("b.ts", 200),
      makeFile("c.ts", 200),
    ];
    // Use a very small budget to force splitting
    const chunks = chunkFiles(files, 500);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("prioritizes source files over docs", () => {
    const files = [
      makeFile("readme.md", 50),
      makeFile("src/main.ts", 50),
      makeFile("test/main.test.ts", 50),
    ];
    const chunks = chunkFiles(files, 100000);

    // Source file should come first in the chunk
    expect(chunks[0].files[0].filename).toBe("src/main.ts");
  });

  it("estimates tokens reasonably", () => {
    const file = makeFile("test.ts", 100);
    const tokens = estimateFileTokens(file);

    // Each line is ~20 chars, so 100 lines = ~2000 chars = ~500 tokens
    expect(tokens).toBeGreaterThan(100);
    expect(tokens).toBeLessThan(2000);
  });
});
