import type { ReviewFinding } from "./types.js";

const SEVERITY_EMOJI: Record<string, string> = {
  error: "\ud83d\udd34",
  warning: "\ud83d\udfe1",
  info: "\u2139\ufe0f",
};

/**
 * Formats a ReviewFinding into a rich inline comment body for GitHub.
 * Includes severity emoji, category, confidence, suggestion block, and graph context.
 */
export function formatInlineComment(finding: ReviewFinding): string {
  const parts: string[] = [];

  // Header: emoji + category + confidence
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "";
  const label = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
  parts.push(`**${emoji} ${label}** — ${finding.category} (confidence: ${finding.confidence.toFixed(2)})`);
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

  // Graph context
  if (finding.graphContext) {
    parts.push("");
    parts.push(`> \ud83d\udcda *${finding.graphContext}*`);
  }

  return parts.join("\n");
}
