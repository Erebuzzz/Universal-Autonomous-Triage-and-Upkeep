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
          <span>SECTOR: GLOBAL_OBSERVATION</span>
          <span className="utopia-telemetry-coords">
            STATUS: SURVEILLANCE_ACTIVE
          </span>
          <span>VERSION: 2.4.0-RC.1</span>
        </div>
      </div>

      {/* Primary Navigation */}
      <header className="landing-nav">
        <BrandLockup size="lg" />

        <nav style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginLeft: "auto", flexWrap: "wrap" }}>
          <a href="#how-it-works" className="landing-nav-link">
            [ 01 // LIFECYCLE ]
          </a>
          <a href="#cartography" className="landing-nav-link">
            [ 02 // CARTOGRAPHY ]
          </a>
          <a
            href="/docs"
            className="landing-nav-link"
            onClick={(e) => {
              e.preventDefault();
              navigate("/docs");
            }}
          >
            [ 03 // DOCS ]
          </a>
          <button
            type="button"
            className="landing-nav-link landing-nav-btn"
            onClick={() => setShowPrivacy(true)}
          >
            [ 04 // PRIVACY ]
          </button>
          <AudioToggle />
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero Chamber */}
      <main className="landing-hero" style={{ padding: "2rem 1.5rem 4rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          
          {/* Top Row: Monumental Typography & Narrative Briefing */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem", alignItems: "center" }}>
            
            {/* Left Column: Monumental Stencil & Punch Triplet */}
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--signal-ember)", marginBottom: "0.75rem" }}>
                [ COSMIC AUTONOMOUS UPKEEP RUNTIME ]
              </div>

              <h1 className="utopia-monumental-title">
                <span className="utopia-title-solid">UATU</span>
                <span className="utopia-title-outline">WATCHER</span>
              </h1>

              {/* Brutalist Punch Triplet with Square Red Dots */}
              <div className="utopia-punch-triplet" style={{ margin: "1.25rem 0" }}>
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

              {/* Corner-Bracketed Action Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginTop: "1.75rem" }}>
                {canOAuth ? (
                  <a
                    href={api.githubLoginUrl()}
                    onClick={() => sound.playCelestialChime()}
                    className="btn-utopia"
                  >
                    &gt;_EXECUTE_TRIAGE
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playCelestialChime();
                      onMockSignIn();
                    }}
                    className="btn-utopia"
                    disabled={busy}
                  >
                    &gt;_{flags.mockAuth ? "MOCK_SESSION" : "EXECUTE_DEMO"}
                  </button>
                )}

                <button
                  type="button"
                  className="btn-utopia btn-utopia-ghost"
                  onClick={onLocalDemo}
                  disabled={busy}
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
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--signal-ember)", marginTop: "1rem" }} role="status">
                  [!] API STATUS: {healthError} · LOCAL FIXTURE FULLY OPERATIONAL
                </p>
              )}
            </div>

            {/* Right Column: Mission Briefing & Real-time Ingestion Pipeline */}
            <div className="utopia-hud-frame" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--ink-line)", paddingBottom: "0.6rem", marginBottom: "1rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--signal-ember)", fontWeight: 700, letterSpacing: "0.14em" }}>
                  [ MISSION BRIEFING // THESIS ]
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--paper-dim)" }}>
                  LATENCY: &lt;42ms
                </span>
              </div>

              <p style={{ fontFamily: "var(--font-sans)", color: "var(--paper-dim)", fontSize: "0.95rem", lineHeight: 1.65, margin: "0 0 1.25rem 0" }}>
                A silent watcher observing the multiverse of code. UATU continuously maps repository entropy,
                projects architectural files onto an interactive 2.5D topographic elevation grid, targets high-risk
                summit bugs and CVE advisories, and synthesizes minimal, verified pull requests without human prompting.
              </p>

              {/* Mini Simulation Pipeline */}
              <div style={{ background: "rgba(0, 0, 0, 0.7)", border: "1px solid var(--ink-line)", padding: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--paper)", fontWeight: 700 }}>
                    ACTIVE TELEMETRY STREAM
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <LatticeLoader status={isPaused ? "done" : "working"} pattern="orbit" grid={3} color="#ff3b00" />
                    <button
                      type="button"
                      onClick={() => setIsPaused((p) => !p)}
                      style={{ background: "none", border: "none", color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontSize: "0.65rem", cursor: "pointer" }}
                    >
                      [{isPaused ? "RESUME" : "PAUSE"}]
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {TELEMETRY_STEPS.map((step, i) => (
                    <div
                      key={step.idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.68rem",
                        color: i === activeStep ? "var(--paper)" : "var(--paper-muted)",
                        background: i === activeStep ? "rgba(255, 59, 0, 0.12)" : "transparent",
                        padding: "0.25rem 0.4rem",
                        borderLeft: i === activeStep ? "2px solid var(--signal-ember)" : "2px solid transparent",
                      }}
                    >
                      <span style={{ color: "var(--signal-ember)", fontWeight: 700 }}>{step.idx}</span>
                      <span style={{ fontWeight: 700 }}>{step.name}</span>
                      <span style={{ marginLeft: "auto", color: "var(--paper-dim)" }}>{step.model}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Centerpiece: Interactive Topographic Elevation Grid Navigation Map */}
          <div id="cartography">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span className="utopia-hash-badge">[ II // SPATIAL CARTOGRAPHY ]</span>
                <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", margin: 0, letterSpacing: "0.08em", color: "var(--paper)" }}>
                  TOPOGRAPHIC REPOSITORY ELEVATION MAP
                </h2>
              </div>
              <div className="utopia-hash-scale">
                <span className="utopia-hash-tick active" />
                <span className="utopia-hash-tick" />
                <span className="utopia-hash-tick" />
                <span className="utopia-hash-badge">SECTOR: 01-ALPHA</span>
                <span className="utopia-hash-tick" />
                <span className="utopia-hash-tick" />
                <span className="utopia-hash-tick active" />
              </div>
            </div>

            {/* Embedded Live Topographic Navigation Map */}
            <BrainMapView brain={demoBrain} height={540} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--paper-dim)", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>
                TIP: DRAG TO PAN · MOUSE WHEEL TO ADJUST ALTITUDE · DOUBLE-CLICK WAYPOINT FOR ACCELERATED FLY-IN
              </span>
              <span style={{ color: "var(--signal-ember)" }}>
                ● 14 SURVEY WAYPOINTS ACTIVE · 1 CRITICAL SUMMIT ISOLATED
              </span>
            </div>
          </div>

        </div>
      </main>

      {/* How It Works Section with 3D Glowing FlipCards */}
      <section id="how-it-works" className="landing-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span className="utopia-hash-badge">[ I // UPKEEP LIFECYCLE ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.14em", color: "var(--paper-dim)" }}>
            DISCIPLINED REPOSITORY HEALTH PROTOCOL
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          HOW UATU KEEPS CODEBASES HEALTHY
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          Every upkeep run executes in an isolated sandbox. Zero code is modified without a passing verification test suite.
          Click or tilt any card to inspect the architectural specifications.
        </p>

        <div className="feature-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#060608" }}>
                <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>01</span>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem" }}>Connect &amp; Scope</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem" }}>
                  Link repositories through fine-grained GitHub App permissions. Repositories initialize in passive,
                  zero-mutation surveillance mode.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.62rem" }}>PASSIVE BY DEFAULT</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--signal-ember)" }}>
                    CLICK TO FLIP ↻
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#0c0c10" }}>
                <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.9rem", margin: "0 0 0.5rem 0" }}>
                  SPEC // PASSIVE SCOPING
                </h4>
                <ul style={{ fontSize: "0.78rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                  <li>Read-only repository access token expires in 60 mins.</li>
                  <li>Branch protection rules respected unconditionally.</li>
                  <li>Explicit write-grant required before feature branch generation.</li>
                </ul>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#060608" }}>
                <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>02</span>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem" }}>Survey &amp; Plan</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem" }}>
                  Autonomous static analysis maps code density and projects AST nodes onto the 2.5D elevation grid,
                  identifying high-risk vulnerability peaks.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.62rem" }}>AST TOPOGRAPHY</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--signal-ember)" }}>
                    CLICK TO FLIP ↻
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#0c0c10" }}>
                <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.9rem", margin: "0 0 0.5rem 0" }}>
                  SPEC // CARTOGRAPHIC PLANNING
                </h4>
                <ul style={{ fontSize: "0.78rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                  <li>Deterministic AST parsing via Babel and TypeScript compiler API.</li>
                  <li>Multi-file dependency graph mapping with circular loop detection.</li>
                  <li>Risk elevation assigned from CVSS scores and git churn metrics.</li>
                </ul>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#060608" }}>
                <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>03</span>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem" }}>Sandbox Verification</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem" }}>
                  Patches synthesize and test inside single-tenant ephemeral Linux sandboxes. Broken tests cause immediate
                  remediation rejection.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.62rem" }}>ZERO CONTAMINATION</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--signal-ember)" }}>
                    CLICK TO FLIP ↻
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#0c0c10" }}>
                <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.9rem", margin: "0 0 0.5rem 0" }}>
                  SPEC // SANDBOX ISOLATION
                </h4>
                <ul style={{ fontSize: "0.78rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                  <li>Volatile memory sandboxes with strict command allowlists.</li>
                  <li>Network egress locked down during test suite execution.</li>
                  <li>Complete filesystem destruction upon triage termination.</li>
                </ul>
              </div>
            }
          />

          <FlipCard
            height={310}
            tilt={true}
            glare={true}
            glareOpacity={0.2}
            radius={8}
            front={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#060608" }}>
                <span className="feature-idx" style={{ color: "var(--signal-ember)", fontFamily: "var(--font-mono)", fontWeight: 800 }}>04</span>
                <h3 style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", fontSize: "1.1rem" }}>Human Authority</h3>
                <p style={{ color: "var(--paper-dim)", fontSize: "0.88rem" }}>
                  UATU never merges code autonomously. Verified fixes are submitted as draft Pull Requests with telemetry
                  logs for your team to review.
                </p>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="utopia-hash-badge" style={{ fontSize: "0.62rem" }}>DRAFT PULL REQUEST</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--signal-ember)" }}>
                    CLICK TO FLIP ↻
                  </span>
                </div>
              </div>
            }
            back={
              <div className="feature-card utopia-hud-frame" style={{ height: "100%", margin: 0, padding: "1.25rem", background: "#0c0c10" }}>
                <h4 style={{ fontFamily: "var(--font-mono)", color: "var(--signal-ember)", fontSize: "0.9rem", margin: "0 0 0.5rem 0" }}>
                  SPEC // TOTAL HUMAN CONTROL
                </h4>
                <ul style={{ fontSize: "0.78rem", color: "var(--paper-dim)", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
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
          <span className="utopia-hash-badge">[ III // FOUNDATION INTELLIGENCE ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.14em", color: "var(--paper-dim)" }}>
            MULTI-MODEL COMPLEXITY ROUTER
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          POWERED BY ENTERPRISE FOUNDATION AI
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          The autonomous Smart Complexity Router dispatches tasks to the optimal foundation model based on problem complexity,
          optimizing for cost, speed, and deep reasoning accuracy.
        </p>

        <div className="models-showcase-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "#060608" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              FLAGSHIP SYNTHESIS
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

          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "#060608" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              DEEP LOGIC
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

          <div className="model-showcase-card utopia-hud-frame" style={{ padding: "1.5rem", background: "#060608" }}>
            <span className="utopia-hash-badge" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
              HIGH THROUGHPUT
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
          <span className="utopia-hash-badge">[ IV // SECURITY GUARANTEES ]</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.14em", color: "var(--paper-dim)" }}>
            CRYPTOGRAPHIC BOUNDARIES
          </span>
        </div>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.4rem)", fontWeight: 800, color: "var(--paper)", margin: "0 0 0.75rem 0", letterSpacing: "0.06em" }}>
          ENGINEERED FOR ABSOLUTE TRUST
        </h2>
        <p style={{ color: "var(--paper-dim)", maxWidth: 780, fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 2rem 0" }}>
          Your code is confidential and strictly protected by ephemeral memory sandboxes and enterprise AWS Bedrock boundaries.
        </p>

        <div className="trust-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "#060608" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Zero Model Training
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              Your proprietary code and commit diffs are never stored, logged, or used to train or fine-tune public foundation models.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "#060608" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Zero Auto-Merge
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              UATU never requests merge permissions. All changes are submitted as reviewable draft pull requests for human sign-off.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "#060608" }}>
            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--paper)", display: "block", marginBottom: "0.4rem" }}>
              Ephemeral Sandboxes
            </strong>
            <p style={{ color: "var(--paper-dim)", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
              All tests and patch verifications run inside temporary single-tenant directories destroyed immediately upon task termination.
            </p>
          </div>

          <div className="trust-card utopia-hud-frame" style={{ padding: "1.25rem", background: "#060608" }}>
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
          <span className="utopia-hash-badge">SYSTEM: ONLINE</span>
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-tick" />
          <span className="utopia-hash-tick active" />
        </div>

        <div className="landing-foot-nav" style={{ display: "flex", gap: "1.25rem", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
          <button type="button" onClick={() => navigate("/docs")} style={{ background: "none", border: "none", color: "var(--paper-dim)", cursor: "pointer" }}>
            DOCUMENTATION ↗
          </button>
          <button type="button" onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", color: "var(--paper-dim)", cursor: "pointer" }}>
            PRIVACY POLICY ↗
          </button>
          <a
            href="https://github.com/Erebuzzz/Universal-Autonomous-Triage-and-Upkeep"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--paper-dim)", textDecoration: "none" }}
          >
            GITHUB REPOSITORY ↗
          </a>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}

export default Landing;
