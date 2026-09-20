/**
 * GitHub App installation token helpers (Phase K1).
 * Falls back to classic PAT (UATU_GITHUB_TOKEN) when App creds are unset.
 */
import { createAppAuth } from "@octokit/auth-app";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface CreatePullRequestInput {
  title: string;
  body: string;
  head: string;
  base: string;
  /** Optional per-request overrides (installation token flow). */
  token?: string;
  installationId?: number;
  repo?: GitHubRepoRef;
}

export interface CreatedPullRequest {
  number: number;
  htmlUrl: string;
  apiUrl: string;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
}

export interface InstallationRepo {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

function readPrivateKey(): string | undefined {
  const raw = process.env.UATU_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  let key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  // Users sometimes paste the base64 body only (no PEM headers). Octokit needs a PEM.
  if (!key.includes("BEGIN")) {
    const body = key
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && /^[A-Za-z0-9+/=]+$/.test(l))
      .join("\n");
    if (body.length >= 200) {
      key = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
    }
  }
  return key;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(process.env.UATU_GITHUB_APP_ID?.trim() && readPrivateKey());
}

export function parseGitHubRepo(raw?: string | null): GitHubRepoRef | undefined {
  const value = (raw ?? process.env.UATU_GITHUB_REPO ?? "").trim();
  if (!value) return undefined;
  const cleaned = value.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

/** Live contribution enabled via App installation token or classic PAT. */
export function isGitHubLiveEnabled(): boolean {
  if (process.env.UATU_GITHUB_TOKEN?.trim() && parseGitHubRepo()) return true;
  return Boolean(isGitHubAppConfigured() && parseGitHubRepo());
}

export function githubApiBase(): string {
  return (process.env.UATU_GITHUB_API_BASE ?? "https://api.github.com").replace(/\/$/, "");
}

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const appId = process.env.UATU_GITHUB_APP_ID?.trim();
  const privateKey = readPrivateKey();
  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials missing (UATU_GITHUB_APP_ID / UATU_GITHUB_APP_PRIVATE_KEY)");
  }

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });
  const result = await auth({ type: "installation" });
  const expiresAt = Date.parse(result.expiresAt);
  tokenCache.set(installationId, {
    token: result.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 50 * 60_000,
  });
  return result.token;
}

/** Resolve a short-lived token for this request (installation preferred). */
export async function resolveGitHubToken(opts?: {
  installationId?: number;
  token?: string;
}): Promise<string | undefined> {
  if (opts?.token?.trim()) return opts.token.trim();
  const installationId =
    opts?.installationId ??
    (process.env.UATU_GITHUB_APP_INSTALLATION_ID
      ? Number(process.env.UATU_GITHUB_APP_INSTALLATION_ID)
      : undefined);
  if (installationId && isGitHubAppConfigured()) {
    return getInstallationAccessToken(installationId);
  }
  return process.env.UATU_GITHUB_TOKEN?.trim() || undefined;
}

export async function githubFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ ok: boolean; status: number; data: T; raw: string }> {
  const token = init?.token ?? (await resolveGitHubToken());
  if (!token) {
    return { ok: false, status: 401, data: {} as T, raw: "missing token" };
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "uatu-agent",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${githubApiBase()}${path}`, {
    ...init,
    headers,
  });
  const raw = await res.text();
  let data = {} as T;
  try {
    data = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data, raw };
}

export async function createPullRequest(
  input: CreatePullRequestInput,
): Promise<CreatedPullRequest> {
  const ref = input.repo ?? parseGitHubRepo();
  if (!ref) throw new Error("GitHub repo is not configured (owner/name)");
  const token = await resolveGitHubToken({
    token: input.token,
    installationId: input.installationId,
  });
  const result = await githubFetch<{
    number?: number;
    html_url?: string;
    url?: string;
    message?: string;
  }>(`/repos/${ref.owner}/${ref.repo}/pulls`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    }),
  });
  if (!result.ok || !result.data.number || !result.data.html_url) {
    throw new Error(
      `GitHub PR create failed (${result.status}): ${result.data.message ?? result.raw}`,
    );
  }
  return {
    number: result.data.number,
    htmlUrl: result.data.html_url,
    apiUrl: result.data.url ?? result.data.html_url,
  };
}

export interface PullRequestReviewInput {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  event?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  installationId?: number;
  token?: string;
}

/**
 * Post a bot-authored PR review. Never merges: event defaults to COMMENT only.
 */
export async function submitPullRequestReview(
  input: PullRequestReviewInput,
): Promise<{ id: number; htmlUrl?: string }> {
  const token = await resolveGitHubToken({
    token: input.token,
    installationId: input.installationId,
  });
  const event = input.event ?? "COMMENT";
  if (event !== "COMMENT" && event !== "APPROVE" && event !== "REQUEST_CHANGES") {
    throw new Error("Invalid review event");
  }
  // Hard rule: UATU never auto-merges; callers must not pass merge APIs.
  const labeledBody = [
    "### UATU automated review (bot)",
    "",
    "_Comment-only review: UATU does not merge pull requests._",
    "",
    input.body,
  ].join("\n");
  const result = await githubFetch<{ id?: number; html_url?: string; message?: string }>(
    `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/reviews`,
    {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: labeledBody, event: "COMMENT" }),
    },
  );
  if (!result.ok || !result.data.id) {
    throw new Error(
      `GitHub PR review failed (${result.status}): ${result.data.message ?? result.raw}`,
    );
  }
  return { id: result.data.id, htmlUrl: result.data.html_url };
}

export async function getPullRequestDiff(opts: {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId?: number;
}): Promise<string> {
  const token = await resolveGitHubToken({ installationId: opts.installationId });
  const result = await githubFetch<string>(
    `/repos/${opts.owner}/${opts.repo}/pulls/${opts.pullNumber}`,
    {
      token,
      headers: { Accept: "application/vnd.github.v3.diff" },
    },
  );
  if (!result.ok) {
    throw new Error(`Failed to fetch PR diff (${result.status})`);
  }
  return result.raw || "";
}

export async function listOpenIssues(
  limit = 20,
  opts?: { repo?: GitHubRepoRef; installationId?: number },
): Promise<GitHubIssueSummary[]> {
  const ref = opts?.repo ?? parseGitHubRepo();
  const token = await resolveGitHubToken({ installationId: opts?.installationId });
  if (!ref || !token) return [];
  const result = await githubFetch<
    Array<{ number: number; title: string; body?: string; state: string; html_url: string }>
  >(`/repos/${ref.owner}/${ref.repo}/issues?state=open&per_page=${limit}`, { token });
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data
    .filter((item) => !(item as { pull_request?: unknown }).pull_request)
    .map((item) => ({
      number: item.number,
      title: item.title,
      body: item.body ?? "",
      state: item.state,
      htmlUrl: item.html_url,
    }));
}

export async function listInstallationRepos(
  installationId: number,
): Promise<InstallationRepo[]> {
  const token = await getInstallationAccessToken(installationId);
  const repos: InstallationRepo[] = [];
  let page = 1;
  while (page <= 5) {
    const result = await githubFetch<{
      repositories?: Array<{
        id: number;
        full_name: string;
        private: boolean;
        default_branch: string;
        html_url: string;
      }>;
    }>(`/installation/repositories?per_page=50&page=${page}`, { token });
    if (!result.ok || !result.data.repositories?.length) break;
    for (const r of result.data.repositories) {
      repos.push({
        id: r.id,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        htmlUrl: r.html_url,
      });
    }
    if (result.data.repositories.length < 50) break;
    page += 1;
  }
  return repos;
}

export interface AppInstallationSummary {
  id: number;
  account: { id: number; login: string; type: string };
}

/** App JWT lookup: used to verify installation ownership without trusting client input. */
export async function getAppInstallation(installationId: number): Promise<AppInstallationSummary> {
  const appId = process.env.UATU_GITHUB_APP_ID?.trim();
  const privateKey = readPrivateKey();
  if (!appId || !privateKey) {
    throw new Error("GitHub App credentials missing (UATU_GITHUB_APP_ID / UATU_GITHUB_APP_PRIVATE_KEY)");
  }
  const auth = createAppAuth({ appId, privateKey });
  const appAuth = await auth({ type: "app" });
  const result = await githubFetch<{
    id?: number;
    account?: { id?: number; login?: string; type?: string };
    message?: string;
  }>(`/app/installations/${installationId}`, { token: appAuth.token });
  if (!result.ok || !result.data.id || !result.data.account?.id) {
    throw new Error(
      `GitHub installation lookup failed (${result.status}): ${result.data.message ?? result.raw}`,
    );
  }
  return {
    id: result.data.id,
    account: {
      id: result.data.account.id,
      login: result.data.account.login ?? String(result.data.account.id),
      type: result.data.account.type ?? "User",
    },
  };
}

/**
 * HTTPS remote without embedding the token in the URL (prefer http.extraHeader for clone/push).
 * Prefer this over token-in-URL to avoid leaking credentials via git stderr.
 */
export async function remoteHttpsUrlForRepo(ref: GitHubRepoRef): Promise<string> {
  return `https://github.com/${ref.owner}/${ref.repo}.git`;
}

/** Args to prepend to `git` so auth uses http.extraHeader instead of token-in-URL. */
export function gitAuthExtraHeaderArgs(token: string): string[] {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return ["-c", `http.extraHeader=AUTHORIZATION: basic ${basic}`];
}

export async function remoteUrlForRepo(
  ref: GitHubRepoRef,
  opts?: { installationId?: number; token?: string },
): Promise<string | undefined> {
  const token = await resolveGitHubToken(opts);
  if (!token) return undefined;
  // Kept for callers that still need a tokenized URL; prefer resolveGitHubToken + remoteHttpsUrlForRepo.
  return `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;
}

export function remoteUrlForConfiguredRepo(): string | undefined {
  const ref = parseGitHubRepo();
  if (!ref) return undefined;
  const token = process.env.UATU_GITHUB_TOKEN?.trim();
  if (!token) return undefined;
  return `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;
}
