import type { ParsedFile } from "../utils/diff-parser.js";
import type { LearningContext, RetrievedPattern } from "./types.js";
import { searchSimilar } from "./vector-store.js";
import { getRelatedInteractions, getFileHistory } from "./graph-store.js";
import { extractConcepts } from "./concept-extractor.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "learning-recall" });

/**
 * Two-stage retrieval: semantic (Qdrant) + concept-based (Neo4j)
 * Returns approved and rejected patterns to inject into the LLM system prompt.
 */
export async function retrieveLearningContext(
  files: ParsedFile[],
  repo: string
): Promise<LearningContext> {
  // Build query from file names + diff content
  const queryParts: string[] = files.map((f) => f.filename);
  for (const file of files.slice(0, 5)) {
    const addedLines = file.hunks
      .flatMap((h) => h.lines)
      .filter((l) => l.type === "add")
      .map((l) => l.content)
      .slice(0, 20);
    queryParts.push(...addedLines);
  }
  const query = queryParts.join("\n").slice(0, 3000);

  // Stage 1: Semantic search via Qdrant
  const semanticResults = await searchSimilar(query, repo, 10);

  // Stage 2: Concept-based search via Neo4j
  const concepts = extractConcepts(files, query);
  const conceptResults = await getRelatedInteractions(concepts, repo, 5);

  // Stage 3: File history from Neo4j (for files being modified)
  const fileHistoryResults: RetrievedPattern[] = [];
  for (const file of files.slice(0, 3)) {
    const history = await getFileHistory(file.filename, repo, 3);
    fileHistoryResults.push(...history);
  }

  // Merge and deduplicate
  const allResults = deduplicatePatterns([
    ...semanticResults,
    ...conceptResults,
    ...fileHistoryResults,
  ]);

  // Split into approved and rejected
  const approved = allResults
    .filter((r) => (r as any).approved === true)
    .slice(0, 5);
  const rejected = allResults
    .filter((r) => (r as any).approved === false)
    .slice(0, 5);

  log.info(
    {
      semantic: semanticResults.length,
      concept: conceptResults.length,
      fileHistory: fileHistoryResults.length,
      approved: approved.length,
      rejected: rejected.length,
    },
    "Retrieved learning context"
  );

  return { approvedPatterns: approved, rejectedPatterns: rejected };
}

/**
 * Format learning context into a string to inject into the LLM system prompt.
 */
export function formatLearningContext(ctx: LearningContext): string | undefined {
  if (ctx.approvedPatterns.length === 0 && ctx.rejectedPatterns.length === 0) {
    return undefined;
  }

  const parts: string[] = [
    "## Learning from Past Reviews",
    "Use these patterns from past reviews to improve your feedback quality.\n",
  ];

  if (ctx.approvedPatterns.length > 0) {
    parts.push("### Patterns that were well-received (do more like these):");
    for (const p of ctx.approvedPatterns) {
      parts.push(
        `- **${p.category}** on \`${p.filePath}\`: ${p.reviewComment.slice(0, 200)}`
      );
    }
    parts.push("");
  }

  if (ctx.rejectedPatterns.length > 0) {
    parts.push("### Patterns that were dismissed (avoid these approaches):");
    for (const p of ctx.rejectedPatterns) {
      parts.push(
        `- **${p.category}** on \`${p.filePath}\`: ${p.reviewComment.slice(0, 200)}`
      );
    }
    parts.push("");
  }

  return parts.join("\n");
}

function deduplicatePatterns(patterns: RetrievedPattern[]): RetrievedPattern[] {
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const key = `${p.filePath}:${p.reviewComment.slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
