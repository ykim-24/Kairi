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
    for (const f of errors) {
      parts.push(`- **\`${f.path}\`** L${f.line} — ${stripMarkdownBold(f.body)}`);
    }
    parts.push("");
  }

  if (warnings.length > 0) {
    parts.push("### Warnings\n");
    for (const f of warnings) {
      parts.push(`- **\`${f.path}\`** L${f.line} — ${stripMarkdownBold(f.body)}`);
    }
    parts.push("");
  }

  if (infos.length > 0) {
    parts.push("### Suggestions\n");
    for (const f of infos) {
      parts.push(`- \`${f.path}\` L${f.line} — ${f.body}`);
    }
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

/** Strip leading **bold** markers from rule body to avoid double-bolding */
function stripMarkdownBold(text: string): string {
  return text.replace(/^\*\*.*?\*\*\s*/, "").replace(/\n/g, " ");
}
