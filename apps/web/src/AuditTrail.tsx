import type { AuditEvent } from "./api";
import { auditDecisionSource } from "./api";

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
                        ? "Decision used Amazon Bedrock"
                        : source === "rules"
                          ? "Deterministic rules path"
                          : `Detection mode: ${mode ?? "unknown"}`
                    }
                  >
                    {source === "detection" && mode ? mode : source}
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
