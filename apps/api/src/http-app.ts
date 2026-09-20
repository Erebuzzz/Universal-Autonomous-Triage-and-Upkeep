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
    const { seedFixture, fixturePath } = resolvePaths();
    await prepareSandboxFixture(seedFixture, fixturePath);
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
  const corsOrigin = process.env.UATU_CORS_ORIGIN ?? "http://localhost:5173";
  const { store, audit, orchestrator, fixturePath, jobQueueUrl, asyncJobs } = ctx;
  const app = express();
  app.use(cors({ origin: corsOrigin }));
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
