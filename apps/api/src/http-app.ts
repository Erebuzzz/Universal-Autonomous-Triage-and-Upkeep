import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  PolicyDeniedError,
  listInstallationRepos,
  isGitHubAppConfigured,
  redactSecrets,
} from "@uatu/core";
import type { WorkflowOrchestrator, AuditTrail, JsonFileStore } from "@uatu/core";
import type { UatuUser } from "@uatu/domain";
import { CloudUatuStore } from "./cloud-store.js";
import { createAppServices, prepareSandboxFixture, resolvePaths } from "./services.js";
import {
  authRequired,
  clearOauthStateCookie,
  clearSessionCookie,
  createFileAuthStoresAsync,
  createSession,
  exchangeOauthCode,
  getRequestUser,
  isOAuthConfigured,
  loadSessionUser,
  oauthAuthorizeUrl,
  requireUser,
  safeEqual,
  setOauthStateCookie,
  setSessionCookie,
  type AuthStores,
} from "./auth.js";
import { QuotaExceededError, QuotaStore, readQuotaLimits, withWallClock } from "./quota.js";
import { cloneRepoToSandbox } from "./sandbox-clone.js";
import {
  assertRepoInInstallation,
  assertUserCanAccessInstallation,
  InstallationAccessError,
} from "./installation-access.js";
import { verifyGitHubWebhookSignature } from "./webhook-hmac.js";
import { runScheduledRescans } from "./rescan.js";

export type UatuStore = JsonFileStore | CloudUatuStore;

export interface AppContext {
  store: UatuStore;
  audit: AuditTrail;
  orchestrator: WorkflowOrchestrator;
  fixturePath: string;
  dataDir: string;
  jobQueueUrl?: string;
  asyncJobs: boolean;
  authStores: AuthStores;
  quota: QuotaStore;
}

export async function buildAppContext(): Promise<AppContext> {
  const tableName = process.env.TASKS_TABLE;
  const bucketName = process.env.ARTIFACT_BUCKET;
  const jobQueueUrl = process.env.JOB_QUEUE_URL;
  const asyncJobs = Boolean(jobQueueUrl) && process.env.UATU_ASYNC_JOBS !== "false";
  const { dataDir, fixturePath } = resolvePaths();
  const authStores = await createFileAuthStoresAsync(dataDir);
  const quota = new QuotaStore(dataDir);

  if (tableName && bucketName) {
    const store = new CloudUatuStore({
      tableName,
      bucketName,
      region: process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION,
    });
    const { AuditTrail, AuthorizationPolicy, WorkflowOrchestrator } = await import("@uatu/core");
    const audit = new AuditTrail();
    audit.load(await store.loadEvents());
    const policy = new AuthorizationPolicy(fixturePath);
    const orchestrator = new WorkflowOrchestrator({
      policy,
      store,
      audit,
      fixturePath,
    });
    return { store, audit, orchestrator, fixturePath, dataDir, jobQueueUrl, asyncJobs, authStores, quota };
  }

  const services = await createAppServices();
  return {
    store: services.store,
    audit: services.audit,
    orchestrator: services.orchestrator,
    fixturePath: services.fixturePath,
    dataDir: services.dataDir,
    jobQueueUrl,
    asyncJobs,
    authStores,
    quota,
  };
}

function paramId(req: express.Request, name = "id"): string {
  const raw = req.params[name];
  return Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
}

function tenantFilter<T extends { userId?: string }>(items: T[], user: UatuUser): T[] {
  // local-demo all-items bypass only when auth is explicitly off for local demo.
  if (!authRequired() && user.id === "local-demo") return items;
  // When auth is on (or any non-demo user), missing userId is not globally visible.
  return items.filter((i) => i.userId === user.id);
}

function canAccessTenantRecord(
  recordUserId: string | undefined,
  user: UatuUser,
): boolean {
  if (!authRequired() && user.id === "local-demo") return true;
  return recordUserId === user.id;
}

export function createHttpApp(ctx: AppContext): express.Express {
  const corsOrigin =
    process.env.UATU_CORS_ORIGIN ??
    (process.env.AWS_LAMBDA_FUNCTION_NAME ? "*" : "http://localhost:5173");
  const { store, audit, orchestrator, fixturePath, dataDir, jobQueueUrl, asyncJobs, authStores, quota } =
    ctx;
  const app = express();
  const credentials = process.env.UATU_CORS_CREDENTIALS === "true" || corsOrigin !== "*";
  app.use(
    cors({
      origin: corsOrigin === "*" ? true : corsOrigin,
      credentials,
    }),
  );

  // GitHub webhooks need the raw body for HMAC — register before JSON parser.
  app.post(
    "/api/webhooks/github",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      try {
        await handleGitHubWebhook(req, res, {
          store,
          audit,
          authStores,
          orchestrator,
          jobQueueUrl,
          asyncJobs,
        });
      } catch (err) {
        handleError(res, err);
      }
    },
  );

  app.use(express.json({ limit: "1mb" }));

  const authed = requireUser(authStores);

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "uatu-api",
      passiveDefault: true,
      fixturePath,
      bedrock: process.env.UATU_BEDROCK_ENABLED === "true",
      persistence: process.env.TASKS_TABLE ? "dynamodb+s3" : "json-file",
      asyncJobs,
      authRequired: authRequired(),
      oauthConfigured: isOAuthConfigured(),
      githubAppConfigured: isGitHubAppConfigured(),
    });
  });

  // —— Auth (K2) ——
  app.get("/auth/github", (_req, res) => {
    if (!isOAuthConfigured()) {
      res.status(503).json({
        error: "oauth_not_configured",
        message: "Set UATU_GITHUB_OAUTH_CLIENT_ID/SECRET for Sign in with GitHub",
      });
      return;
    }
    const state = randomUUID();
    setOauthStateCookie(res, state);
    res.redirect(oauthAuthorizeUrl(state));
  });

  app.get("/auth/github/callback", async (req, res) => {
    try {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      const expected = req.headers.cookie
        ? undefined
        : undefined;
      void expected;
      const { readOauthState } = await import("./auth.js");
      const cookieState = readOauthState(req);
      if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
        res.status(400).json({ error: "invalid_oauth_state" });
        return;
      }
      clearOauthStateCookie(res);
      const { user: gh } = await exchangeOauthCode(code);
      const userId = String(gh.id);
      let user = await authStores.getUser(userId);
      if (!user) {
        user = {
          id: userId,
          login: gh.login,
          avatarUrl: gh.avatar_url,
          createdAt: new Date().toISOString(),
          installationIds: [],
        };
      } else {
        user = { ...user, login: gh.login, avatarUrl: gh.avatar_url };
      }
      await authStores.saveUser(user);
      const session = await createSession(authStores, user.id);
      setSessionCookie(res, session.id);
      audit.append({
        taskId: "system",
        actor: user.login,
        action: "auth_login",
        detail: `GitHub OAuth login for ${user.login}`,
        metadata: { userId: user.id },
      });
      await store.saveEvents(audit.all());
      const webOrigin = process.env.UATU_WEB_ORIGIN?.trim() || "http://localhost:5173";
      res.redirect(`${webOrigin}/?signedIn=1`);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/auth/logout", async (req, res) => {
    const { session } = await loadSessionUser(authStores, req);
    if (session) await authStores.deleteSession(session.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/me", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    const snap = await quota.get(user.id);
    res.json({
      user: { id: user.id, login: user.login, avatarUrl: user.avatarUrl, installationIds: user.installationIds },
      quota: snap,
      limits: readQuotaLimits(),
      githubAppConfigured: isGitHubAppConfigured(),
      fixtureDemoAvailable: true,
    });
  });

  // —— Grants (K4: grantedBy from session, never body spoof) ——
  app.get("/api/grants", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    const grants = tenantFilter(await store.listGrants(), user);
    res.json({ grants });
  });

  app.post("/api/grants", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const source = String(req.body.source ?? "fixture") as "fixture" | "github";
      if (source === "fixture") {
        const { seedFixture, fixturePath: fp } = resolvePaths();
        await prepareSandboxFixture(seedFixture, fp);
        const scope =
          String(req.body.scope ?? "general") === "security-research"
            ? "security-research"
            : "general";
        const grant = await orchestrator.createGrant({
          grantedBy: user.login,
          notes: req.body.notes ?? "Fixture demo authorization",
          userId: user.id,
          source: "fixture",
          repositoryName: "demo-vulnerable",
          scope,
          organizationId: user.id,
        });
        res.status(201).json({ grant });
        return;
      }

      const fullName = String(req.body.repositoryFullName ?? "");
      const installationId = Number(req.body.installationId ?? user.installationIds[0] ?? 0);
      if (!fullName || !installationId) {
        res.status(400).json({ error: "repositoryFullName and installationId required" });
        return;
      }
      await assertUserCanAccessInstallation(user, installationId);
      await assertRepoInInstallation(installationId, fullName);
      if (!user.installationIds.includes(installationId)) {
        user.installationIds = [...user.installationIds, installationId];
        await authStores.saveUser(user);
      }
      const runId = randomUUID().slice(0, 8);
      const { sandboxPath, ref } = await cloneRepoToSandbox({
        dataDir,
        userId: user.id,
        fullName,
        installationId,
        runId,
      });
      audit.append({
        taskId: "system",
        actor: user.login,
        action: "sandbox_cloned",
        detail: `Cloned ${fullName} to sandbox`,
        metadata: { userId: user.id, installationId, sandboxPath },
      });
      await store.saveEvents(audit.all());

      const scope =
        String(req.body.scope ?? "general") === "security-research"
          ? "security-research"
          : "general";
      const grant = await orchestrator.createGrant({
        grantedBy: user.login,
        notes: req.body.notes ?? `Authorized clone of ${fullName}`,
        userId: user.id,
        installationId,
        repositoryFullName: `${ref.owner}/${ref.repo}`,
        source: "github",
        targetPath: sandboxPath,
        repositoryName: ref.repo,
        scope,
        organizationId: ref.owner,
      });
      res.status(201).json({ grant });
    } catch (err) {
      handleError(res, err);
    }
  });

  // —— Repo picker (K3) ——
  app.get("/api/installations/:id/repos", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const installationId = Number(paramId(req));
      await assertUserCanAccessInstallation(user, installationId);
      if (!isGitHubAppConfigured()) {
        res.status(503).json({
          error: "github_app_not_configured",
          message: "Configure UATU_GITHUB_APP_ID and UATU_GITHUB_APP_PRIVATE_KEY on the API host (not Vercel).",
          repos: [],
        });
        return;
      }
      const repos = await listInstallationRepos(installationId);
      res.json({ repos });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/me/installations", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const installationId = Number(req.body.installationId);
      if (!Number.isFinite(installationId) || installationId <= 0) {
        res.status(400).json({ error: "invalid_installation_id" });
        return;
      }
      await assertUserCanAccessInstallation(user, installationId);
      if (!user.installationIds.includes(installationId)) {
        user.installationIds = [...user.installationIds, installationId];
        await authStores.saveUser(user);
      }
      res.json({ user });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/tasks", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    res.json({ tasks: tenantFilter(await store.listTasks(), user) });
  });

  app.get("/api/tasks/:id", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    const task = await store.getTask(paramId(req));
    if (!task || !canAccessTenantRecord(task.userId, user)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      task,
      audit: audit.forTask(task.id),
      brain: await orchestrator.getBrainMap(
        task.findings.find((f) => f.id === task.selectedFindingId)?.relatedNeuronIds ?? [],
      ),
    });
  });

  app.post("/api/tasks", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const grantId = String(req.body.grantId ?? "");
      const grant = await store.getGrant(grantId);
      if (!grant || !canAccessTenantRecord(grant.userId, user)) {
        res.status(403).json({ error: "grant_forbidden" });
        return;
      }
      const task = await orchestrator.startRun(grantId, req.body.mode ?? "REMEDIATE");
      res.status(201).json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/tasks/:id/advance", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const existing = await store.getTask(paramId(req));
      if (!existing || !canAccessTenantRecord(existing.userId, user)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const task = await orchestrator.advance(paramId(req), req.body.selectedFindingId);
      res.json({
        task,
        audit: audit.forTask(task.id),
        brain: await orchestrator.getBrainMap(),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/tasks/:id/run", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    try {
      const existing = await store.getTask(paramId(req));
      if (!existing || !canAccessTenantRecord(existing.userId, user)) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      if (asyncJobs && jobQueueUrl) {
        await quota.beginRun(user.id);
        const sqs = new SQSClient({});
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: jobQueueUrl,
            MessageBody: JSON.stringify({
              type: "run_to_completion",
              taskId: paramId(req),
              selectedFindingId: req.body.selectedFindingId,
              userId: user.id,
            }),
          }),
        );
        audit.append({
          taskId: paramId(req),
          actor: user.login,
          action: "run_enqueued",
          detail: "Remediation queued for worker Lambda",
          metadata: { userId: user.id },
        });
        await store.saveEvents(audit.all());
        const task = await store.getTask(paramId(req));
        res.status(202).json({
          accepted: true,
          task,
          message: "Remediation queued for worker Lambda",
        });
        return;
      }

      await quota.beginRun(user.id);
      const limits = readQuotaLimits();
      audit.append({
        taskId: paramId(req),
        actor: user.login,
        action: "run_started",
        detail: `Wall clock ${limits.wallClockMs}ms; bedrock=${process.env.UATU_BEDROCK_ENABLED === "true"}`,
        metadata: {
          userId: user.id,
          bedrockEnabled: process.env.UATU_BEDROCK_ENABLED === "true",
          sandbox: existing.repositoryPath,
        },
      });
      await store.saveEvents(audit.all());

      try {
        const task = await withWallClock(
          limits.wallClockMs,
          () => orchestrator.runToCompletion(paramId(req), req.body.selectedFindingId),
          () => {
            audit.append({
              taskId: paramId(req),
              actor: "quota",
              action: "run_wall_clock_killed",
              detail: `Exceeded ${limits.wallClockMs}ms`,
              metadata: { userId: user.id },
            });
          },
        );
        res.json({
          task,
          audit: audit.forTask(task.id),
          brain: await orchestrator.getBrainMap(
            task.findings.find((f) => f.id === task.selectedFindingId)?.relatedNeuronIds ?? [],
          ),
        });
      } finally {
        await quota.endRun(user.id);
        await store.saveEvents(audit.all());
      }
    } catch (err) {
      await quota.endRun(user.id).catch(() => undefined);
      handleError(res, err);
    }
  });

  app.get("/api/brain", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    res.json({
      brain: await orchestrator.getBrainMap([], {
        userId: user.id,
        repositoryId: "demo-vulnerable",
      }),
    });
  });

  app.post("/api/rescans", authed, async (req, res) => {
    try {
      const user = getRequestUser(req)!;
      const result = await runScheduledRescans({
        store,
        orchestrator,
        audit,
        userId: user.id,
      });
      res.status(202).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/audit", authed, async (req, res) => {
    const user = getRequestUser(req)!;
    const events = audit.all().filter((e) => {
      const metaUser = e.metadata?.userId;
      if (typeof metaUser === "string") return metaUser === user.id;
      // Unscoped events: only local-demo with auth explicitly off.
      return !authRequired() && user.id === "local-demo";
    });
    res.json({ events });
  });

  return app;
}

async function handleGitHubWebhook(
  req: express.Request,
  res: express.Response,
  deps: {
    store: UatuStore;
    audit: AuditTrail;
    authStores: AuthStores;
    orchestrator: WorkflowOrchestrator;
    jobQueueUrl?: string;
    asyncJobs: boolean;
  },
): Promise<void> {
  const { store, audit, authStores, orchestrator, jobQueueUrl, asyncJobs } = deps;
  const secret = process.env.UATU_GITHUB_WEBHOOK_SECRET?.trim();
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");

  if (!secret) {
    if (authRequired() || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      res.status(503).json({ error: "webhook_secret_not_configured" });
      return;
    }
  } else {
    const header = String(req.header("x-hub-signature-256") ?? "");
    if (!verifyGitHubWebhookSignature(rawBody, header, secret)) {
      res.status(401).json({ error: "unauthorized_webhook" });
      return;
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody.length ? (JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>) : {};
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  const event = String(req.header("x-github-event") ?? "unknown");
  const action = String(payload.action ?? "none");
  const pr = payload.pull_request as
    | { number?: number; html_url?: string; merged?: boolean; state?: string; title?: string }
    | undefined;
  const installation = payload.installation as { id?: number } | undefined;
  const repoFull =
    (payload.repository as { full_name?: string } | undefined)?.full_name ??
    (pr ? undefined : undefined);

  if (event === "installation" || event === "installation_repositories") {
    const account = (payload.installation as { account?: { login?: string; id?: number } } | undefined)
      ?.account;
    if (installation?.id && account?.id) {
      const userId = String(account.id);
      let user = await authStores.getUser(userId);
      if (!user) {
        user = {
          id: userId,
          login: account.login ?? userId,
          createdAt: new Date().toISOString(),
          installationIds: [installation.id],
        };
      } else if (!user.installationIds.includes(installation.id)) {
        user.installationIds = [...user.installationIds, installation.id];
      }
      await authStores.saveUser(user);
    }
  }

  // Phase F: push / issues → enqueue or kick a rescan for matching grants
  if (event === "push" || (event === "issues" && (action === "opened" || action === "reopened"))) {
    const fullName =
      (payload.repository as { full_name?: string } | undefined)?.full_name ?? repoFull;
    if (fullName) {
      const grants = (await store.listGrants()).filter(
        (g) => g.repositoryFullName === fullName || g.repositoryName === fullName.split("/")[1],
      );
      for (const grant of grants.slice(0, 3)) {
        try {
          if (asyncJobs && jobQueueUrl && grant.userId) {
            const task = await orchestrator.startRun(
              grant.id,
              grant.scope === "security-research" ? "SECURITY" : "REMEDIATE",
            );
            const sqs = new SQSClient({});
            await sqs.send(
              new SendMessageCommand({
                QueueUrl: jobQueueUrl,
                MessageBody: JSON.stringify({
                  type: "run_to_completion",
                  taskId: task.id,
                  userId: grant.userId,
                }),
              }),
            );
            audit.append({
              taskId: task.id,
              actor: "github-webhook",
              action: "webhook_pipeline_enqueued",
              detail: `${event}/${action} on ${fullName}`,
              metadata: { userId: grant.userId, grantId: grant.id },
            });
          } else {
            const task = await orchestrator.startRun(
              grant.id,
              grant.scope === "security-research" ? "SECURITY" : "REMEDIATE",
            );
            audit.append({
              taskId: task.id,
              actor: "github-webhook",
              action: "webhook_pipeline_started",
              detail: `${event}/${action} on ${fullName} (local sync start)`,
              metadata: { userId: grant.userId, grantId: grant.id },
            });
          }
        } catch (err) {
          audit.append({
            taskId: "webhook",
            actor: "github-webhook",
            action: "webhook_pipeline_failed",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  audit.append({
    taskId: "webhook",
    actor: "github-webhook",
    action: `github.${event}.${action}`,
    detail: pr?.number
      ? `PR #${pr.number} ${action} state=${pr.state ?? "n/a"} merged=${Boolean(pr.merged)}`
      : `Received GitHub event ${event}/${action}`,
    metadata: {
      prNumber: pr?.number,
      prUrl: pr?.html_url,
      title: pr?.title,
    },
  });
  await store.saveEvents(audit.all());

  const accountLogin =
    (payload.repository as { owner?: { login?: string; id?: number } } | undefined)?.owner?.login ??
    (payload.installation as { account?: { login?: string; id?: number } } | undefined)?.account
      ?.login;
  const accountId =
    (payload.repository as { owner?: { id?: number } } | undefined)?.owner?.id ??
    (payload.installation as { account?: { id?: number } } | undefined)?.account?.id;

  if (pr?.number) {
    const { makeNeuron, RepositoryBrain, reviewPullRequestAndComment, parseGitHubRepo } =
      await import("@uatu/core");
    const userId = accountId ? String(accountId) : undefined;
    const orgId = accountLogin ?? userId ?? "local";
    const brain = new RepositoryBrain(store, "webhook-repo", {
      userId,
      organizationId: orgId,
    });
    await brain.upsertNeuron(
      makeNeuron(
        "Observation",
        `webhook:pr:${pr.number}:${action}`,
        {
          event,
          action,
          prNumber: pr.number,
          prUrl: pr.html_url,
          merged: pr.merged,
          state: pr.state,
        },
        { value: 0.7, rationale: "GitHub webhook observation" },
        0.6,
      ),
    );

    // Phase G: comment-only review on newly opened / synchronized PRs
    if (
      event === "pull_request" &&
      (action === "opened" || action === "reopened" || action === "synchronize") &&
      installation?.id
    ) {
      const fullName = (payload.repository as { full_name?: string } | undefined)?.full_name;
      const ref = fullName ? parseGitHubRepo(fullName) : undefined;
      if (ref) {
        try {
          const graph = await brain.getGraph();
          const review = await reviewPullRequestAndComment({
            repo: ref,
            pullNumber: pr.number,
            installationId: installation.id,
            title: pr.title,
            brain: graph,
          });
          audit.append({
            taskId: "webhook",
            actor: "github-webhook",
            action: "pr_review_posted",
            detail: `Posted review comment on PR #${pr.number}`,
            metadata: { reviewId: review.reviewId, prUrl: pr.html_url },
          });
          await store.saveEvents(audit.all());
        } catch (err) {
          audit.append({
            taskId: "webhook",
            actor: "github-webhook",
            action: "pr_review_failed",
            detail: err instanceof Error ? err.message : String(err),
          });
          await store.saveEvents(audit.all());
        }
      }
    }
  }

  res.status(202).json({ accepted: true, event, action });
}

export function handleError(res: express.Response, err: unknown): void {
  if (err instanceof InstallationAccessError) {
    res.status(err.status).json({ error: err.code, message: redactSecrets(err.message).text });
    return;
  }
  if (err instanceof PolicyDeniedError) {
    res.status(403).json({ error: "policy_denied", message: redactSecrets(err.message).text });
    return;
  }
  if (err instanceof QuotaExceededError) {
    res.status(429).json({ error: "quota_exceeded", message: redactSecrets(err.message).text });
    return;
  }
  const message = redactSecrets(err instanceof Error ? err.message : "unknown_error").text;
  console.error(err);
  res.status(500).json({ error: "internal", message });
}
