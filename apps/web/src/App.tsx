import { useMemo, useState } from "react";
import {
  api,
  type AuditEvent,
  type BrainMap,
  type Finding,
  type Grant,
  type RemediationTask,
} from "./api";
import { BrainMapView } from "./BrainMapView";

const FLOW = [
  "Authorize fixture",
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
  if (["SELECTED", "MEMORY_CONTEXT_LOADED", "INVESTIGATING", "ROOT_CAUSE_VERIFIED", "IMPLEMENTING", "TESTING", "MEMORY_UPDATED", "REVIEWING", "READY_FOR_PR"].includes(task.state)) {
    return 3;
  }
  return 2;
}

export function App() {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [task, setTask] = useState<RemediationTask | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [brain, setBrain] = useState<BrainMap>({ nodes: [], edges: [], activatedIds: [] });
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = flowIndex(task ?? undefined, grant);
  const selected: Finding | undefined = useMemo(
    () => task?.findings.find((f) => f.id === (selectedFindingId ?? task.selectedFindingId)),
    [task, selectedFindingId],
  );

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const { grant: g } = await api.createGrant("dashboard-operator");
      setGrant(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!grant) return;
    setBusy(true);
    setError(null);
    try {
      const { task: t } = await api.startTask(grant.id);
      const detail = await api.getTask(t.id);
      setTask(detail.task);
      setAudit(detail.audit);
      setBrain(detail.brain);
      // Advance once to triage so findings appear
      const advanced = await fetch(`/api/tasks/${t.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = (await advanced.json()) as {
        task: RemediationTask;
        audit: AuditEvent[];
        brain: BrainMap;
        message?: string;
      };
      if (!advanced.ok) throw new Error(body.message ?? "advance failed");
      setTask(body.task);
      setAudit(body.audit);
      setBrain(body.brain);
      setSelectedFindingId(body.task.findings[0]?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSelected() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.runTask(task.id, selectedFindingId);
      setTask(result.task);
      setAudit(result.audit);
      setBrain(result.brain);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <div className="mode-chip">
          <span className="live-dot" aria-hidden />
          {grant ? "AUTHORIZED · FIXTURE" : "PASSIVE · AWAITING GRANT"}
        </div>
      </header>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

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
            <button className="btn btn-primary" type="button" disabled={busy || !!grant} onClick={authorize}>
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
          </div>
        </aside>

        <main className="panel center-stack" aria-label="Investigation">
          <section>
            <div className="section-head">
              <h2>Findings</h2>
              <span className="brand-tag">{task?.findings.length ?? 0} candidates</span>
            </div>
            {!task?.findings.length ? (
              <div className="empty">Authorize and start a run to surface fixture findings.</div>
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
                      {f.kind.replace("_", " ")} · {f.severity} · conf {(f.confidence.value * 100).toFixed(0)}%
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
              <span className="brand-tag">{brain.nodes.length} neurons</span>
            </div>
            <BrainMapView brain={brain} />
          </section>

          <section>
            <div className="section-head">
              <h2>Audit trail</h2>
            </div>
            {!audit.length ? (
              <div className="empty">Events appear as the supervisor transitions state.</div>
            ) : (
              <ul className="audit-stream">
                {[...audit].reverse().map((e) => (
                  <li key={e.id} className="audit-item">
                    <div className="audit-time">{new Date(e.at).toLocaleTimeString()}</div>
                    <div>
                      <div className="audit-action">
                        {e.actor} · {e.action}
                        {e.fromState && e.toState ? ` · ${e.fromState} → ${e.toState}` : ""}
                      </div>
                      <div>{e.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
                  <div className="finding-kind">{ev.kind}{ev.path ? ` · ${ev.path}` : ""}</div>
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
                Pending patch verification.
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
              <p className="empty" style={{ border: "none", padding: 0 }}>
                PR draft appears after verification. Set UATU_GITHUB_TOKEN + UATU_GITHUB_REPO for a live GitHub PR.
              </p>
            ) : (
              <>
                <p className="finding-title">{task.prArtifact.title}</p>
                <p className="finding-meta">
                  Branch <code>{task.prArtifact.branchName}</code>
                  {task.prArtifact.localOnly === false ? " · live PR opened" : " · local artifact"}
                </p>
                {task.prArtifact.prUrl ? (
                  <p className="finding-meta">
                    <a href={task.prArtifact.prUrl} target="_blank" rel="noreferrer">
                      {task.prArtifact.prUrl}
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
