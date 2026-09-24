import assert from "node:assert/strict";
import { describe, it } from "node:test";
import os from "node:os";
import path from "node:path";
import { AuthorizationPolicy, PolicyDeniedError } from "./policy.js";
import { redactSecrets } from "./audit.js";
import type { AuthorizationGrant } from "@uatu/domain";

const fixture = path.join(os.tmpdir(), "uatu-fixtures-test-root");

function grant(overrides: Partial<AuthorizationGrant> = {}): AuthorizationGrant {
  return {
    id: "g1",
    targetPath: fixture,
    repositoryName: "demo",
    capabilities: ["inspect", "analyze", "run_tests", "write_files", "create_branch", "commit", "draft_pr"],
    pathAllowlist: ["src/**", "test/**", "package.json"],
    commandAllowlist: ["npm test", "git"],
    grantedBy: "tester",
    grantedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AuthorizationPolicy", () => {
  const policy = new AuthorizationPolicy(fixture);

  it("allows inspect without grant", () => {
    policy.assertCapability({ mode: "PASSIVE", fixtureRoot: fixture }, "inspect");
  });

  it("denies write in passive mode without grant", () => {
    assert.throws(
      () => policy.assertCapability({ mode: "PASSIVE", fixtureRoot: fixture }, "write_files"),
      PolicyDeniedError,
    );
  });

  it("denies paths outside fixture", () => {
    assert.throws(
      () => policy.assertTargetIsFixture(path.join(os.tmpdir(), "uatu-not-the-fixture")),
      PolicyDeniedError,
    );
  });

  it("denies path not in allowlist", () => {
    assert.throws(
      () => policy.assertPathAllowed(grant(), "secrets/token.env"),
      PolicyDeniedError,
    );
  });

  it("denies non-allowlisted commands", () => {
    assert.throws(
      () => policy.assertCommandAllowed(grant(), "curl http://evil"),
      PolicyDeniedError,
    );
  });

  it("allows temporary authorized roots", () => {
    const extra = path.join(os.tmpdir(), "uatu-oss-clone-root");
    const p = new AuthorizationPolicy(fixture);
    p.grantTemporaryRoot(extra);
    p.assertTargetIsFixture(extra);
    p.clearTemporaryRoots();
    assert.throws(() => p.assertTargetIsFixture(extra), PolicyDeniedError);
  });

  it("trusts persistent grant targetPath without in-memory temporary root", () => {
    const sandboxPath = path.join(os.tmpdir(), "uatu-persistent-grant-sandbox");
    const freshPolicy = new AuthorizationPolicy(fixture);
    const externalGrant = grant({ targetPath: sandboxPath });

    freshPolicy.assertCapability(
      { mode: "REMEDIATE", grant: externalGrant, fixtureRoot: fixture },
      "write_files",
    );

    freshPolicy.assertPathAllowed(externalGrant, "src/index.js");
    freshPolicy.assertTargetIsFixture(sandboxPath, externalGrant);

    assert.throws(
      () => freshPolicy.assertTargetIsFixture(sandboxPath),
      PolicyDeniedError,
    );
  });

  it("requires security-research scope for SECURITY path", () => {
    assert.throws(
      () => policy.assertSecurityResearchAllowed(grant({ scope: "general" })),
      PolicyDeniedError,
    );
    policy.assertSecurityResearchAllowed(
      grant({ scope: "security-research", capabilities: [...grant().capabilities, "security_research"] }),
    );
  });
});

describe("redactSecrets", () => {
  it("redacts token-like values", () => {
    const { text, redacted } = redactSecrets("Authorization: Bearer abcdefghijklmnop");
    assert.equal(redacted, true);
    assert.match(text, /REDACTED/);
  });
});
