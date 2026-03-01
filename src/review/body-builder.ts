import type { ReviewFinding } from "./types.js";

interface BodyBuilderOptions {
  llmSummary: string;
  findings: ReviewFinding[];
  inlineCount: number;
  metadata: {
    filesReviewed: number;
    rulesRun: number;
    llmFindings: number;
    ruleFindings: number;
    durationMs: number;
  };
}

/**
 * Builds a clean markdown review body for GitHub PR comments.
 * Groups repeated rule findings (same file + same ruleId/body) into
 * a single compacted line to reduce noise.
 */
export function buildReviewBody(options: BodyBuilderOptions): string {
  const { llmSummary, findings, inlineCount, metadata } = options;
  const parts: string[] = [];

  parts.push("<!-- kairi-review -->");
  parts.push("## Kairi Review\n");

  // Cross-file summary (the main analysis)
  if (llmSummary) {
    parts.push(llmSummary);
    parts.push("");
  }

  // Group findings by severity
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  if (errors.length > 0) {
    parts.push("### Errors\n");
    parts.push(...formatFindingGroup(errors));
    parts.push("");
  }

  if (warnings.length > 0) {
    parts.push("### Warnings\n");
    parts.push(...formatFindingGroup(warnings));
    parts.push("");
  }

  if (infos.length > 0) {
    parts.push("### Suggestions\n");
    parts.push(...formatFindingGroup(infos));
    parts.push("");
  }

  if (findings.length === 0) {
    parts.push("No issues found.\n");
  }

  // Minimal stats footer
  const total = metadata.ruleFindings + metadata.llmFindings;
  parts.push("---");
  parts.push(
    `${metadata.filesReviewed} files | ${total} findings | ${inlineCount} inline`
  );

  return parts.join("\n");
}

/**
 * Format a group of same-severity findings.
 * Compacts repeated rule findings on the same file into a single line:
 *   `file.ts` — 14× no-console-log (L45, L48, L54, ...)
 * Unique/LLM findings render one per line as before.
 */
function formatFindingGroup(findings: ReviewFinding[]): string[] {
  const lines: string[] = [];

  // Group by file + body signature (for rule findings with identical messages)
  const groups = new Map<string, ReviewFinding[]>();
  for (const f of findings) {
    // Use ruleId if available, otherwise use the body text truncated as key
    const sig = f.ruleId ?? f.body.slice(0, 80);
    const key = `${f.path}::${sig}`;
    const arr = groups.get(key);
    if (arr) {
      arr.push(f);
    } else {
      groups.set(key, [f]);
    }
  }

  for (const group of groups.values()) {
    if (group.length >= 3) {
      // Compact: show as single line with count and line numbers
      const f = group[0];
      const lineNums = group.map((g) => `L${g.line}`);
      const displayed = lineNums.slice(0, 6).join(", ");
      const suffix = lineNums.length > 6 ? `, +${lineNums.length - 6} more` : "";
      const label = f.ruleId ?? f.category ?? "issue";
      lines.push(`- **\`${f.path}\`** — ${group.length}× ${label} (${displayed}${suffix})`);
    } else {
      // Render individually
      for (const f of group) {
        lines.push(`- **\`${f.path}\`** L${f.line} — ${stripMarkdownBold(f.body)}`);
      }
    }
  }

  return lines;
}

/** Strip leading **bold** markers from rule body to avoid double-bolding */
function stripMarkdownBold(text: string): string {
  return text.replace(/^\*\*.*?\*\*\s*/, "").replace(/\n/g, " ");
}
