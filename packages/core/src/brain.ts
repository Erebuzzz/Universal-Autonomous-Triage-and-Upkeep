import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  SCHEMA_VERSION,
  type BrainGraph,
  type BrainMapPayload,
  type Confidence,
  type EdgeKind,
  type Evidence,
  type Finding,
  type MemoryStatus,
  type Neuron,
  type NeuronKind,
  type Synapse,
} from "@uatu/domain";
import type { BrainStore } from "./persistence.js";

/** Stable storage key: tenant-partitioned when userId is set. */
export function brainStorageKey(repositoryId: string, userId?: string): string {
  if (!userId) return repositoryId;
  return `tenant_${userId}__${repositoryId}`;
}

export function orgBrainRepositoryId(organizationId: string): string {
  return `org:${organizationId}`;
}

function conf(value: number, rationale: string): Confidence {
  return { value: Math.max(0, Math.min(1, value)), rationale };
}

function idFor(kind: string, key: string): string {
  return createHash("sha256").update(`${kind}:${key}`).digest("hex").slice(0, 16);
}

/** Shared dependency identity across repos (package name only). */
export function sharedDependencyNeuronId(packageName: string): string {
  return idFor("Dependency", packageName.toLowerCase());
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".uatu-work") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(path.relative(root, full).replace(/\\/g, "/"));
      await walk(full, root, out);
    } else {
      out.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  }
}

export interface BrainScope {
  userId?: string;
  organizationId?: string;
}

export class RepositoryBrain {
  constructor(
    private readonly store: BrainStore,
    private readonly repositoryId: string,
    private readonly scope: BrainScope = {},
  ) {}

  get userId(): string | undefined {
    return this.scope.userId;
  }

  get organizationId(): string | undefined {
    return this.scope.organizationId;
  }

  private storageId(): string {
    // Org-wide graph lives under org:{id}; per-repo under repositoryId — both tenant-keyed.
    if (this.scope.organizationId) {
      return orgBrainRepositoryId(this.scope.organizationId);
    }
    return this.repositoryId;
  }

  async initializeFromTree(repoPath: string): Promise<BrainGraph> {
    const relativePaths: string[] = [];
    await walk(repoPath, repoPath, relativePaths);

    const now = new Date().toISOString();
    const orgId = this.scope.organizationId ?? this.scope.userId ?? "local";
    const existing = await this.getGraph();
    const neurons: Neuron[] = existing?.neurons ? [...existing.neurons] : [];
    const synapses: Synapse[] = existing?.synapses ? [...existing.synapses] : [];
    const evidence: Evidence[] = [];
    const byId = new Map(neurons.map((n) => [n.id, n]));

    const upsertN = (n: Neuron) => {
      const prev = byId.get(n.id);
      if (prev) {
        // Reinforce shared neurons (e.g. Dependency seen again across repos).
        const boosted = Math.min(1, prev.confidence.value + 0.08);
        const merged: Neuron = {
          ...prev,
          ...n,
          confidence: conf(
            Math.max(prev.confidence.value, boosted),
            prev.kind === "Dependency"
              ? `Reinforced across repos; prior=${prev.confidence.value.toFixed(2)}`
              : n.confidence.rationale,
          ),
          importance: Math.max(prev.importance, n.importance),
          recency: now,
          payload: { ...prev.payload, ...n.payload },
          status: prev.status === "CONTRADICTED" ? "UNCERTAIN" : "ACTIVE",
        };
        byId.set(n.id, merged);
      } else {
        byId.set(n.id, n);
      }
    };

    const orgNeuron: Neuron = {
      id: idFor("Organization", orgId),
      kind: "Organization",
      label: orgId,
      status: "ACTIVE",
      confidence: conf(1, "Organization root"),
      importance: 1,
      recency: now,
      payload: { organizationId: orgId },
      evidenceIds: [],
    };
    upsertN(orgNeuron);

    const repoNeuron: Neuron = {
      id: idFor("Repository", this.repositoryId),
      kind: "Repository",
      label: path.basename(repoPath),
      status: "ACTIVE",
      confidence: conf(1, "Direct filesystem scan"),
      importance: 1,
      recency: now,
      payload: { path: repoPath, repositoryId: this.repositoryId },
      evidenceIds: [],
    };
    upsertN(repoNeuron);
    synapses.push(edge(orgNeuron.id, repoNeuron.id, "CONTAINS", conf(0.95, "Repo under organization")));

    let packageJson: Record<string, unknown> | undefined;
    for (const rel of relativePaths) {
      const full = path.join(repoPath, rel);
      const s = await stat(full);
      if (s.isDirectory()) {
        const n: Neuron = {
          id: idFor("Directory", `${this.repositoryId}:${rel}`),
          kind: "Directory",
          label: rel,
          status: "ACTIVE",
          confidence: conf(0.95, "Directory present in tree"),
          importance: 0.4,
          recency: now,
          payload: { path: rel, repositoryId: this.repositoryId },
          evidenceIds: [],
        };
        upsertN(n);
        synapses.push(edge(repoNeuron.id, n.id, "CONTAINS", conf(0.9, "Tree containment")));
        continue;
      }

      const fileNeuron: Neuron = {
        id: idFor("File", `${this.repositoryId}:${rel}`),
        kind: "File",
        label: rel,
        status: "ACTIVE",
        confidence: conf(0.95, "File present in tree"),
        importance: rel.includes("test") ? 0.7 : 0.5,
        recency: now,
        payload: { path: rel, size: s.size, repositoryId: this.repositoryId },
        evidenceIds: [],
      };
      upsertN(fileNeuron);
      synapses.push(edge(repoNeuron.id, fileNeuron.id, "CONTAINS", conf(0.9, "Tree containment")));

      if (rel.endsWith(".test.js") || rel.endsWith(".test.ts") || rel.includes("/test")) {
        const testNeuron: Neuron = {
          id: idFor("Test", `${this.repositoryId}:${rel}`),
          kind: "Test",
          label: `test:${rel}`,
          status: "ACTIVE",
          confidence: conf(0.9, "Test file naming convention"),
          importance: 0.75,
          recency: now,
          payload: { path: rel, repositoryId: this.repositoryId },
          evidenceIds: [],
        };
        upsertN(testNeuron);
        synapses.push(edge(testNeuron.id, fileNeuron.id, "TESTED_BY", conf(0.85, "Test file")));
      }

      if (rel === "package.json") {
        const raw = await readFile(full, "utf8");
        packageJson = JSON.parse(raw) as Record<string, unknown>;
        const deps = {
          ...(packageJson.dependencies as Record<string, string> | undefined),
          ...(packageJson.devDependencies as Record<string, string> | undefined),
        };
        for (const [name, version] of Object.entries(deps ?? {})) {
          const depId = sharedDependencyNeuronId(name);
          const prior = byId.get(depId);
          const versions = new Set<string>(
            Array.isArray(prior?.payload.versions)
              ? (prior!.payload.versions as string[])
              : prior?.payload.version
                ? [String(prior.payload.version)]
                : [],
          );
          versions.add(version);

          const depNeuron: Neuron = {
            id: depId,
            kind: "Dependency",
            label: name,
            status: "ACTIVE",
            confidence: conf(
              prior ? Math.min(1, prior.confidence.value + 0.12) : 0.99,
              prior
                ? `Shared dependency reinforced (seen in ${this.repositoryId})`
                : "Declared in package.json",
            ),
            importance: 0.85,
            recency: now,
            payload: {
              name,
              version,
              versions: [...versions],
              repositories: Array.from(
                new Set([
                  ...((prior?.payload.repositories as string[] | undefined) ?? []),
                  this.repositoryId,
                ]),
              ),
            },
            evidenceIds: [],
          };
          upsertN(depNeuron);
          synapses.push(edge(repoNeuron.id, depNeuron.id, "DEPENDS_ON", conf(0.99, "package.json")));
          evidence.push({
            id: randomUUID(),
            kind: "dependency",
            summary: `Dependency ${name}@${version} declared in ${this.repositoryId}`,
            path: "package.json",
            confidence: conf(0.99, "Manifest"),
            observedAt: now,
          });

          // Version disagreement across repos → CONTRADICTS observation.
          if (versions.size > 1) {
            const conflictObs = makeNeuron(
              "Observation",
              `dep-version-conflict:${name}`,
              { name, versions: [...versions] },
              conf(0.7, "Multiple pinned versions across org repos"),
              0.7,
            );
            upsertN(conflictObs);
            this.linkContradiction(
              synapses,
              depNeuron.id,
              conflictObs.id,
              `Versions diverge: ${[...versions].join(" vs ")}`,
            );
          }
        }
      }
    }

    // Deduplicate synapses by id.
    const synById = new Map<string, Synapse>();
    for (const s of synapses) synById.set(s.id, s);

    const graph: BrainGraph = {
      schemaVersion: SCHEMA_VERSION,
      repositoryId: this.storageId(),
      neurons: [...byId.values()],
      synapses: [...synById.values()],
      updatedAt: now,
      userId: this.scope.userId,
      organizationId: orgId,
    };
    await this.applyDecayInPlace(graph, now);
    await this.store.saveBrain(graph);
    return graph;
  }

  async getGraph(): Promise<BrainGraph | undefined> {
    return this.store.getBrain(this.storageId(), this.scope.userId);
  }

  async upsertNeuron(neuron: Neuron): Promise<BrainGraph> {
    const graph = (await this.getGraph()) ?? emptyGraph(this.storageId(), this.scope);
    const idx = graph.neurons.findIndex((n) => n.id === neuron.id);
    if (idx >= 0) graph.neurons[idx] = neuron;
    else graph.neurons.push(neuron);
    graph.updatedAt = new Date().toISOString();
    graph.userId = this.scope.userId ?? graph.userId;
    await this.store.saveBrain(graph);
    return graph;
  }

  async upsertSynapse(synapse: Synapse): Promise<BrainGraph> {
    const graph = (await this.getGraph()) ?? emptyGraph(this.storageId(), this.scope);
    const idx = graph.synapses.findIndex((s) => s.id === synapse.id);
    if (idx >= 0) graph.synapses[idx] = synapse;
    else graph.synapses.push(synapse);
    graph.updatedAt = new Date().toISOString();
    graph.userId = this.scope.userId ?? graph.userId;
    await this.store.saveBrain(graph);
    return graph;
  }

  async markStale(neuronId: string, reason: string): Promise<void> {
    const graph = await this.getGraph();
    if (!graph) return;
    const n = graph.neurons.find((x) => x.id === neuronId);
    if (!n) return;
    n.status = "STALE";
    n.confidence = conf(Math.max(0.1, n.confidence.value - 0.3), reason);
    n.recency = new Date().toISOString();
    await this.store.saveBrain(graph);
  }

  async markContradicted(neuronId: string, reason: string): Promise<void> {
    const graph = await this.getGraph();
    if (!graph) return;
    const n = graph.neurons.find((x) => x.id === neuronId);
    if (!n) return;
    n.status = "CONTRADICTED";
    n.confidence = conf(0.2, reason);
    n.recency = new Date().toISOString();
    await this.store.saveBrain(graph);
  }

  /**
   * Record that two claims about the same subject disagree.
   * Creates a CONTRADICTS synapse and marks the lower-confidence neuron CONTRADICTED.
   */
  async recordContradiction(
    fromId: string,
    toId: string,
    reason: string,
  ): Promise<BrainGraph | undefined> {
    const graph = await this.getGraph();
    if (!graph) return undefined;
    const from = graph.neurons.find((n) => n.id === fromId);
    const to = graph.neurons.find((n) => n.id === toId);
    if (!from || !to) return graph;

    const syn = edge(fromId, toId, "CONTRADICTS", conf(0.85, reason));
    const idx = graph.synapses.findIndex((s) => s.id === syn.id);
    if (idx >= 0) graph.synapses[idx] = syn;
    else graph.synapses.push(syn);

    const loser = from.confidence.value <= to.confidence.value ? from : to;
    loser.status = "CONTRADICTED";
    loser.confidence = conf(Math.min(loser.confidence.value, 0.25), reason);
    graph.updatedAt = new Date().toISOString();
    await this.store.saveBrain(graph);
    return graph;
  }

  /**
   * Temporal decay: neurons not reinforced within halfLifeDays lose confidence.
   * Configurable via UATU_BRAIN_DECAY_HALF_LIFE_DAYS (default 14).
   */
  async applyDecay(nowIso = new Date().toISOString()): Promise<BrainGraph | undefined> {
    const graph = await this.getGraph();
    if (!graph) return undefined;
    await this.applyDecayInPlace(graph, nowIso);
    await this.store.saveBrain(graph);
    return graph;
  }

  private async applyDecayInPlace(graph: BrainGraph, nowIso: string): Promise<void> {
    const halfLifeDays = Number(process.env.UATU_BRAIN_DECAY_HALF_LIFE_DAYS ?? "14");
    const halfLifeMs = Math.max(1, halfLifeDays) * 24 * 60 * 60 * 1000;
    const now = Date.parse(nowIso);
    for (const n of graph.neurons) {
      if (n.kind === "Organization" || n.kind === "Repository") continue;
      const last = Date.parse(n.recency || graph.updatedAt);
      if (!Number.isFinite(last)) continue;
      const age = now - last;
      if (age < halfLifeMs) continue;
      const periods = age / halfLifeMs;
      const factor = Math.pow(0.5, periods);
      const next = Math.max(0.05, n.confidence.value * factor);
      if (next < n.confidence.value - 0.01) {
        n.confidence = conf(next, `Temporal decay (${halfLifeDays}d half-life)`);
        if (next < 0.35) n.status = "STALE";
      }
    }
    graph.updatedAt = nowIso;
  }

  /** Prior org knowledge for a package elevates finding confidence. */
  elevateFindingFromSharedDeps(finding: Finding, graph: BrainGraph): Finding {
    const hint = finding.remediationHint?.packageName;
    if (!hint) return finding;
    const dep = graph.neurons.find(
      (n) => n.kind === "Dependency" && String(n.payload.name ?? "").toLowerCase() === hint.toLowerCase(),
    );
    if (!dep) return finding;
    const repos = (dep.payload.repositories as string[] | undefined) ?? [];
    if (repos.length < 2 && dep.confidence.value < 0.9) return finding;
    const boost = Math.min(1, finding.confidence.value + 0.15);
    return {
      ...finding,
      confidence: conf(
        boost,
        `Elevated by shared org Dependency neuron (${repos.length || 1} repos); ${finding.confidence.rationale}`,
      ),
      relatedNeuronIds: Array.from(new Set([...finding.relatedNeuronIds, dep.id])),
    };
  }

  retrieveForFinding(finding: Finding, graph: BrainGraph): Neuron[] {
    const byId = new Map(graph.neurons.map((n) => [n.id, n]));
    const selected = new Set<string>(finding.relatedNeuronIds);
    for (const hint of finding.pathHints) {
      for (const n of graph.neurons) {
        if (n.kind === "File" && String(n.payload.path ?? "").includes(hint)) {
          selected.add(n.id);
        }
      }
    }
    for (const syn of graph.synapses) {
      if (selected.has(syn.from)) selected.add(syn.to);
      if (selected.has(syn.to)) selected.add(syn.from);
    }
    return [...selected]
      .map((id) => byId.get(id))
      .filter((n): n is Neuron => Boolean(n))
      .sort((a, b) => b.importance * b.confidence.value - a.importance * a.confidence.value);
  }

  toMapPayload(graph: BrainGraph, activatedIds: string[] = []): BrainMapPayload {
    const nodes = graph.neurons.map((n, i) => {
      const angle = (i / Math.max(1, graph.neurons.length)) * Math.PI * 2;
      const radius = 40 + n.importance * 120;
      return {
        id: n.id,
        kind: n.kind,
        label: n.label,
        status: n.status,
        confidence: n.confidence.value,
        x: 200 + Math.cos(angle) * radius,
        y: 160 + Math.sin(angle) * radius,
      };
    });
    return {
      nodes,
      edges: graph.synapses.map((s) => ({
        id: s.id,
        from: s.from,
        to: s.to,
        kind: s.kind,
        confidence: s.confidence.value,
      })),
      activatedIds,
    };
  }

  private linkContradiction(
    synapses: Synapse[],
    fromId: string,
    toId: string,
    reason: string,
  ): void {
    synapses.push(edge(fromId, toId, "CONTRADICTS", conf(0.8, reason)));
  }
}

function emptyGraph(repositoryId: string, scope: BrainScope = {}): BrainGraph {
  return {
    schemaVersion: SCHEMA_VERSION,
    repositoryId,
    neurons: [],
    synapses: [],
    updatedAt: new Date().toISOString(),
    userId: scope.userId,
    organizationId: scope.organizationId,
  };
}

function edge(from: string, to: string, kind: EdgeKind, confidence: Confidence): Synapse {
  return {
    id: idFor("edge", `${from}:${kind}:${to}`),
    from,
    to,
    kind,
    confidence,
    status: "ACTIVE" as MemoryStatus,
    lastObserved: new Date().toISOString(),
    evidenceIds: [],
  };
}

export function makeNeuron(
  kind: NeuronKind,
  label: string,
  payload: Record<string, unknown>,
  confidence: Confidence,
  importance = 0.6,
): Neuron {
  return {
    id: idFor(kind, label),
    kind,
    label,
    status: "ACTIVE",
    confidence,
    importance,
    recency: new Date().toISOString(),
    payload,
    evidenceIds: [],
  };
}
