import type { Rule } from "../types.js";
import type { InlineComment } from "../../review/types.js";

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|TEMP)\b/;

export const noTodo: Rule = {
  id: "no-todo",
  name: "No TODO",
  description: "Flags TODO/FIXME/HACK comments in added lines",
  run({ file, config }) {
    const comments: InlineComment[] = [];

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "add" || line.newLineNumber === null) continue;

        const match = line.content.match(TODO_PATTERN);
        if (match) {
          comments.push({
            path: file.filename,
            line: line.newLineNumber,
            body: `\`${config.severity}\` **no-todo**: \`${match[1]}\` comment found. Track this in an issue instead of leaving it in code.`,
            source: "rule",
            severity: config.severity ?? "info",
            ruleId: "no-todo",
          });
        }
      }
    }
    return comments;
  },
};
