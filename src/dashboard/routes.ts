import { readFileSync } from "fs";
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
import { serveStatic } from "@hono/node-server/serve-static";
import { syncRepoHistory, getSyncProgress } from "../learning/sync.js";
import { clearRepoLearning as clearGraphLearning } from "../learning/graph-store.js";
import { clearRepoLearning as clearVectorLearning } from "../learning/vector-store.js";
import {
  listInstallations,
  listInstallationRepos,
} from "../github/client.js";
import {
  getFeatureFlag,
  setFeatureFlag,
  listPendingReviews,
  resolvePendingReview,
} from "../metrics/pg-store.js";
import { getOctokit } from "../github/client.js";
import { postReview } from "../github/reviews.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "dashboard-routes" });

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

  // ─── Sync API ───

  app.get("/api/installations", async (c) => {
    const installations = await listInstallations();
    const repos: Array<{ full_name: string; installationId: number }> = [];
    for (const inst of installations) {
      const instRepos = await listInstallationRepos(inst.id);
      repos.push(
        ...instRepos.map((r) => ({ ...r, installationId: inst.id }))
      );
    }
    return c.json(repos);
  });

  app.post("/api/sync", async (c) => {
    const enabled = await getFeatureFlag("sync_enabled");
    if (!enabled) {
      return c.json({ ok: false, error: "Sync is disabled. Enable it in the dashboard first." }, 403);
    }
    const { repo, installationId } = await c.req.json<{
      repo: string;
      installationId: number;
    }>();
    // Run in background — don't await
    syncRepoHistory(installationId, repo).catch((err) =>
      log.error({ err }, "Sync failed")
    );
    return c.json({ ok: true });
  });

  app.get("/api/sync/status", (c) => {
    return c.json(getSyncProgress());
  });

  app.get("/api/flags/sync", async (c) => {
    const enabled = await getFeatureFlag("sync_enabled");
    return c.json({ enabled });
  });

  app.post("/api/flags/sync", async (c) => {
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    await setFeatureFlag("sync_enabled", enabled);
    log.info({ enabled }, "Sync feature flag updated");
    return c.json({ ok: true, enabled });
  });

  // ─── Learning management ───

  app.delete("/api/learning/:repo{.+}", async (c) => {
    const repo = c.req.param("repo");
    const [graphDeleted, _vectorResult] = await Promise.all([
      clearGraphLearning(repo),
      clearVectorLearning(repo),
    ]);
    log.info({ repo, graphDeleted }, "Cleared learning data for repo");
    return c.json({ ok: true, repo, graphDeleted });
  });

  // ─── Review gate API ───

  app.get("/api/flags/review-gate", async (c) => {
    const enabled = await getFeatureFlag("review_gate");
    return c.json({ enabled });
  });

  app.post("/api/flags/review-gate", async (c) => {
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    await setFeatureFlag("review_gate", enabled);
    log.info({ enabled }, "Review gate flag updated");
    return c.json({ ok: true, enabled });
  });

  app.get("/api/pending-reviews", async (c) => {
    const status = c.req.query("status");
    const reviews = await listPendingReviews(status || undefined);
    return c.json(reviews);
  });

  app.post("/api/pending-reviews/:id/approve", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const row = await resolvePendingReview(id, "approved");
    if (!row) {
      return c.json({ ok: false, error: "Review not found or already resolved" }, 404);
    }

    // Post the held review to GitHub
    try {
      const octokit = await getOctokit(row.installation_id);
      await postReview(octokit, {
        owner: row.owner,
        repo: row.repo.split("/")[1] ?? row.repo,
        pullNumber: row.pull_number,
        headSha: row.head_sha,
        headRef: "",
        baseRef: "",
        installationId: row.installation_id,
      }, row.result_json);
      log.info({ id, repo: row.repo, pr: row.pull_number }, "Approved and posted gated review");
    } catch (err) {
      log.error({ err, id }, "Failed to post approved review to GitHub");
      return c.json({ ok: false, error: "Failed to post review to GitHub" }, 500);
    }

    return c.json({ ok: true });
  });

  app.get("/api/pending-reviews/:id/diff", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const all = await listPendingReviews();
    const row = all.find((r) => r.id === id);
    if (!row) {
      return c.json({ ok: false, error: "Review not found" }, 404);
    }

    try {
      const octokit = await getOctokit(row.installation_id);
      const repoName = row.repo.split("/")[1] ?? row.repo;
      const { data: files } = await octokit.pulls.listFiles({
        owner: row.owner,
        repo: repoName,
        pull_number: row.pull_number,
        per_page: 100,
      });
      const diff = files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? "",
      }));
      return c.json({ ok: true, diff });
    } catch (err) {
      log.error({ err, id }, "Failed to fetch PR diff");
      return c.json({ ok: false, error: "Failed to fetch diff from GitHub" }, 500);
    }
  });

  app.post("/api/pending-reviews/:id/reject", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const row = await resolvePendingReview(id, "rejected");
    if (!row) {
      return c.json({ ok: false, error: "Review not found or already resolved" }, 404);
    }
    log.info({ id, repo: row.repo, pr: row.pull_number }, "Rejected gated review");
    return c.json({ ok: true });
  });

  // ─── SPA static files ───

  app.use("/*", serveStatic({
    root: "./dashboard-ui/dist",
    rewriteRequestPath: (path) => {
      // Strip /dashboard prefix if present (nested routing may keep it)
      return path.replace(/^\/dashboard/, "") || "/";
    },
  }));

  // SPA fallback — only for navigation requests, not assets
  app.get("/*", (c) => {
    const path = c.req.path;
    // Don't serve index.html for API routes or file extensions (assets)
    if (path.includes("/api/") || path.includes("/auth/") || /\.\w+$/.test(path)) {
      return c.notFound();
    }
    return c.html(readFileSync("./dashboard-ui/dist/index.html", "utf-8"));
  });

  return app;
}
