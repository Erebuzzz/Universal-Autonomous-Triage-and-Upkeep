import { useEffect, useState } from "react";
import { api, flags } from "./api";
import { AudioToggle } from "./AudioToggle";
import { demoBrainMap } from "./BrainMapPreview";
import { BrainMapView } from "./BrainMapView";
import { FlipCard } from "./components/FlipCard";
import { LatticeLoader } from "./components/LatticeLoader";
import { PixelSnow } from "./components/PixelSnow";
import { SpecularButton } from "./components/SpecularButton";
import { Logo } from "./Logo";
import { navigate } from "./path";
import { PrivacyModal } from "./PrivacyModal";
import { sound } from "./SoundEngine";
import { ThemeToggle } from "./ThemeToggle";

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
    name: "Repository Ingestion",
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
    name: "Root-Cause Isolation",
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
  const [isPaused, setIsPaused] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const brain = demoBrainMap();

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % TELEMETRY_STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden>
        <PixelSnow
          color="#00ff9d"
          flakeSize={0.008}
          pixelResolution={120}
          speed={0.4}
          density={0.04}
          direction={135}
          brightness={0.35}
          className="landing-snow-bg"
        />
        <div className="landing-grid" />
        <div className="landing-scan" />
      </div>

      <header className="landing-nav">
        <div className="brand brand-header-group">
          <Logo size={36} />
          <div className="brand-text">
            <div className="brand-mark">
              <span className="brand-duotone-ua">UA</span>
              <span className="brand-duotone-tu">TU</span>
            </div>
            <div className="brand-tag">Universal Autonomous Triage &amp; Upkeep</div>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginLeft: "auto" }}>
          <a href="#how-it-works" className="landing-nav-link">
            How It Works
          </a>
          <a href="#neural-brain" className="landing-nav-link">
            Neural Brain
          </a>
          <a
            href="/docs"
            className="landing-nav-link"
            onClick={(e) => {
              e.preventDefault();
              navigate("/docs");
            }}
          >
            User Docs
          </a>
          <button
            type="button"
            className="landing-nav-link landing-nav-btn"
            onClick={() => setShowPrivacy(true)}
          >
            Privacy
          </button>
          <AudioToggle />
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero Section */}
      <main className="landing-hero">
        <div className="landing-hero-content">
          <div className="hero-beacon">
            <span className="beacon-dot" />
            Celestial Observatory Active · ap-south-1
          </div>

          <h1 className="landing-brand">
            The Celestial Watcher of Codebases:{" "}
            <span className="brand-duotone-ua">UA</span>
            <span className="brand-duotone-tu">TU</span>
          </h1>
          <p className="landing-tagline">Observe · Understand · Repair · Contribute</p>

          <p className="landing-lede">
            UATU continuously monitors your repositories, maps an organic biological neural tree of your
            architecture, isolates bugs and CVE advisories, and synthesizes minimal, regression-tested
            pull requests you review with total merge confidence.
          </p>

          <div className="landing-cta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            {canOAuth ? (
              <SpecularButton
                onClick={() => {
                  sound.playCelestialChime();
                  window.location.href = api.githubLoginUrl();
                }}
                tint="#00ff9d"
                lineColor="#ffffff"
                baseColor="#10b981"
                intensity={1.3}
                size="lg"
                disabled={busy}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  <span>Sign in with GitHub</span>
                </span>
              </SpecularButton>
            ) : (
              <SpecularButton
                onClick={() => {
                  sound.playCelestialChime();
                  onMockSignIn();
                }}
                tint="#00ff9d"
                lineColor="#ffffff"
                baseColor="#10b981"
                intensity={1.2}
                size="lg"
                disabled={busy}
              >
                <span>{flags.mockAuth ? "Enter with Mock Session" : "Continue with Demo"}</span>
              </SpecularButton>
            )}

            {canOAuth && !authRequired && (
              <button
                className="btn btn-ghost btn-lg"
                type="button"
                disabled={busy}
                onClick={onLocalDemo}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span>Local Fixture Demo</span>
              </button>
            )}

            {showMock && canOAuth && (
              <button
                className="btn btn-ghost btn-lg"
                type="button"
                disabled={busy}
                onClick={onMockSignIn}
              >
                Mock Session
              </button>
            )}

            <button
              className="btn btn-ghost btn-lg"
              type="button"
              onClick={() => navigate("/docs")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span>User Guide</span>
            </button>
          </div>

          {healthError && (
            <p className="landing-health-warn" role="status">
              API unreachable: {healthError}. You can test all UI flows via the instant local demo.
            </p>
          )}
        </div>

        {/* Interactive Telemetry Preview with LatticeLoader */}
        <div className="telemetry-card" aria-label="Simulated autonomous triage telemetry">
          <div className="telemetry-header">
            <div className="terminal-dots">
              <span className="terminal-dot red" />
              <span className="terminal-dot amber" />
              <span className="terminal-dot green" />
            </div>
            <span className="telemetry-title">Autonomous Triage Telemetry</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <LatticeLoader
                status={isPaused ? "done" : "working"}
                pattern="orbit"
                grid={3}
                color="#00ff9d"
              />
              <button
                type="button"
                className="telemetry-ctrl-btn"
                onClick={() => setIsPaused((p) => !p)}
                title={isPaused ? "Resume simulation" : "Pause simulation"}
              >
                {isPaused ? "Play" : "Pause"}
              </button>
              <button
                type="button"
                className="telemetry-ctrl-btn"
                onClick={() => setActiveStep((prev) => (prev + 1) % TELEMETRY_STEPS.length)}
                title="Step forward"
              >
                Step
              </button>
            </div>
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
            <span>Target: demo-vulnerable (sandbox)</span>
            <span style={{ color: "var(--signal-bright)" }}>Passed (2/2 checks)</span>
          </div>
        </div>
      </main>

      {/* How It Works Section with 3D Glowing FlipCards */}
      <section id="how-it-works" className="landing-section">
        <div className="section-eyebrow">The Upkeep Lifecycle</div>
        <h2 className="section-heading">How UATU Keeps Repositories Healthy</h2>
        <p className="section-sub">
          Every triage run follows a disciplined engineering lifecycle. Zero code is modified without an isolated
          sandbox and verification pass. Click or tilt any card to explore architectural specifications.
        </p>

        <div className="feature-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.25}
            radius={16}
            front={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem" }}>
                <span className="feature-idx">01</span>
                <h3>Connect &amp; Scope</h3>
                <p>
                  Link target repositories through fine-grained GitHub App permissions. Repositories start in a passive,
                  read-only inspection state.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-tag">Passive by Default</span>
                  <span className="flip-hint-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    Click to Flip
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem", borderColor: "rgba(0, 255, 157, 0.4)" }}>
                <span className="feature-idx" style={{ color: "var(--signal-bright)" }}>SPEC 01</span>
                <h3>Security Enclave</h3>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.55 }}>
                  Minted installation tokens expire after 60 minutes. Read-only permissions allow initial AST indexing without write grants.
                </p>
                <div style={{ marginTop: "auto" }}>
                  <span className="feature-tag">Capability-Scoped Grants</span>
                </div>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.25}
            radius={16}
            front={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem" }}>
                <span className="feature-idx">02</span>
                <h3>Autonomous Diagnosis</h3>
                <p>
                  UATU scans your AST tree, evaluates package dependencies, and leverages Amazon Nova Micro to triage and
                  prioritize actionable defects.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-tag">Smart Complexity Router</span>
                  <span className="flip-hint-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    Click to Flip
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem", borderColor: "rgba(0, 255, 157, 0.4)" }}>
                <span className="feature-idx" style={{ color: "var(--signal-bright)" }}>SPEC 02</span>
                <h3>AST &amp; Dependency Graph</h3>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.55 }}>
                  Heuristics and Bedrock LLM classify bugs into severity tiers. Security vulnerabilities match against GitHub Advisory Database.
                </p>
                <div style={{ marginTop: "auto" }}>
                  <span className="feature-tag">Multi-Model Routing</span>
                </div>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.25}
            radius={16}
            front={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem" }}>
                <span className="feature-idx">03</span>
                <h3>Sandboxed Repair</h3>
                <p>
                  Candidate diffs are synthesized by Amazon Nova 2 Omni and tested inside single-tenant filesystem sandboxes
                  with strict path allowlists.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-tag">Isolated Sandboxes</span>
                  <span className="flip-hint-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    Click to Flip
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem", borderColor: "rgba(0, 255, 157, 0.4)" }}>
                <span className="feature-idx" style={{ color: "var(--signal-bright)" }}>SPEC 03</span>
                <h3>Zero Host Leakage</h3>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.55 }}>
                  Ephemeral sandbox clones run test runners with strict timeouts. Any modified files outside the capability allowlist trigger instant task abort.
                </p>
                <div style={{ marginTop: "auto" }}>
                  <span className="feature-tag">Path Allowlist Guard</span>
                </div>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.25}
            radius={16}
            front={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem" }}>
                <span className="feature-idx">04</span>
                <h3>Review &amp; Merge</h3>
                <p>
                  Verified fixes are opened as reviewable GitHub draft pull requests complete with test logs. You maintain
                  complete merge authority.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-tag">Human in the Loop</span>
                  <span className="flip-hint-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    Click to Flip
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card" style={{ height: "100%", margin: 0, padding: "1.25rem", borderColor: "rgba(0, 255, 157, 0.4)" }}>
                <span className="feature-idx" style={{ color: "var(--signal-bright)" }}>SPEC 04</span>
                <h3>Pass Certification</h3>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.55 }}>
                  Draft PRs include detailed test reproduction logs, root-cause rationale, and rollback instructions. Zero auto-merges are ever performed.
                </p>
                <div style={{ marginTop: "auto" }}>
                  <span className="feature-tag">Zero Auto-Merge Rule</span>
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* Neural Knowledge Brain Showcase */}
      <section id="neural-brain" className="landing-section">
        <div className="section-eyebrow">Living Memory</div>
        <h2 className="section-heading">
          Biological Neural Brain: Spatial Code Knowledge
        </h2>
        <p className="section-sub">
          Unlike static linters that forget past runs, UATU builds an organic biological neural tree representing
          your directories, files, vulnerabilities, and verified patches. Double-click any node or click the Synaptic
          Gateways (+/-) to expand and dramatically zoom into sub-branches. Double-click again to collapse.
        </p>

        <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--ink-line)" }}>
          <BrainMapView brain={brain} />
        </div>
      </section>

      {/* Foundation Intelligence Section */}
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
            <h3>Amazon Nova 2 Omni</h3>
            <p>Next-generation high-capacity reasoning model for deep root-cause isolation and unified diff generation.</p>
            <div className="model-metrics">
              <span className="metric-pill"><span className="metric-key">TPM:</span> 8M</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 20</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">Tier:</span> Flagship</span>
            </div>
          </div>

          <div className="model-showcase-card">
            <span className="model-tier-chip tier-flagship">Deep Logic</span>
            <h3>Claude 3.5 Sonnet v2</h3>
            <p>Industry standard for intricate functional code logic and nuanced edge-case bug fixes.</p>
            <div className="model-metrics">
              <span className="metric-pill"><span className="metric-key">TPM:</span> 800K</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 1</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">Tier:</span> Flagship</span>
            </div>
          </div>

          <div className="model-showcase-card">
            <span className="model-tier-chip tier-fast">High Throughput</span>
            <h3>Amazon Nova Micro</h3>
            <p>Ultra-low latency inference for rapid AST classification, issue triage, and next-action planning.</p>
            <div className="model-metrics">
              <span className="metric-pill"><span className="metric-key">TPM:</span> 400K</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 20</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">Tier:</span> Fast</span>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Security Guarantees */}
      <section className="landing-section">
        <div className="section-eyebrow">Security Guarantees</div>
        <h2 className="section-heading">Engineered for Absolute Trust</h2>
        <p className="section-sub">Your code is private and protected by cryptographic boundaries.</p>

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
          <Logo size={26} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--paper)" }}>
            <span className="brand-duotone-ua">UA</span>
            <span className="brand-duotone-tu">TU</span>: Observe · Understand · Repair · Contribute
          </span>
        </div>

        <div className="landing-foot-nav">
          <button type="button" onClick={() => navigate("/docs")}>
            Documentation ↗
          </button>
          <button type="button" onClick={() => setShowPrivacy(true)}>
            Privacy Policy ↗
          </button>
          <a
            href="https://github.com/Erebuzzz/Universal-Autonomous-Triage-and-Upkeep"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Repository ↗
          </a>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
