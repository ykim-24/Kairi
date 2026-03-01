import type { Rule, RuleContext } from "../types.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"]);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__/, /test_/, /_test\./];

/**
 * Single summary-level finding when source files are modified without test changes.
 * Only emits once (on the first source file encountered), not per-file.
 */
export const requireTests: Rule = {
  id: "require-tests",
  name: "Require Tests",
  description: "Warns when source files are modified without corresponding test changes",
  run(ctx: RuleContext) {
    const ext = getExtension(ctx.file.filename);
    if (!SOURCE_EXTENSIONS.has(ext)) return [];
    if (isTestFile(ctx.file.filename)) return [];
    if (ctx.file.status === "removed") return [];

    // Only emit on the first source file — avoids duplicate findings
    const firstSource = ctx.allFiles.find(
      (f) =>
        SOURCE_EXTENSIONS.has(getExtension(f.filename)) &&
        !isTestFile(f.filename) &&
        f.status !== "removed"
    );
    if (!firstSource || firstSource.filename !== ctx.file.filename) return [];

    // If any test file was modified in this PR, no warning needed
    const hasTests = ctx.allFiles.some((f) => isTestFile(f.filename));
    if (hasTests) return [];

    const sourceFiles = ctx.allFiles.filter(
      (f) =>
        SOURCE_EXTENSIONS.has(getExtension(f.filename)) &&
        !isTestFile(f.filename) &&
        f.status !== "removed"
    );

    const fileList = sourceFiles
      .slice(0, 5)
      .map((f) => `\`${f.filename}\``)
      .join(", ");
    const more = sourceFiles.length > 5 ? ` and ${sourceFiles.length - 5} more` : "";

    const firstLine = ctx.file.hunks
      .flatMap((h) => h.lines)
      .find((l) => l.type === "add" && l.newLineNumber !== null);

    return [
      {
        path: ctx.file.filename,
        line: firstLine?.newLineNumber ?? 1,
        body: `**require-tests**: ${sourceFiles.length} source file(s) modified without test changes: ${fileList}${more}. Consider adding or updating tests.`,
        source: "rule",
        severity: ctx.config.severity ?? "warning",
        category: "testing",
        confidence: 0.5, // low confidence pushes it to body-only (not inline)
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
