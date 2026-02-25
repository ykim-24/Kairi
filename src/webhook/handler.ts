import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";
import { loadEnv } from "../config/env.js";
import { handlePullRequest } from "./events.js";
import { handleReviewFeedback } from "../learning/feedback.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "webhook-handler" });

export function createWebhookRouter(): Hono {
  const app = new Hono();
  const env = loadEnv();

  const webhooks = new Webhooks({ secret: env.GITHUB_WEBHOOK_SECRET });

  webhooks.on("pull_request", handlePullRequest);

  // Feedback signals for learning system
  webhooks.on("pull_request_review", handleReviewFeedback as any);
  webhooks.on("pull_request_review_comment", handleReviewFeedback as any);

  app.post("/", async (c) => {
    const id = c.req.header("x-github-delivery") ?? "";
    const name = c.req.header("x-github-event") ?? "";
    const signature = c.req.header("x-hub-signature-256") ?? "";
    const body = await c.req.text();

    log.debug({ id, event: name }, "Received webhook");

    try {
      await webhooks.verifyAndReceive({
        id,
        name: name as any,
        signature,
        payload: body,
      });
      return c.json({ ok: true });
    } catch (err) {
      log.error({ err, id }, "Webhook verification/handling failed");
      return c.json({ error: "webhook processing failed" }, 400);
    }
  });

  return app;
}
