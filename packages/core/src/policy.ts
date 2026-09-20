import path from "node:path";
import type { AuthorizationGrant, Capability, OperatingMode } from "@uatu/domain";

export class PolicyDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}

export interface PolicyContext {
  mode: OperatingMode;
  grant?: AuthorizationGrant;
  fixtureRoot: string;
}

function normalize(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

export class AuthorizationPolicy {
  constructor(private readonly fixtureRoot: string) {}

  getFixtureRoot(): string {
    return path.resolve(this.fixtureRoot);
  }

  isPassive(mode: OperatingMode): boolean {
    return mode === "PASSIVE" || mode === "RESEARCH" || mode === "TRIAGE" || mode === "WATCH";
  }

  assertCapability(ctx: PolicyContext, capability: Capability): void {
    if (capability === "inspect" || capability === "analyze") {
      return;
    }
    if (capability === "run_tests") {
      if (!ctx.grant?.capabilities.includes("run_tests")) {
        throw new PolicyDeniedError("run_tests requires an authorization grant");
      }
      return;
    }
    const writeCaps: Capability[] = ["write_files", "create_branch", "commit", "draft_pr"];
    if (writeCaps.includes(capability)) {
      if (this.isPassive(ctx.mode) && !ctx.grant) {
        throw new PolicyDeniedError(`Passive mode denies ${capability}`);
      }
      if (!ctx.grant) {
        throw new PolicyDeniedError(`Missing authorization grant for ${capability}`);
      }
      if (!ctx.grant.capabilities.includes(capability)) {
        throw new PolicyDeniedError(`Grant does not include capability ${capability}`);
      }
      this.assertTargetIsFixture(ctx.grant.targetPath);
    }
  }

  assertTargetIsFixture(targetPath: string): void {
    const target = normalize(targetPath);
    const root = normalize(this.fixtureRoot);
    if (target !== root && !target.startsWith(root + "/")) {
      throw new PolicyDeniedError(
        `Write target outside authorized fixture: ${targetPath}`,
      );
    }
  }

  assertPathAllowed(grant: AuthorizationGrant, filePath: string): void {
    this.assertTargetIsFixture(grant.targetPath);
    const abs = normalize(path.isAbsolute(filePath) ? filePath : path.join(grant.targetPath, filePath));
    const root = normalize(grant.targetPath);
    if (abs !== root && !abs.startsWith(root + "/")) {
      throw new PolicyDeniedError(`Path escapes grant target: ${filePath}`);
    }
    const rel = path.relative(grant.targetPath, abs).replace(/\\/g, "/");
    const allowed = grant.pathAllowlist.some((pattern) => {
      if (pattern === "**" || pattern === "*") return true;
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        return rel === prefix || rel.startsWith(prefix + "/");
      }
      return rel === pattern || rel.startsWith(pattern.replace(/\*$/, ""));
    });
    if (!allowed) {
      throw new PolicyDeniedError(`Path not in allowlist: ${rel}`);
    }
  }

  assertCommandAllowed(grant: AuthorizationGrant, command: string): void {
    const base = command.trim().split(/\s+/)[0] ?? "";
    const ok = grant.commandAllowlist.some(
      (c) => c === command.trim() || c === base || command.trim().startsWith(c + " "),
    );
    if (!ok) {
      throw new PolicyDeniedError(`Command not allowlisted: ${command}`);
    }
  }
}
