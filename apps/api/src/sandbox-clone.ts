/**
 * Clone a selected GitHub repo into a per-run sandbox under the authorized data dir.
 * Uses http.extraHeader auth so tokens never appear in the remote URL (or typical git stderr).
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseGitHubRepo,
  redactSecrets,
  remoteHttpsUrlForRepo,
  resolveGitHubToken,
  type GitHubRepoRef,
} from "@uatu/core";

export function redactCloneErrorMessage(raw: string): string {
  return redactSecrets(raw).text;
}

export async function cloneRepoToSandbox(opts: {
  dataDir: string;
  userId: string;
  fullName: string;
  installationId: number;
  runId: string;
}): Promise<{ sandboxPath: string; ref: GitHubRepoRef }> {
  const ref = parseGitHubRepo(opts.fullName);
  if (!ref) throw new Error(`Invalid repository full name: ${opts.fullName}`);

  const sandboxPath = path.join(
    opts.dataDir,
    "sandbox",
    "tenants",
    opts.userId,
    opts.runId,
    ref.repo,
  );
  await rm(sandboxPath, { recursive: true, force: true });
  await mkdir(path.dirname(sandboxPath), { recursive: true });

  const token = await resolveGitHubToken({ installationId: opts.installationId });
  if (!token) throw new Error("Unable to mint installation token for clone");

  const remote = await remoteHttpsUrlForRepo(ref);
  // Basic auth header keeps credentials out of the URL (and out of most git error text).
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  const result = spawnSync(
    "git",
    [
      "-c",
      `http.extraHeader=AUTHORIZATION: basic ${basic}`,
      "clone",
      "--depth",
      "1",
      "--single-branch",
      remote,
      sandboxPath,
    ],
    {
      encoding: "utf8",
      timeout: 180_000,
      env: {
        ...process.env,
        GIT_CEILING_DIRECTORIES: path.dirname(sandboxPath),
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  );
  if (result.status !== 0) {
    const detail = redactCloneErrorMessage(String(result.stderr || result.stdout || "unknown"));
    throw new Error(`git clone failed: ${detail}`);
  }
  return { sandboxPath, ref };
}
