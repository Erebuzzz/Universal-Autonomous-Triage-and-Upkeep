import { useEffect, useState } from "react";
import type { Grant, InstallationRepo, MeResponse, UatuUser } from "./api";
import { api, flags, oauthLoginUrl } from "./api";
import { BrandLockup } from "./BrandLockup";
import {
  clearInstallQueryParams,
  clearPendingInstall,
  githubAppInstallUrl,
  githubAppSetupUrl,
  navigate,
  readInstallQuery,
  stashPendingInstall,
} from "./path";

type Phase = "linking" | "connected" | "pick" | "need_auth" | "need_id";

type Props = {
  me: MeResponse | null;
  authLoading: boolean;
  onGrantReady: (grant: Grant) => void;
  onGoDashboard: () => void;
  onLogout: () => void;
  onEnterLocalDemo: () => void;
  oauthConfigured: boolean;
};

export function OnboardingComplete({
  me,
  authLoading,
  onGrantReady,
  onGoDashboard,
  onLogout,
  onEnterLocalDemo,
  oauthConfigured,
}: Props) {
  const initial = readInstallQuery();
  const [installationId, setInstallationId] = useState(initial.installationId ?? "");
  const [setupAction, setSetupAction] = useState(initial.setupAction);
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initial.installationId && !me?.user.installationIds.length) return "need_id";
    return "linking";
  });
  const installUrl = githubAppInstallUrl(flags.githubAppSlug);
  const slugReady = Boolean(flags.githubAppSlug && installUrl);
  const [user, setUser] = useState<UatuUser | null>(me?.user ?? null);
  const [repos, setRepos] = useState<InstallationRepo[]>([]);
  const [reposNote, setReposNote] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  const fixtureOk = me?.fixtureDemoAvailable !== false;

  // Keep installation_id across OAuth redirect to /?signedIn=1 (sessionStorage, non-secret).
  useEffect(() => {
    if (installationId) stashPendingInstall(installationId, setupAction);
  }, [installationId, setupAction]);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      setPhase("need_auth");
      return;
    }
    setUser(me.user);
    const idFromQuery = readInstallQuery().installationId;
    const id =
      idFromQuery ??
      (me.user.installationIds[0] ? String(me.user.installationIds[0]) : "");
    if (idFromQuery) setInstallationId(idFromQuery);
    if (readInstallQuery().setupAction) setSetupAction(readInstallQuery().setupAction);

    if (!id) {
      setPhase("need_id");
      return;
    }

    let cancelled = false;
    async function link() {
      setPhase("linking");
      setBusy(true);
      setError(null);
      try {
        const numeric = Number(id);
        const { user: next } = await api.linkInstallation(numeric);
        if (cancelled) return;
        setUser(next);
        setLinkNote(
          setupAction === "update"
            ? "Installation updated and linked to this session."
            : "Installation linked to this session.",
        );
        clearInstallQueryParams();
        clearPendingInstall();
        setPhase("connected");
        await loadRepos(numeric);
      } catch (e) {
        if (cancelled) return;
        // Still allow continue: id may already be linked or API unavailable
        setError(e instanceof Error ? e.message : String(e));
        setLinkNote("Could not auto-link via API. You can still choose a target below.");
        setPhase("connected");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void link();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when me becomes available
  }, [authLoading, me?.user.id]);

  async function loadRepos(id: number) {
    try {
      const result = await api.listInstallationRepos(id);
      setRepos(result.repos ?? []);
      setReposNote(result.message ?? (result.repos?.length ? null : "No repositories returned yet."));
    } catch (e) {
      setRepos([]);
      setReposNote(e instanceof Error ? e.message : String(e));
    }
  }

  async function manualLink() {
    const id = Number(installationId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Enter the numeric installation_id from GitHub.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user: next } = await api.linkInstallation(id);
      setUser(next);
      setLinkNote("Installation linked to this session.");
      clearInstallQueryParams();
      clearPendingInstall();
      setPhase("connected");
      await loadRepos(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function authorizeFixture() {
    setBusy(true);
    setError(null);
    try {
      const { grant } = await api.createFixtureGrant();
      onGrantReady(grant);
      navigate("/", { replace: true });
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
    const id = Number(installationId) || user?.installationIds[0];
    if (!id) {
      setError("Installation id required before authorizing a GitHub repo.");
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
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <BrandLockup size="lg" variant="minimal" subtitle="[ 19.0760°N // 72.8777°E // CONFIRMING_INSTALL ]" />
      </div>
    );
  }

  if (phase === "need_auth" || !me) {
    return (
      <div className="complete-shell utopia-cross-grid">
        <div className="complete-atmosphere" aria-hidden>
          <div className="utopia-matrix-grid" />
          <div className="utopia-meridian-lines" />
          <div className="utopia-starlight-glow" />
        </div>
        <header className="landing-nav">
          <BrandLockup size="lg" href="/" />
        </header>
        <main className="complete-main">
          <p className="landing-eyebrow">[ GITHUB APP // PENDING_SESSION ]</p>
          <h1 className="complete-title">Sign In to Finish Setup</h1>
          <p className="onboard-copy">
            Your App install succeeded
            {installationId ? (
              <>
                {" "}
                (<code className="mono-inline">installation_id={installationId}</code>)
              </>
            ) : null}
            . Sign in so UATU can link it to this operator session, then pick a triage target.
          </p>
          <div className="landing-cta" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {oauthConfigured ? (
              <a
                className="btn-utopia"
                href={oauthLoginUrl()}
                onClick={() => {
                  if (installationId) stashPendingInstall(installationId, setupAction);
                }}
              >
                &gt;_SIGN_IN_GITHUB
              </a>
            ) : (
              <button className="btn-utopia" type="button" onClick={onEnterLocalDemo}>
                &gt;_CONTINUE_DEMO
              </button>
            )}
            <button
              className="btn-utopia btn-utopia-ghost"
              type="button"
              onClick={() => navigate("/")}
            >
              &gt;_RETURN_LANDING
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="complete-shell utopia-cross-grid">
      <div className="complete-atmosphere" aria-hidden>
        <div className="utopia-matrix-grid" />
        <div className="utopia-meridian-lines" />
        <div className="utopia-starlight-glow" />
      </div>

      <header className="topbar">
        <BrandLockup size="md" subtitle={`[ CONNECTED // ${user?.login ?? me.user.login} ]`} href="/" />
        <div className="topbar-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              onGoDashboard();
              navigate("/", { replace: true });
            }}
          >
            Dashboard
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

      <main className="complete-main">
        {phase === "linking" ? (
          <div role="status" aria-live="polite">
            <p className="landing-eyebrow">GitHub App</p>
            <h1 className="complete-title">Linking installation…</h1>
            <p className="onboard-copy">
              Binding <code className="mono-inline">{installationId || "…"}</code> to your session.
            </p>
          </div>
        ) : null}

        {phase === "need_id" ? (
          <section aria-labelledby="need-id-title">
            <p className="landing-eyebrow">GitHub App</p>
            <h1 id="need-id-title" className="complete-title">
              Almost connected
            </h1>
            <p className="onboard-copy">
              No <code className="mono-inline">installation_id</code> was found on this URL. Paste it
              from GitHub, or open the install flow again (Setup URL should return here).
            </p>
            <div className="onboard-actions">
              <div className="field-row">
                <label htmlFor="complete-installation-id">Installation id</label>
                <input
                  id="complete-installation-id"
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 12345678"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                />
                <button className="btn btn-primary" type="button" disabled={busy} onClick={manualLink}>
                  Link installation
                </button>
              </div>
              {slugReady ? (
                <a
                  className="btn"
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open GitHub App install
                </a>
              ) : (
                <div className="callout callout-warn" role="status">
                  <strong>Set VITE_UATU_GITHUB_APP_SLUG</strong> in repo-root{" "}
                  <code className="mono-inline">.env</code> to your App&apos;s public slug, then
                  restart Vite.
                  <button className="btn" type="button" disabled>
                    Open GitHub App install
                  </button>
                </div>
              )}
              <p className="complete-hint">
                Configure App Setup URL: <code className="mono-inline">{githubAppSetupUrl()}</code>
              </p>
            </div>
          </section>
        ) : null}

        {phase === "connected" || phase === "pick" ? (
          <section aria-labelledby="connected-title" className="complete-confirm">
            <p className="landing-eyebrow">
              {setupAction === "update" ? "Setup · updated" : "Setup · installed"}
            </p>
            <h1 id="connected-title" className="complete-title">
              You&apos;re connected
            </h1>
            <p className="onboard-copy">
              The UATU GitHub App is installed
              {installationId ? (
                <>
                  {" "}
                  as <code className="mono-inline">#{installationId}</code>
                </>
              ) : null}
              . Next, authorize a triage target: sample fixture for a fast demo, or a linked
              repository for a sandbox clone. Nothing is written until you grant.
            </p>
            {linkNote ? <p className="complete-status">{linkNote}</p> : null}

            {phase === "connected" ? (
              <div className="landing-cta">
                <button
                  className="btn btn-primary btn-lg"
                  type="button"
                  onClick={() => setPhase("pick")}
                >
                  Choose triage target
                </button>
                <button
                  className="btn btn-ghost btn-lg"
                  type="button"
                  onClick={() => {
                    onGoDashboard();
                    navigate("/", { replace: true });
                  }}
                >
                  Go to dashboard
                </button>
                {slugReady ? (
                  <a
                    className="btn btn-ghost btn-lg"
                    href={installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Install help / manage App
                  </a>
                ) : (
                  <button className="btn btn-ghost btn-lg" type="button" disabled title="Missing VITE_UATU_GITHUB_APP_SLUG">
                    Install help / manage App
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {phase === "pick" ? (
          <section className="complete-picker" aria-labelledby="pick-title">
            <h2 id="pick-title" className="onboard-title">
              Authorize a triage target
            </h2>
            <p className="onboard-copy">
              Same K3 picker as setup: fixture for deterministic demo, or a repo from this
              installation.
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
                  demo-vulnerable: intentional bug + outdated dependency. Fastest path to findings.
                </span>
              </button>

              <div className="target-option target-repos">
                <span className="target-kicker">GitHub · sandbox clone</span>
                <span className="target-name">Linked repositories</span>
                {reposNote ? <p className="target-note">{reposNote}</p> : null}
                {!repos.length ? (
                  <p className="empty" style={{ marginTop: "0.75rem" }}>
                    No repos listed yet. Use the sample fixture, or confirm App permissions on GitHub.
                  </p>
                ) : (
                  <ul className="repo-list">
                    {repos.map((r) => (
                      <li key={r.id}>
                        <label className="repo-row">
                          <input
                            type="radio"
                            name="complete-repo"
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
          </section>
        ) : null}
      </main>
    </div>
  );
}
