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
 * Builds a structured markdown body containing all findings organized by severity.
 */
export function buildReviewBody(options: BodyBuilderOptions): string {
  const { llmSummary, findings, inlineCount, metadata } = options;
  const parts: string[] = [];

  parts.push("<!-- kairi-review -->");
  parts.push("## Kairi Review\n");

  if (llmSummary) {
    parts.push(llmSummary);
    parts.push("");
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  if (errors.length > 0) {
    parts.push("### Errors (must fix)");
    parts.push("| File | Line | Issue |");
    parts.push("|------|------|-------|");
    for (const f of errors) {
      parts.push(`| \`${f.path}\` | L${f.line} | ${escapePipes(f.body)} |`);
    }
    parts.push("");
  }

  if (warnings.length > 0) {
    parts.push("### Warnings");
    parts.push("| File | Line | Issue |");
    parts.push("|------|------|-------|");
    for (const f of warnings) {
      parts.push(`| \`${f.path}\` | L${f.line} | ${escapePipes(f.body)} |`);
    }
    parts.push("");
  }

  if (infos.length > 0) {
    parts.push("### Info / Suggestions");
    for (const f of infos) {
      parts.push(`- \`${f.path}:${f.line}\` — ${f.body}`);
    }
    parts.push("");
  }

  if (findings.length === 0) {
    parts.push("No issues found. Looks good!");
    parts.push("");
  }

  parts.push("---");
  const totalFindings = metadata.ruleFindings + metadata.llmFindings;
  parts.push(
    `**Stats**: ${metadata.filesReviewed} files reviewed | ${metadata.ruleFindings} rule findings | ${metadata.llmFindings} LLM findings | ${inlineCount} inline comments posted | ${totalFindings} total findings`
  );

  return parts.join("\n");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
