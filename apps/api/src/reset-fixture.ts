import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Restore intentional demo defects so repeated local runs stay reproducible. */
export async function resetFixtureDefects(fixturePath: string): Promise<void> {
  const rangePath = path.join(fixturePath, "src", "range.js");
  let src = await readFile(rangePath, "utf8");
  src = src.replace(
    /for \(let i = start; i <= end; i \+= 1\)/,
    "for (let i = start; i < end; i += 1)",
  );
  await writeFile(rangePath, src, "utf8");

  const pkgPath = path.join(fixturePath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  pkg.dependencies["left-pad"] = "1.0.1";
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  await writeFile(
    path.join(fixturePath, "SECURITY_NOTE.md"),
    `# Security note\n\nThis fixture intentionally pins an outdated dependency for the authorized UATU security-remediation demo.\nUATU should replace this file when it applies the dependency bump.\n`,
    "utf8",
  );
}
