import { z } from "zod";

const ruleSeverity = z.enum(["error", "warning", "info"]);

const ruleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  severity: ruleSeverity.default("warning"),
  maxLines: z.number().optional(),
  patterns: z.array(z.string()).optional(),
});

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

const repoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rules: z.record(z.string(), ruleConfigSchema).default({}),
  llm: z
    .object({
      enabled: z.boolean().default(true),
      model: z.string().default("claude-sonnet-4-20250514"),
      maxTokenBudget: z.number().default(80000),
      temperature: z.number().min(0).max(1).default(0),
      focusAreas: z.array(z.string()).default([
        "bugs",
        "security",
        "performance",
        "readability",
        "maintainability",
      ]),
      customInstructions: z.string().optional(),
    })
    .default({}),
  filters: z
    .object({
      excludePaths: z.array(z.string()).default([]),
      includePaths: z.array(z.string()).optional(),
      maxFiles: z.number().default(50),
      maxFileSizeKB: z.number().default(200),
    })
    .default({}),
  review: z
    .object({
      postSummary: z.boolean().default(true),
      dismissOnUpdate: z.boolean().default(true),
      labelOnReview: z.boolean().default(false),
    })
    .default({}),
  learning: z
    .object({
      enabled: z.boolean().default(true),
      feedbackFromReactions: z.boolean().default(true),
      feedbackFromResolved: z.boolean().default(true),
    })
    .default({}),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;

export function parseRepoConfig(raw: unknown): RepoConfig {
  return repoConfigSchema.parse(raw);
}
