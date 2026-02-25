export const SIMPLE_PATCH = `@@ -1,5 +1,8 @@
 import express from 'express';

+const API_KEY = "sk-1234567890abcdef";
+
 const app = express();
+console.log("server starting");

-app.listen(3000);
+// TODO: add proper port config
+app.listen(process.env.PORT || 3000);`;

export const MULTI_HUNK_PATCH = `@@ -10,7 +10,7 @@
 function processData(input: string) {
-  return input.trim();
+  return input.trim().toLowerCase();
 }

 function validate(data: unknown) {
@@ -25,4 +25,8 @@
   return true;
 }
+
+function newHelper() {
+  console.log("debug");
+  return 42;
+}`;

export const WEBHOOK_PAYLOAD = {
  action: "opened",
  pull_request: {
    number: 42,
    draft: false,
    head: {
      sha: "abc123def456",
      ref: "feature/my-branch",
    },
    base: {
      ref: "main",
      repo: {
        owner: { login: "testorg" },
        name: "testrepo",
      },
    },
  },
  installation: { id: 12345 },
};

export const SAMPLE_CONFIG_YAML = `
enabled: true
rules:
  no-console-log:
    enabled: true
    severity: error
  no-todo:
    enabled: false
llm:
  enabled: true
  focusAreas:
    - bugs
    - security
filters:
  excludePaths:
    - "*.min.js"
`;
