import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";
import type { InlineComment } from "../review/types.js";
import type { Rule } from "./types.js";
import { noConsoleLog } from "./builtin/no-console-log.js";
import { maxFileSize } from "./builtin/max-file-size.js";
import { noSecrets } from "./builtin/no-secrets.js";
import { requireTests } from "./builtin/require-tests.js";
import { noTodo } from "./builtin/no-todo.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "rule-engine" });

const BUILTIN_RULES: Rule[] = [
  noConsoleLog,
  maxFileSize,
  noSecrets,
  requireTests,
  noTodo,
];

export function runRules(
  files: ParsedFile[],
  config: RepoConfig
): { comments: InlineComment[]; rulesRun: number } {
  const comments: InlineComment[] = [];
  let rulesRun = 0;

  const enabledRules = BUILTIN_RULES.filter((rule) => {
    const ruleConfig = config.rules[rule.id];
    return ruleConfig?.enabled !== false;
  });

  for (const file of files) {
    for (const rule of enabledRules) {
      const ruleConfig = config.rules[rule.id] ?? {
        enabled: true,
        severity: "warning",
      };
      try {
        const findings = rule.run({ file, config: ruleConfig });
        comments.push(...findings);
        rulesRun++;
      } catch (err) {
        log.warn({ err, rule: rule.id, file: file.filename }, "Rule execution failed");
      }
    }
  }

  log.info(
    { rulesRun, findings: comments.length, files: files.length },
    "Rule engine complete"
  );
  return { comments, rulesRun };
}
