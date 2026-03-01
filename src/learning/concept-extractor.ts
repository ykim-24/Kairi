import { getAnthropicClient } from "../llm/client.js";
import { createChildLogger } from "../utils/logger.js";
import type { ParsedFile } from "../utils/diff-parser.js";

const log = createChildLogger({ module: "concept-extractor" });

const CONCEPT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Extract meaningful code review concepts using an LLM.
 * Returns file-level identifiers + semantically extracted concepts.
 */
export async function extractConcepts(
  files: ParsedFile[],
  reviewComment: string
): Promise<string[]> {
  const concepts: string[] = [];

  // File-level identifiers (deterministic, no LLM needed)
  for (const file of files) {
    concepts.push(`file:${file.filename}`);
    const stem = extractFileStem(file.filename);
    if (stem && stem.length > 2) {
      concepts.push(`stem:${stem}`);
    }
  }

  // LLM-based semantic concept extraction
  if (reviewComment.trim().length > 10) {
    try {
      const llmConcepts = await extractWithLLM(files, reviewComment);
      concepts.push(...llmConcepts);
    } catch (err) {
      log.warn({ err }, "LLM concept extraction failed, using fallback");
      concepts.push(...fallbackExtract(reviewComment));
    }
  }

  return concepts.slice(0, 15);
}

async function extractWithLLM(
  files: ParsedFile[],
  reviewComment: string
): Promise<string[]> {
  const client = getAnthropicClient();

  const fileContext =
    files.length > 0
      ? `Files: ${files.map((f) => f.filename).join(", ")}\n\n`
      : "";

  const response = await client.messages.create({
    model: CONCEPT_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: `You extract code review concepts. Given a review comment and optional file context, return 3-7 lowercase hyphenated concept tags that capture the core technical topics.

Focus on:
- Code patterns: null-safety, error-handling, race-condition, input-validation, boundary-check
- Architecture: separation-of-concerns, dependency-injection, caching-strategy, api-design
- Quality: naming-convention, dead-code, code-duplication, magic-number, single-responsibility
- Domain: authentication, authorization, database-query, state-management, logging

Do NOT return generic language names (typescript, javascript, react), generic words (code, file, function), or non-technical words.

Respond with ONLY a JSON array of strings. Example: ["error-handling", "null-safety", "input-validation"]`,
    messages: [
      {
        role: "user",
        content: `${fileContext}Review comment: ${reviewComment.slice(0, 1000)}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseConceptArray(text);
}

function parseConceptArray(text: string): string[] {
  const clean = (arr: unknown[]): string[] =>
    arr
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.toLowerCase().trim())
      .filter((c) => c.length > 2 && c.length < 50)
      .slice(0, 7);

  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return clean(parsed);
  } catch {
    // Try extracting array from surrounding text
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        return clean(JSON.parse(match[0]));
      } catch {
        /* ignore */
      }
    }
  }
  return [];
}

/** Simple regex fallback when LLM is unavailable */
function fallbackExtract(comment: string): string[] {
  const lower = comment.toLowerCase();
  const concepts: string[] = [];

  if (/\b(null|undefined|optional|nil)\b/.test(lower)) concepts.push("null-safety");
  if (/\b(error|exception|try|catch|throw)\b/.test(lower)) concepts.push("error-handling");
  if (/\b(security|secret|credential|token|password|xss|injection)\b/.test(lower)) concepts.push("security");
  if (/\b(performance|slow|memory|leak|optimize|cache|latency)\b/.test(lower)) concepts.push("performance");
  if (/\b(test|coverage|spec|assert|mock)\b/.test(lower)) concepts.push("testing");
  if (/\b(type|interface|generic|enum)\b/.test(lower)) concepts.push("type-safety");
  if (/\b(async|await|promise|race|concurrent|parallel)\b/.test(lower)) concepts.push("async-patterns");
  if (/\b(naming|name|readab|clean)\b/.test(lower)) concepts.push("naming-convention");
  if (/\b(refactor|extract|duplicate|dry)\b/.test(lower)) concepts.push("code-structure");
  if (/\b(validate|sanitize|input|check)\b/.test(lower)) concepts.push("input-validation");

  return concepts.length > 0 ? concepts : ["general-review"];
}

function extractFileStem(filename: string): string {
  const basename = filename.split("/").pop() ?? "";
  const dotIndex = basename.indexOf(".");
  return dotIndex > 0 ? basename.slice(0, dotIndex).toLowerCase() : basename.toLowerCase();
}
