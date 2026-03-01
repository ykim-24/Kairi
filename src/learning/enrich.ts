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
      const concepts = await extractConcepts(dummyFiles, finding.body);

      const [related, history] = await Promise.all([
        getRelatedInteractions(concepts, repo, 3),
        getFileHistory(finding.path, repo, 3),
      ]);

      const contextParts: string[] = [];

      // Check for approved patterns (positive signals) — cite the source
      const approvedRelated = related.filter((r) => r.approved === true);
      if (approvedRelated.length > 0) {
        contextParts.push(formatApprovedContext(approvedRelated, repo));
      }

      // Check for rejected patterns (negative signals) — cite where dismissed
      const rejectedRelated = related.filter((r) => r.approved === false);
      if (rejectedRelated.length > 0) {
        contextParts.push(formatRejectedContext(rejectedRelated, repo));
      }

      // File history context with PR references
      const approvedHistory = history.filter((h) => h.approved === true);
      if (approvedHistory.length > 0 && contextParts.length === 0) {
        contextParts.push(formatHistoryContext(approvedHistory, finding.path, repo));
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

function prLink(repo: string, prNumber: number): string {
  return `[#${prNumber}](https://github.com/${repo}/pull/${prNumber})`;
}

function formatApprovedContext(patterns: RetrievedPattern[], repo: string): string {
  const lines = patterns.map((p) => {
    const pr = p.pullNumber ? ` (${prLink(repo, p.pullNumber)})` : "";
    const snippet = p.reviewComment.slice(0, 120).trim();
    return `- \`${p.filePath}\`${pr}: "${snippet}"`;
  });
  return `Similar feedback was accepted in past reviews:\n${lines.join("\n")}`;
}

function formatRejectedContext(patterns: RetrievedPattern[], repo: string): string {
  const lines = patterns.map((p) => {
    const pr = p.pullNumber ? ` (${prLink(repo, p.pullNumber)})` : "";
    const snippet = p.reviewComment.slice(0, 120).trim();
    return `- \`${p.filePath}\`${pr}: "${snippet}"`;
  });
  return `Similar comments were dismissed in past reviews:\n${lines.join("\n")}`;
}

function formatHistoryContext(
  patterns: RetrievedPattern[],
  filePath: string,
  repo: string
): string {
  const lines = patterns.map((p) => {
    const pr = p.pullNumber ? ` (${prLink(repo, p.pullNumber)})` : "";
    const snippet = p.reviewComment.slice(0, 120).trim();
    return `- ${pr}: "${snippet}"`;
  });
  return `Past feedback on \`${filePath}\`:\n${lines.join("\n")}`;
}
