/**
 * Ensure a GitHub App installation is owned/accessible by the authenticated user
 * before linking, listing repos, or cloning.
 */
import {
  getAppInstallation,
  listInstallationRepos,
  parseGitHubRepo,
  type GitHubRepoRef,
} from "@uatu/core";
import type { UatuUser } from "@uatu/domain";
import { authRequired } from "./auth.js";

export class InstallationAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstallationAccessError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Linked installations are trusted. Otherwise verify via GitHub App API that
 * the installation account id matches the authenticated GitHub user id
 * (personal-account installs). Org installs must already be linked (e.g. webhook).
 */
export async function assertUserCanAccessInstallation(
  user: UatuUser,
  installationId: number,
): Promise<void> {
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw new InstallationAccessError(400, "invalid_installation_id", "Invalid installation id");
  }

  if (user.installationIds.includes(installationId)) {
    return;
  }

  // Local fixture demo with auth explicitly off may probe without App creds.
  if (!authRequired() && user.id === "local-demo") {
    return;
  }

  let installation: Awaited<ReturnType<typeof getAppInstallation>>;
  try {
    installation = await getAppInstallation(installationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "installation_lookup_failed";
    throw new InstallationAccessError(403, "installation_not_accessible", msg);
  }

  const accountId = String(installation.account.id);
  if (accountId === user.id) {
    return;
  }

  throw new InstallationAccessError(
    403,
    "installation_not_linked",
    "Installation is not linked to this user; install the GitHub App or link via webhook",
  );
}

/** Confirm the repo is visible to the installation before clone/grant. */
export async function assertRepoInInstallation(
  installationId: number,
  repositoryFullName: string,
): Promise<GitHubRepoRef> {
  const ref = parseGitHubRepo(repositoryFullName);
  if (!ref) {
    throw new InstallationAccessError(
      400,
      "invalid_repository",
      `Invalid repository full name: ${repositoryFullName}`,
    );
  }

  const wanted = `${ref.owner}/${ref.repo}`.toLowerCase();
  const repos = await listInstallationRepos(installationId);
  const match = repos.find((r) => r.fullName.toLowerCase() === wanted);
  if (!match) {
    throw new InstallationAccessError(
      403,
      "repository_not_in_installation",
      `Repository ${wanted} is not accessible for this installation`,
    );
  }
  return ref;
}
