import type { AuditEvent } from "./api";
import { auditDecisionSource, simplifyModelName } from "./api";

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return <div className="empty">Events appear as the supervisor transitions state.</div>;
  }

  return (
    <ul className="audit-stream">
      {[...events].reverse().map((e) => {
        const source = auditDecisionSource(e);
        const mode =
          typeof e.metadata?.detection_mode_used === "string"
            ? String(e.metadata.detection_mode_used)
            : null;
        const modelUsed =
          typeof e.metadata?.modelUsed === "string" ? String(e.metadata.modelUsed) : null;
        const modelTier =
          typeof e.metadata?.modelTier === "string" ? String(e.metadata.modelTier) : null;

        return (
          <li key={e.id} className="audit-item">
            <div className="audit-time">{new Date(e.at).toLocaleTimeString()}</div>
            <div>
              <div className="audit-action-row">
                <span className="audit-action">
                  {e.actor} · {e.action}
                  {e.fromState && e.toState ? ` · ${e.fromState} → ${e.toState}` : ""}
                </span>
                {source ? (
                  <span
                    className={`source-tag source-${source}`}
                    title={
                      source === "bedrock"
                        ? `Decision used Amazon Bedrock${modelUsed ? `: ${modelUsed}` : ""}`
                        : source === "rules"
                          ? "Deterministic rules path"
                          : `Detection mode: ${mode ?? "unknown"}`
                    }
                  >
                    {source === "detection" && mode ? mode : source}
                  </span>
                ) : null}
                {modelUsed ? (
                  <span
                    className="source-tag"
                    style={{
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "#a5b4fc",
                      borderColor: "rgba(99, 102, 241, 0.3)",
                    }}
                    title={`Model: ${modelUsed}${modelTier ? ` (${modelTier} tier)` : ""}`}
                  >
                    {simplifyModelName(modelUsed)}
                  </span>
                ) : null}
              </div>
              <div>{e.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
