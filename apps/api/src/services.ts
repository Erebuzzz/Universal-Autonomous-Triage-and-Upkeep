import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { AuditTrail, JsonFileStore, AuthorizationPolicy, WorkflowOrchestrator } from "@uatu/core";
import { resetFixtureDefects } from "./reset-fixture.js";

function resolveRepoRoot(): string {
  if (process.env.UATU_REPO_ROOT) return path.resolve(process.env.UATU_REPO_ROOT);
  // Always set by the Lambda runtime; CJS bundles may empty import.meta.
  if (process.env.LAMBDA_TASK_ROOT) return process.env.LAMBDA_TASK_ROOT;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export const REPO_ROOT = resolveRepoRoot();

export function resolvePaths() {
  const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const resolveFromRoot = (value: string) =>
    path.isAbsolute(value) ? path.resolve(value) : path.resolve(REPO_ROOT, value);
  const dataDir = resolveFromRoot(
    process.env.UATU_DATA_DIR?.trim() || (isLambda ? "/tmp/uatu-data" : "data"),
  );
  const defaultSeed = isLambda
    ? path.join(process.env.LAMBDA_TASK_ROOT ?? "/var/task", "fixture-seed")
    : path.join(REPO_ROOT, "fixtures", "demo-vulnerable");
  const seedRaw = process.env.UATU_FIXTURE_SEED?.trim();
  const seedFixture = seedRaw ? resolveFromRoot(seedRaw) : defaultSeed;
  const fixtureRaw = process.env.UATU_FIXTURE_PATH?.trim();
  const fixturePath = fixtureRaw
    ? resolveFromRoot(fixtureRaw)
    : path.join(dataDir, "sandbox", "demo-vulnerable");
  return { dataDir, seedFixture, fixturePath };
}

export async function createAppServices() {
  const { dataDir, seedFixture, fixturePath } = resolvePaths();
  await mkdir(dataDir, { recursive: true });
  await prepareSandboxFixture(seedFixture, fixturePath);

  const store = new JsonFileStore(dataDir);
  const audit = new AuditTrail();
  audit.load(await store.loadEvents());
  const policy = new AuthorizationPolicy(fixturePath);
  const orchestrator = new WorkflowOrchestrator({
    policy,
    store,
    audit,
    fixturePath,
  });

  return { store, audit, policy, orchestrator, dataDir, fixturePath, seedFixture };
}

export async function prepareSandboxFixture(seedFixture: string, fixturePath: string): Promise<void> {
  await rm(fixturePath, { recursive: true, force: true });
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await cp(seedFixture, fixturePath, { recursive: true });
  await resetFixtureDefects(fixturePath);
  await initExclusiveGitRepo(fixturePath);
}

async function initExclusiveGitRepo(fixturePath: string): Promise<void> {
  // Always re-init so a copied or leftover .git cannot attach to the monorepo.
  await rm(path.join(fixturePath, ".git"), { recursive: true, force: true });

  const ceiling = path.dirname(fixturePath);
  const run = (args: string[]) =>
    spawnSync("git", args, {
      cwd: fixturePath,
      encoding: "utf8",
      shell: false,
      env: {
        ...process.env,
        // Stop git from walking into the parent monorepo.
        GIT_CEILING_DIRECTORIES: ceiling,
        GIT_AUTHOR_NAME: "UATU Fixture",
        GIT_AUTHOR_EMAIL: "fixture@uatu.local",
        GIT_COMMITTER_NAME: "UATU Fixture",
        GIT_COMMITTER_EMAIL: "fixture@uatu.local",
      },
    });

  const version = run(["--version"]);
  if (version.status !== 0) {
    throw new Error(
      `git is not available in this runtime (${version.stderr || version.error?.message || "unknown"}). ` +
        "Local installs need git on PATH; Lambda needs the git layer.",
    );
  }

  run(["init", "-b", "main"]);
  run(["config", "core.autocrlf", "false"]);
  run(["add", "."]);
  const commit = run(["commit", "-m", "chore: seed authorized demo fixture"]);
  if (commit.status !== 0) {
    throw new Error(
      `Fixture git seed commit failed: ${commit.stderr || commit.stdout || commit.error?.message || "unknown"}`,
    );
  }

  const gitDir = run(["rev-parse", "--git-dir"]);
  const resolved = path.resolve(fixturePath, (gitDir.stdout || "").trim());
  if (!resolved.startsWith(path.resolve(fixturePath))) {
    throw new Error(`Fixture git dir escaped sandbox: ${resolved}`);
  }
}
