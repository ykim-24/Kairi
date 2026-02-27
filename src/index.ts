import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { loadEnv } from "./config/env.js";
import { createWebhookRouter } from "./webhook/handler.js";
import { createDashboardRouter } from "./dashboard/routes.js";
import { createAuthRoutes, requireAuth, isAuthEnabled } from "./dashboard/auth.js";
import { initMetricsDb, closeMetricsDb } from "./metrics/pg-store.js";
import { initGraphMetrics, shutdownGraphMetrics } from "./metrics/graph-metrics.js";
import { getLogger } from "./utils/logger.js";
import { initLearningSystem, shutdownLearningSystem } from "./learning/init.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() })
);

app.route("/webhook", createWebhookRouter());

// Dashboard with optional GitHub OAuth
const dashboard = new Hono();
if (isAuthEnabled()) {
  dashboard.use("/*", requireAuth());
  dashboard.route("/", createAuthRoutes());
}
dashboard.route("/", createDashboardRouter());
app.route("/dashboard", dashboard);

async function main() {
  const env = loadEnv();
  const log = getLogger();

  // Init metrics (PostgreSQL)
  await initMetricsDb();
  await initGraphMetrics();

  // Init learning system (optional — needs Qdrant + Neo4j)
  await initLearningSystem();

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    log.info({ port: info.port }, "Kairi server started");
    log.info({ url: `http://localhost:${info.port}/dashboard` }, "Dashboard available");
  });

  const shutdown = async () => {
    log.info("Shutting down...");
    await closeMetricsDb();
    await shutdownGraphMetrics();
    await shutdownLearningSystem();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
