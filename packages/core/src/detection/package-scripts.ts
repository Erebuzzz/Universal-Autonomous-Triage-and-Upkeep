import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readTestScript(repoPath: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(path.join(repoPath, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.test?.trim();
    return script || undefined;
  } catch {
    return undefined;
  }
}

/** Split a package.json scripts.test value into argv for spawn (no shell). */
export function parseTestScriptArgv(script: string): { command: string; args: string[] } | undefined {
  const parts = script.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return undefined;
  const command = parts[0]!;
  // Prefer running via npm run test when the script is complex; callers may choose.
  return { command, args: parts.slice(1) };
}
