import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  type AuditEvent,
  type BedrockModelDescriptor,
  type BrainMap,
  type Finding,
  type Grant,
  type HealthStatus,
  type RemediationTask,
  type UatuUser,
  simplifyModelName,
} from "./api";
import { AuditTrail } from "./AuditTrail";
import { BrainMapView } from "./BrainMapView";
import { navigate } from "./path";
import { AudioToggle } from "./AudioToggle";
import { BrandLockup } from "./BrandLockup";
import { PolicyScopeBar } from "./PolicyScopeBar";
import { sound } from "./SoundEngine";
import { ThemeToggle } from "./ThemeToggle";

const FLOW = [
  "Authorize target",
  "Start remediation",
  "Inspect findings",
  "Run investigate -> patch -> verify",
  "Review PR / contribute",
] as const;

function flowIndex(task?: RemediationTask, grant?: Grant | null): number {
  if (!grant) return 0;
  if (!task) return 1;
  if (task.state === "TRIAGED" || task.state === "DISCOVERED") return 2;
  if (task.state === "PR_ARTIFACT_READY" || task.state === "PR_CREATED" || task.prArtifact) return 4;
  if (
    [
      "SELECTED",
      "MEMORY_CONTEXT_LOADED",
      "INVESTIGATING",
      "ROOT_CAUSE_VERIFIED",
      "IMPLEMENTING",
      "TESTING",
      "MEMORY_UPDATED",
      "REVIEWING",
      "READY_FOR_PR",
    ].includes(task.state)
  ) {
    return 3;
  }
  return 2;
}

type Props = {
  user: UatuUser;
  grant: Grant | null;
  health: HealthStatus | null;
  onGrantChange: (grant: Grant | null) => void;
  onReonboard: () => void;
  onLogout: () => void;
};

export function Dashboard({ user, grant, health, onGrantChange, onReonboard, onLogout }: Props) {
  const [task, setTask] = useState<RemediationTask | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [brain, setBrain] = useState<BrainMap>({ nodes: [], edges: [], activatedIds: [] });
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [models, setModels] = useState<BedrockModelDescriptor[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyDenial, setPolicyDenial] = useState<string | null>(null);

  useEffect(() => {
    api.listModels()
      .then((res) => {
        if (res.models && res.models.length > 0) {
          setModels(res.models);
        }
      })
      .catch(() => {
        /* ignore offline fallback */
      });
  }, []);

  const step = flowIndex(task ?? undefined, grant);
  const selected: Finding | undefined = useMemo(
    () => task?.findings.find((f) => f.id === (selectedFindingId ?? task.selectedFindingId)),
    [task, selectedFindingId],
  );

  function captureError(e: unknown) {
    if (e instanceof ApiError && e.isPolicyDenied) {
      setPolicyDenial(e.message);
      setError(null);
      return;
    }
    if (e instanceof ApiError && (e.status === 429 || e.code === "quota_exceeded")) {
      setError(`Execution limit: ${e.message}. Please wait a moment before starting another run.`);
      return;
    }
    setError(e instanceof Error ? e.message : String(e));
  }

  async function authorizeFixture() {
    setBusy(true);
    setError(null);
    setPolicyDenial(null);
    try {
      const { grant: g } = await api.createFixtureGrant();
      onGrantChange(g);
      sound.playCelestialChime();
    } catch (e) {
      captureError(e);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!grant) return;
    setBusy(true);
    setError(null);
    setPolicyDenial(null);
    try {
      const { task: t } = await api.startTask(grant.id, "REMEDIATE", selectedModel);
      const detail = await api.getTask(t.id);
      setTask(detail.task);
      setAudit(detail.audit ?? []);
      if (detail.brain && Array.isArray(detail.brain.nodes)) setBrain(detail.brain);
      const body = await api.advanceTask(t.id, undefined, selectedModel);
      setTask(body.task);
      setAudit(body.audit ?? []);
      if (body.brain && Array.isArray(body.brain.nodes)) setBrain(body.brain);
      setSelectedFindingId(body.task.findings[0]?.id);
      sound.playCelestialChime();
    } catch (e) {
      captureError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runSelected() {
    if (!task) return;
    if (!task.findings?.length) {
      setError("No findings available to remediate. Start a triage run on a target with defects.");
      return;
    }
    setBusy(true);
    setError(null);
    setPolicyDenial(null);
    try {
      const result = await api.runTask(task.id, selectedFindingId, selectedModel);
      setTask(result.task);
      if (result.audit && result.audit.length) setAudit(result.audit);
      if (result.brain && Array.isArray(result.brain.nodes) && result.brain.nodes.length) setBrain(result.brain);
      sound.playCelestialChime();

      // If queued asynchronously, poll for task completion
      if (result.task.state !== "PR_ARTIFACT_READY" && result.task.state !== "PR_CREATED") {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const poll = await api.getTask(task.id);
          setTask(poll.task);
          if (poll.audit && poll.audit.length) setAudit(poll.audit);
          if (poll.brain && Array.isArray(poll.brain.nodes) && poll.brain.nodes.length) setBrain(poll.brain);
          if (
            poll.task.state === "PR_ARTIFACT_READY" ||
            poll.task.state === "PR_CREATED" ||
            poll.task.state === "NEEDS_HUMAN"
          ) {
            break;
          }
        }
      }
    } catch (e) {
      captureError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell utopia-cross-grid">
      <div className="utopia-telemetry-header">
        <div className="utopia-telemetry-coords">
          [ 19.0760° N // 72.8777° E ]
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
          <span>TARGET: {grant?.repositoryFullName ?? "SAMPLE_FIXTURE"}</span>
          <span className="utopia-telemetry-coords">
            {grant ? "AUTHORIZED" : "PASSIVE_MONITORING"}
          </span>
          <span>VERSION: 2.4.0-RC.1</span>
        </div>
      </div>

      <header className="topbar">
        <BrandLockup size="md" variant="tagline" href="/" />
        <div className="topbar-actions">
          <div className="mode-chip">
            <span className="live-dot" aria-hidden />
            {grant
              ? `AUTHORIZED · ${(grant.source ?? "fixture").toUpperCase()}`
              : "PASSIVE · AWAITING GRANT"}
          </div>
          <span className="user-chip" title={user.id}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" width={20} height={20} className="user-avatar" />
            ) : null}
            {user.login}
          </span>
          <AudioToggle />
          <ThemeToggle />
          <button className="btn btn-ghost" type="button" onClick={() => navigate("/docs")}>
            Docs
          </button>
          <button className="btn btn-ghost" type="button" onClick={onReonboard}>
            Change target
          </button>
          <button className="btn" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <PolicyScopeBar
        grant={grant}
        health={health}
        policyDenial={policyDenial}
        onDismissDenial={() => setPolicyDenial(null)}
      />

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="workspace">
        <aside className="panel" aria-label="Workflow">
          <p className="panel-title">Workflow</p>
          <ol className="flow-list">
            {FLOW.map((label, i) => (
              <li
                key={label}
                className={`flow-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
              >
                <span className="flow-index">{String(i + 1).padStart(2, "0")}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          <div className="model-selector-block" style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="model-select"
              style={{ display: "block", fontSize: "0.8rem", color: "var(--mute)", marginBottom: "0.35rem" }}
            >
              Foundation Model
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={busy}
              style={{
                width: "100%",
                background: "var(--surface-elevated, #181c24)",
                color: "inherit",
                border: "1px solid var(--border, #2a313d)",
                borderRadius: "6px",
                padding: "0.45rem 0.6rem",
                fontSize: "0.82rem",
              }}
            >
              {models.length > 0 ? (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.rpm} RPM / {m.tpm} TPM)
                  </option>
                ))
              ) : (
                <>
                  <option value="auto">Auto (Smart Complexity Router)</option>
                  <option value="nova-micro">Amazon Nova Micro (20 RPM)</option>
                  <option value="nova-lite">Amazon Nova Lite (20 RPM)</option>
                  <option value="nova-2-omni">Amazon Nova 2 Omni (20 RPM)</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (8 RPM)</option>
                  <option value="claude-haiku-4-5">Claude Haiku 4.5 (10 RPM)</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet v2 (1 RPM)</option>
                  <option value="claude-sonnet-4-5">Claude Sonnet 4.5 v1 (10 RPM)</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (10 RPM)</option>
                  <option value="claude-opus-4-5">Claude Opus 4.5 (5 RPM)</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 v1 (5 RPM)</option>
                  <option value="llama-3-2-3b">Llama 3.2 3B Instruct (16 RPM)</option>
                  <option value="rules-only">Deterministic Rules Only</option>
                </>
              )}
            </select>
            {selectedModel === "auto" ? (
              <p style={{ fontSize: "0.72rem", color: "var(--mute)", margin: "0.3rem 0 0" }}>
                Auto routes by complexity: Nova Micro for triage, Nova Lite for dependencies, Nova 2 Omni for complex diffs.
              </p>
            ) : null}
          </div>

          <div className="actions">
            {grant ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={onReonboard}
                title="Switch repository or switch to sample fixture"
              >
                Switch repo / target
              </button>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !!grant}
                onClick={authorizeFixture}
              >
                Authorize fixture
              </button>
            )}
            <button className="btn" type="button" disabled={busy || !grant || !!task} onClick={start}>
              Start run
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                busy ||
                !task ||
                !task.findings?.length ||
                task.state === "PR_ARTIFACT_READY" ||
                task.state === "PR_CREATED"
              }
              onClick={runSelected}
              title={!task?.findings?.length ? "No findings available to remediate" : "Run automated investigation, patch, and verification"}
            >
              Run to PR
            </button>
          </div>

          <div className="status-block">
            <div>
              Grant: <strong>{grant?.id.slice(0, 8) ?? "-"}</strong>
            </div>
            <div>
              Task: <strong>{task?.id.slice(0, 8) ?? "-"}</strong>
            </div>
            <div>
              Model: <strong>{simplifyModelName(task?.modelPreference ?? selectedModel)}</strong>
            </div>
            <div>
              State: <strong>{task?.state ?? "PASSIVE"}</strong>
            </div>
            {busy ? (
              <div className="busy-line" aria-live="polite">
                Working...
              </div>
            ) : null}
          </div>
        </aside>

        <main className="panel center-stack" aria-label="Investigation">
          <section>
            <div className="section-head">
              <h2>Findings</h2>
              <span className="brand-tag">{task?.findings.length ?? 0} candidates</span>
            </div>
            {!task?.findings.length ? (
              <div className="empty">
                {grant
                  ? "Start a run to surface findings for the authorized target."
                  : "Authorize a fixture or repo, then start a run."}
              </div>
            ) : (
              <div className="finding-list">
                {task.findings.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`finding ${selectedFindingId === f.id ? "selected" : ""}`}
                    onClick={() => setSelectedFindingId(f.id)}
                  >
                    <div className="finding-kind">
                      {f.kind.replace("_", " ")} · {f.severity} · conf{" "}
                      {(f.confidence.value * 100).toFixed(0)}%
                      {f.confidence.rationale.includes("functional_root_cause") || f.kind === "functional_bug" ? (
                        <span
                          className="source-tag"
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.7rem",
                            background: "rgba(168, 85, 247, 0.15)",
                            color: "#c084fc",
                            borderColor: "rgba(168, 85, 247, 0.3)",
                          }}
                        >
                          Nova 2 Omni
                        </span>
                      ) : f.kind === "dependency_security" ? (
                        <span
                          className="source-tag"
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.7rem",
                            background: "rgba(59, 130, 246, 0.15)",
                            color: "#93c5fd",
                            borderColor: "rgba(59, 130, 246, 0.3)",
                          }}
                        >
                          Nova Lite
                        </span>
                      ) : null}
                    </div>
                    <div className="finding-title">{f.title}</div>
                    <div className="finding-meta">{f.summary}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2>Topographic Repository Map</h2>
              <span className="utopia-hash-badge">{brain?.nodes?.length ?? 0} SURVEY WAYPOINTS · 2.5D CARTOGRAPHY</span>
            </div>
            {brain?.nodes?.length ? (
              <BrainMapView brain={brain} height={500} />
            ) : (
              <div className="empty">Topographic cartography initializes after triage begins.</div>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2>Audit trail</h2>
              <span className="brand-tag">bedrock · rules · detection</span>
            </div>
            <AuditTrail events={audit} />
          </section>
        </main>

        <aside className="panel" aria-label="Evidence and artifact">
          <p className="panel-title">Evidence · Verify · PR</p>

          <div className="evidence-list" style={{ marginBottom: "1rem" }}>
            <h3>Evidence</h3>
            {!selected?.evidence.length ? (
              <p className="empty" style={{ border: "none", padding: 0 }}>
                Select a finding to inspect evidence.
              </p>
            ) : (
              selected.evidence.map((ev) => (
                <div key={ev.id} className="evidence-item">
                  <div className="finding-kind">
                    {ev.kind}
                    {ev.path ? ` · ${ev.path}` : ""}
                  </div>
                  <div>{ev.summary}</div>
                  {ev.excerpt ? (
                    <pre style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "var(--mute)" }}>
                      {ev.excerpt}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="verify-box" style={{ marginBottom: "1rem" }}>
            <h3>Verification</h3>
            {!task?.verification ? (
              <p className="empty" style={{ border: "none", padding: 0 }}>
                {task ? "Pending" : "No verification yet."}
              </p>
            ) : (
              <>
                <p className={task.verification.passed ? "pass" : "fail"}>
                  {task.verification.passed ? "PASSED" : "FAILED"}
                </p>
                <ul>
                  {task.verification.checks.map((c) => (
                    <li key={c.name} className={c.passed ? "pass" : "fail"}>
                      {c.name}: {c.passed ? "PASS" : "FAIL"}
                    </li>
                  ))}
                </ul>
                {task.patch ? (
                  <p className="finding-meta">
                    Branch <code>{task.patch.branchName}</code>
                    <br />
                    {task.patch.diffSummary}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="pr-box">
            <h3>Contribution</h3>
            {!task?.prArtifact ? (
              <div className="contrib-empty">
                <p className="empty" style={{ border: "none", padding: 0, margin: 0 }}>
                  {task?.verification?.passed
                    ? "Preparing pull request artifact…"
                    : task
                      ? "No PR yet - waiting on verify."
                      : "No contribution yet."}
                </p>
                <p className="finding-meta" style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/docs", { search: "?doc=github-app" })}
                  >
                    Setup guide →
                  </button>
                </p>
              </div>
            ) : (
              <>
                <p className="finding-title">{task.prArtifact.title}</p>
                <p className="finding-meta">
                  Branch <code>{task.prArtifact.branchName}</code>
                  {task.prArtifact.localOnly === false ? " · live PR opened" : " · local artifact"}
                </p>
                {task.prArtifact.prUrl ? (
                  <p className="finding-meta">
                    <a href={task.prArtifact.prUrl} target="_blank" rel="noopener noreferrer">
                      Open pull request
                    </a>
                  </p>
                ) : null}
                <pre>{task.prArtifact.body}</pre>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
