import { useMemo, useState } from "react";
import {
  ApiError,
  api,
  type AuditEvent,
  type BrainMap,
  type Finding,
  type Grant,
  type HealthStatus,
  type RemediationTask,
  type UatuUser,
} from "./api";
import { AuditTrail } from "./AuditTrail";
import { BrainMapView } from "./BrainMapView";
import { navigate } from "./path";
import { PolicyScopeBar } from "./PolicyScopeBar";

const FLOW = [
  "Authorize target",
  "Start remediation",
  "Inspect findings",
  "Run investigate → patch → verify",
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyDenial, setPolicyDenial] = useState<string | null>(null);

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
    setError(e instanceof Error ? e.message : String(e));
  }

  async function authorizeFixture() {
    setBusy(true);
    setError(null);
    setPolicyDenial(null);
    try {
      const { grant: g } = await api.createFixtureGrant();
      onGrantChange(g);
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
      const { task: t } = await api.startTask(grant.id);
      const detail = await api.getTask(t.id);
      setTask(detail.task);
      setAudit(detail.audit);
      setBrain(detail.brain);
      const body = await api.advanceTask(t.id);
      setTask(body.task);
      setAudit(body.audit);
      setBrain(body.brain);
      setSelectedFindingId(body.task.findings[0]?.id);
    } catch (e) {
      captureError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runSelected() {
    if (!task) return;
    setBusy(true);
    setError(null);
    setPolicyDenial(null);
    try {
      const result = await api.runTask(task.id, selectedFindingId);
      setTask(result.task);
      setAudit(result.audit);
      setBrain(result.brain);
    } catch (e) {
      captureError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">UATU</div>
          <div className="brand-tag">Observe · Understand · Repair · Contribute</div>
        </div>
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

          <div className="actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !!grant}
              onClick={authorizeFixture}
            >
              Authorize fixture
            </button>
            <button className="btn" type="button" disabled={busy || !grant || !!task} onClick={start}>
              Start run
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !task || task.state === "PR_ARTIFACT_READY" || task.state === "PR_CREATED"}
              onClick={runSelected}
            >
              Run to PR
            </button>
          </div>

          <div className="status-block">
            <div>
              Grant: <strong>{grant?.id.slice(0, 8) ?? "—"}</strong>
            </div>
            <div>
              Task: <strong>{task?.id.slice(0, 8) ?? "—"}</strong>
            </div>
            <div>
              State: <strong>{task?.state ?? "PASSIVE"}</strong>
            </div>
            {busy ? (
              <div className="busy-line" aria-live="polite">
                Working…
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
              <h2>Neural repository map</h2>
              <span className="brand-tag">{brain.nodes.length} neurons · interactive</span>
            </div>
            {brain.nodes.length ? (
              <BrainMapView brain={brain} />
            ) : (
              <div className="empty">Brain map activates after triage begins.</div>
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
