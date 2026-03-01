import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./client.js";
import { chunkFiles, estimateFileTokens } from "./chunker.js";
import { buildAgenticSystemPrompt, buildUserPrompt } from "./prompts.js";
import {
  REVIEW_TOOLS,
  LOOKUP_TOOL_NAMES,
  submitReviewSchema,
  executeToolCall,
  type SubmitReviewInput,
} from "./tools.js";
import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";
import type { ReviewFinding } from "../review/types.js";
import { withRetry } from "../utils/retry.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "llm-reviewer" });

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_ITERATIONS = 10;

export async function reviewWithLLM(
  files: ParsedFile[],
  config: RepoConfig,
  repo: string,
  learningEnabled: boolean
): Promise<{
  comments: ReviewFinding[];
  summary: string;
  chunksUsed: number;
  toolCallsMade: number;
}> {
  log.info({ fileCount: files.length }, "Starting agentic LLM review");

  const chunks = chunkFiles(files, config.llm.maxTokenBudget);
  const allComments: ReviewFinding[] = [];
  const summaries: string[] = [];
  let totalToolCalls = 0;

  for (const chunk of chunks) {
    const result = await runAgenticReview(
      chunk.files,
      config,
      repo,
      learningEnabled,
      chunks.length > 1
    );
    allComments.push(...result.comments);
    summaries.push(result.summary);
    totalToolCalls += result.toolCallsMade;
  }

  // Merge summaries
  const summary =
    summaries.length === 1
      ? summaries[0]
      : summaries.filter(Boolean).join("\n\n") || "No significant issues found.";

  log.info(
    {
      totalFindings: allComments.length,
      chunksUsed: chunks.length,
      toolCallsMade: totalToolCalls,
    },
    "Agentic LLM review complete"
  );

  return {
    comments: allComments,
    summary,
    chunksUsed: chunks.length,
    toolCallsMade: totalToolCalls,
  };
}

// ---------------------------------------------------------------------------
// Agentic tool-use loop
// ---------------------------------------------------------------------------

async function runAgenticReview(
  files: ParsedFile[],
  config: RepoConfig,
  repo: string,
  learningEnabled: boolean,
  isChunk: boolean
): Promise<{
  comments: ReviewFinding[];
  summary: string;
  toolCallsMade: number;
}> {
  const client = getAnthropicClient();
  const systemPrompt = buildAgenticSystemPrompt(config, learningEnabled);
  const userPrompt = buildUserPrompt(files);
  const maxIterations = config.llm.maxToolIterations ?? DEFAULT_MAX_ITERATIONS;

  // Select tools: only include lookup tools if learning is enabled
  const tools = learningEnabled
    ? REVIEW_TOOLS
    : REVIEW_TOOLS.filter((t) => !LOOKUP_TOOL_NAMES.includes(t.name as any));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  // Estimate token usage for budget tracking
  const systemTokens = Math.ceil(systemPrompt.length / CHARS_PER_TOKEN);
  const userTokens = Math.ceil(userPrompt.length / CHARS_PER_TOKEN);
  let accumulatedToolResultTokens = 0;
  let toolCallsMade = 0;

  const validFiles = new Set(files.map((f) => f.filename));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const isLastIteration = iteration === maxIterations;

    // Check token budget — force submit if nearing limit
    const estimatedContext =
      systemTokens + userTokens + accumulatedToolResultTokens;
    const budgetExceeded = estimatedContext > config.llm.maxTokenBudget * 0.85;

    const forceSubmit = isLastIteration || budgetExceeded;
    const toolChoice: Anthropic.MessageCreateParams["tool_choice"] = forceSubmit
      ? { type: "tool", name: "submit_review" }
      : { type: "auto" };

    if (budgetExceeded && !isLastIteration) {
      log.info(
        { iteration, estimatedContext, budget: config.llm.maxTokenBudget },
        "Token budget nearing limit, forcing submit_review"
      );
    }

    try {
      const response = await withRetry(
        () =>
          client.messages.create({
            model: config.llm.model,
            max_tokens: 4096,
            temperature: config.llm.temperature,
            system: systemPrompt,
            messages,
            tools,
            tool_choice: toolChoice,
          }),
        {
          maxAttempts: 2,
          retryOn: (err: any) => err?.status === 529 || err?.status === 500,
        }
      );

      // Process response content blocks
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } =>
          b.type === "tool_use"
      );

      // No tool calls — the model stopped without calling submit_review.
      // If tool_choice was "auto" and model returned only text, treat as
      // an implicit empty review (shouldn't normally happen with good prompts).
      if (toolUseBlocks.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        log.warn(
          { iteration },
          "LLM returned no tool calls, treating as empty review"
        );
        return {
          comments: [],
          summary: text.slice(0, 500) || "No significant issues found.",
          toolCallsMade,
        };
      }

      // Check for submit_review among the tool calls
      const submitBlock = toolUseBlocks.find(
        (b) => b.name === "submit_review"
      );

      if (submitBlock) {
        const parsed = submitReviewSchema.safeParse(submitBlock.input);
        if (!parsed.success) {
          log.warn(
            { errors: parsed.error.issues },
            "submit_review validation failed, returning raw"
          );
          // Best-effort: extract what we can
          const raw = submitBlock.input as any;
          return {
            comments: [],
            summary:
              typeof raw?.summary === "string"
                ? raw.summary.slice(0, 500)
                : "Review completed (parse error).",
            toolCallsMade,
          };
        }

        const comments = mapToFindings(parsed.data, validFiles);
        return {
          comments,
          summary: parsed.data.summary,
          toolCallsMade,
        };
      }

      // Execute lookup tool calls and accumulate results
      const assistantContent = response.content;
      const toolResults: Anthropic.MessageParam["content"] = [];

      for (const block of toolUseBlocks) {
        toolCallsMade++;
        log.info(
          { tool: block.name, iteration },
          "Executing tool call"
        );
        const result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
          repo
        );
        accumulatedToolResultTokens += Math.ceil(result.length / CHARS_PER_TOKEN);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      // Append assistant message and tool results to conversation
      messages.push({ role: "assistant", content: assistantContent });
      messages.push({ role: "user", content: toolResults });
    } catch (err) {
      log.error({ err, iteration }, "Agentic review iteration failed");
      return {
        comments: [],
        summary: "Review failed due to an error.",
        toolCallsMade,
      };
    }
  }

  // Should not reach here (last iteration forces submit_review),
  // but handle gracefully
  log.warn("Agentic review exceeded max iterations without submit_review");
  return {
    comments: [],
    summary: "Review reached iteration limit.",
    toolCallsMade,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToFindings(
  data: SubmitReviewInput,
  validFiles: Set<string>
): ReviewFinding[] {
  return data.comments
    .filter((c) => validFiles.has(c.path))
    .map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      source: "llm" as const,
      severity: c.severity,
      category: c.category,
      confidence: c.confidence,
      suggestedFix: c.suggestedFix,
    }));
}
