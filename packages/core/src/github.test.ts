import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGitHubLiveEnabled, parseGitHubRepo } from "./github.js";

describe("github helpers", () => {
  it("parses owner/repo and github URLs", () => {
    assert.deepEqual(parseGitHubRepo("acme/demo"), { owner: "acme", repo: "demo" });
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/demo.git"), {
      owner: "acme",
      repo: "demo",
    });
    assert.equal(parseGitHubRepo("invalid"), undefined);
  });

  it("reports live mode only when token and repo are set", () => {
    const prevToken = process.env.UATU_GITHUB_TOKEN;
    const prevRepo = process.env.UATU_GITHUB_REPO;
    try {
      delete process.env.UATU_GITHUB_TOKEN;
      delete process.env.UATU_GITHUB_REPO;
      assert.equal(isGitHubLiveEnabled(), false);
      process.env.UATU_GITHUB_TOKEN = "test-token";
      process.env.UATU_GITHUB_REPO = "acme/demo";
      assert.equal(isGitHubLiveEnabled(), true);
    } finally {
      if (prevToken === undefined) delete process.env.UATU_GITHUB_TOKEN;
      else process.env.UATU_GITHUB_TOKEN = prevToken;
      if (prevRepo === undefined) delete process.env.UATU_GITHUB_REPO;
      else process.env.UATU_GITHUB_REPO = prevRepo;
    }
  });
});
