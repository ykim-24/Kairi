import type { Rule, RuleContext } from "../types.js";
import type { InlineComment } from "../../review/types.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"]);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__/, /test_/, /_test\./];

export const requireTests: Rule = {
  id: "require-tests",
  name: "Require Tests",
  description: "Warns when source files are modified without corresponding test changes",
  run(ctx: RuleContext) {
    // This rule is special: it needs to be called once with context about all files
    // We'll flag it on the first source file if no test files are present
    // The engine calls this per-file, so we just check if this file is a source file
    const ext = getExtension(ctx.file.filename);
    if (!SOURCE_EXTENSIONS.has(ext)) return [];
    if (isTestFile(ctx.file.filename)) return [];
    if (ctx.file.status === "removed") return [];

    // We can't check other files here, so this is a per-file hint
    // The orchestrator will aggregate and deduplicate
    const firstLine = ctx.file.hunks
      .flatMap((h) => h.lines)
      .find((l) => l.type === "add" && l.newLineNumber !== null);

    if (!firstLine?.newLineNumber) return [];

    return [
      {
        path: ctx.file.filename,
        line: firstLine.newLineNumber,
        body: `\`${ctx.config.severity}\` **require-tests**: Source file modified — ensure test coverage exists for these changes.`,
        source: "rule",
        severity: ctx.config.severity ?? "warning",
        ruleId: "require-tests",
      },
    ];
  },
};

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : "";
}

function isTestFile(filename: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(filename));
}
