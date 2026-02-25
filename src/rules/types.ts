import type { ParsedFile } from "../utils/diff-parser.js";
import type { RuleConfig } from "../config-loader/schema.js";
import type { InlineComment } from "../review/types.js";

export interface RuleContext {
  file: ParsedFile;
  config: RuleConfig;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  run(ctx: RuleContext): InlineComment[];
}
