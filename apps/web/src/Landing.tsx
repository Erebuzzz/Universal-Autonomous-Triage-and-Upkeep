import { useEffect, useState } from "react";
import { api, flags } from "./api";
import { AudioToggle } from "./AudioToggle";
import { BrandLockup } from "./BrandLockup";
import { demoBrainMap } from "./BrainMapPreview";
import { BrainMapView } from "./BrainMapView";
import { FlipCard } from "./components/FlipCard";
import { LatticeLoader } from "./components/LatticeLoader";
import { navigate } from "./path";
import { PrivacyModal } from "./PrivacyModal";
import { sound } from "./SoundEngine";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  oauthConfigured?: boolean;
  canOAuth?: boolean;
  authRequired?: boolean;
  healthError: string | null;
  busy: boolean;
  onLocalDemo: () => void;
  onMockSignIn: () => void;
  showMock?: boolean;
}

const TELEMETRY_STEPS = [
  { idx: "01", name: "OBSERVE_INGESTION", model: "Nova Micro", detail: "Repository webhook parsed, AST dependency graph indexed" },
  { idx: "02", name: "CARTOGRAPHIC_SURVEY", model: "Deterministic", detail: "Elevations calculated, high-risk summits targeted" },
  { idx: "03", name: "ROOT_CAUSE_ISOLATION", model: "Claude 3.5", detail: "Stack trace pinpointed to off-by-one boundary" },
  { idx: "04", name: "SYNTHESIS_REMEDIATION", model: "Nova 2 Omni", detail: "Clean unified diff generated with 100% test pass" },
];

export function Landing({
  oauthConfigured,
  canOAuth: explicitCanOAuth,
  onMockSignIn,
  onLocalDemo,
  busy,
  healthError,
  showMock = false,
}: Props) {
  const canOAuth = explicitCanOAuth ?? oauthConfigured ?? false;
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [demoBrain] = useState(() => demoBrainMap());

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % TELEMETRY_STEPS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div className="landing utopia-cross-grid">
      {/* Background Starlight Aura */}
      <div className="landing-atmosphere" aria-hidden>
        <div className="utopia-matrix-grid" />
        <div className="utopia-meridian-lines" />
        <div className="utopia-starlight-glow" />
      </div>

      {/* Topmost Utopia Tokyo GPS Telemetry Strip */}
      <div className="utopia-telemetry-header">
        <div className="utopia-telemetry-coords">
          [ 35.6762° N // 139.6503° E ]
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
          <span>Sector: Global Observation</span>
          <span className="utopia-telemetry-coords">
            Status: Active Surveillance
          </span>
          <span>Version: 2.4.0-RC.1</span>
        </div>
      </div>

      {/* Primary Navigation */}
      <header className="landing-nav">
        <BrandLockup size="lg" />

        <nav style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginLeft: "auto", flexWrap: "wrap" }}>
          <a href="#how-it-works" className="landing-nav-link">
            [ 01 // Lifecycle ]
          </a>
          <a href="#cartography" className="landing-nav-link">
            [ 02 // Cartography ]
          </a>
          <a
            href="/docs"
            className="landing-nav-link"
            onClick={(e) => {
              e.preventDefault();
              navigate("/docs");
            }}
          >
            [ 03 // Docs ]
          </a>
          <button
            type="button"
            className="landing-nav-link landing-nav-btn"
            onClick={() => setShowPrivacy(true)}
          >
            [ 04 // Privacy ]
          </button>
          <AudioToggle />
          <ThemeToggle />
          {canOAuth ? (
            <a
              href={api.githubLoginUrl()}
              onClick={() => sound.playCelestialChime()}
              className="btn-utopia btn-utopia-primary"
              style={{
                padding: "0.45rem 1rem",
                fontSize: "0.72rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                textDecoration: "none",
              }}
              title="Sign in with GitHub"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>SIGN IN</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                sound.playCelestialChime();
                onMockSignIn();
              }}
              className="btn-utopia btn-utopia-primary"
              style={{
                padding: "0.45rem 1rem",
                fontSize: "0.72rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
              disabled={busy}
              title="Sign in with demo credentials"
            >
              <span>SIGN IN</span>
            </button>
          )}
        </nav>
      </header>

      {/* Symmetrical Hero Command Cockpit */}
      <main className="landing-hero-cockpit">
        <div className="landing-hero-grid">
          
          {/* Left Column: Monumental Stencil, Brutalist Punch Triplet, and Action CTAs */}
          <div className="landing-hero-left utopia-hud-frame">
            <div className="hero-subhead-pill">
              [ Cosmic Autonomous Upkeep Runtime ]
            </div>

            <h1 className="utopia-monumental-title">
              <span className="utopia-title-solid">UATU</span>
              <span className="utopia-title-outline">WATCHER</span>
            </h1>

            {/* Brutalist Punch Triplet with Square Ember Dots */}
            <div className="utopia-punch-triplet">
              <span className="utopia-punch-line">
                OBSERVED<span className="utopia-punch-dot">.</span>
              </span>
              <span className="utopia-punch-line">
                TRIAGED<span className="utopia-punch-dot">.</span>
              </span>
              <span className="utopia-punch-line">
                REPAIRED<span className="utopia-punch-dot">.</span>
              </span>
            </div>

            <p className="hero-punch-summary">
              A silent autonomous watcher continuously observing code multiverse entropy.
              Isolating vulnerability summits and synthesizing verified, zero-regression pull requests.
            </p>

            {/* Primary & Secondary Action CTAs */}
            <div className="hero-action-group">
              {canOAuth ? (
                <a
                  href={api.githubLoginUrl()}
                  onClick={() => sound.playCelestialChime()}
                  className="btn-utopia btn-utopia-primary"
                  title="Sign in with GitHub to observe and triage repositories"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span>&gt;_SIGN_IN_WITH_GITHUB</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    sound.playCelestialChime();
                    onMockSignIn();
                  }}
                  className="btn-utopia btn-utopia-primary"
                  disabled={busy}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}
                  title="Sign in with demo credentials"
                >
                  <span>&gt;_{flags.mockAuth ? "MOCK_SESSION" : "SIGN_IN_DEMO"}</span>
                </button>
              )}

              <button
                type="button"
                className="btn-utopia btn-utopia-ghost"
                onClick={onLocalDemo}
                disabled={busy}
                title="Explore interactive fixture sandbox without GitHub credentials"
              >
                &gt;_LOCAL_FIXTURE
              </button>

              {showMock && canOAuth && (
                <button
                  type="button"
                  className="btn-utopia btn-utopia-ghost"
                  onClick={onMockSignIn}
                  disabled={busy}
                >
                  &gt;_MOCK_SESSION
                </button>
              )}
            </div>

            {healthError && (
              <p className="hero-health-status" role="status">
                [!] API Status: {healthError} · Local fixture operational
              </p>
            )}
          </div>

          {/* Right Column: Mission Briefing & Real-time Telemetry Stream */}
          <div className="landing-hero-right utopia-hud-frame">
            <div className="hud-panel-header">
              <span className="hud-panel-title">
                [ Mission Briefing // Thesis ]
              </span>
              <span className="hud-panel-meta">
                Latency: &lt;42ms
              </span>
            </div>

            <p className="hud-briefing-text">
              A silent watcher observing the multiverse of code. UATU continuously maps repository entropy,
              projects architectural files onto an interactive 2.5D topographic elevation grid, targets high-risk
              summit bugs and CVE advisories, and synthesizes minimal, verified pull requests without human prompting.
            </p>

            {/* Interactive Telemetry Stream */}
            <div className="telemetry-stream-box">
              <div className="telemetry-stream-bar">
                <span className="telemetry-stream-title">
                  Active Telemetry Stream
                </span>
                <div className="telemetry-stream-controls">
                  <LatticeLoader status={isPaused ? "done" : "working"} pattern="orbit" grid={3} color="#ff3b00" />
                  <button
                    type="button"
                    className="telemetry-toggle-pill"
                    onClick={() => setIsPaused((p) => !p)}
                    aria-pressed={isPaused}
                    title={isPaused ? "Resume telemetry animation" : "Pause telemetry animation"}
                  >
                    <span className={`toggle-dot ${isPaused ? "paused" : "active"}`} />
                    <span>{isPaused ? "Resume" : "Pause"}</span>
                  </button>
                </div>
              </div>

              <div className="telemetry-steps-list">
                {TELEMETRY_STEPS.map((step, i) => (
                  <div
                    key={step.idx}
                    className={`telemetry-step-row ${i === activeStep ? "active" : ""}`}
                  >
                    <span className="step-idx">{step.idx}</span>
                    <span className="step-name">{step.name}</span>
                    <span className="step-model">{step.model}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Symmetrical Cartographic Topography Section */}
      <section id="cartography" className="landing-map-section">
        <div className="landing-map-header">
          <div className="map-title-group">
            <span className="utopia-hash-badge">[ 02 // Spatial Cartography ]</span>
            <h2 className="map-heading">
              Topographic Elevation Map
            </h2>
          </div>
          <div className="utopia-hash-scale" aria-hidden="true">
            <span className="utopia-hash-tick active" />
            <span className="utopia-hash-tick" />
            <span className="utopia-hash-tick" />
            <span className="utopia-hash-badge">Sector: 01-Alpha</span>
            <span className="utopia-hash-tick" />
            <span className="utopia-hash-tick" />
            <span className="utopia-hash-tick active" />
          </div>
        </div>

        {/* Embedded Live Topographic Navigation Map */}
        <BrainMapView brain={demoBrain} height={540} />

        <div className="landing-map-footer">
          <span>
            Tip: Drag to pan · Scroll wheel to adjust altitude · Double-click waypoint to fly in
          </span>
          <span className="map-stats-active">
            ● 14 Survey Waypoints Active · 1 Critical Summit Isolated
          </span>
        </div>
      </section>

      {/* How It Works Section with 3D Glowing FlipCards */}
      {/* How It Works Section with 3D Glowing FlipCards */}
      <section id="how-it-works" className="landing-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "3.5rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span className="utopia-hash-badge">[ 01 // Upkeep Lifecycle ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", letterSpacing: "0.1em", color: "var(--paper-dim)" }}>
            Disciplined Repository Health Protocol
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          How UATU Keeps Codebases Healthy
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "var(--text-base)", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          Every upkeep run executes in an isolated sandbox. Zero code is modified without a passing verification test suite.
          Click or tilt any card to inspect the architectural specifications.
        </p>

        <div className="feature-cards-grid">
          {/* Card 01: Connect & Scope */}
          <FlipCard
            height={350}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem" }}>01</span>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                    <span>FLIP</span>
                  </span>
                </div>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem", margin: "0 0 0.5rem 0" }}>Connect &amp; Scope</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 1rem 0" }}>
                  Link repositories through fine-grained GitHub App permissions. Repositories initialize in passive,
                  zero-mutation surveillance mode.
                </p>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.72rem" }}>Passive by Default</span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.85rem", margin: 0, letterSpacing: "0.08em" }}>
                    Spec: Passive Scoping
                  </h4>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                  </span>
                </div>
                <ul style={{ fontSize: "0.82rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6, margin: 0 }}>
                  <li>Read-only repository access token expires in 60 mins.</li>
                  <li>Branch protection rules respected unconditionally.</li>
                  <li>Explicit write-grant required before feature branch generation.</li>
                </ul>
              </div>
            }
          />

          {/* Card 02: Survey & Plan */}
          <FlipCard
            height={350}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem" }}>02</span>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                    <span>FLIP</span>
                  </span>
                </div>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem", margin: "0 0 0.5rem 0" }}>Survey &amp; Plan</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 1rem 0" }}>
                  Autonomous static analysis maps code density and projects AST nodes onto the 2.5D elevation grid,
                  identifying high-risk vulnerability peaks.
                </p>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.72rem" }}>AST Topography</span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.85rem", margin: 0, letterSpacing: "0.08em" }}>
                    Spec: Cartographic Planning
                  </h4>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                  </span>
                </div>
                <ul style={{ fontSize: "0.82rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6, margin: 0 }}>
                  <li>Deterministic AST parsing via Babel and TypeScript compiler API.</li>
                  <li>Multi-file dependency graph mapping with circular loop detection.</li>
                  <li>Risk elevation assigned from CVSS scores and git churn metrics.</li>
                </ul>
              </div>
            }
          />

          {/* Card 03: Sandbox Verification */}
          <FlipCard
            height={350}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem" }}>03</span>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                    <span>FLIP</span>
                  </span>
                </div>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem", margin: "0 0 0.5rem 0" }}>Sandbox Verification</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 1rem 0" }}>
                  Patches synthesize and test inside single-tenant ephemeral Linux sandboxes. Broken tests cause immediate
                  remediation rejection.
                </p>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.72rem" }}>Zero Contamination</span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.85rem", margin: 0, letterSpacing: "0.08em" }}>
                    Spec: Sandbox Isolation
                  </h4>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                  </span>
                </div>
                <ul style={{ fontSize: "0.82rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6, margin: 0 }}>
                  <li>Volatile memory sandboxes with strict command allowlists.</li>
                  <li>Network egress locked down during test suite execution.</li>
                  <li>Complete filesystem destruction upon triage termination.</li>
                </ul>
              </div>
            }
          />

          {/* Card 04: Human Authority */}
          <FlipCard
            height={350}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem" }}>04</span>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                    <span>FLIP</span>
                  </span>
                </div>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem", margin: "0 0 0.5rem 0" }}>Human Authority</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 1rem 0" }}>
                  UATU never merges code autonomously. Verified fixes are submitted as draft Pull Requests with telemetry
                  logs for your team to review.
                </p>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.72rem" }}>Draft Pull Request</span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.5rem", background: "var(--ink-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.85rem", margin: 0, letterSpacing: "0.08em" }}>
                    Spec: Total Human Control
                  </h4>
                  <span className="card-flip-indicator" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                      <path d="m16 3 4 4-4 4" />
                      <path d="M20 7H9a4 4 0 0 0-4 4v1" />
                      <path d="m8 21-4-4 4-4" />
                      <path d="M4 17h11a4 4 0 0 0 4-4v-1" />
                    </svg>
                  </span>
                </div>
                <ul style={{ fontSize: "0.82rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6, margin: 0 }}>
                  <li>Feature branches prefixed with uatu/ for instant identification.</li>
                  <li>Complete diff preview with unit test coverage report.</li>
                  <li>One-click accept, modify, or reject via GitHub PR UI.</li>
                </ul>
              </div>
            }
          />
        </div>
      </section>

      {/* Foundation Intelligence Section */}
      <section className="landing-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span className="utopia-hash-badge">[ 03 // Foundation Intelligence ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", letterSpacing: "0.1em", color: "var(--paper-dim)" }}>
            Multi-Model Complexity Router
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          Powered by Enterprise Foundation AI
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "var(--text-base)", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          The autonomous Smart Complexity Router dispatches tasks to the optimal foundation model based on problem complexity,
          optimizing for cost, speed, and deep reasoning accuracy.
        </p>

        <div className="models-showcase-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "var(--ink-surface)" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              Flagship Synthesis
            </span>
            <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.2rem" }}>Amazon Nova 2 Omni</h3>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6 }}>
              Next-generation high-capacity reasoning model for deep root-cause isolation and unified diff generation across complex repos.
            </p>
            <div className="model-metrics" style={{ borderTop: "1px solid var(--ink-line)", paddingTop: "0.75rem", marginTop: "1rem" }}>
              <span className="metric-pill"><span className="metric-key">TPM:</span> 8M</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 20</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">TIER:</span> Flagship</span>
            </div>
          </div>

          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "var(--ink-surface)" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              Deep Logic
            </span>
            <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.2rem" }}>Claude 3.5 Sonnet v2</h3>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6 }}>
              Industry benchmark for intricate functional code logic, complex dependency graphs, and nuanced edge-case bug fixes.
            </p>
            <div className="model-metrics" style={{ borderTop: "1px solid var(--ink-line)", paddingTop: "0.75rem", marginTop: "1rem" }}>
              <span className="metric-pill"><span className="metric-key">TPM:</span> 800K</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 1</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">TIER:</span> Flagship</span>
            </div>
          </div>

          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "var(--ink-surface)" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              High Throughput
            </span>
            <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.2rem" }}>Amazon Nova Micro</h3>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6 }}>
              Ultra-low latency inference for rapid AST classification, issue webhook triage, and continuous next-action planning.
            </p>
            <div className="model-metrics" style={{ borderTop: "1px solid var(--ink-line)", paddingTop: "0.75rem", marginTop: "1rem" }}>
              <span className="metric-pill"><span className="metric-key">TPM:</span> 400K</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">RPM:</span> 20</span>
              <span className="metric-divider" aria-hidden="true">|</span>
              <span className="metric-pill"><span className="metric-key">TIER:</span> Fast</span>
            </div>
          </div>
        </div>
      </section>

      {/* Security Guarantees */}
      <section className="landing-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span className="utopia-hash-badge">[ 04 // Security Guarantees ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", letterSpacing: "0.1em", color: "var(--paper-dim)" }}>
            Cryptographic Boundaries
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          Engineered for Absolute Trust
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "var(--text-base)", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          Your code is confidential and strictly protected by ephemeral memory sandboxes and enterprise AWS Bedrock boundaries.
        </p>

        <div className="trust-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "var(--ink-surface)" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Zero Model Training
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              Your proprietary code and commit diffs are never stored, logged, or used to train or fine-tune public foundation models.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "var(--ink-surface)" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Zero Auto-Merge
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              UATU never requests merge permissions. All changes are submitted as reviewable draft pull requests for human sign-off.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "var(--ink-surface)" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Ephemeral Sandboxes
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              All tests and patch verifications run inside temporary single-tenant directories destroyed immediately upon task termination.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "var(--ink-surface)" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Tenant Cryptographic Partitioning
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              Repository memories, capability grants, and audit logs are partitioned strictly by your authenticated GitHub User ID.
            </p>
          </div>
        </div>
      </section>

      {/* Telemetry Footer with Ocular Monolith Seal */}
      <footer className="landing-foot" style={{ borderTop: "1px solid var(--ink-line)", padding: "2.5rem 1.5rem", maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1.5rem" }}>
        <BrandLockup size="md" variant="tagline" />

        <div className="utopia-hash-scale" style={{ display: "flex", alignItems: "center" }}>
          <span className="utopia-hash-tick active" />
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-badge">System: Online</span>
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-tick active" />
        </div>

        <div className="landing-foot-nav" style={{ display: "flex", gap: "1.25rem", fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
          <button type="button" onClick={() => navigate("/docs")} style={{ background: "none", border: "none", color: "var(--paper-dim)", cursor: "pointer" }}>
            Documentation ↗
          </button>
          <button type="button" onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", color: "var(--paper-dim)", cursor: "pointer" }}>
            Privacy Policy ↗
          </button>
          <a
            href="https://github.com/Erebuzzz/Universal-Autonomous-Triage-and-Upkeep"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--paper-dim)", textDecoration: "none" }}
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

export default Landing;
