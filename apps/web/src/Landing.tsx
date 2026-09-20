import { api, flags } from "./api";
import { navigate } from "./path";

type Props = {
  oauthConfigured: boolean;
  authRequired: boolean;
  healthError: string | null;
  busy: boolean;
  onLocalDemo: () => void;
  onMockSignIn: () => void;
};

export function Landing({
  oauthConfigured,
  authRequired,
  healthError,
  busy,
  onLocalDemo,
  onMockSignIn,
}: Props) {
  const canOAuth = oauthConfigured;
  const showMock = flags.mockAuth || !oauthConfigured;

  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden>
        <div className="landing-grid" />
        <div className="landing-scan" />
      </div>

      <header className="landing-nav">
        <div className="brand">
          <div className="brand-mark">UATU</div>
        </div>
        <p className="landing-nav-meta">Universal Autonomous Triage &amp; Upkeep</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => navigate("/docs")}
          style={{ marginLeft: "auto" }}
        >
          Documentation
        </button>
      </header>

      <main className="landing-hero">
        <p className="landing-eyebrow">Authorized observation · verified repair · reviewable PRs</p>
        <h1 className="landing-brand">UATU</h1>
        <p className="landing-lede">
          Autonomous triage for repositories you explicitly grant. Policy-bounded writes, auditable
          decisions, and contributions you can review before they land.
        </p>

        <div className="landing-cta">
          {canOAuth ? (
            <a className="btn btn-primary btn-lg" href={api.githubLoginUrl()}>
              Sign in with GitHub
            </a>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              type="button"
              disabled={busy}
              onClick={onMockSignIn}
              title="OAuth not configured on the API: use local demo or set VITE_UATU_MOCK_AUTH"
            >
              {flags.mockAuth ? "Enter with mock session" : "Continue with local demo"}
            </button>
          )}
          {canOAuth && !authRequired ? (
            <button className="btn btn-ghost btn-lg" type="button" disabled={busy} onClick={onLocalDemo}>
              Local fixture demo
            </button>
          ) : null}
          {showMock && canOAuth ? (
            <button className="btn btn-ghost btn-lg" type="button" disabled={busy} onClick={onMockSignIn}>
              Mock session
            </button>
          ) : null}
        </div>

        {healthError ? (
          <p className="landing-health-warn" role="status">
            API unreachable: {healthError}. UI still loads; connect the API for live runs.
          </p>
        ) : (
          <p className="landing-health-ok" role="status">
            {oauthConfigured
              ? "GitHub OAuth ready"
              : "OAuth unset: local / mock gate active"}
            {" · "}
            {authRequired ? "auth required" : "passive local mode"}
          </p>
        )}
      </main>

      <section className="landing-principles" aria-label="Operating principles">
        <h2 className="landing-section-title">How UATU stays trustworthy</h2>
        <ol className="landing-principle-list">
          <li>
            <span className="landing-principle-idx">01</span>
            <div>
              <strong>Grant before write</strong>
              <p>No sandbox clone or patch without an explicit authorization scope.</p>
            </div>
          </li>
          <li>
            <span className="landing-principle-idx">02</span>
            <div>
              <strong>Audit every decision</strong>
              <p>Bedrock and deterministic rules are tagged so you know what reasoned.</p>
            </div>
          </li>
          <li>
            <span className="landing-principle-idx">03</span>
            <div>
              <strong>Contribute for review</strong>
              <p>PRs and local artifacts stay human-gated; UATU never merges for you.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="landing-foot">
        <span>Observe · Understand · Repair · Contribute</span>
      </footer>
    </div>
  );
}
