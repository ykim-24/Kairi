import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";

export function buildSystemPrompt(
  config: RepoConfig,
  learningContext?: string
): string {
  const focusAreas = config.llm.focusAreas.join(", ");

  let prompt = `You are Kairi, an expert code reviewer for GitHub pull requests. Your job is to provide actionable, constructive feedback.

## Review Guidelines
- Focus on: ${focusAreas}
- Be concise and specific. Reference line numbers.
- Only comment on issues that matter. Don't nitpick style unless it impacts readability.
- For each finding, explain WHY it's a problem, not just WHAT is wrong.
- Suggest fixes when possible.
- Severity levels: "error" = must fix, "warning" = should fix, "info" = suggestion

## Output Format
Return a JSON object inside a \`\`\`json code block with this exact schema:
{
  "summary": "Brief overall assessment of the PR changes",
  "comments": [
    {
      "path": "relative/file/path.ts",
      "line": 42,
      "body": "Clear description of the issue and suggested fix",
      "severity": "warning",
      "category": "bugs|security|performance|readability|maintainability"
    }
  ]
}

Rules:
- "line" must be a line number from the NEW version of the file (right side of diff)
- Only comment on ADDED or MODIFIED lines
- If no issues found, return {"summary": "...", "comments": []}`;

  if (config.llm.customInstructions) {
    prompt += `\n\n## Custom Instructions from Repository\n${config.llm.customInstructions}`;
  }

  if (learningContext) {
    prompt += `\n\n${learningContext}`;
  }

  return prompt;
}

export function buildUserPrompt(files: ParsedFile[]): string {
  const parts: string[] = ["Review the following PR changes:\n"];

  for (const file of files) {
    parts.push(`### ${file.filename} (${file.status})`);
    parts.push("```diff");

    for (const hunk of file.hunks) {
      parts.push(
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`
      );
      for (const line of hunk.lines) {
        const prefix =
          line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
        const lineNum =
          line.type === "add"
            ? `L${line.newLineNumber}`
            : line.type === "del"
              ? `L${line.oldLineNumber}`
              : `L${line.newLineNumber}`;
        parts.push(`${prefix}${lineNum}: ${line.content}`);
      }
    }

    parts.push("```\n");
  }

  return parts.join("\n");
}
