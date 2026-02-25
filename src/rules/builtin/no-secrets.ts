import type { Rule } from "../types.js";
import type { InlineComment } from "../../review/types.js";

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']{8,}["']/i, label: "API key" },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/i, label: "Secret/password" },
  { pattern: /(?:token)\s*[:=]\s*["'][^"']{10,}["']/i, label: "Token" },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, label: "Private key" },
  { pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/, label: "AWS access key" },
  { pattern: /ghp_[A-Za-z0-9_]{36}/, label: "GitHub personal access token" },
  { pattern: /sk-[A-Za-z0-9]{20,}/, label: "API secret key" },
];

export const noSecrets: Rule = {
  id: "no-secrets",
  name: "No Secrets",
  description: "Detects potential secrets/credentials in added lines",
  run({ file, config }) {
    const comments: InlineComment[] = [];

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== "add" || line.newLineNumber === null) continue;

        for (const { pattern, label } of SECRET_PATTERNS) {
          if (pattern.test(line.content)) {
            comments.push({
              path: file.filename,
              line: line.newLineNumber,
              body: `\`error\` **no-secrets**: Potential ${label} detected. Never commit secrets — use environment variables or a secrets manager.`,
              source: "rule",
              severity: "error",
              ruleId: "no-secrets",
            });
            break; // one finding per line is enough
          }
        }
      }
    }
    return comments;
  },
};
