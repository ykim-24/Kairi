import type { ReviewFinding } from "./types.js";

const SEVERITY_LABEL: Record<string, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/**
 * Formats a ReviewFinding into an inline comment body for GitHub.
 */
export function formatInlineComment(finding: ReviewFinding): string {
  const parts: string[] = [];

  // Header: severity + category + confidence
  const label = SEVERITY_LABEL[finding.severity] ?? finding.severity;
  parts.push(`**${label}** — ${finding.category} (confidence: ${finding.confidence.toFixed(2)})`);
  parts.push("");

  // Body text
  parts.push(finding.body);

  // GitHub suggestion block
  if (finding.suggestedFix) {
    parts.push("");
    parts.push("```suggestion");
    parts.push(finding.suggestedFix);
    parts.push("```");
  }

  // Graph context — past review references
  if (finding.graphContext) {
    parts.push("");
    parts.push(`> ${finding.graphContext}`);
  }

  return parts.join("\n");
}
