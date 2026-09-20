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

function conf(value: number, rationale: string): Confidence {
  return { value: Math.max(0, Math.min(1, value)), rationale };
}

function idFor(kind: string, key: string): string {
  return createHash("sha256").update(`${kind}:${key}`).digest("hex").slice(0, 16);
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

export class RepositoryBrain {
  constructor(
    private readonly store: BrainStore,
    private readonly repositoryId: string,
  ) {}

  async initializeFromTree(repoPath: string): Promise<BrainGraph> {
    const relativePaths: string[] = [];
    await walk(repoPath, repoPath, relativePaths);

    const neurons: Neuron[] = [];
    const synapses: Synapse[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    const repoNeuron: Neuron = {
      id: idFor("Repository", this.repositoryId),
      kind: "Repository",
      label: path.basename(repoPath),
      status: "ACTIVE",
      confidence: conf(1, "Direct filesystem scan"),
      importance: 1,
      recency: now,
      payload: { path: repoPath },
      evidenceIds: [],
    };
    neurons.push(repoNeuron);

    let packageJson: Record<string, unknown> | undefined;
    for (const rel of relativePaths) {
      const full = path.join(repoPath, rel);
      const s = await stat(full);
      if (s.isDirectory()) {
        const n: Neuron = {
          id: idFor("Directory", rel),
          kind: "Directory",
          label: rel,
          status: "ACTIVE",
          confidence: conf(0.95, "Directory present in tree"),
          importance: 0.4,
          recency: now,
          payload: { path: rel },
          evidenceIds: [],
        };
        neurons.push(n);
        synapses.push(edge(repoNeuron.id, n.id, "CONTAINS", conf(0.9, "Tree containment")));
        continue;
      }

      const fileNeuron: Neuron = {
        id: idFor("File", rel),
        kind: "File",
        label: rel,
        status: "ACTIVE",
        confidence: conf(0.95, "File present in tree"),
        importance: rel.includes("test") ? 0.7 : 0.5,
        recency: now,
        payload: { path: rel, size: s.size },
        evidenceIds: [],
      };
      neurons.push(fileNeuron);
      synapses.push(edge(repoNeuron.id, fileNeuron.id, "CONTAINS", conf(0.9, "Tree containment")));

      if (rel.endsWith(".test.js") || rel.endsWith(".test.ts") || rel.includes("/test")) {
        const testNeuron: Neuron = {
          id: idFor("Test", rel),
          kind: "Test",
          label: `test:${rel}`,
          status: "ACTIVE",
          confidence: conf(0.9, "Test file naming convention"),
          importance: 0.75,
          recency: now,
          payload: { path: rel },
          evidenceIds: [],
        };
        neurons.push(testNeuron);
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
          const depNeuron: Neuron = {
            id: idFor("Dependency", `${name}@${version}`),
            kind: "Dependency",
            label: `${name}@${version}`,
            status: "ACTIVE",
            confidence: conf(0.99, "Declared in package.json"),
            importance: 0.8,
            recency: now,
            payload: { name, version },
            evidenceIds: [],
          };
          neurons.push(depNeuron);
          synapses.push(edge(repoNeuron.id, depNeuron.id, "DEPENDS_ON", conf(0.99, "package.json")));
          evidence.push({
            id: randomUUID(),
            kind: "dependency",
            summary: `Dependency ${name}@${version} declared`,
            path: "package.json",
            confidence: conf(0.99, "Manifest"),
            observedAt: now,
          });
        }
      }
    }

    const graph: BrainGraph = {
      schemaVersion: SCHEMA_VERSION,
      repositoryId: this.repositoryId,
      neurons,
      synapses,
      updatedAt: now,
    };
    await this.store.saveBrain(graph);
    return graph;
  }

  async getGraph(): Promise<BrainGraph | undefined> {
    return this.store.getBrain(this.repositoryId);
  }

  async upsertNeuron(neuron: Neuron): Promise<BrainGraph> {
    const graph = (await this.getGraph()) ?? emptyGraph(this.repositoryId);
    const idx = graph.neurons.findIndex((n) => n.id === neuron.id);
    if (idx >= 0) graph.neurons[idx] = neuron;
    else graph.neurons.push(neuron);
    graph.updatedAt = new Date().toISOString();
    await this.store.saveBrain(graph);
    return graph;
  }

  async upsertSynapse(synapse: Synapse): Promise<BrainGraph> {
    const graph = (await this.getGraph()) ?? emptyGraph(this.repositoryId);
    const idx = graph.synapses.findIndex((s) => s.id === synapse.id);
    if (idx >= 0) graph.synapses[idx] = synapse;
    else graph.synapses.push(synapse);
    graph.updatedAt = new Date().toISOString();
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
      const radius = 40 + (n.importance * 120);
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
}

function emptyGraph(repositoryId: string): BrainGraph {
  return {
    schemaVersion: SCHEMA_VERSION,
    repositoryId,
    neurons: [],
    synapses: [],
    updatedAt: new Date().toISOString(),
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
