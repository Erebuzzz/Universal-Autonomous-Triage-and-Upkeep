import express from "express";
import cors from "cors";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PolicyDeniedError } from "@uatu/core";
import type { WorkflowOrchestrator, AuditTrail, JsonFileStore } from "@uatu/core";
import { CloudUatuStore } from "./cloud-store.js";
import { createAppServices, prepareSandboxFixture, resolvePaths } from "./services.js";

export type UatuStore = JsonFileStore | CloudUatuStore;

export interface AppContext {
  store: UatuStore;
  audit: AuditTrail;
  orchestrator: WorkflowOrchestrator;
  fixturePath: string;
  jobQueueUrl?: string;
  asyncJobs: boolean;
}

export async function buildAppContext(): Promise<AppContext> {
  const tableName = process.env.TASKS_TABLE;
  const bucketName = process.env.ARTIFACT_BUCKET;
  const jobQueueUrl = process.env.JOB_QUEUE_URL;
  const asyncJobs = Boolean(jobQueueUrl) && process.env.UATU_ASYNC_JOBS !== "false";

  if (tableName && bucketName) {
    const { fixturePath } = resolvePaths();
    // Do not seed the fixture on cold start /health. Git may be provided via a Lambda layer
    // and is only required when an authorized write path runs.
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
    return { store, audit, orchestrator, fixturePath, jobQueueUrl, asyncJobs };
  }

  const services = await createAppServices();
  return {
    store: services.store,
    audit: services.audit,
    orchestrator: services.orchestrator,
    fixturePath: services.fixturePath,
    jobQueueUrl,
    asyncJobs,
  };
}

export function createHttpApp(ctx: AppContext): express.Express {
  const corsOrigin =
    process.env.UATU_CORS_ORIGIN ??
    (process.env.AWS_LAMBDA_FUNCTION_NAME ? "*" : "http://localhost:5173");
  const { store, audit, orchestrator, fixturePath, jobQueueUrl, asyncJobs } = ctx;
  const app = express();
  app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "uatu-api",
      passiveDefault: true,
      fixturePath,
      bedrock: process.env.UATU_BEDROCK_ENABLED === "true",
      persistence: process.env.TASKS_TABLE ? "dynamodb+s3" : "json-file",
      asyncJobs,
    });
  });

  app.get("/api/grants", async (_req, res) => {
    res.json({ grants: await store.listGrants() });
  });

  app.post("/api/grants", async (req, res) => {
    try {
      const { seedFixture, fixturePath: fp } = resolvePaths();
      await prepareSandboxFixture(seedFixture, fp);
      const grant = await orchestrator.createGrant({
        grantedBy: String(req.body.grantedBy ?? "local-operator"),
        notes: req.body.notes,
      });
      res.status(201).json({ grant });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/tasks", async (_req, res) => {
    res.json({ tasks: await store.listTasks() });
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await store.getTask(req.params.id);
    if (!task) {
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

  app.post("/api/tasks", async (req, res) => {
    try {
      const grantId = String(req.body.grantId ?? "");
      const task = await orchestrator.startRun(grantId, req.body.mode ?? "REMEDIATE");
      res.status(201).json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/tasks/:id/advance", async (req, res) => {
    try {
      const task = await orchestrator.advance(req.params.id, req.body.selectedFindingId);
      res.json({
        task,
        audit: audit.forTask(task.id),
        brain: await orchestrator.getBrainMap(),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/tasks/:id/run", async (req, res) => {
    try {
      if (asyncJobs && jobQueueUrl) {
        const sqs = new SQSClient({});
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: jobQueueUrl,
            MessageBody: JSON.stringify({
              type: "run_to_completion",
              taskId: req.params.id,
              selectedFindingId: req.body.selectedFindingId,
            }),
          }),
        );
        const task = await store.getTask(req.params.id);
        res.status(202).json({
          accepted: true,
          task,
          message: "Remediation queued for worker Lambda",
        });
        return;
      }

      const task = await orchestrator.runToCompletion(req.params.id, req.body.selectedFindingId);
      res.json({
        task,
        audit: audit.forTask(task.id),
        brain: await orchestrator.getBrainMap(
          task.findings.find((f) => f.id === task.selectedFindingId)?.relatedNeuronIds ?? [],
        ),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/brain", async (_req, res) => {
    res.json({ brain: await orchestrator.getBrainMap() });
  });

  app.get("/api/audit", async (_req, res) => {
    res.json({ events: audit.all() });
  });

  app.post("/api/webhooks/github", async (req, res) => {
    const secret = process.env.UATU_GITHUB_WEBHOOK_SECRET?.trim();
    if (secret) {
      const header = String(req.header("x-hub-signature-256") ?? "");
      // MVP: require matching shared secret header when configured.
      // Full HMAC verification can be added without changing the route contract.
      const provided = String(req.header("x-uatu-webhook-secret") ?? "");
      if (provided !== secret && !header) {
        res.status(401).json({ error: "unauthorized_webhook" });
        return;
      }
    }

    const event = String(req.header("x-github-event") ?? "unknown");
    const action = String(req.body?.action ?? "none");
    const pr = req.body?.pull_request as
      | { number?: number; html_url?: string; merged?: boolean; state?: string; title?: string }
      | undefined;

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

    if (pr?.number) {
      const { makeNeuron, RepositoryBrain } = await import("@uatu/core");
      const brain = new RepositoryBrain(store, "demo-vulnerable");
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
    }

    res.status(202).json({ accepted: true, event, action });
  });

  return app;
}

export function handleError(res: express.Response, err: unknown): void {
  if (err instanceof PolicyDeniedError) {
    res.status(403).json({ error: "policy_denied", message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "unknown_error";
  console.error(err);
  res.status(500).json({ error: "internal", message });
}
