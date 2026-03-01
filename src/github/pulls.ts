import type { Octokit } from "@octokit/rest";
import { parsePatch, type ParsedFile } from "../utils/diff-parser.js";
import { updateRateLimit, waitIfNeeded } from "../utils/rate-limiter.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "github-pulls" });

export interface PRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  headRef: string;
  baseRef: string;
  installationId: number;
  prAuthor?: string;
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export async function fetchPRFiles(
  octokit: Octokit,
  ctx: PRContext
): Promise<PRFile[]> {
  await waitIfNeeded("github");
  const files: PRFile[] = [];
  let page = 1;

  while (true) {
    const { data, headers } = await octokit.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.pullNumber,
      per_page: 100,
      page,
    });
    updateRateLimit("github", headers as Record<string, string>);

    files.push(
      ...data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      }))
    );

    if (data.length < 100) break;
    page++;
  }

  log.info(
    { owner: ctx.owner, repo: ctx.repo, pr: ctx.pullNumber, fileCount: files.length },
    "Fetched PR files"
  );
  return files;
}

export function parseFiles(files: PRFile[]): ParsedFile[] {
  return files.map((f) => parsePatch(f.filename, f.patch, f.status));
}
