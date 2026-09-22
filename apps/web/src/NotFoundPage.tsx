import { useMemo } from "react";
import type { BrainMap } from "./api";
import { BrainMapView } from "./BrainMapView";
import { BrandLockup } from "./BrandLockup";
import { currentPath, navigate } from "./path";
import { ThemeToggle } from "./ThemeToggle";

export function NotFoundPage({ onGoHome }: { onGoHome?: () => void }) {
  const path = currentPath();

  // Severed skeletal repository graph for the 404 state
  const severedBrain: BrainMap = useMemo(
    () => ({
      nodes: [
        { id: "root", kind: "Organization", label: "repo-root", status: "ACTIVE", confidence: 1 },
        { id: "spine", kind: "Repository", label: "main-branch", status: "ACTIVE", confidence: 0.95 },
        { id: "err-404", kind: "Bug", label: "SYNAPSE_NOT_FOUND", status: "ACTIVE", confidence: 0.404 },
        { id: "lost-path", kind: "Issue", label: path.slice(0, 24) || "unknown-node", status: "ACTIVE", confidence: 0.1 },
        { id: "drift-neuron-1", kind: "Hypothesis", label: "orphan-memory", status: "ACTIVE", confidence: 0.2 },
        { id: "drift-neuron-2", kind: "SecurityFinding", label: "unmapped-sector", status: "ACTIVE", confidence: 0.3 },
      ],
      edges: [
        { id: "e1", from: "root", to: "spine", kind: "CONTAINS", confidence: 0.95 },
        { id: "e2", from: "spine", to: "err-404", kind: "AFFECTS", confidence: 0.404 },
        { id: "e3", from: "err-404", to: "lost-path", kind: "AFFECTS", confidence: 0.2 },
        { id: "e4", from: "err-404", to: "drift-neuron-1", kind: "CONTRADICTS", confidence: 0.1 },
        { id: "e5", from: "spine", to: "drift-neuron-2", kind: "AFFECTS", confidence: 0.3 },
      ],
      activatedIds: ["err-404", "lost-path"],
    }),
    [path],
  );

  const handleHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="void-page">
      <div className="landing-atmosphere" aria-hidden>
        <div className="utopia-matrix-grid" />
        <div className="utopia-meridian-lines" />
        <div className="utopia-starlight-glow" />
      </div>

      <div className="void-card utopia-hud-frame" style={{ padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <BrandLockup size="sm" showTag={false} href="/" />
            <span className="utopia-hash-badge">
              ● SYNAPTIC DISCONNECTION // ERROR_404
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--paper-dim)" }}>
              SECTOR: UNMAPPED_COORDINATE
            </span>
            <ThemeToggle />
          </div>
        </div>

        <h1 className="void-heading" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>Neural Synapse Not Found</h1>

        <p style={{ color: "var(--paper-dim)", margin: 0, fontSize: "0.95rem", lineHeight: 1.55 }}>
          The requested coordinate <code style={{ color: "var(--signal-ember)", background: "rgba(255, 59, 0, 0.1)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>{path}</code> does not exist within the living repository cartography. The synaptic pathway is severed.
        </p>

        {/* Embedded Severed Topographic Graph */}
        <div style={{ overflow: "hidden", border: "1px solid var(--ink-line)" }}>
          <BrainMapView brain={severedBrain} height={380} />
        </div>

        <div className="void-code">
          <div>[KERNEL TELEMETRY]</div>
          <div>ERROR: 404_SYNAPTIC_VOID</div>
          <div>TARGET: {path}</div>
          <div>STATE: Repository spine intact · Synapse reference unresolvable</div>
          <div>RECOMMENDATION: Reroute execution to authenticated brain root</div>
        </div>

        <div className="void-actions" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button type="button" className="btn-utopia" onClick={handleHome}>
            &gt;_RECONNECT_REPOSITORY_ROOT
          </button>
          <button type="button" className="btn-utopia btn-utopia-ghost" onClick={() => navigate("/docs")}>
            &gt;_USER_DOCUMENTATION
          </button>
        </div>
      </div>
    </div>
  );
}
