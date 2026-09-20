import { spawn } from "node:child_process";
import path from "node:path";
import type { AuthorizationGrant } from "@uatu/domain";
import { AuthorizationPolicy, PolicyDeniedError } from "./policy.js";
import { redactSecrets } from "./audit.js";

export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  dryRun: boolean;
}

export interface CommandRunnerOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  grant?: AuthorizationGrant;
  policy: AuthorizationPolicy;
}

function resolveExecutable(command: string): string {
  return command;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandRunnerOptions,
): Promise<CommandResult> {
  const full = [command, ...args].join(" ");
  if (options.grant) {
    options.policy.assertCommandAllowed(options.grant, full);
    options.policy.assertTargetIsFixture(options.cwd);
  } else if (!options.dryRun) {
    throw new PolicyDeniedError("Command execution requires a grant or dryRun");
  }

  if (options.dryRun) {
    return {
      command: full,
      exitCode: 0,
      stdout: `[dry-run] ${full}`,
      stderr: "",
      timedOut: false,
      dryRun: true,
    };
  }

  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 256_000;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    ComSpec: process.env.ComSpec,
    NODE_ENV: "test",
    // Keep fixture git operations from discovering a parent monorepo.
    GIT_CEILING_DIRECTORIES: path.dirname(options.cwd),
    ...options.env,
  };

  // Prefer argv spawn (no shell) so commit messages with spaces stay intact.
  // On Windows, .cmd shims (npm) require shell; callers should prefer node/git directly.
  const useShell =
    process.platform === "win32" && (command === "npm" || command === "npx");
  const executable = useShell ? `${command}.cmd` : resolveExecutable(command);

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env,
      shell: useShell,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const push = (target: "out" | "err", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "out") {
        stdout += text;
        if (Buffer.byteLength(stdout) > maxOutputBytes) {
          stdout = stdout.slice(0, maxOutputBytes) + "\n[truncated]";
          child.kill("SIGTERM");
        }
      } else {
        stderr += text;
        if (Buffer.byteLength(stderr) > maxOutputBytes) {
          stderr = stderr.slice(0, maxOutputBytes) + "\n[truncated]";
          child.kill("SIGTERM");
        }
      }
    };

    child.stdout?.on("data", (c: Buffer) => push("out", c));
    child.stderr?.on("data", (c: Buffer) => push("err", c));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        command: full,
        exitCode: 1,
        stdout: redactSecrets(stdout).text,
        stderr: redactSecrets(`${stderr}\n${err.message}`).text,
        timedOut,
        dryRun: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command: full,
        exitCode: code,
        stdout: redactSecrets(stdout).text,
        stderr: redactSecrets(stderr).text,
        timedOut,
        dryRun: false,
      });
    });
  });
}
