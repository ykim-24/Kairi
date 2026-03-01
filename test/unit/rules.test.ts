import { describe, it, expect } from "vitest";
import { parsePatch } from "../../src/utils/diff-parser.js";
import { noConsoleLog } from "../../src/rules/builtin/no-console-log.js";
import { noSecrets } from "../../src/rules/builtin/no-secrets.js";
import { noTodo } from "../../src/rules/builtin/no-todo.js";
import { maxFileSize } from "../../src/rules/builtin/max-file-size.js";
import { SIMPLE_PATCH, MULTI_HUNK_PATCH } from "../fixtures/sample-patch.js";

const defaultConfig = { enabled: true, severity: "warning" as const };

describe("no-console-log rule", () => {
  it("detects console.log in added lines", () => {
    const file = parsePatch("test.ts", SIMPLE_PATCH, "modified");
    const comments = noConsoleLog.run({ file, config: defaultConfig, allFiles: [file] });

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].ruleId).toBe("no-console-log");
    expect(comments[0].source).toBe("rule");
  });

  it("detects console.log in multi-hunk patch", () => {
    const file = parsePatch("utils.ts", MULTI_HUNK_PATCH, "modified");
    const comments = noConsoleLog.run({ file, config: defaultConfig, allFiles: [file] });

    expect(comments.length).toBeGreaterThan(0);
  });

  it("returns empty for clean code", () => {
    const patch = `@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 export { a };`;
    const file = parsePatch("clean.ts", patch, "modified");
    const comments = noConsoleLog.run({ file, config: defaultConfig, allFiles: [file] });

    expect(comments).toHaveLength(0);
  });
});

describe("no-secrets rule", () => {
  it("detects API key patterns", () => {
    const file = parsePatch("config.ts", SIMPLE_PATCH, "modified");
    const comments = noSecrets.run({ file, config: { enabled: true, severity: "error" }, allFiles: [file] });

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].severity).toBe("error");
    expect(comments[0].ruleId).toBe("no-secrets");
  });

  it("detects AWS keys", () => {
    const patch = `@@ -1,2 +1,3 @@
 const config = {
+  key: "AKIAIOSFODNN7EXAMPLE",
 };`;
    const file = parsePatch("aws.ts", patch, "modified");
    const comments = noSecrets.run({ file, config: { enabled: true, severity: "error" }, allFiles: [file] });

    expect(comments.length).toBeGreaterThan(0);
  });
});

describe("no-todo rule", () => {
  it("detects TODO comments", () => {
    const file = parsePatch("app.ts", SIMPLE_PATCH, "modified");
    const comments = noTodo.run({ file, config: { enabled: true, severity: "info" }, allFiles: [file] });

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].ruleId).toBe("no-todo");
  });

  it("detects FIXME and HACK", () => {
    const patch = `@@ -1,2 +1,4 @@
 function process() {
+  // FIXME: this is broken
+  // HACK: temporary workaround
 }`;
    const file = parsePatch("fix.ts", patch, "modified");
    const comments = noTodo.run({ file, config: { enabled: true, severity: "info" }, allFiles: [file] });

    expect(comments).toHaveLength(2);
  });
});

describe("max-file-size rule", () => {
  it("flags files with many additions", () => {
    // Create a file with 600 additions
    const lines = Array.from({ length: 600 }, (_, i) => `+const x${i} = ${i};`);
    const patch = `@@ -0,0 +1,600 @@\n${lines.join("\n")}`;
    const file = parsePatch("big.ts", patch, "added");
    const comments = maxFileSize.run({
      file,
      config: { enabled: true, severity: "warning", maxLines: 500 },
      allFiles: [file],
    });

    expect(comments).toHaveLength(1);
    expect(comments[0].ruleId).toBe("max-file-size");
  });

  it("passes for small files", () => {
    const patch = `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;`;
    const file = parsePatch("small.ts", patch, "modified");
    const comments = maxFileSize.run({
      file,
      config: { enabled: true, severity: "warning", maxLines: 500 },
      allFiles: [file],
    });

    expect(comments).toHaveLength(0);
  });
});
