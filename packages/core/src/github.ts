/**
 * Optional live GitHub contribution helpers.
 * Disabled unless UATU_GITHUB_TOKEN and UATU_GITHUB_REPO (owner/name) are set.
 */

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface CreatePullRequestInput {
  title: string;
  body: string;
  head: string;
  base: string;
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

export function parseGitHubRepo(raw?: string | null): GitHubRepoRef | undefined {
  const value = (raw ?? process.env.UATU_GITHUB_REPO ?? "").trim();
  if (!value) return undefined;
  const cleaned = value.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

export function isGitHubLiveEnabled(): boolean {
  return Boolean(process.env.UATU_GITHUB_TOKEN?.trim() && parseGitHubRepo());
}

export function githubApiBase(): string {
  return (process.env.UATU_GITHUB_API_BASE ?? "https://api.github.com").replace(/\/$/, "");
}

async function githubFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ ok: boolean; status: number; data: T; raw: string }> {
  const token = init?.token ?? process.env.UATU_GITHUB_TOKEN?.trim();
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
  const ref = parseGitHubRepo();
  if (!ref) throw new Error("UATU_GITHUB_REPO is not configured (owner/name)");
  const result = await githubFetch<{
    number?: number;
    html_url?: string;
    url?: string;
    message?: string;
    errors?: unknown;
  }>(`/repos/${ref.owner}/${ref.repo}/pulls`, {
    method: "POST",
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

export async function listOpenIssues(limit = 20): Promise<GitHubIssueSummary[]> {
  const ref = parseGitHubRepo();
  if (!ref || !process.env.UATU_GITHUB_TOKEN?.trim()) return [];
  const result = await githubFetch<
    Array<{ number: number; title: string; body?: string; state: string; html_url: string }>
  >(`/repos/${ref.owner}/${ref.repo}/issues?state=open&per_page=${limit}`);
  if (!result.ok || !Array.isArray(result.data)) return [];
  // GitHub issues API also returns PRs; skip pull_request-shaped items.
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

export function remoteUrlForConfiguredRepo(): string | undefined {
  const ref = parseGitHubRepo();
  if (!ref) return undefined;
  const token = process.env.UATU_GITHUB_TOKEN?.trim();
  if (!token) return undefined;
  // Prefer HTTPS with token for headless CI/demo; redacted in audit via command runner.
  return `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;
}
