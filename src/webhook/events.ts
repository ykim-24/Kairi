import type { EmitterWebhookEvent } from "@octokit/webhooks";
import type { PRContext } from "../github/pulls.js";
import { orchestrateReview } from "../review/orchestrator.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "webhook-events" });

type PREvent = EmitterWebhookEvent<"pull_request">;

const REVIEWABLE_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

export async function handlePullRequest(event: PREvent): Promise<void> {
  const { action, pull_request: pr } = event.payload;
  const installation = (event.payload as any).installation;

  if (!REVIEWABLE_ACTIONS.has(action)) {
    log.debug({ action, pr: pr.number }, "Skipping non-reviewable PR action");
    return;
  }

  if (pr.draft) {
    log.info({ pr: pr.number }, "Skipping draft PR");
    return;
  }

  if (!installation?.id) {
    log.error("No installation ID in webhook payload");
    return;
  }

  const ctx: PRContext = {
    owner: pr.base.repo.owner!.login,
    repo: pr.base.repo.name,
    pullNumber: pr.number,
    headSha: pr.head.sha,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    installationId: installation.id,
  };

  log.info(
    { owner: ctx.owner, repo: ctx.repo, pr: ctx.pullNumber, action },
    "Processing PR event"
  );

  try {
    await orchestrateReview(ctx, action === "synchronize");
  } catch (err) {
    log.error({ err, pr: ctx.pullNumber }, "Review orchestration failed");
  }
}
