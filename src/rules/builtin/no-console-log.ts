import type { Rule } from "../types.js";
import type { InlineComment } from "../../review/types.js";

export const noConsoleLog: Rule = {
  id: "no-console-log",
  name: "No Console Log",
  description: "Flags console.log statements in added lines",
  run({ file, config }) {
    const comments: InlineComment[] = [];
    const pattern = /\bconsole\.(log|debug|info|warn|error)\b/;

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "add" || line.newLineNumber === null) continue;
        if (pattern.test(line.content)) {
          comments.push({
            path: file.filename,
            line: line.newLineNumber,
            body: `\`${config.severity}\` **no-console-log**: \`console.*\` statement detected. Consider removing or replacing with a proper logger.`,
            source: "rule",
            severity: config.severity ?? "warning",
            category: "style",
            confidence: 1.0,
            ruleId: "no-console-log",
          });
        }
      }
    }
    return comments;
  },
};
