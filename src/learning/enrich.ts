import type { ReviewFinding } from "../review/types.js";
import type { RetrievedPattern } from "./types.js";
import { extractConcepts } from "./concept-extractor.js";
import { getRelatedInteractions, getFileHistory } from "./graph-store.js";
import type { ParsedFile } from "../utils/diff-parser.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "enrich" });

/**
 * Enriches inline-worthy findings with graph DB context.
 * For each finding, queries related interactions and file history,
 * then appends a graphContext string citing where the info came from.
 */
export async function enrichFindings(
  findings: ReviewFinding[],
  repo: string,
  files: ParsedFile[]
): Promise<ReviewFinding[]> {
  const enriched: ReviewFinding[] = [];

  for (const finding of findings) {
    try {
      const file = files.find((f) => f.filename === finding.path);
      const dummyFiles = file ? [file] : [];
      const concepts = extractConcepts(dummyFiles, finding.body);

      const [related, history] = await Promise.all([
        getRelatedInteractions(concepts, repo, 3),
        getFileHistory(finding.path, repo, 3),
      ]);

      const contextParts: string[] = [];

      // Check for approved patterns (positive signals) — cite the source
      const approvedRelated = related.filter((r) => r.approved === true);
      if (approvedRelated.length > 0) {
        contextParts.push(formatApprovedContext(approvedRelated));
      }

      // Check for rejected patterns (negative signals) — cite where dismissed
      const rejectedRelated = related.filter((r) => r.approved === false);
      if (rejectedRelated.length > 0) {
        contextParts.push(formatRejectedContext(rejectedRelated));
      }

      // File history context with PR references
      const approvedHistory = history.filter((h) => h.approved === true);
      if (approvedHistory.length > 0 && contextParts.length === 0) {
        contextParts.push(formatHistoryContext(approvedHistory, finding.path));
      }

      enriched.push({
        ...finding,
        graphContext: contextParts.length > 0 ? contextParts.join(" ") : undefined,
      });
    } catch (err) {
      log.warn({ err, path: finding.path }, "Failed to enrich finding, using as-is");
      enriched.push(finding);
    }
  }

  return enriched;
}

function formatApprovedContext(patterns: RetrievedPattern[]): string {
  const refs = patterns.map((p) => {
    const parts: string[] = [`\`${p.filePath}\``];
    if (p.pullNumber) parts.push(`PR #${p.pullNumber}`);
    if (p.source === "human") parts.push("(human comment)");
    return parts.join(" in ");
  });
  const uniqueRefs = [...new Set(refs)];
  return `Past reviews: Similar issues in ${uniqueRefs.join(", ")} were flagged and fixed.`;
}

function formatRejectedContext(patterns: RetrievedPattern[]): string {
  const prRefs = patterns
    .filter((p) => p.pullNumber)
    .map((p) => `#${p.pullNumber}`);
  const uniquePRs = [...new Set(prRefs)];
  if (uniquePRs.length > 0) {
    return `Note: Similar comments were dismissed in ${uniquePRs.join(", ")}.`;
  }
  return "Note: Similar comments were previously dismissed in past reviews.";
}

function formatHistoryContext(
  patterns: RetrievedPattern[],
  filePath: string
): string {
  const prRefs = patterns
    .filter((p) => p.pullNumber)
    .map((p) => `#${p.pullNumber}`);
  const uniquePRs = [...new Set(prRefs)];
  const humanCount = patterns.filter((p) => p.source === "human").length;

  let ctx = `This file has ${patterns.length} past review(s) with accepted feedback`;
  if (uniquePRs.length > 0) {
    ctx += ` from ${uniquePRs.join(", ")}`;
  }
  if (humanCount > 0) {
    ctx += ` (${humanCount} from human reviewers)`;
  }
  ctx += ".";
  return ctx;
}
