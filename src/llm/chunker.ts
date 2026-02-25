import type { ParsedFile } from "../utils/diff-parser.js";

export interface FileChunk {
  files: ParsedFile[];
  estimatedTokens: number;
}

const FILE_PRIORITY: Record<string, number> = {
  // Source code - highest priority
  ".ts": 10, ".tsx": 10, ".js": 10, ".jsx": 10,
  ".py": 10, ".go": 10, ".rs": 10, ".java": 10,
  ".rb": 10, ".kt": 10, ".swift": 10, ".cs": 10,
  // Config - medium priority
  ".json": 5, ".yml": 5, ".yaml": 5, ".toml": 5,
  ".env": 5, ".ini": 5,
  // Tests - lower than source but still important
  ".test.ts": 4, ".spec.ts": 4, ".test.js": 4, ".spec.js": 4,
  // Docs - lowest
  ".md": 2, ".txt": 2, ".rst": 2,
};

const CHARS_PER_TOKEN = 4; // rough estimate

export function chunkFiles(
  files: ParsedFile[],
  maxTokenBudget: number
): FileChunk[] {
  // Sort by priority (highest first), then by size (smallest first within same priority)
  const sorted = [...files].sort((a, b) => {
    const pa = getFilePriority(a.filename);
    const pb = getFilePriority(b.filename);
    if (pa !== pb) return pb - pa;
    return estimateFileTokens(a) - estimateFileTokens(b);
  });

  const chunks: FileChunk[] = [];
  let current: FileChunk = { files: [], estimatedTokens: 0 };

  for (const file of sorted) {
    let tokens = estimateFileTokens(file);

    // If single file exceeds budget, truncate its hunks
    if (tokens > maxTokenBudget * 0.8) {
      const truncated = truncateFile(file, Math.floor(maxTokenBudget * 0.7));
      tokens = estimateFileTokens(truncated);
      if (current.files.length > 0) {
        chunks.push(current);
        current = { files: [], estimatedTokens: 0 };
      }
      chunks.push({ files: [truncated], estimatedTokens: tokens });
      continue;
    }

    // Start a new chunk if adding this file would exceed the budget
    if (current.estimatedTokens + tokens > maxTokenBudget) {
      if (current.files.length > 0) {
        chunks.push(current);
      }
      current = { files: [], estimatedTokens: 0 };
    }

    current.files.push(file);
    current.estimatedTokens += tokens;
  }

  if (current.files.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function getFilePriority(filename: string): number {
  // Check for test files first (lower priority)
  if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filename)) return 4;

  const ext = "." + filename.split(".").pop();
  return FILE_PRIORITY[ext] ?? 3;
}

export function estimateFileTokens(file: ParsedFile): number {
  let chars = file.filename.length + 20; // header overhead
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      chars += line.content.length + 5; // line prefix overhead
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function truncateFile(file: ParsedFile, maxTokens: number): ParsedFile {
  const truncated: ParsedFile = {
    ...file,
    hunks: [],
    additions: 0,
    deletions: 0,
  };

  let tokens = Math.ceil(file.filename.length / CHARS_PER_TOKEN) + 20;

  for (const hunk of file.hunks) {
    const hunkCopy = { ...hunk, lines: [...hunk.lines] };
    let hunkTokens = 0;

    for (const line of hunk.lines) {
      const lineTokens = Math.ceil((line.content.length + 5) / CHARS_PER_TOKEN);
      if (tokens + hunkTokens + lineTokens > maxTokens) {
        // Truncate at this point
        hunkCopy.lines = hunkCopy.lines.slice(
          0,
          hunkCopy.lines.indexOf(line)
        );
        break;
      }
      hunkTokens += lineTokens;
    }

    if (hunkCopy.lines.length > 0) {
      truncated.hunks.push(hunkCopy);
      truncated.additions += hunkCopy.lines.filter((l) => l.type === "add").length;
      truncated.deletions += hunkCopy.lines.filter((l) => l.type === "del").length;
      tokens += hunkTokens;
    }

    if (tokens >= maxTokens) break;
  }

  return truncated;
}
