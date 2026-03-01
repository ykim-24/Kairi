import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractConcepts } from "../../src/learning/concept-extractor.js";
import { parsePatch } from "../../src/utils/diff-parser.js";

// Mock the Anthropic client
vi.mock("../../src/llm/client.js", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '["error-handling", "null-safety", "input-validation"]',
          },
        ],
      }),
    },
  }),
}));

describe("concept-extractor", () => {
  it("extracts file-level concepts deterministically", async () => {
    const files = [
      parsePatch("src/services/auth-service.ts", "+const x = 1;", "modified"),
    ];
    const concepts = await extractConcepts(files, "auth check");

    expect(concepts).toContain("file:src/services/auth-service.ts");
    expect(concepts).toContain("stem:auth-service");
  });

  it("calls LLM for semantic concept extraction", async () => {
    const files = [
      parsePatch("src/auth/login.ts", "+const x = 1;", "modified"),
    ];
    const concepts = await extractConcepts(
      files,
      "This function has a potential memory leak in the event handler"
    );

    // Should have file-level concepts
    expect(concepts).toContain("file:src/auth/login.ts");
    expect(concepts).toContain("stem:login");
    // Should have LLM-extracted concepts
    expect(concepts).toContain("error-handling");
    expect(concepts).toContain("null-safety");
  });

  it("caps at 15 concepts", async () => {
    const files = [
      parsePatch(
        "src/api/routes/auth/middleware/hooks/components/test.tsx",
        "+x",
        "modified"
      ),
    ];
    const concepts = await extractConcepts(
      files,
      "performance security authentication routing middleware hooks components"
    );

    expect(concepts.length).toBeLessThanOrEqual(15);
  });

  it("skips LLM for very short comments", async () => {
    const files = [
      parsePatch("src/index.ts", "+const x = 1;", "modified"),
    ];
    const concepts = await extractConcepts(files, "ok");

    // Should only have file-level concepts, no LLM call for short text
    expect(concepts).toContain("file:src/index.ts");
    expect(concepts).toContain("stem:index");
    expect(concepts.length).toBe(2);
  });
});
