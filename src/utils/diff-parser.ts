export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "del" | "context";
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface ParsedFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed";
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export function parsePatch(filename: string, patch: string | undefined, status: string): ParsedFile {
  const parsed: ParsedFile = {
    filename,
    status: normalizeStatus(status),
    hunks: [],
    additions: 0,
    deletions: 0,
  };

  if (!patch) return parsed;

  const lines = patch.split("\n");
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] ?? "1", 10),
        lines: [],
      };
      parsed.hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine++;
      parsed.additions++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "del",
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine++;
      parsed.deletions++;
    } else if (line.startsWith("\\")) {
      // "No newline at end of file" - skip
    } else {
      currentHunk.lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return parsed;
}

function normalizeStatus(status: string): ParsedFile["status"] {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

/** Get all added line numbers from a parsed file */
export function getAddedLineNumbers(file: ParsedFile): number[] {
  return file.hunks
    .flatMap((h) => h.lines)
    .filter((l) => l.type === "add" && l.newLineNumber !== null)
    .map((l) => l.newLineNumber!);
}
