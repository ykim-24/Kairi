import { Hono } from "hono";
import {
  getAggregatedMetrics,
  getApprovalTrend,
  getReviewTrend,
  getRepoBreakdown,
} from "../metrics/pg-store.js";
import {
  getConceptApprovalRates,
  getFileHotspots,
  getConceptGraph,
  getKnowledgeBaseStats,
} from "../metrics/graph-metrics.js";
import { renderDashboard } from "./html.js";

export function createDashboardRouter(): Hono {
  const app = new Hono();

  // ─── JSON API ───

  app.get("/api/metrics/summary", async (c) => {
    const repo = c.req.query("repo");
    const period = (c.req.query("period") as "day" | "week" | "month") ?? "week";
    return c.json(await getAggregatedMetrics(repo, period));
  });

  app.get("/api/metrics/approval-trend", async (c) => {
    const repo = c.req.query("repo");
    const period = (c.req.query("period") as "day" | "week" | "month") ?? "week";
    const points = parseInt(c.req.query("points") ?? "12", 10);
    return c.json(await getApprovalTrend(repo, period, points));
  });

  app.get("/api/metrics/review-trend", async (c) => {
    const repo = c.req.query("repo");
    const period = (c.req.query("period") as "day" | "week" | "month") ?? "week";
    const points = parseInt(c.req.query("points") ?? "12", 10);
    return c.json(await getReviewTrend(repo, period, points));
  });

  app.get("/api/metrics/repos", async (c) => {
    return c.json(await getRepoBreakdown());
  });

  app.get("/api/metrics/concepts", async (c) => {
    const repo = c.req.query("repo");
    return c.json(await getConceptApprovalRates(repo));
  });

  app.get("/api/metrics/file-hotspots", async (c) => {
    const repo = c.req.query("repo");
    return c.json(await getFileHotspots(repo));
  });

  app.get("/api/metrics/concept-graph", async (c) => {
    const repo = c.req.query("repo");
    return c.json(await getConceptGraph(repo));
  });

  app.get("/api/metrics/knowledge-base", async (c) => {
    const repo = c.req.query("repo");
    return c.json(await getKnowledgeBaseStats(repo));
  });

  // ─── HTML Dashboard ───

  app.get("/", async (c) => {
    const html = renderDashboard();
    return c.html(html);
  });

  return app;
}
