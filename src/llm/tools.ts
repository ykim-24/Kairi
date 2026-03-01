import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { searchSimilar } from "../learning/vector-store.js";
import { getFileHistory } from "../learning/graph-store.js";
import { getConceptApprovalRates } from "../metrics/graph-metrics.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "llm-tools" });

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic format)
// ---------------------------------------------------------------------------

export const REVIEW_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_past_reviews",
    description:
      "Semantic search across past code review comments. Use this when you spot a pattern in the diff and want to know how similar code was reviewed before. Returns matching review comments with approval status.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language description of the pattern or code construct to search for",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_file_history",
    description:
      "Get past review comments for a specific file. Use this to understand what kinds of issues have been flagged in this file before and whether those comments were accepted or dismissed.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "Relative file path (e.g. src/utils/auth.ts)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5, max 10)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "get_concept_stats",
    description:
      "Get approval/rejection rates for review categories in this repo. Use this to calibrate your confidence — if a category of feedback is frequently dismissed, lower your confidence or skip it.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "submit_review",
    description:
      "Submit the final review. Call this when you have finished analyzing all files and are ready to deliver your findings. This is the ONLY way to complete the review.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description:
            "Overall assessment of the PR changes — how they fit together, key observations",
        },
        comments: {
          type: "array",
          description: "Review comments (findings). Empty array if no issues found.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative file path" },
              line: {
                type: "number",
                description: "Line number in the NEW version of the file",
              },
              body: {
                type: "string",
                description:
                  "Clear description of the issue — explain WHY it matters, not just what is wrong",
              },
              severity: {
                type: "string",
                enum: ["error", "warning", "info"],
                description:
                  "error = must fix, warning = should fix, info = suggestion",
              },
              category: {
                type: "string",
                description:
                  "Issue category: bugs, security, performance, readability, maintainability",
              },
              confidence: {
                type: "number",
                description: "0.0–1.0, how confident this is a real issue",
              },
              suggestedFix: {
                type: "string",
                description:
                  "Optional replacement code snippet (only the corrected lines)",
              },
            },
            required: ["path", "line", "body", "severity", "category", "confidence"],
          },
        },
      },
      required: ["summary", "comments"],
    },
  },
];

/** Lookup-only tools (excludes submit_review) — used when learning is disabled */
export const LOOKUP_TOOL_NAMES = [
  "search_past_reviews",
  "get_file_history",
  "get_concept_stats",
] as const;

// ---------------------------------------------------------------------------
// Validation schema for submit_review (reuses llmCommentSchema shape)
// ---------------------------------------------------------------------------

export const submitReviewSchema = z.object({
  summary: z.string(),
  comments: z.array(
    z.object({
      path: z.string(),
      line: z.number(),
      body: z.string(),
      severity: z.enum(["error", "warning", "info"]),
      category: z.string(),
      confidence: z.number().min(0).max(1).optional().default(0.7),
      suggestedFix: z.string().optional(),
    })
  ),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// ---------------------------------------------------------------------------
// Tool execution dispatcher
// ---------------------------------------------------------------------------

const MAX_RESULTS = 10;
const COMMENT_TRUNCATE = 200;

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  repo: string
): Promise<string> {
  try {
    switch (name) {
      case "search_past_reviews": {
        const query = String(input.query ?? "");
        const limit = Math.min(Number(input.limit) || 5, MAX_RESULTS);
        const results = await searchSimilar(query, repo, limit);

        if (results.length === 0) return JSON.stringify([]);

        return JSON.stringify(
          results.map((r) => ({
            filePath: r.filePath,
            reviewComment: r.reviewComment.slice(0, COMMENT_TRUNCATE),
            category: r.category,
            approved: r.approved ?? null,
            pullNumber: r.pullNumber ?? null,
            score: Math.round((r.score ?? 0) * 100) / 100,
          }))
        );
      }

      case "get_file_history": {
        const filePath = String(input.file_path ?? "");
        const limit = Math.min(Number(input.limit) || 5, MAX_RESULTS);
        const results = await getFileHistory(filePath, repo, limit);

        if (results.length === 0) return JSON.stringify([]);

        return JSON.stringify(
          results.map((r) => ({
            reviewComment: r.reviewComment.slice(0, COMMENT_TRUNCATE),
            category: r.category,
            approved: r.approved ?? null,
            pullNumber: r.pullNumber ?? null,
          }))
        );
      }

      case "get_concept_stats": {
        const results = await getConceptApprovalRates(repo);
        // Return top 20
        return JSON.stringify(
          results.slice(0, 20).map((r) => ({
            concept: r.concept,
            total: r.total,
            approved: r.approved,
            rejected: r.rejected,
            rate: Math.round(r.rate * 100) / 100,
          }))
        );
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    log.warn({ err, tool: name }, "Tool execution failed");
    return JSON.stringify({ error: "Tool execution failed, proceed without this data" });
  }
}
