import type { RepoConfig } from "../config-loader/schema.js";

export const DEFAULT_CONFIG: RepoConfig = {
  enabled: true,
  rules: {
    "no-console-log": { enabled: true, severity: "warning" },
    "max-file-size": { enabled: true, severity: "warning", maxLines: 500 },
    "no-secrets": { enabled: true, severity: "error" },
    "require-tests": { enabled: true, severity: "warning" },
    "no-todo": { enabled: true, severity: "info" },
  },
  llm: {
    enabled: true,
    model: "claude-sonnet-4-20250514",
    maxTokenBudget: 80000,
    temperature: 0,
    focusAreas: [
      "bugs",
      "security",
      "performance",
      "readability",
      "maintainability",
    ],
    maxToolIterations: 10,
  },
  filters: {
    excludePaths: [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "*.min.js",
      "*.min.css",
      "dist/**",
      "build/**",
      "node_modules/**",
    ],
    maxFiles: 50,
    maxFileSizeKB: 200,
  },
  review: {
    postSummary: true,
    dismissOnUpdate: true,
    labelOnReview: false,
    inlineThreshold: 0.7,
    maxInlineComments: 5,
  },
  learning: {
    enabled: true,
    feedbackFromReactions: true,
    feedbackFromResolved: true,
  },
};
