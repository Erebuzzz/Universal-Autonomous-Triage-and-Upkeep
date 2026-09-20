import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  SCHEMA_VERSION,
  canTransition,
  type AuthorizationGrant,
  type Finding,
  type OperatingMode,
  type PatchResult,
  type PrReadyArtifact,
  type RemediationTask,
  type TaskState,
  type VerificationResult,
} from "@uatu/domain";
import { AuditTrail, transitionAudit } from "./audit.js";
import { RepositoryBrain, makeNeuron } from "./brain.js";
import { runCommand } from "./command-runner.js";
import { decideWithOptionalLlm, ruleTriagePriority } from "./llm.js";
import type { ArtifactStore, AuditStore, BrainStore, GrantStore, TaskStore } from "./persistence.js";
import { AuthorizationPolicy, PolicyDeniedError } from "./policy.js";

export interface OrchestratorDeps {
  policy: AuthorizationPolicy;
  store: TaskStore & GrantStore & BrainStore & ArtifactStore & AuditStore;
  audit: AuditTrail;
  fixturePath: string;
  repositoryId?: string;
}

const FUNCTIONAL_BUG_MARKER = "off-by-one in inclusive range";
const VULN_DEP = "left-pad";
const VULN_VERSION = "1.0.1";
const SAFE_VERSION = "1.0.2";

export class WorkflowOrchestrator {
  private readonly brain: RepositoryBrain;
  private readonly repositoryId: string;

  constructor(private readonly deps: OrchestratorDeps) {
    this.repositoryId = deps.repositoryId ?? "demo-vulnerable";
    this.brain = new RepositoryBrain(deps.store, this.repositoryId);
  }

  async createGrant(input: {
    grantedBy: string;
    notes?: string;
    capabilities?: AuthorizationGrant["capabilities"];
  }): Promise<AuthorizationGrant> {
    const grant: AuthorizationGrant = {
      id: randomUUID(),
      targetPath: path.resolve(this.deps.fixturePath),
      repositoryName: "demo-vulnerable",
      capabilities: input.capabilities ?? [
        "inspect",
        "analyze",
        "run_tests",
        "write_files",
        "create_branch",
        "commit",
        "draft_pr",
      ],
      pathAllowlist: ["**"],
      commandAllowlist: [
        "node",
        "npm",
        "npm test",
        "npm run test",
        "git",
        "git status",
        "git checkout",
        "git add",
        "git commit",
        "git rev-parse",
        "git branch",
        "git config",
      ],
      grantedBy: input.grantedBy,
      grantedAt: new Date().toISOString(),
      notes: input.notes,
    };
    this.deps.policy.assertTargetIsFixture(grant.targetPath);
    await this.deps.store.saveGrant(grant);
    this.deps.audit.append({
      taskId: "system",
      actor: input.grantedBy,
      action: "authorization_granted",
      detail: `Granted write capabilities on ${grant.repositoryName}`,
    });
    await this.persistAudit();
    return grant;
  }

  async startRun(grantId: string, mode: OperatingMode = "REMEDIATE"): Promise<RemediationTask> {
    const grant = await this.deps.store.getGrant(grantId);
    if (!grant) throw new PolicyDeniedError("Unknown grant");
    this.deps.policy.assertCapability({ mode, grant, fixtureRoot: this.deps.fixturePath }, "analyze");

    const now = new Date().toISOString();
    const task: RemediationTask = {
      id: randomUUID(),
      schemaVersion: SCHEMA_VERSION,
      repositoryPath: grant.targetPath,
      grantId: grant.id,
      state: "DISCOVERED",
      mode,
      findings: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.store.saveTask(task);
    this.deps.audit.append({
      taskId: task.id,
      actor: "supervisor",
      action: "task_created",
      detail: "Remediation task discovered against authorized fixture",
    });
    await this.persistAudit();
    return task;
  }

  async advance(taskId: string, selectedFindingId?: string): Promise<RemediationTask> {
    let task = await this.requireTask(taskId);
    const grant = task.grantId ? await this.deps.store.getGrant(task.grantId) : undefined;

    switch (task.state) {
      case "DISCOVERED":
        task = await this.researchAndTriage(task, grant);
        break;
      case "TRIAGED":
        task = await this.selectFinding(task, selectedFindingId);
        break;
      case "SELECTED":
        task = await this.loadMemory(task);
        break;
      case "MEMORY_CONTEXT_LOADED":
        task = await this.investigate(task);
        break;
      case "INVESTIGATING":
        task = await this.verifyRootCause(task);
        break;
      case "ROOT_CAUSE_VERIFIED":
        task = await this.implement(task, grant);
        break;
      case "IMPLEMENTING":
        task = await this.verify(task, grant);
        break;
      case "TESTING":
        // verify() moves to MEMORY_UPDATED or VERIFICATION_FAILED
        break;
      case "MEMORY_UPDATED":
        task = await this.review(task);
        break;
      case "REVIEWING":
        task = await this.composePr(task, grant);
        break;
      case "READY_FOR_PR":
        task = await this.finalizeArtifact(task);
        break;
      default:
        break;
    }
    await this.persistAudit();
    return task;
  }

  async runToCompletion(taskId: string, selectedFindingId?: string): Promise<RemediationTask> {
    let task = await this.requireTask(taskId);
    const terminal = new Set<TaskState>([
      "PR_ARTIFACT_READY",
      "BLOCKED",
      "NEEDS_HUMAN",
      "VERIFICATION_FAILED",
      "OUT_OF_SCOPE",
      "LOW_CONFIDENCE",
    ]);
    let guard = 0;
    while (!terminal.has(task.state) && guard < 20) {
      const before = task.state;
      task = await this.advance(task.id, selectedFindingId);
      if (task.state === before) {
        // Need selection input
        if (task.state === "TRIAGED" && !selectedFindingId && !task.selectedFindingId) {
          const preferred =
            task.findings.find((f) => f.kind === "functional_bug")?.id ?? task.findings[0]?.id;
          if (preferred) task = await this.advance(task.id, preferred);
        }
        if (task.state === before) break;
      }
      guard += 1;
    }
    return task;
  }

  private async researchAndTriage(
    task: RemediationTask,
    grant?: AuthorizationGrant,
  ): Promise<RemediationTask> {
    const graph = await this.brain.initializeFromTree(task.repositoryPath);
    const findings = await this.detectFindings(task.repositoryPath, graph.neurons.map((n) => n.id));

    const llm = await decideWithOptionalLlm(
      { purpose: "triage", prompt: "Prioritize findings" },
      findings
        .map((f) => `${ruleTriagePriority(f.kind)}:${f.id}`)
        .sort()
        .reverse()
        .join(","),
    );

    task.findings = findings.sort(
      (a, b) => ruleTriagePriority(b.kind) - ruleTriagePriority(a.kind),
    );
    task = await this.transition(task, "TRIAGED", "research+triage", `Brain initialized; ${findings.length} findings; llm=${llm.provider}`);
    this.deps.audit.append({
      taskId: task.id,
      actor: "research",
      action: "brain_initialized",
      detail: `Neurons=${graph.neurons.length} synapses=${graph.synapses.length}`,
      metadata: { grantId: grant?.id },
    });
    return task;
  }

  private async selectFinding(task: RemediationTask, selectedFindingId?: string): Promise<RemediationTask> {
    const preferredFunctional = task.findings.find((f) => f.kind === "functional_bug")?.id;
    const id =
      selectedFindingId ??
      task.selectedFindingId ??
      preferredFunctional ??
      task.findings[0]?.id;
    if (!id) {
      return this.transition(task, "NEEDS_HUMAN", "triage", "No findings available");
    }
    task.selectedFindingId = id;
    return this.transition(task, "SELECTED", "operator", `Selected finding ${id}`);
  }

  private async loadMemory(task: RemediationTask): Promise<RemediationTask> {
    const graph = await this.brain.getGraph();
    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    if (!graph || !finding) {
      return this.transition(task, "MEMORY_CONFLICT", "memory", "Missing brain or finding");
    }
    const related = this.brain.retrieveForFinding(finding, graph);
    this.deps.audit.append({
      taskId: task.id,
      actor: "memory",
      action: "context_loaded",
      detail: `Activated ${related.length} related neurons for ${finding.title}`,
    });
    return this.transition(task, "MEMORY_CONTEXT_LOADED", "memory", "Context loaded");
  }

  private async investigate(task: RemediationTask): Promise<RemediationTask> {
    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    if (!finding) return this.transition(task, "NEEDS_HUMAN", "investigate", "Finding missing");

    const hypothesis = makeNeuron(
      "Hypothesis",
      `hypothesis:${finding.id}`,
      { findingId: finding.id, summary: finding.summary },
      { value: finding.confidence.value, rationale: "Rule-based investigation" },
      0.85,
    );
    await this.brain.upsertNeuron(hypothesis);
    this.deps.audit.append({
      taskId: task.id,
      actor: "investigate",
      action: "hypothesis_formed",
      detail: finding.summary,
    });
    return this.transition(task, "INVESTIGATING", "investigate", "Hypothesis recorded");
  }

  private async verifyRootCause(task: RemediationTask): Promise<RemediationTask> {
    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    if (!finding) return this.transition(task, "NEEDS_HUMAN", "investigate", "Finding missing");
    if (finding.confidence.value < 0.6) {
      return this.transition(task, "LOW_CONFIDENCE", "investigate", "Confidence below threshold");
    }
    return this.transition(task, "ROOT_CAUSE_VERIFIED", "investigate", "Root cause accepted by rules");
  }

  private async implement(
    task: RemediationTask,
    grant?: AuthorizationGrant,
  ): Promise<RemediationTask> {
    if (!grant) throw new PolicyDeniedError("Implementation requires grant");
    this.deps.policy.assertCapability(
      { mode: task.mode, grant, fixtureRoot: this.deps.fixturePath },
      "write_files",
    );
    this.deps.policy.assertCapability(
      { mode: task.mode, grant, fixtureRoot: this.deps.fixturePath },
      "create_branch",
    );

    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    if (!finding) return this.transition(task, "NEEDS_HUMAN", "implement", "Finding missing");

    task = await this.transition(task, "IMPLEMENTING", "implement", `Applying fix for ${finding.kind}`);

    const branchName =
      finding.kind === "functional_bug"
        ? `uatu/fix-range-inclusive-${task.id.slice(0, 8)}`
        : `uatu/bump-left-pad-${task.id.slice(0, 8)}`;

    await runCommand("git", ["checkout", "-B", branchName], {
      cwd: task.repositoryPath,
      policy: this.deps.policy,
      grant,
      timeoutMs: 30_000,
    });

    const changedFiles: string[] = [];
    if (finding.kind === "functional_bug") {
      const target = path.join(task.repositoryPath, "src", "range.js");
      let source = await readFile(target, "utf8");
      // Fix off-by-one: inclusive end should use <= 
      source = source.replace(
        /for \(let i = start; i < end; i \+= 1\)/,
        "for (let i = start; i <= end; i += 1)",
      );
      await writeFile(target, source, "utf8");
      changedFiles.push("src/range.js");

      const testPath = path.join(task.repositoryPath, "test", "range.test.js");
      let testSrc = await readFile(testPath, "utf8");
      if (!testSrc.includes("inclusive end")) {
        testSrc += `\n// uatu regression\ntest("inclusive end is counted", () => {\n  assert.deepEqual(inclusiveRange(2, 4), [2, 3, 4]);\n});\n`;
        await writeFile(testPath, testSrc, "utf8");
        changedFiles.push("test/range.test.js");
      }
    } else {
      const pkgPath = path.join(task.repositoryPath, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
        dependencies: Record<string, string>;
      };
      if (pkg.dependencies[VULN_DEP] === VULN_VERSION) {
        pkg.dependencies[VULN_DEP] = SAFE_VERSION;
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
        changedFiles.push("package.json");
      }
      const note = path.join(task.repositoryPath, "SECURITY_NOTE.md");
      await writeFile(
        note,
        `# Security remediation\n\nBumped \`${VULN_DEP}\` from ${VULN_VERSION} to ${SAFE_VERSION} (fixture advisory).\n`,
        "utf8",
      );
      changedFiles.push("SECURITY_NOTE.md");
    }

    this.deps.policy.assertCapability(
      { mode: task.mode, grant, fixtureRoot: this.deps.fixturePath },
      "commit",
    );

    await runCommand("git", ["add", ...changedFiles], {
      cwd: task.repositoryPath,
      policy: this.deps.policy,
      grant,
    });

    const commitMessage =
      finding.kind === "functional_bug"
        ? "fix: make inclusiveRange include the end bound"
        : `security: bump ${VULN_DEP} to ${SAFE_VERSION}`;

    const commit = await runCommand("git", ["commit", "-m", commitMessage], {
      cwd: task.repositoryPath,
      policy: this.deps.policy,
      grant,
      env: {
        GIT_AUTHOR_NAME: "UATU",
        GIT_AUTHOR_EMAIL: "uatu@local",
        GIT_COMMITTER_NAME: "UATU",
        GIT_COMMITTER_EMAIL: "uatu@local",
      },
    });

    if (commit.exitCode !== 0) {
      this.deps.audit.append({
        taskId: task.id,
        actor: "implement",
        action: "commit_failed",
        detail: commit.stderr || commit.stdout || "git commit failed",
      });
    }

    const shaResult = await runCommand("git", ["rev-parse", "HEAD"], {
      cwd: task.repositoryPath,
      policy: this.deps.policy,
      grant,
    });

    const patch: PatchResult = {
      applied: commit.exitCode === 0,
      branchName,
      commitSha: shaResult.exitCode === 0 ? shaResult.stdout.trim() : undefined,
      changedFiles,
      diffSummary:
        commit.exitCode === 0
          ? `${changedFiles.length} files on ${branchName}`
          : `commit failed: ${(commit.stderr || commit.stdout).slice(0, 500)}`,
    };
    task.patch = patch;

    const patchNeuron = makeNeuron(
      "Patch",
      patch.branchName,
      { ...patch },
      { value: 0.9, rationale: "Local commit created" },
      0.9,
    );
    await this.brain.upsertNeuron(patchNeuron);

    this.deps.audit.append({
      taskId: task.id,
      actor: "implement",
      action: "patch_applied",
      detail: patch.diffSummary,
      metadata: { branchName, files: changedFiles },
    });

    await this.deps.store.saveTask(task);
    return task;
  }

  private async verify(
    task: RemediationTask,
    grant?: AuthorizationGrant,
  ): Promise<RemediationTask> {
    if (!grant) throw new PolicyDeniedError("Verification requires grant");
    this.deps.policy.assertCapability(
      { mode: task.mode, grant, fixtureRoot: this.deps.fixturePath },
      "run_tests",
    );

    task = await this.transition(task, "TESTING", "verify", "Running fixture verification");

    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    const testResult = await runCommand("node", ["--test", "test/range.test.js"], {
      cwd: task.repositoryPath,
      policy: this.deps.policy,
      grant,
      timeoutMs: 90_000,
    });

    const scopeOk =
      (task.patch?.changedFiles.length ?? 0) > 0 &&
      (task.patch?.changedFiles.every((f) => !f.includes("..")) ?? false) &&
      (task.patch?.applied ?? false);

    const checks = [
      {
        name: "node --test",
        passed: testResult.exitCode === 0 && !testResult.timedOut,
        output: (testResult.stdout + "\n" + testResult.stderr).slice(0, 4000),
        durationMs: 0,
      },
      {
        name: "diff_scope",
        passed: scopeOk,
        output: task.patch?.changedFiles.join(", ") ?? "none",
        durationMs: 0,
      },
    ];

    const verification: VerificationResult = {
      passed: checks.every((c) => c.passed),
      checks,
      confidence: {
        value: checks.every((c) => c.passed) ? 0.96 : 0.3,
        rationale: "Command runner + scope gate",
      },
      blockedReasons: checks.filter((c) => !c.passed).map((c) => c.name),
    };
    task.verification = verification;

    const vNeuron = makeNeuron(
      "VerificationResult",
      `verify:${task.id}`,
      { passed: verification.passed },
      verification.confidence,
      0.95,
    );
    await this.brain.upsertNeuron(vNeuron);

    if (!verification.passed) {
      return this.transition(
        task,
        "VERIFICATION_FAILED",
        "verify",
        `Failed: ${verification.blockedReasons.join(", ")}`,
      );
    }

    // Memory update
    if (finding) {
      const experience = makeNeuron(
        "Observation",
        `experience:${task.id}`,
        {
          lesson: `Fixed ${finding.kind}: ${finding.title}`,
          branch: task.patch?.branchName,
        },
        { value: 0.94, rationale: "Verified remediation" },
        0.88,
      );
      await this.brain.upsertNeuron(experience);
    }

    return this.transition(task, "MEMORY_UPDATED", "memory", "Experience consolidated");
  }

  private async review(task: RemediationTask): Promise<RemediationTask> {
    if (!task.verification?.passed) {
      return this.transition(task, "VERIFICATION_FAILED", "review", "Cannot review failed verification");
    }
    return this.transition(task, "REVIEWING", "review", "Patch and verification accepted");
  }

  private async composePr(
    task: RemediationTask,
    grant?: AuthorizationGrant,
  ): Promise<RemediationTask> {
    if (!grant) throw new PolicyDeniedError("PR draft requires grant");
    this.deps.policy.assertCapability(
      { mode: task.mode, grant, fixtureRoot: this.deps.fixturePath },
      "draft_pr",
    );
    if (!task.verification?.passed) {
      throw new PolicyDeniedError("PR drafting blocked: verification failed");
    }

    const finding = task.findings.find((f) => f.id === task.selectedFindingId);
    const artifact: PrReadyArtifact = {
      title: finding?.title ?? "UATU remediation",
      body: [
        "## Summary",
        finding?.summary ?? "",
        "",
        "## Root cause",
        finding?.evidence.map((e) => `- ${e.summary}`).join("\n") ?? "",
        "",
        "## Verification",
        ...(task.verification?.checks.map((c) => `- ${c.name}: ${c.passed ? "PASS" : "FAIL"}`) ?? []),
        "",
        "## Notes",
        "Live GitHub PR creation is deferred. This artifact is PR-ready for manual open.",
        "",
        `Branch: \`${task.patch?.branchName}\``,
        `Commit: \`${task.patch?.commitSha ?? "n/a"}\``,
      ].join("\n"),
      branchName: task.patch?.branchName ?? "uatu/unknown",
      baseBranch: "main",
      changedFiles: task.patch?.changedFiles ?? [],
      commitMessage: finding?.kind === "functional_bug"
        ? "fix: make inclusiveRange include the end bound"
        : `security: bump ${VULN_DEP}`,
      verificationPassed: true,
      localOnly: true,
    };
    task.prArtifact = artifact;
    await this.deps.store.put(
      `pr/${task.id}.md`,
      `# ${artifact.title}\n\n${artifact.body}\n`,
      "text/markdown",
    );
    return this.transition(task, "READY_FOR_PR", "pr", "PR-ready artifact composed (local only)");
  }

  private async finalizeArtifact(task: RemediationTask): Promise<RemediationTask> {
    return this.transition(task, "PR_ARTIFACT_READY", "pr", "Local branch + PR artifact ready");
  }

  private async detectFindings(
    repoPath: string,
    neuronIds: string[],
  ): Promise<Finding[]> {
    const findings: Finding[] = [];
    const now = new Date().toISOString();

    const rangePath = path.join(repoPath, "src", "range.js");
    try {
      const src = await readFile(rangePath, "utf8");
      if (src.includes("i < end") && src.includes("inclusiveRange")) {
        findings.push({
          id: randomUUID(),
          kind: "functional_bug",
          title: "inclusiveRange excludes the end bound",
          summary: `${FUNCTIONAL_BUG_MARKER}: loop uses i < end instead of i <= end`,
          severity: "medium",
          confidence: { value: 0.92, rationale: "Static pattern + failing fixture test" },
          evidence: [
            {
              id: randomUUID(),
              kind: "file",
              summary: "Loop condition uses exclusive upper bound",
              path: "src/range.js",
              excerpt: "for (let i = start; i < end; i += 1)",
              confidence: { value: 0.95, rationale: "Source excerpt" },
              observedAt: now,
            },
            {
              id: randomUUID(),
              kind: "test",
              summary: "Fixture test expects [1,2,3] for inclusiveRange(1,3)",
              path: "test/range.test.js",
              confidence: { value: 0.9, rationale: "Expected regression" },
              observedAt: now,
            },
          ],
          relatedNeuronIds: neuronIds.slice(0, 5),
          pathHints: ["src/range.js", "test/range.test.js"],
        });
      }
    } catch {
      // ignore
    }

    try {
      const pkg = JSON.parse(await readFile(path.join(repoPath, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
      };
      const ver = pkg.dependencies?.[VULN_DEP];
      if (ver === VULN_VERSION) {
        findings.push({
          id: randomUUID(),
          kind: "dependency_security",
          title: `${VULN_DEP}@${VULN_VERSION} is outdated (fixture advisory)`,
          summary: `Authorized fixture pins a deliberately outdated ${VULN_DEP}; bump to ${SAFE_VERSION}`,
          severity: "high",
          confidence: { value: 0.97, rationale: "Manifest version match to fixture advisory" },
          evidence: [
            {
              id: randomUUID(),
              kind: "dependency",
              summary: `${VULN_DEP}@${VULN_VERSION} listed in dependencies`,
              path: "package.json",
              confidence: { value: 0.99, rationale: "package.json" },
              observedAt: now,
            },
          ],
          relatedNeuronIds: neuronIds.filter((_, i) => i < 8),
          pathHints: ["package.json"],
        });
      }
    } catch {
      // ignore
    }

    return findings;
  }

  private async transition(
    task: RemediationTask,
    to: TaskState,
    actor: string,
    detail: string,
  ): Promise<RemediationTask> {
    if (!canTransition(task.state, to)) {
      throw new Error(`Illegal transition ${task.state} -> ${to}`);
    }
    const from = task.state;
    task.state = to;
    task.updatedAt = new Date().toISOString();
    transitionAudit(this.deps.audit, task.id, actor, from, to, detail);
    await this.deps.store.saveTask(task);
    return task;
  }

  private async requireTask(id: string): Promise<RemediationTask> {
    const task = await this.deps.store.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  private async persistAudit(): Promise<void> {
    await this.deps.store.saveEvents(this.deps.audit.all());
  }

  async getBrainMap(activatedIds: string[] = []) {
    const graph = await this.brain.getGraph();
    if (!graph) return { nodes: [], edges: [], activatedIds: [] };
    return this.brain.toMapPayload(graph, activatedIds);
  }
}

export async function ensureFixtureGit(repoPath: string): Promise<void> {
  await mkdir(repoPath, { recursive: true });
  const policy = new AuthorizationPolicy(repoPath);
  // Bootstrap git without grant using dry-run false only for fixture setup from trusted local path.
  const status = await runCommand("git", ["status"], {
    cwd: repoPath,
    policy,
    dryRun: true,
  });
  void status;
}
