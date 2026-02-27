import type { ParsedFile } from "../utils/diff-parser.js";
import type { RepoConfig } from "../config-loader/schema.js";

/**
 * Phase 1 system prompt: per-file analysis.
 * Focuses on the individual file — quality, patterns, issues in isolation.
 */
export function buildFileAnalysisPrompt(
  config: RepoConfig,
  learningContext?: string
): string {
  const focusAreas = config.llm.focusAreas.join(", ");

  let prompt = `You are Kairi, an expert code reviewer for GitHub pull requests.

## Phase: Per-File Analysis
You are reviewing ONE file at a time. Focus entirely on this file's changes in isolation.

## What to Assess
1. **Code quality**: Is the code clean, readable, well-structured?
2. **Design patterns**: Are appropriate patterns used? Any anti-patterns?
3. **Bugs & correctness**: Logic errors, off-by-one, null safety, edge cases?
4. **Security**: Hardcoded secrets, injection risks, auth issues?
5. **Performance**: Unnecessary allocations, N+1 patterns, missing memoization?

Focus on: ${focusAreas}

## Guidelines
- Be concise and specific. Reference line numbers.
- Only comment on issues that matter. Don't nitpick style unless it impacts readability.
- For each finding, explain WHY it's a problem, not just WHAT is wrong.
- Suggest fixes when possible.
- Severity levels: "error" = must fix, "warning" = should fix, "info" = suggestion

## Selectivity
Be selective. Only report issues with confidence >= 0.6. Prefer fewer, higher-quality comments over many low-value ones. Don't flag style nits like TODO/FIXME — those are handled by rules.

## Output Format
Return a JSON object inside a \`\`\`json code block:
{
  "fileSummary": "Brief assessment of this file's quality and patterns used",
  "comments": [
    {
      "path": "relative/file/path.ts",
      "line": 42,
      "body": "Clear description of the issue and suggested fix",
      "severity": "warning",
      "category": "bugs|security|performance|readability|maintainability",
      "confidence": 0.85,
      "suggestedFix": "const key = process.env.API_KEY;"
    }
  ]
}

Field details:
- "fileSummary": your assessment of this file's quality, patterns, and any structural observations
- "confidence": 0.0–1.0, how confident you are this is a real issue
- "suggestedFix": optional replacement code snippet (only the corrected line(s))

Rules:
- "line" must be a line number from the NEW version of the file (right side of diff)
- Only comment on ADDED or MODIFIED lines
- If no issues found, return {"fileSummary": "...", "comments": []}`;

  if (config.llm.customInstructions) {
    prompt += `\n\n## Custom Instructions from Repository\n${config.llm.customInstructions}`;
  }

  if (learningContext) {
    prompt += `\n\n${learningContext}`;
  }

  return prompt;
}

/**
 * Phase 2 system prompt: cross-file analysis.
 * Sees the full picture — how files connect, data flow, breaking changes.
 */
export function buildCrossFilePrompt(
  config: RepoConfig,
  fileAnalyses: Array<{ filename: string; summary: string }>,
  learningContext?: string
): string {
  const focusAreas = config.llm.focusAreas.join(", ");

  const analysisSummaries = fileAnalyses
    .map((a) => `- **${a.filename}**: ${a.summary}`)
    .join("\n");

  let prompt = `You are Kairi, an expert code reviewer for GitHub pull requests.

## Phase: Cross-File Analysis
You have already reviewed each file individually. Now analyze how the changes work TOGETHER.

## Per-File Summaries from Phase 1
${analysisSummaries}

## What to Assess
1. **Data flow**: Do changes in one file break assumptions in another? Are interfaces/types consistent?
2. **Integration**: Do the pieces fit together correctly? Missing glue code? Incomplete wiring?
3. **Shared state**: Are shared resources (config, state, DB) handled consistently across files?
4. **Breaking changes**: Could these changes break callers, downstream consumers, or existing tests?
5. **Missing pieces**: Are there changes that SHOULD have been made but weren't? (e.g., updated types but forgot to update callers)

Focus on: ${focusAreas}

## Guidelines
- Only report cross-file issues — don't repeat findings from per-file analysis.
- Focus on how the changes CONNECT and AFFECT each other.
- Be concise. This is about the big picture, not line-level nits.
- Severity: "error" for broken integration, "warning" for likely issues, "info" for design suggestions.

## Selectivity
Only report issues with confidence >= 0.6. If the per-file changes are well-isolated and don't interact, it's fine to return no comments.

## Output Format
Return a JSON object inside a \`\`\`json code block:
{
  "summary": "Overall assessment of the PR — how the changes fit together",
  "comments": [
    {
      "path": "relative/file/path.ts",
      "line": 42,
      "body": "Explanation of the cross-file issue",
      "severity": "warning",
      "category": "bugs|security|performance|readability|maintainability",
      "confidence": 0.80,
      "suggestedFix": "optional fix"
    }
  ]
}

Rules:
- "line" must be a line number from the NEW version of the file (right side of diff)
- Only comment on ADDED or MODIFIED lines
- If no cross-file issues found, return {"summary": "...", "comments": []}`;

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
