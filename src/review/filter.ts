import type { ReviewFinding } from "./types.js";
import type { RepoConfig } from "../config-loader/schema.js";

export interface FilteredFindings {
  inline: ReviewFinding[];
  bodyOnly: ReviewFinding[];
}

/**
 * Partitions findings into inline-worthy vs body-only.
 *
 * Inline-worthy:
 *  - severity "error" always
 *  - category "security" or "bugs" always
 *  - severity "warning" with confidence >= inlineThreshold
 *  - Capped at maxInlineComments, prioritized by severity desc then confidence desc
 *
 * Body-only: everything else
 */
export function filterFindings(
  findings: ReviewFinding[],
  config: RepoConfig
): FilteredFindings {
  const threshold = config.review.inlineThreshold;
  const maxInline = config.review.maxInlineComments;

  const inlineCandidates: ReviewFinding[] = [];
  const bodyOnly: ReviewFinding[] = [];

  for (const f of findings) {
    if (isInlineWorthy(f, threshold)) {
      inlineCandidates.push(f);
    } else {
      bodyOnly.push(f);
    }
  }

  // Sort candidates: severity desc, then confidence desc
  inlineCandidates.sort((a, b) => {
    const sevDiff = severityRank(b.severity) - severityRank(a.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  // Cap at maxInlineComments, overflow goes to body
  const inline = inlineCandidates.slice(0, maxInline);
  const overflow = inlineCandidates.slice(maxInline);
  bodyOnly.push(...overflow);

  return { inline, bodyOnly };
}

function isInlineWorthy(finding: ReviewFinding, threshold: number): boolean {
  if (finding.severity === "error") return true;
  if (finding.category === "security" || finding.category === "bugs") return true;
  if (finding.severity === "warning" && finding.confidence >= threshold) return true;
  return false;
}

function severityRank(s: string): number {
  return s === "error" ? 3 : s === "warning" ? 2 : 1;
}
