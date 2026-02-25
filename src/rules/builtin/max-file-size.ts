import type { Rule } from "../types.js";
import type { InlineComment } from "../../review/types.js";

export const maxFileSize: Rule = {
  id: "max-file-size",
  name: "Max File Size",
  description: "Warns when a file has too many added lines",
  run({ file, config }) {
    const maxLines = config.maxLines ?? 500;
    if (file.additions <= maxLines) return [];

    // Find the first added line to attach comment to
    const firstAddedLine = file.hunks
      .flatMap((h) => h.lines)
      .find((l) => l.type === "add" && l.newLineNumber !== null);

    if (!firstAddedLine?.newLineNumber) return [];

    return [
      {
        path: file.filename,
        line: firstAddedLine.newLineNumber,
        body: `\`${config.severity}\` **max-file-size**: This file adds ${file.additions} lines (threshold: ${maxLines}). Large files are harder to review — consider splitting.`,
        source: "rule",
        severity: config.severity ?? "warning",
        ruleId: "max-file-size",
      },
    ];
  },
};
