import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHmac, randomBytes } from "crypto";
import { loadEnv } from "../config/env.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "dashboard-auth" });

interface SessionData {
  user: string;
  avatar: string;
  exp: number;
}

const SESSION_COOKIE = "kairi_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sign(payload: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token: string, secret: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.slice(0, lastDot);
  const expected = sign(payload, secret);
  if (token !== expected) return null;
  return payload;
}

function getSession(cookie: string | undefined, secret: string): SessionData | null {
  if (!cookie) return null;
  const payload = verify(cookie, secret);
  if (!payload) return null;
  try {
    const data: SessionData = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function createSession(user: string, avatar: string, secret: string): string {
  const data: SessionData = { user, avatar, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return sign(payload, secret);
}

export function isAuthEnabled(): boolean {
  const env = loadEnv();
  return !!(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

/** Mount auth routes and return middleware that protects dashboard routes */
export function createAuthRoutes(): Hono {
  const app = new Hono();
  const env = loadEnv();

  const clientId = env.GITHUB_OAUTH_CLIENT_ID!;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET!;
  const allowedOrg = env.GITHUB_ALLOWED_ORG;
  const sessionSecret = env.SESSION_SECRET;

  // Login — redirect to GitHub
  app.get("/auth/login", (c) => {
    const state = randomBytes(16).toString("hex");
    setCookie(c, "oauth_state", state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 300,
      path: "/dashboard",
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${getBaseUrl(c)}/dashboard/auth/callback`,
      scope: "user read:org",
      state,
    });
    return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // Callback — exchange code, check org membership
  app.get("/auth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const savedState = getCookie(c, "oauth_state");

    deleteCookie(c, "oauth_state", { path: "/dashboard" });

    if (!code || !state || state !== savedState) {
      return c.text("Invalid OAuth state", 403);
    }

    // Exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      log.warn({ error: tokenData.error }, "OAuth token exchange failed");
      return c.text("Authentication failed", 403);
    }

    const token = tokenData.access_token;

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = await userRes.json() as { login: string; avatar_url: string };

    // Check org membership (user's own orgs list — works for private memberships)
    const orgsRes = await fetch("https://api.github.com/user/orgs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const orgsBody = await orgsRes.text();
    let orgs: Array<{ login: string }>;
    try {
      orgs = JSON.parse(orgsBody);
    } catch {
      orgs = [];
    }
    const orgLogins = Array.isArray(orgs) ? orgs.map((o) => o.login) : [];
    log.info({ user: user.login, orgLogins, allowedOrg, orgsStatus: orgsRes.status }, "Org membership check");
    const isMember = orgLogins.some((login) => login.toLowerCase() === allowedOrg.toLowerCase());

    if (!isMember) {
      log.warn({ user: user.login, org: allowedOrg }, "User not in allowed org");
      return c.text(`Access denied — you must be a member of the ${allowedOrg} organization`, 403);
    }

    // Create session
    const sessionToken = createSession(user.login, user.avatar_url, sessionSecret);
    setCookie(c, SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/dashboard",
    });

    log.info({ user: user.login }, "Dashboard login");
    return c.redirect("/dashboard/");
  });

  // Logout
  app.get("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/dashboard" });
    return c.redirect("/dashboard/auth/login");
  });

  // User info endpoint (for the UI)
  app.get("/api/me", (c) => {
    const session = getSession(getCookie(c, SESSION_COOKIE), sessionSecret);
    if (!session) return c.json({ authenticated: false }, 401);
    return c.json({ authenticated: true, user: session.user, avatar: session.avatar });
  });

  return app;
}

/** Middleware that requires authentication for all routes below it */
export function requireAuth() {
  const env = loadEnv();
  const sessionSecret = env.SESSION_SECRET;

  return async (c: any, next: any) => {
    // Skip auth routes and static assets
    const path = c.req.path;
    if (path.startsWith("/dashboard/auth/") || path.startsWith("/dashboard/assets/")) {
      return next();
    }

    const session = getSession(getCookie(c, SESSION_COOKIE), sessionSecret);
    if (!session) {
      // API requests get 401, page requests redirect to login
      if (path.startsWith("/dashboard/api/")) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return c.redirect("/dashboard/auth/login");
    }

    return next();
  };
}

function getBaseUrl(c: any): string {
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost";
  return `${proto}://${host}`;
}
