import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEvent, AuthorizationGrant, BrainGraph, RemediationTask } from "@uatu/domain";

export interface TaskStore {
  saveTask(task: RemediationTask): Promise<void>;
  getTask(id: string): Promise<RemediationTask | undefined>;
  listTasks(): Promise<RemediationTask[]>;
}

export interface GrantStore {
  saveGrant(grant: AuthorizationGrant): Promise<void>;
  getGrant(id: string): Promise<AuthorizationGrant | undefined>;
  listGrants(): Promise<AuthorizationGrant[]>;
}

export interface BrainStore {
  saveBrain(graph: BrainGraph): Promise<void>;
  getBrain(repositoryId: string): Promise<BrainGraph | undefined>;
}

export interface AuditStore {
  saveEvents(events: AuditEvent[]): Promise<void>;
  loadEvents(): Promise<AuditEvent[]>;
}

export interface ArtifactStore {
  put(key: string, body: string | Buffer, contentType?: string): Promise<string>;
  get(key: string): Promise<Buffer | undefined>;
}

export class JsonFileStore implements TaskStore, GrantStore, BrainStore, AuditStore, ArtifactStore {
  constructor(private readonly root: string) {}

  private async ensure(): Promise<void> {
    await mkdir(path.join(this.root, "tasks"), { recursive: true });
    await mkdir(path.join(this.root, "grants"), { recursive: true });
    await mkdir(path.join(this.root, "brains"), { recursive: true });
    await mkdir(path.join(this.root, "artifacts"), { recursive: true });
  }

  async saveTask(task: RemediationTask): Promise<void> {
    await this.ensure();
    await writeFile(path.join(this.root, "tasks", `${task.id}.json`), JSON.stringify(task, null, 2), "utf8");
  }

  async getTask(id: string): Promise<RemediationTask | undefined> {
    try {
      const raw = await readFile(path.join(this.root, "tasks", `${id}.json`), "utf8");
      return JSON.parse(raw) as RemediationTask;
    } catch {
      return undefined;
    }
  }

  async listTasks(): Promise<RemediationTask[]> {
    await this.ensure();
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(path.join(this.root, "tasks"));
    const tasks: RemediationTask[] = [];
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      const t = await this.getTask(f.replace(/\.json$/, ""));
      if (t) tasks.push(t);
    }
    return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveGrant(grant: AuthorizationGrant): Promise<void> {
    await this.ensure();
    await writeFile(path.join(this.root, "grants", `${grant.id}.json`), JSON.stringify(grant, null, 2), "utf8");
  }

  async getGrant(id: string): Promise<AuthorizationGrant | undefined> {
    try {
      const raw = await readFile(path.join(this.root, "grants", `${id}.json`), "utf8");
      return JSON.parse(raw) as AuthorizationGrant;
    } catch {
      return undefined;
    }
  }

  async listGrants(): Promise<AuthorizationGrant[]> {
    await this.ensure();
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(path.join(this.root, "grants"));
    const grants: AuthorizationGrant[] = [];
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      const g = await this.getGrant(f.replace(/\.json$/, ""));
      if (g) grants.push(g);
    }
    return grants;
  }

  async saveBrain(graph: BrainGraph): Promise<void> {
    await this.ensure();
    await writeFile(
      path.join(this.root, "brains", `${graph.repositoryId}.json`),
      JSON.stringify(graph, null, 2),
      "utf8",
    );
  }

  async getBrain(repositoryId: string): Promise<BrainGraph | undefined> {
    try {
      const raw = await readFile(path.join(this.root, "brains", `${repositoryId}.json`), "utf8");
      return JSON.parse(raw) as BrainGraph;
    } catch {
      return undefined;
    }
  }

  async saveEvents(events: AuditEvent[]): Promise<void> {
    await this.ensure();
    await writeFile(path.join(this.root, "audit.json"), JSON.stringify(events, null, 2), "utf8");
  }

  async loadEvents(): Promise<AuditEvent[]> {
    try {
      const raw = await readFile(path.join(this.root, "audit.json"), "utf8");
      return JSON.parse(raw) as AuditEvent[];
    } catch {
      return [];
    }
  }

  async put(key: string, body: string | Buffer): Promise<string> {
    await this.ensure();
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const full = path.join(this.root, "artifacts", safe);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return full;
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
      return await readFile(path.join(this.root, "artifacts", safe));
    } catch {
      return undefined;
    }
  }
}

/** Local MVP uses JsonFileStore; Lambda uses CloudUatuStore in apps/api. */
export class DynamoDbTaskAdapter implements TaskStore {
  constructor(private readonly fallback: TaskStore) {}
  saveTask(task: RemediationTask): Promise<void> {
    return this.fallback.saveTask(task);
  }
  getTask(id: string): Promise<RemediationTask | undefined> {
    return this.fallback.getTask(id);
  }
  listTasks(): Promise<RemediationTask[]> {
    return this.fallback.listTasks();
  }
}

/** @deprecated Prefer CloudUatuStore in apps/api for deploy. Kept for interface compatibility. */
export class S3ArtifactAdapter implements ArtifactStore {
  constructor(private readonly fallback: ArtifactStore) {}
  put(key: string, body: string | Buffer, contentType?: string): Promise<string> {
    return this.fallback.put(key, body, contentType);
  }
  get(key: string): Promise<Buffer | undefined> {
    return this.fallback.get(key);
  }
}
