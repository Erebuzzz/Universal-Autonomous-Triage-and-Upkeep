import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load repo-root `.env` for local `tsx` / `node` (Node does not auto-load it).
 * Supports multiline PEM bodies for UATU_GITHUB_APP_PRIVATE_KEY without requiring
 * quoted single-line `\n` form. Does not override vars already set in the process.
 */
export function loadLocalEnv(): void {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(here, "../../../.env"),
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) return;

  const text = fs.readFileSync(envPath, "utf8");
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1);

    // Multiline continuation: unquoted PRIVATE_KEY body until next KEY= / blank / comment end
    if (
      key === "UATU_GITHUB_APP_PRIVATE_KEY" &&
      value.length > 0 &&
      !value.startsWith('"') &&
      !value.startsWith("'") &&
      !value.includes("\\n") &&
      !value.includes("BEGIN")
    ) {
      const chunks = [value.trim()];
      while (i < lines.length) {
        const next = lines[i]!;
        const nt = next.trim();
        if (!nt || nt.startsWith("#")) break;
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(nt)) break;
        if (nt.startsWith("-----")) {
          chunks.push(nt);
          i += 1;
          continue;
        }
        if (/^[A-Za-z0-9+/=]+$/.test(nt)) {
          chunks.push(nt);
          i += 1;
          continue;
        }
        break;
      }
      value = chunks.join("\n");
    } else {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, "\n");
    }

    if (process.env[key] === undefined && value !== "") {
      process.env[key] = value;
    }
  }
}
