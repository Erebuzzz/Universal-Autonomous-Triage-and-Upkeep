import type { BrainMap } from "./api";

export function BrainMapView({ brain }: { brain: BrainMap }) {
  const activated = new Set(brain.activatedIds);
  const byId = new Map(brain.nodes.map((n) => [n.id, n]));

  // Prefer File / Dependency / Bug / SecurityFinding for readability
  const visible = brain.nodes
    .filter((n) =>
      ["Repository", "File", "Dependency", "Bug", "SecurityFinding", "Test", "Patch", "Hypothesis", "Observation"].includes(
        n.kind,
      ),
    )
    .slice(0, 36);

  const visibleIds = new Set(visible.map((n) => n.id));

  return (
    <div className="brain-map" role="img" aria-label="Repository neural map">
      <svg viewBox="0 0 420 280" preserveAspectRatio="xMidYMid meet">
        {brain.edges
          .filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
          .slice(0, 60)
          .map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const hot = activated.has(e.from) || activated.has(e.to);
            return (
              <line
                key={e.id}
                className={`synapse ${hot ? "hot" : ""}`}
                x1={a.x ?? 0}
                y1={a.y ?? 0}
                x2={b.x ?? 0}
                y2={b.y ?? 0}
              />
            );
          })}
        {visible.map((n) => (
          <g key={n.id}>
            <circle
              className={`neuron-node ${activated.has(n.id) ? "activated" : ""}`}
              cx={n.x ?? 0}
              cy={n.y ?? 0}
              r={activated.has(n.id) ? 7 : 5}
            />
            <text className="neuron-label" x={(n.x ?? 0) + 8} y={(n.y ?? 0) + 3}>
              {n.label.length > 22 ? `${n.label.slice(0, 20)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
