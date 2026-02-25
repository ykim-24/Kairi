import type { ParsedFile } from "../utils/diff-parser.js";

const EXTENSION_CONCEPTS: Record<string, string[]> = {
  ".ts": ["typescript"],
  ".tsx": ["typescript", "react"],
  ".js": ["javascript"],
  ".jsx": ["javascript", "react"],
  ".py": ["python"],
  ".go": ["golang"],
  ".rs": ["rust"],
  ".java": ["java"],
  ".rb": ["ruby"],
  ".kt": ["kotlin"],
  ".swift": ["swift"],
  ".css": ["css"],
  ".scss": ["css", "scss"],
  ".html": ["html"],
  ".sql": ["sql"],
  ".graphql": ["graphql"],
  ".proto": ["protobuf"],
  ".dockerfile": ["docker"],
  ".yml": ["yaml"],
  ".yaml": ["yaml"],
};

const DIRECTORY_CONCEPTS: Record<string, string> = {
  auth: "authentication",
  api: "api",
  middleware: "middleware",
  hooks: "hooks",
  components: "components",
  utils: "utilities",
  lib: "library",
  services: "services",
  models: "models",
  routes: "routing",
  config: "configuration",
  test: "testing",
  tests: "testing",
  migrations: "database-migrations",
  graphql: "graphql",
  grpc: "grpc",
  webhook: "webhooks",
  workers: "background-jobs",
  queue: "message-queue",
};

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "been",
  "will", "would", "could", "should", "into", "about", "when", "where",
  "what", "which", "their", "there", "then", "than", "each", "other",
  "some", "them", "also", "more", "after", "before", "between",
  "function", "const", "return", "import", "export", "class", "type",
]);

export function extractConcepts(
  files: ParsedFile[],
  reviewComment: string
): string[] {
  const concepts = new Set<string>();

  for (const file of files) {
    // From file extensions
    const ext = "." + file.filename.split(".").pop()?.toLowerCase();
    const extConcepts = EXTENSION_CONCEPTS[ext];
    if (extConcepts) extConcepts.forEach((c) => concepts.add(c));

    // From directory paths
    const dirs = file.filename.toLowerCase().split("/");
    for (const dir of dirs) {
      const concept = DIRECTORY_CONCEPTS[dir];
      if (concept) concepts.add(concept);
    }
  }

  // From review comment keywords
  const words = reviewComment
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

  // Take top unique keywords
  const seen = new Set<string>();
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word);
      concepts.add(word);
    }
    if (concepts.size >= 10) break;
  }

  return Array.from(concepts).slice(0, 10);
}
