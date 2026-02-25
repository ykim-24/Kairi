import { Octokit } from "@octokit/rest";
import { getInstallationToken } from "./auth.js";

const clientCache = new Map<number, { octokit: Octokit; expiresAt: number }>();

export async function getOctokit(installationId: number): Promise<Octokit> {
  const cached = clientCache.get(installationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.octokit;
  }

  const token = await getInstallationToken(installationId);
  const octokit = new Octokit({ auth: token });

  // Cache for 50 minutes (tokens last 60)
  clientCache.set(installationId, {
    octokit,
    expiresAt: Date.now() + 50 * 60 * 1000,
  });

  return octokit;
}
