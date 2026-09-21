import { useEffect, useState } from "react";
import { api, flags } from "./api";
import { demoBrainMap } from "./BrainMapPreview";
import { BrainMapView } from "./BrainMapView";
import { navigate } from "./path";
import { PrivacyModal } from "./PrivacyModal";

type Props = {
  oauthConfigured: boolean;
  authRequired: boolean;
  healthError: string | null;
  busy: boolean;
  onLocalDemo: () => void;
  onMockSignIn: () => void;
};

const TELEMETRY_STEPS = [
  {
    idx: "01",
    phase: "OBSERVE",
    model: "Local AST",
    name: "Repository Tree Ingestion",
    detail: "Scanned 15 files, package dependencies, and ISSUES.json context.",
  },
  {
    idx: "02",
    phase: "TRIAGE",
    model: "Nova Micro",
    name: "Defect Prioritization",
    detail: "Ranked high-confidence off-by-one bug in inclusiveRange (confidence: 0.94).",
  },
  {
    idx: "03",
    phase: "INVESTIGATE",
    model: "Nova 2 Omni",
    name: "Root-Cause Synthesis",
    detail: "Determined upper bound loop logic (i < end) excludes target bound.",
  },
  {
    idx: "04",
    phase: "VERIFY",
    model: "Sandbox Runner",
    name: "Regression Test Suite",
    detail: "Executed node --test in container. 2 passed, 0 failed (duration: 48ms).",
  },
  {
    idx: "05",
    phase: "PR ARTIFACT",
    model: "PR Review Bot",
    name: "Draft Contribution Ready",
    detail: "Synthesized branch uatu/fix-range-inclusive with verified diff artifact.",
  },
];

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
  const [activeStep, setActiveStep] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const brain = demoBrainMap();

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % TELEMETRY_STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden>
        <div className="landing-grid" />
        <div className="landing-scan" />
      </div>

      <header className="landing-nav">
        <div className="brand brand-header-group">
          <img src="/logo.png" alt="UATU Logo" className="brand-logo" />
          <div className="brand-text">
            <div className="brand-mark">UATU</div>
            <div className="brand-tag">Universal Autonomous Triage &amp; Upkeep</div>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginLeft: "auto" }}>
          <a
            href="#how-it-works"
            className="landing-foot-nav"
            style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}
          >
            How It Works
          </a>
          <a
            href="#neural-brain"
            className="landing-foot-nav"
            style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}
          >
            Neural Brain
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/docs")}
          >
            User Docs
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowPrivacy(true)}
          >
            Privacy
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="landing-hero">
        <div className="landing-hero-content">
          <div className="hero-beacon">
            <span className="beacon-dot" />
            UATU Autonomous Upkeep Active · ap-south-1
          </div>

          <h1 className="landing-brand">Autonomous Codebase Triage.</h1>
          <p className="landing-tagline">Observe · Understand · Repair · Contribute</p>

          <p className="landing-lede">
            UATU continuously monitors your software repositories, maps a living neural memory of your
            architecture, isolates bugs and CVE security advisories, and synthesizes minimal, regression-tested
            pull requests you can review and merge with total confidence.
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
              >
                {flags.mockAuth ? "Enter with mock session" : "Continue with local demo"}
              </button>
            )}
            {canOAuth && !authRequired && (
              <button className="btn btn-ghost btn-lg" type="button" disabled={busy} onClick={onLocalDemo}>
                Local Fixture Demo
              </button>
            )}
            {showMock && canOAuth && (
              <button className="btn btn-ghost btn-lg" type="button" disabled={busy} onClick={onMockSignIn}>
                Mock Session
              </button>
            )}
            <button className="btn btn-ghost btn-lg" type="button" onClick={() => navigate("/docs")}>
              User Guide
            </button>
          </div>

          {healthError && (
            <p className="landing-health-warn" role="status">
              API unreachable: {healthError}. You can still test all UI flows via the instant local demo.
            </p>
          )}
        </div>

        {/* Interactive Telemetry Preview (Right Hero Column) */}
        <div className="telemetry-card" aria-label="Simulated autonomous triage telemetry">
          <div className="telemetry-header">
            <div className="terminal-dots">
              <span className="terminal-dot red" />
              <span className="terminal-dot amber" />
              <span className="terminal-dot green" />
            </div>
            <span className="telemetry-title">Autonomous Triage Telemetry</span>
            <span className="telemetry-badge">LIVE RUN</span>
          </div>

          <div className="telemetry-body">
            {TELEMETRY_STEPS.map((step, i) => {
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              return (
                <div
                  key={step.idx}
                  className={`telemetry-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                >
                  <span className="telemetry-step-idx">{step.idx}</span>
                  <div className="telemetry-step-content">
                    <div className="telemetry-step-name">
                      <span>{step.name}</span>
                      <span className="telemetry-step-model">{step.model}</span>
                    </div>
                    <div className="telemetry-step-detail">{step.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="telemetry-footer">
            <span>TARGET: demo-vulnerable (sandbox)</span>
            <span style={{ color: "var(--signal-soft)" }}>PASSED (2/2 CHECKS)</span>
          </div>
        </div>
      </main>

      {/* How It Works Section */}
      <section id="how-it-works" className="landing-section">
        <div className="section-eyebrow">The Upkeep Lifecycle</div>
        <h2 className="section-heading">How UATU Keeps Repositories Healthy</h2>
        <p className="section-sub">
          Every triage run follows a disciplined engineering lifecycle. Zero code is modified without an isolated sandbox
          and verification passes.
        </p>

        <div className="feature-cards-grid">
          <div className="feature-card">
            <span className="feature-idx">01</span>
            <h3>Connect &amp; Scope</h3>
            <p>
              Link target repositories through fine-grained GitHub OAuth and App permissions. Repositories start in a passive,
              read-only inspection state.
            </p>
            <span className="feature-tag">Passive by Default</span>
          </div>

          <div className="feature-card">
            <span className="feature-idx">02</span>
            <h3>Autonomous Diagnosis</h3>
            <p>
              UATU scans your AST tree, evaluates package dependencies, and leverages Amazon Nova Micro to triage and
              prioritize actionable defects.
            </p>
            <span className="feature-tag">Smart Complexity Router</span>
          </div>

          <div className="feature-card">
            <span className="feature-idx">03</span>
            <h3>Sandboxed Repair</h3>
            <p>
              Candidate diffs are synthesized by Amazon Nova 2 Omni and tested inside single-tenant filesystem sandboxes
              with strict path allowlists.
            </p>
            <span className="feature-tag">Isolated Sandboxes</span>
          </div>

          <div className="feature-card">
            <span className="feature-idx">04</span>
            <h3>Review &amp; Merge</h3>
            <p>
              Verified fixes are opened as reviewable GitHub draft pull requests complete with test logs. You maintain
              complete merge authority.
            </p>
            <span className="feature-tag">Human in the Loop</span>
          </div>
        </div>
      </section>

      {/* Neural Knowledge Brain Showcase */}
      <section id="neural-brain" className="landing-section">
        <div className="section-eyebrow">Living Memory</div>
        <h2 className="section-heading">Repository Brain: Spatial Code Knowledge</h2>
        <p className="section-sub">
          Unlike static linters that forget past runs, UATU builds an interactive neuron graph representing your files,
          dependencies, known vulnerabilities, and verified past repairs.
        </p>

        <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--ink-line)" }}>
          <BrainMapView brain={brain} />
        </div>
      </section>

      {/* Model Showcase Section */}
      <section className="landing-section">
        <div className="section-eyebrow">Foundation Intelligence</div>
        <h2 className="section-heading">Powered by Leading AI Models</h2>
        <p className="section-sub">
          The autonomous Smart Complexity Router routes tasks to the optimal model based on task difficulty, or you can
          choose specific models for your codebase.
        </p>

        <div className="models-showcase-grid">
          <div className="model-showcase-card">
            <span className="model-tier-chip tier-flagship">Flagship Synthesis</span>
            <h4>Amazon Nova 2 Omni</h4>
            <p>Next-generation high-capacity reasoning model for deep root-cause isolation and unified diff generation.</p>
            <div className="model-metrics">
              <span>8M TPM</span>
              <span>20 RPM</span>
              <span>Flagship Tier</span>
            </div>
          </div>

          <div className="model-showcase-card">
            <span className="model-tier-chip tier-flagship">Deep Logic</span>
            <h4>Claude 3.5 Sonnet v2</h4>
            <p>Industry standard for intricate functional code logic and nuanced edge-case bug fixes.</p>
            <div className="model-metrics">
              <span>800K TPM</span>
              <span>1 RPM</span>
              <span>Flagship Tier</span>
            </div>
          </div>

          <div className="model-showcase-card">
            <span className="model-tier-chip tier-fast">High Throughput</span>
            <h4>Amazon Nova Micro</h4>
            <p>Ultra-low latency inference for rapid AST classification, issue triage, and next-action planning.</p>
            <div className="model-metrics">
              <span>400K TPM</span>
              <span>20 RPM</span>
              <span>Fast Tier</span>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Security Guarantees */}
      <section className="landing-section">
        <div className="section-eyebrow">Security Guarantees</div>
        <h2 className="section-heading">Engineered for Absolute Trust</h2>
        <p className="section-sub">
          Your code is private and protected by cryptographic boundaries.
        </p>

        <div className="trust-grid">
          <div className="trust-card">
            <strong>Zero Model Training</strong>
            <p>Your proprietary code and commit diffs are never stored or used to train any AI foundation models.</p>
          </div>
          <div className="trust-card">
            <strong>Zero Auto-Merge</strong>
            <p>UATU never requests administrative merge rights; all changes are submitted as reviewable pull requests.</p>
          </div>
          <div className="trust-card">
            <strong>Isolated Sandboxes</strong>
            <p>All test runs and patches execute inside ephemeral temporary directories destroyed after each task.</p>
          </div>
          <div className="trust-card">
            <strong>Tenant Partitioning</strong>
            <p>Repository memories and grants are partitioned strictly by your authenticated GitHub User ID.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-foot">
        <div className="brand brand-header-group">
          <img src="/logo.png" alt="UATU Logo" style={{ width: "24px", height: "24px", borderRadius: "4px" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--paper)" }}>
            UATU: Observe · Understand · Repair · Contribute
          </span>
        </div>

        <div className="landing-foot-nav">
          <button type="button" onClick={() => navigate("/docs")}>
            Documentation
          </button>
          <button type="button" onClick={() => setShowPrivacy(true)}>
            Privacy Policy
          </button>
          <a href="https://github.com/Erebuzzz/Universal-Autonomous-Triage-and-Upkeep" target="_blank" rel="noreferrer">
            GitHub Repository
          </a>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
