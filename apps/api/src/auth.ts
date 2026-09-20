import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { SessionRecord, UatuUser } from "@uatu/domain";

const SESSION_COOKIE = "uatu_session";
const CSRF_COOKIE = "uatu_oauth_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthStores {
  getUser(id: string): Promise<UatuUser | undefined>;
  saveUser(user: UatuUser): Promise<void>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  saveSession(session: SessionRecord): Promise<void>;
  deleteSession(id: string): Promise<void>;
}

export function authRequired(): boolean {
  const raw = process.env.UATU_AUTH_REQUIRED?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Fail closed when unset in Lambda / production; local demo stays open when unset.
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.NODE_ENV === "production";
}

export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.UATU_GITHUB_OAUTH_CLIENT_ID?.trim() &&
      process.env.UATU_GITHUB_OAUTH_CLIENT_SECRET?.trim(),
  );
}

export function localDemoUser(): UatuUser {
  return {
    id: "local-demo",
    login: "local-demo",
    createdAt: new Date(0).toISOString(),
    installationIds: [],
  };
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

export function readSessionId(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const secure = process.env.UATU_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const sameSite = process.env.UATU_COOKIE_SAMESITE ?? (secure ? "None" : "Lax");
  const domain = process.env.UATU_COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`,
  );
}

export function setOauthStateCookie(res: Response, state: string): void {
  res.append(
    "Set-Cookie",
    `${CSRF_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  );
}

export function readOauthState(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[CSRF_COOKIE];
}

export function clearOauthStateCookie(res: Response): void {
  res.append("Set-Cookie", `${CSRF_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function createSession(stores: AuthStores, userId: string): Promise<SessionRecord> {
  const now = Date.now();
  const session: SessionRecord = {
    id: randomUUID(),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  await stores.saveSession(session);
  return session;
}

export async function loadSessionUser(
  stores: AuthStores,
  req: Request,
): Promise<{ session?: SessionRecord; user?: UatuUser }> {
  const sid = readSessionId(req);
  if (!sid) {
    if (!authRequired()) return { user: localDemoUser() };
    return {};
  }
  const session = await stores.getSession(sid);
  if (!session || Date.parse(session.expiresAt) < Date.now()) {
    if (session) await stores.deleteSession(session.id);
    if (!authRequired()) return { user: localDemoUser() };
    return {};
  }
  const user = await stores.getUser(session.userId);
  return { session, user };
}

export function requireUser(
  stores: AuthStores,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    try {
      const { user, session } = await loadSessionUser(stores, req);
      (req as Request & { uatuUser?: UatuUser; uatuSession?: SessionRecord }).uatuUser = user;
      (req as Request & { uatuUser?: UatuUser; uatuSession?: SessionRecord }).uatuSession = session;
      if (!user) {
        res.status(401).json({ error: "unauthorized", message: "Sign in with GitHub required" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getRequestUser(req: Request): UatuUser | undefined {
  return (req as Request & { uatuUser?: UatuUser }).uatuUser;
}

export function oauthAuthorizeUrl(state: string): string {
  const clientId = process.env.UATU_GITHUB_OAUTH_CLIENT_ID!.trim();
  const redirect = process.env.UATU_GITHUB_OAUTH_CALLBACK_URL?.trim() ??
    "http://localhost:8787/auth/github/callback";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeOauthCode(code: string): Promise<{
  accessToken: string;
  user: { id: number; login: string; avatar_url?: string };
}> {
  const clientId = process.env.UATU_GITHUB_OAUTH_CLIENT_ID!.trim();
  const clientSecret = process.env.UATU_GITHUB_OAUTH_CLIENT_SECRET!.trim();
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const tokenBody = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenBody.access_token) {
    throw new Error(tokenBody.error_description ?? tokenBody.error ?? "oauth_token_exchange_failed");
  }
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenBody.access_token}`,
      "User-Agent": "uatu-agent",
    },
  });
  const user = (await userRes.json()) as { id: number; login: string; avatar_url?: string };
  if (!user?.id || !user.login) throw new Error("oauth_user_fetch_failed");
  // Intentionally discard access_token after identity hydration — never send to browser.
  void createHash("sha256").update(tokenBody.access_token).digest("hex");
  return { accessToken: tokenBody.access_token, user };
}

/** Async file-backed auth stores under the API data directory. */
export async function createFileAuthStoresAsync(dataDir: string): Promise<AuthStores> {
  const { readFile, writeFile, mkdir, unlink } = await import("node:fs/promises");
  const path = await import("node:path");
  const usersDir = path.join(dataDir, "users");
  const sessionsDir = path.join(dataDir, "sessions");

  return {
    async getUser(id) {
      try {
        return JSON.parse(await readFile(path.join(usersDir, `${id}.json`), "utf8")) as UatuUser;
      } catch {
        return undefined;
      }
    },
    async saveUser(user) {
      await mkdir(usersDir, { recursive: true });
      await writeFile(path.join(usersDir, `${user.id}.json`), JSON.stringify(user, null, 2), "utf8");
    },
    async getSession(id) {
      try {
        return JSON.parse(await readFile(path.join(sessionsDir, `${id}.json`), "utf8")) as SessionRecord;
      } catch {
        return undefined;
      }
    },
    async saveSession(session) {
      await mkdir(sessionsDir, { recursive: true });
      await writeFile(
        path.join(sessionsDir, `${session.id}.json`),
        JSON.stringify(session, null, 2),
        "utf8",
      );
    },
    async deleteSession(id) {
      try {
        await unlink(path.join(sessionsDir, `${id}.json`));
      } catch {
        /* ignore */
      }
    },
  };
}
