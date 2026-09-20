import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export class DiffApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffApplyError";
  }
}

function assertSafeRelPath(repoRoot: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("..") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new DiffApplyError(`Unsafe path in diff: ${relPath}`);
  }
  const abs = path.resolve(repoRoot, normalized);
  const root = path.resolve(repoRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new DiffApplyError(`Path escapes repository root: ${relPath}`);
  }
  return abs;
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
}

function parseHunkHeader(line: string): Hunk | undefined {
  const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!m) return undefined;
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] !== undefined ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] !== undefined ? Number(m[4]) : 1,
    lines: [],
  };
}

/**
 * Parse a small unified diff into file patches.
 * Supports `diff --git`, `---/+++`, and `@@` hunks.
 */
export function parseUnifiedDiff(diffText: string): FilePatch[] {
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  const patches: FilePatch[] = [];
  let current: FilePatch | undefined;
  let hunk: Hunk | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      hunk = undefined;
      current = { oldPath: "", newPath: "", hunks: [] };
      patches.push(current);
      continue;
    }
    if (line.startsWith("--- ")) {
      if (!current) {
        current = { oldPath: "", newPath: "", hunks: [] };
        patches.push(current);
      }
      const p = line.slice(4).trim().replace(/^a\//, "");
      current.oldPath = p === "/dev/null" ? "" : p;
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (!current) {
        current = { oldPath: "", newPath: "", hunks: [] };
        patches.push(current);
      }
      const p = line.slice(4).trim().replace(/^b\//, "");
      current.newPath = p === "/dev/null" ? "" : p;
      continue;
    }
    if (line.startsWith("@@ ")) {
      if (!current) {
        current = { oldPath: "", newPath: "", hunks: [] };
        patches.push(current);
      }
      hunk = parseHunkHeader(line);
      if (hunk) current.hunks.push(hunk);
      continue;
    }
    if (hunk && (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "\\ No newline at end of file")) {
      if (line !== "\\ No newline at end of file") hunk.lines.push(line);
    }
  }

  return patches.filter((p) => p.newPath || p.oldPath);
}

function applyHunksToContent(original: string, hunks: Hunk[]): string {
  const sourceLines = original.replace(/\r\n/g, "\n").split("\n");
  // Drop trailing empty line produced by split on final newline
  if (sourceLines.length && sourceLines[sourceLines.length - 1] === "") {
    sourceLines.pop();
  }

  let offset = 0;
  for (const hunk of hunks) {
    const start = hunk.oldStart - 1 + offset;
    const remove: string[] = [];
    const add: string[] = [];
    for (const line of hunk.lines) {
      const tag = line[0];
      const body = line.slice(1);
      if (tag === " " || tag === "-") remove.push(body);
      if (tag === " " || tag === "+") add.push(body);
    }

    const slice = sourceLines.slice(start, start + remove.length);
    if (slice.length !== remove.length || slice.some((l, i) => l !== remove[i])) {
      throw new DiffApplyError(
        `Hunk context mismatch at line ${hunk.oldStart}: expected ${JSON.stringify(remove)} got ${JSON.stringify(slice)}`,
      );
    }
    sourceLines.splice(start, remove.length, ...add);
    offset += add.length - remove.length;
  }

  return sourceLines.join("\n") + (original.endsWith("\n") || sourceLines.length ? "\n" : "");
}

/**
 * Apply a unified diff under repoRoot. Rejects path escape or apply failure.
 * Returns relative changed file paths.
 */
export async function applyUnifiedDiff(
  repoRoot: string,
  diffText: string,
): Promise<string[]> {
  const patches = parseUnifiedDiff(diffText);
  if (!patches.length) {
    throw new DiffApplyError("Empty or unparseable unified diff");
  }

  const changed: string[] = [];
  for (const patch of patches) {
    const rel = (patch.newPath || patch.oldPath).replace(/\\/g, "/");
    if (!rel || rel === "/dev/null") {
      throw new DiffApplyError("Diff deletes or omits file path (unsupported)");
    }
    const abs = assertSafeRelPath(repoRoot, rel);

    let original = "";
    try {
      original = await readFile(abs, "utf8");
    } catch {
      if (patch.oldPath && patch.oldPath !== "/dev/null") {
        throw new DiffApplyError(`Missing file for patch: ${rel}`);
      }
      await mkdir(path.dirname(abs), { recursive: true });
    }

    const next = applyHunksToContent(original, patch.hunks);
    await writeFile(abs, next, "utf8");
    changed.push(rel);
  }
  return changed;
}
