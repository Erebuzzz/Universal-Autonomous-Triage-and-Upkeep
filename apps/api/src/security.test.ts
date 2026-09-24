import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, before, after } from "node:test";
import { AuditTrail } from "@uatu/core";
import type { UatuUser } from "@uatu/domain";
import { createHttpApp, handleError, type AppContext } from "./http-app.js";
import { redactCloneErrorMessage } from "./sandbox-clone.js";
import { InstallationAccessError, assertUserCanAccessInstallation } from "./installation-access.js";
import { signGitHubWebhookBody, verifyGitHubWebhookSignature } from "./webhook-hmac.js";
import type { AuthStores } from "./auth.js";

function mockAuthStores(users: Map<string, UatuUser> = new Map()): AuthStores {
  const sessions = new Map<string, { id: string; userId: string; createdAt: string; expiresAt: string }>();
  return {
    async getUser(id) {
      return users.get(id);
    },
    async saveUser(user) {
      users.set(user.id, user);
    },
    async getSession(id) {
      return sessions.get(id);
    },
    async saveSession(session) {
      sessions.set(session.id, session);
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
  };
}

function mockCtx(authStores: AuthStores): AppContext {
  const audit = new AuditTrail();
  const emptyStore = {
    listGrants: async () => [],
    listTasks: async () => [],
    getTask: async () => undefined,
    getGrant: async () => undefined,
    saveEvents: async () => undefined,
    loadEvents: async () => [],
    saveGrant: async () => undefined,
    saveTask: async () => undefined,
    put: async () => undefined,
  };
  return {
    store: emptyStore as unknown as AppContext["store"],
    audit,
    orchestrator: {
      getBrainMap: async () => ({ neurons: [], edges: [] }),
    } as unknown as AppContext["orchestrator"],
    fixturePath: "/tmp/fixture",
    dataDir: "/tmp/uatu-data",
    asyncJobs: false,
    authStores,
    quota: {
      get: async () => ({ concurrent: 0, daily: 0, monthly: 0 }),
      beginRun: async () => undefined,
      endRun: async () => undefined,
    } as unknown as AppContext["quota"],
  };
}

describe("webhook HMAC", () => {
  it("rejects wrong or missing signatures", () => {
    const body = Buffer.from('{"action":"opened"}', "utf8");
    const secret = "test-webhook-secret";
    assert.equal(verifyGitHubWebhookSignature(body, "", secret), false);
    assert.equal(verifyGitHubWebhookSignature(body, "sha256=", secret), false);
    assert.equal(verifyGitHubWebhookSignature(body, "sha256=deadbeef", secret), false);
    assert.equal(verifyGitHubWebhookSignature(body, "sha256=nothex!!!", secret), false);
    // Mere presence of a plausible header must not authenticate.
    assert.equal(verifyGitHubWebhookSignature(body, "sha256=" + "ab".repeat(32), secret), false);
  });

  it("accepts a valid HMAC-SHA256 signature", () => {
    const body = Buffer.from('{"action":"opened","number":1}', "utf8");
    const secret = "test-webhook-secret";
    const sig = signGitHubWebhookBody(body, secret);
    assert.equal(verifyGitHubWebhookSignature(body, sig, secret), true);
  });
});

describe("webhook route HMAC reject", () => {
  let baseUrl = "";
  let server: ReturnType<typeof createServer> | undefined;
  const prevSecret = process.env.UATU_GITHUB_WEBHOOK_SECRET;
  const prevAuth = process.env.UATU_AUTH_REQUIRED;

  before(async () => {
    process.env.UATU_GITHUB_WEBHOOK_SECRET = "route-secret";
    process.env.UATU_AUTH_REQUIRED = "false";
    const app = createHttpApp(mockCtx(mockAuthStores()));
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (prevSecret === undefined) delete process.env.UATU_GITHUB_WEBHOOK_SECRET;
    else process.env.UATU_GITHUB_WEBHOOK_SECRET = prevSecret;
    if (prevAuth === undefined) delete process.env.UATU_AUTH_REQUIRED;
    else process.env.UATU_AUTH_REQUIRED = prevAuth;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 401 when signature does not match", async () => {
    const body = JSON.stringify({ action: "opened" });
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-hub-signature-256": "sha256=" + "00".repeat(32),
      },
      body,
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as { error: string };
    assert.equal(json.error, "unauthorized_webhook");
  });

  it("returns 401 when signature header is absent", async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "ping" },
      body: "{}",
    });
    assert.equal(res.status, 401);
  });

  it("returns 202 for a valid signature", async () => {
    const body = Buffer.from(JSON.stringify({ action: "opened" }), "utf8");
    const sig = signGitHubWebhookBody(body, "route-secret");
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-hub-signature-256": sig,
      },
      body,
    });
    assert.equal(res.status, 202);
  });
});

describe("installation ownership", () => {
  const prevAuth = process.env.UATU_AUTH_REQUIRED;

  after(() => {
    if (prevAuth === undefined) delete process.env.UATU_AUTH_REQUIRED;
    else process.env.UATU_AUTH_REQUIRED = prevAuth;
  });

  it("rejects unlinked installation for authenticated users", async () => {
    process.env.UATU_AUTH_REQUIRED = "true";
    const user: UatuUser = {
      id: "111",
      login: "alice",
      createdAt: new Date().toISOString(),
      installationIds: [42],
    };
    await assert.rejects(
      () => assertUserCanAccessInstallation(user, 99999),
      (err: unknown) => {
        assert.ok(err instanceof InstallationAccessError);
        assert.equal(err.status, 403);
        return true;
      },
    );
  });

  it("allows already-linked installation without GitHub round-trip", async () => {
    process.env.UATU_AUTH_REQUIRED = "true";
    const user: UatuUser = {
      id: "111",
      login: "alice",
      createdAt: new Date().toISOString(),
      installationIds: [42],
    };
    await assertUserCanAccessInstallation(user, 42);
  });
});

describe("clone error redaction", () => {
  it("redacts x-access-token from clone error text", () => {
    // Opaque placeholder: not a real token shape the static scanner should flag in prod repos.
    const leakToken = "REDACT_ME_PLACEHOLDER_0001";
    const leaked = `fatal: unable to access 'https://x-access-token:${leakToken}@github.com/acme/demo.git/': The requested URL returned error: 403`;
    const redacted = redactCloneErrorMessage(leaked);
    assert.equal(redacted.includes(leakToken), false);
    assert.match(redacted, /REDACTED/i);
  });

  it("handleError redacts secrets in 500 responses", () => {
    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    const leakToken = "REDACT_ME_PLACEHOLDER_0002";
    handleError(
      res as never,
      new Error(`git clone failed: https://x-access-token:${leakToken}@github.com/x/y.git`),
    );
    assert.equal(res.statusCode, 500);
    const message = String((res.body as { message: string }).message);
    assert.equal(message.includes(leakToken), false);
    assert.match(message, /REDACTED/i);
  });
});

describe("CORS origin filtering", () => {
  it("allows configured whitelist origins with credentials", async () => {
    const orig = process.env.UATU_CORS_ORIGIN;
    try {
      process.env.UATU_CORS_ORIGIN = "https://uatu-beta.vercel.app, http://localhost:5173";
      const app = createHttpApp(mockCtx(mockAuthStores()));
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://localhost:${port}/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://uatu-beta.vercel.app",
          "Access-Control-Request-Method": "GET",
        },
      });

      assert.equal(res.headers.get("access-control-allow-origin"), "https://uatu-beta.vercel.app");
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
      server.close();
    } finally {
      if (orig !== undefined) process.env.UATU_CORS_ORIGIN = orig;
      else delete process.env.UATU_CORS_ORIGIN;
    }
  });

  it("denies origins not in the whitelist", async () => {
    const orig = process.env.UATU_CORS_ORIGIN;
    try {
      process.env.UATU_CORS_ORIGIN = "https://uatu-beta.vercel.app";
      const app = createHttpApp(mockCtx(mockAuthStores()));
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;

      const res = await fetch(`http://localhost:${port}/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://malicious-site.example.com",
          "Access-Control-Request-Method": "GET",
        },
      });

      assert.equal(res.headers.get("access-control-allow-origin"), null);
      server.close();
    } finally {
      if (orig !== undefined) process.env.UATU_CORS_ORIGIN = orig;
      else delete process.env.UATU_CORS_ORIGIN;
    }
  });
});
