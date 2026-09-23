import { useEffect, useState } from "react";
import type { Grant, InstallationRepo, MeResponse, UatuUser } from "./api";
import { api, flags } from "./api";
import { BrandLockup } from "./BrandLockup";
import { githubAppInstallUrl, githubAppSetupUrl } from "./path";

type Props = {
  me: MeResponse;
  onGrantReady: (grant: Grant) => void;
  onSkipToDashboard: () => void;
  onLogout: () => void;
  /** Jump straight to K3 picker (e.g. after /onboarding/complete or change target). */
  initialStep?: "install" | "pick";
  initialInstallationId?: string;
};

export function Onboarding({
  me,
  onGrantReady,
  onSkipToDashboard,
  onLogout,
  initialStep,
  initialInstallationId,
}: Props) {
  const hasInstalled =
    Boolean(initialInstallationId) ||
    Boolean(me.user.installationIds && me.user.installationIds.length > 0);

  const defaultStep: "install" | "pick" = initialStep ?? (hasInstalled ? "pick" : "install");
  const [step, setStep] = useState<"install" | "pick">(defaultStep);
  const [installationId, setInstallationId] = useState(
    initialInstallationId ??
      (me.user.installationIds[0] ? String(me.user.installationIds[0]) : ""),
  );
  const [repos, setRepos] = useState<InstallationRepo[]>([]);
  const [reposNote, setReposNote] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UatuUser>(me.user);

  useEffect(() => {
    const id = Number(installationId) || me.user.installationIds[0];
    if (id && Number.isFinite(id) && id > 0) {
      setBusy(true);
      void loadRepos(id).finally(() => setBusy(false));
    }
  }, [installationId]);

  const installUrl = githubAppInstallUrl(flags.githubAppSlug);
  const setupUrl = githubAppSetupUrl();
  const appConfigured = me.githubAppConfigured ?? false;
  const fixtureOk = me.fixtureDemoAvailable !== false;
  const slugReady = Boolean(flags.githubAppSlug && installUrl);

  async function linkInstallation() {
    const id = Number(installationId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Enter a numeric GitHub App installation id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user: next } = await api.linkInstallation(id);
      setUser(next);
      setStep("pick");
      await loadRepos(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadRepos(id: number) {
    try {
      const result = await api.listInstallationRepos(id);
      setRepos(result.repos ?? []);
      setReposNote(result.message ?? (result.repos?.length ? null : "No repositories returned."));
    } catch (e) {
      setRepos([]);
      setReposNote(e instanceof Error ? e.message : String(e));
    }
  }

  async function authorizeFixture() {
    setBusy(true);
    setError(null);
    try {
      const { grant } = await api.createFixtureGrant();
      onGrantReady(grant);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function authorizeRepo() {
    if (!selectedRepo) {
      setError("Select a repository first.");
      return;
    }
    const id = Number(installationId) || user.installationIds[0];
    if (!id) {
      setError("Link a GitHub App installation before authorizing a repo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { grant } = await api.createGithubGrant({
        repositoryFullName: selectedRepo,
        installationId: id,
      });
      onGrantReady(grant);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboard utopia-cross-grid">
      <header className="topbar">
        <BrandLockup size="md" subtitle={`[ SETUP // ${user.login} ]`} href="/" />
        <div className="topbar-actions">
          <button className="btn btn-ghost" type="button" onClick={onSkipToDashboard}>
            Skip to console
          </button>
          <button className="btn" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="onboard-body">
        <nav className="onboard-steps" aria-label="Setup steps">
          <button
            type="button"
            className={`onboard-step ${step === "install" ? "active" : ""}`}
            onClick={() => setStep("install")}
          >
            <span>01</span> Install GitHub App
          </button>
          <button
            type="button"
            className={`onboard-step ${step === "pick" ? "active" : ""}`}
            onClick={() => setStep("pick")}
          >
            <span>02</span> Choose target
          </button>
        </nav>

        {step === "install" ? (
          <section className="onboard-panel" aria-labelledby="install-title">
            <h1 id="install-title" className="onboard-title">
              Install the UATU GitHub App
            </h1>
            <p className="onboard-copy">
              The App scopes which repositories UATU may clone into an isolated sandbox. No write
              happens until you create a grant on the next step.
            </p>

            {!appConfigured ? (
              <div className="callout callout-warn">
                <strong>GitHub App not configured on the API host.</strong>
                <p>
                  You can still run the sample fixture locally. App install is required only for
                  live repository clones.
                </p>
              </div>
            ) : (
              <ol className="onboard-guide">
                <li>
                  Open the install page and pick the org or user that owns the repos you want to
                  triage.
                </li>
                <li>
                  GitHub returns to the App Setup URL (
                  <code>{setupUrl}</code>) with{" "}
                  <code>installation_id</code> and <code>setup_action</code>.
                </li>
                <li>
                  That page links the install and opens the repo picker. If you land elsewhere,
                  paste the id below.
                </li>
              </ol>
            )}

            <div className="onboard-actions">
              {appConfigured && slugReady ? (
                <a
                  className="btn btn-primary"
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open GitHub App install
                </a>
              ) : null}
              {appConfigured && !slugReady ? (
                <div className="callout callout-warn" role="status">
                  <strong>Set VITE_UATU_GITHUB_APP_SLUG before installing.</strong>
                  <p>
                    Copy the public slug from{" "}
                    <code className="mono-inline">github.com/settings/apps/&lt;slug&gt;</code>{" "}
                    (Public link is{" "}
                    <code className="mono-inline">https://github.com/apps/&lt;slug&gt;</code>
                    ), put it in the repo-root <code className="mono-inline">.env</code>, then
                    restart Vite. App ID alone cannot derive the slug.
                  </p>
                  <button className="btn btn-primary" type="button" disabled title="Missing VITE_UATU_GITHUB_APP_SLUG">
                    Open GitHub App install
                  </button>
                </div>
              ) : null}
              <div className="field-row">
                <label htmlFor="installation-id">Installation id</label>
                <input
                  id="installation-id"
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 12345678"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                />
                <button className="btn" type="button" disabled={busy} onClick={linkInstallation}>
                  Link &amp; continue
                </button>
              </div>
              {hasInstalled ? (
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => setStep("pick")}
                >
                  ← Back to repository picker
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => setStep("pick")}
                >
                  Skip install: use fixture
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="onboard-panel" aria-labelledby="pick-title">
            <h1 id="pick-title" className="onboard-title">
              Authorize a triage target
            </h1>
            <p className="onboard-copy">
              Pick the sample fixture for a deterministic demo, or a linked repository for a sandbox
              clone. Scope stays visible on the dashboard after you grant.
            </p>

            <div className="target-grid">
              <button
                type="button"
                className="target-option target-fixture"
                disabled={busy || !fixtureOk}
                onClick={authorizeFixture}
              >
                <span className="target-kicker">Recommended · demo</span>
                <span className="target-name">Sample fixture</span>
                <span className="target-desc">
                  demo-vulnerable: intentional bug + outdated dependency. Fastest path to findings,
                  brain map, and a PR artifact.
                </span>
              </button>

              <div className="target-option target-repos">
                <span className="target-kicker">GitHub · sandbox clone</span>
                <span className="target-name">Linked repositories</span>
                {user.installationIds.length > 1 ? (
                  <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--paper-dim)", display: "block", marginBottom: "0.25rem" }}>
                      GitHub Installation Account:
                    </label>
                    <select
                      className="input"
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem", width: "100%" }}
                      value={installationId}
                      onChange={(e) => {
                        setInstallationId(e.target.value);
                        setSelectedRepo("");
                      }}
                    >
                      {user.installationIds.map((id) => (
                        <option key={id} value={String(id)}>
                          Installation #{id}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {reposNote ? <p className="target-note">{reposNote}</p> : null}
                {!repos.length ? (
                  <p className="empty" style={{ marginTop: "0.75rem" }}>
                    {busy ? "Loading repositories from GitHub..." : "No repositories returned. Link an installation or use fixture."}
                  </p>
                ) : (
                  <ul className="repo-list">
                    {repos.map((r) => (
                      <li key={r.id}>
                        <label className="repo-row">
                          <input
                            type="radio"
                            name="repo"
                            value={r.fullName}
                            checked={selectedRepo === r.fullName}
                            onChange={() => setSelectedRepo(r.fullName)}
                          />
                          <span>
                            {r.fullName}
                            {r.private ? " · private" : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !selectedRepo}
                  onClick={authorizeRepo}
                >
                  Authorize selected repo
                </button>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.8rem" }}
                onClick={() => setStep("install")}
              >
                + Link or install on another organization
              </button>
              {onSkipToDashboard ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: "0.8rem" }}
                  onClick={onSkipToDashboard}
                >
                  Return to Dashboard →
                </button>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
