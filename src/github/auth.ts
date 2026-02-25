import { createAppAuth } from "@octokit/auth-app";
import { loadEnv } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "github-auth" });

let _appAuth: ReturnType<typeof createAppAuth> | null = null;

function getAppAuth() {
  if (_appAuth) return _appAuth;
  const env = loadEnv();
  _appAuth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
  });
  return _appAuth;
}

export async function getInstallationToken(
  installationId: number
): Promise<string> {
  const auth = getAppAuth();
  const { token } = await auth({
    type: "installation",
    installationId,
  });
  log.debug({ installationId }, "Obtained installation token");
  return token;
}

export async function getAppJwt(): Promise<string> {
  const auth = getAppAuth();
  const { token } = await auth({ type: "app" });
  return token;
}
