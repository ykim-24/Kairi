import { Octokit } from "@octokit/rest";
import { getInstallationToken, getAppJwt } from "./auth.js";

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

/** App-level Octokit authenticated with a JWT (not installation-scoped) */
export async function getAppOctokit(): Promise<Octokit> {
  const jwt = await getAppJwt();
  return new Octokit({ auth: jwt });
}

/** List all installations of this GitHub App */
export async function listInstallations(): Promise<
  Array<{ id: number; account: string }>
> {
  const octokit = await getAppOctokit();
  const { data } = await octokit.apps.listInstallations({ per_page: 100 });
  return data.map((inst) => ({
    id: inst.id,
    account: inst.account?.login ?? `installation-${inst.id}`,
  }));
}

/** List repositories accessible to a specific installation */
export async function listInstallationRepos(
  installationId: number
): Promise<Array<{ full_name: string }>> {
  const octokit = await getOctokit(installationId);
  const { data } = await octokit.apps.listReposAccessibleToInstallation({
    per_page: 100,
  });
  return data.repositories.map((r) => ({ full_name: r.full_name }));
}
