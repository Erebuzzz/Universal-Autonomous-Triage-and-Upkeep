import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { BrainMap } from "./api";
import { sound } from "./SoundEngine";

export type BrainNode = BrainMap["nodes"][number];
export type BrainEdge = BrainMap["edges"][number];

interface Props {
  brain: BrainMap;
  onSelectNode?: (nodeId: string | null) => void;
  selectedId?: string | null;
  height?: number | string;
}

interface MapCoordinate {
  id: string;
  x: number;
  y: number;
  elevation: number; // in meters (0 to 2400)
  tier: "SUMMIT" | "RIDGE" | "PLATEAU" | "VALLEY";
  node: BrainNode;
}

export const TIER_COLORS = {
  SUMMIT: "#ff3b00", // Surgical Ember
  RIDGE: "#f5f5f7", // Stark Alabaster
  PLATEAU: "#8e8e96", // Titanium Slate
  VALLEY: "#3a3a44", // Deep Valley
} as const;

export function BrainMapView({
  brain,
  onSelectNode,
  selectedId: controlledSelectedId,
  height = 560,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform: Pan (x, y) and Zoom (k)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const transformStart = useRef({ x: 0, y: 0 });

  // Selected node state
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  // Active hover node
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);

  // Drone Crosshair coordinate tracking
  const [crosshairPos, setCrosshairPos] = useState({ x: 600, y: 350 });

  // Filter tier visibility
  const [filterTier, setFilterTier] = useState<string>("ALL");

  // Determine Elevation Tier for nodes
  const coordinates = useMemo<MapCoordinate[]>(() => {
    if (!brain.nodes.length) return [];

    const width = 1200;
    const heightBound = 720;
    const centerX = width / 2;
    const centerY = heightBound / 2;

    return brain.nodes.map((node, index) => {
      let tier: MapCoordinate["tier"] = "VALLEY";
      let elevation = 200;

      if (node.kind === "Bug" || node.kind === "SecurityFinding" || node.kind === "Issue") {
        tier = "SUMMIT";
        elevation = 2200 + ((index * 37) % 200);
      } else if (node.kind === "File" || node.kind === "Patch" || node.kind === "VerificationResult") {
        tier = "RIDGE";
        elevation = 1500 + ((index * 41) % 250);
      } else if (node.kind === "Directory" || node.kind === "Hypothesis" || node.kind === "Observation") {
        tier = "PLATEAU";
        elevation = 850 + ((index * 29) % 200);
      } else {
        tier = "VALLEY";
        elevation = 150 + ((index * 19) % 150);
      }

      // Deterministic cartographic layout algorithm based on node ID hash
      let hash = 0;
      for (let i = 0; i < node.id.length; i++) {
        hash = (hash << 5) - hash + node.id.charCodeAt(i);
        hash |= 0;
      }
      const angle = (Math.abs(hash) % 360) * (Math.PI / 180);

      // Distance from center inversely proportional to elevation (summits cluster near active center ridges)
      let radius = 240;
      if (tier === "SUMMIT") {
        radius = 80 + (Math.abs(hash >> 2) % 120);
      } else if (tier === "RIDGE") {
        radius = 180 + (Math.abs(hash >> 3) % 160);
      } else if (tier === "PLATEAU") {
        radius = 290 + (Math.abs(hash >> 4) % 150);
      } else {
        radius = 420 + (Math.abs(hash >> 5) % 160);
      }

      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * (radius * 0.72));

      return {
        id: node.id,
        x,
        y,
        elevation,
        tier,
        node,
      };
    });
  }, [brain.nodes]);

  // Coordinate lookup table
  const coordMap = useMemo(() => {
    const map = new Map<string, MapCoordinate>();
    for (const c of coordinates) {
      map.set(c.id, c);
    }
    return map;
  }, [coordinates]);

  // Selected coordinate
  const selectedCoord = useMemo(() => {
    return selectedId ? coordMap.get(selectedId) ?? null : null;
  }, [selectedId, coordMap]);

  // Sync crosshair with selected node
  useEffect(() => {
    if (selectedCoord) {
      setCrosshairPos({ x: selectedCoord.x, y: selectedCoord.y });
    }
  }, [selectedCoord]);

  // Topographic Contour Lines generation (rings around summit & ridge clusters)
  const contourPaths = useMemo(() => {
    if (!coordinates.length) return [];

    const summits = coordinates.filter((c) => c.tier === "SUMMIT");
    const ridges = coordinates.filter((c) => c.tier === "RIDGE");

    const paths: { d: string; elevation: string; color: string; dash?: string }[] = [];

    // Outer Valley Boundary Contour
    paths.push({
      d: "M 120 360 C 120 160, 400 80, 600 80 C 800 80, 1080 160, 1080 360 C 1080 560, 800 640, 600 640 C 400 640, 120 560, 120 360 Z",
      elevation: "+400m",
      color: "rgba(255, 255, 255, 0.08)",
      dash: "4 6",
    });

    // Plateau Mid-Elevation Contour
    paths.push({
      d: "M 240 360 C 240 220, 440 160, 600 160 C 760 160, 960 220, 960 360 C 960 500, 760 560, 600 560 C 440 560, 240 500, 240 360 Z",
      elevation: "+800m",
      color: "rgba(255, 255, 255, 0.12)",
    });

    // High Ridge Contours
    ridges.forEach((r, idx) => {
      const rx = 80 + (idx % 3) * 20;
      const ry = 55 + (idx % 3) * 15;
      paths.push({
        d: `M ${r.x - rx} ${r.y} C ${r.x - rx} ${r.y - ry}, ${r.x + rx} ${r.y - ry}, ${r.x + rx} ${r.y} C ${r.x + rx} ${r.y + ry}, ${r.x - rx} ${r.y + ry}, ${r.x - rx} ${r.y} Z`,
        elevation: `+${r.elevation}m`,
        color: "rgba(245, 245, 247, 0.15)",
        dash: "3 3",
      });
    });

    // Summit Peak Contours (Ember High-Risk Peaks)
    summits.forEach((s) => {
      paths.push({
        d: `M ${s.x - 55} ${s.y} C ${s.x - 55} ${s.y - 38}, ${s.x + 55} ${s.y - 38}, ${s.x + 55} ${s.y} C ${s.x + 55} ${s.y + 38}, ${s.x - 55} ${s.y + 38}, ${s.x - 55} ${s.y} Z`,
        elevation: `+${s.elevation}m`,
        color: "rgba(255, 59, 0, 0.4)",
      });
      paths.push({
        d: `M ${s.x - 28} ${s.y} C ${s.x - 28} ${s.y - 18}, ${s.x + 28} ${s.y - 18}, ${s.x + 28} ${s.y} C ${s.x + 28} ${s.y + 18}, ${s.x - 28} ${s.y + 18}, ${s.x - 28} ${s.y} Z`,
        elevation: `+${s.elevation + 100}m`,
        color: "rgba(255, 59, 0, 0.75)",
      });
    });

    return paths;
  }, [coordinates]);

  // Edges filtered
  const visibleEdges = useMemo(() => {
    return brain.edges.filter((e) => coordMap.has(e.from) && coordMap.has(e.to));
  }, [brain.edges, coordMap]);

  // Pan Handlers
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only drag with primary mouse button
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    transformStart.current = { x: transform.x, y: transform.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform((prev) => ({
      ...prev,
      x: transformStart.current.x + dx,
      y: transformStart.current.y + dy,
    }));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Zoom Handlers
  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform((prev) => {
      const nextK = Math.max(0.4, Math.min(3.5, prev.k * factor));
      return { ...prev, k: nextK };
    });
  };

  const zoomIn = () => {
    sound.playTactileClick();
    setTransform((prev) => ({ ...prev, k: Math.min(3.5, prev.k * 1.25) }));
  };

  const zoomOut = () => {
    sound.playTactileClick();
    setTransform((prev) => ({ ...prev, k: Math.max(0.4, prev.k * 0.8) }));
  };

  const resetView = () => {
    sound.playTactileClick();
    setTransform({ x: 0, y: 0, k: 1 });
  };

  // Node Click: Lock-on Drone Reticle & Open Drawer
  const handleNodeClick = (coord: MapCoordinate, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTactileClick();
    setInternalSelectedId(coord.id);
    setCrosshairPos({ x: coord.x, y: coord.y });
    if (onSelectNode) {
      onSelectNode(coord.id);
    }
  };

  // Double-Click Node: Accelerated Fly-In Zoom
  const handleNodeDoubleClick = (coord: MapCoordinate, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playCelestialChime();
    if (transform.k > 1.8) {
      // Zoom back out to full theater
      setTransform({ x: 0, y: 0, k: 1 });
    } else {
      // Fly into node
      const targetK = 2.2;
      const targetX = 600 - coord.x * targetK;
      const targetY = 360 - coord.y * targetK;
      setTransform({ x: targetX, y: targetY, k: targetK });
    }
  };

  // Focus on highest priority summit bug
  const focusSummit = () => {
    const summit = coordinates.find((c) => c.tier === "SUMMIT");
    if (summit) {
      handleNodeDoubleClick(summit, { stopPropagation: () => {} } as React.MouseEvent);
      handleNodeClick(summit, { stopPropagation: () => {} } as React.MouseEvent);
    }
  };

  const filteredCoordinates = useMemo(() => {
    if (filterTier === "ALL") return coordinates;
    return coordinates.filter((c) => c.tier === filterTier);
  }, [coordinates, filterTier]);

  return (
    <div
      ref={containerRef}
      className="topo-container utopia-hud-frame"
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Topographic Telemetry HUD Bar */}
      <div className="topo-hud-telemetry">
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
          <span style={{ color: "var(--signal-ember)", fontWeight: 700 }}>
            ● [ Lat: 35.6762°N // Lon: 139.6503°E ]
          </span>
          <span style={{ color: "var(--paper-dim)" }}>
            Elev:{" "}
            <strong style={{ color: "var(--paper)" }}>
              {selectedCoord ? `+${selectedCoord.elevation}m` : "+1,840m (AVG)"}
            </strong>
          </span>
          <span style={{ color: "var(--paper-muted)" }}>
            Sector: <strong>TOKYO-ALPHA-01</strong>
          </span>
        </div>

        {/* Filter Tier Chips */}
        <div className="topo-filter-group">
          <span className="topo-filter-label">Filter:</span>
          {(["ALL", "SUMMIT", "RIDGE", "PLATEAU", "VALLEY"] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              className={`topo-filter-chip ${filterTier === tier ? "active" : ""}`}
              onClick={() => {
                sound.playTactileClick();
                setFilterTier(tier);
              }}
              aria-pressed={filterTier === tier}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Compass Rose */}
      <div className="topo-compass" title="True North Bearing">
        <span>▲ N</span>
      </div>

      {/* Flight Controls */}
      <div className="topo-flight-controls">
        <button
          type="button"
          className="topo-flight-btn"
          onClick={zoomIn}
          title="Zoom In Altitude"
          aria-label="Zoom In"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className="topo-flight-btn"
          onClick={zoomOut}
          title="Zoom Out Altitude"
          aria-label="Zoom Out"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className="topo-flight-btn"
          onClick={resetView}
          title="Reset Flight View"
          aria-label="Reset View"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button
          type="button"
          className="topo-flight-btn"
          onClick={focusSummit}
          title="Lock-On High Risk Summit"
          aria-label="Focus Summit"
          style={{ color: "var(--signal-ember)" }}
        >
          {/* Custom Precision Translucent SVG Reticle */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.9 }}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.45" />
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
            <line x1="12" y1="1" x2="12" y2="6" stroke="currentColor" strokeWidth="1.4" />
            <line x1="12" y1="18" x2="12" y2="23" stroke="currentColor" strokeWidth="1.4" />
            <line x1="1" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.4" />
            <line x1="18" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Cartographic Scale Bar */}
      <div className="topo-scale-bar">
        <span>|━━━━ 500 LOC ━━━━| Scale: 1:25000</span>
      </div>

      {/* SVG Topographic Navigation Canvas */}
      <svg
        className="topo-canvas"
        viewBox="0 0 1200 720"
        preserveAspectRatio="xMidYMid slice"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          transformOrigin: "50% 50%",
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <defs>
          {/* Subtle Grid Pattern */}
          <pattern id="carto-subgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="40" y2="0" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            <line x1="0" y1="0" x2="0" y2="40" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            <circle cx="20" cy="20" r="0.8" fill="rgba(255, 255, 255, 0.15)" />
          </pattern>

          {/* Summit Ember Glow */}
          <radialGradient id="summit-pulse-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff3b00" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#ff3b00" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ff3b00" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background Cartographic Coordinates Grid */}
        <rect width="1200" height="720" fill="url(#carto-subgrid)" />

        {/* Contour Elevation Curves */}
        <g className="topo-contours">
          {contourPaths.map((contour, idx) => (
            <path
              key={`contour-${idx}`}
              d={contour.d}
              fill="none"
              stroke={contour.color}
              strokeWidth="1.2"
              strokeDasharray={contour.dash}
            />
          ))}
        </g>

        {/* Synaptic Edge Pathways */}
        <g className="topo-edges">
          {visibleEdges.map((edge) => {
            const from = coordMap.get(edge.from);
            const to = coordMap.get(edge.to);
            if (!from || !to) return null;

            const isEdgeSelected = selectedId === from.id || selectedId === to.id;

            return (
              <g key={edge.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isEdgeSelected ? "var(--signal-ember)" : "rgba(255, 255, 255, 0.12)"}
                  strokeWidth={isEdgeSelected ? 1.8 : 1}
                  strokeDasharray={edge.kind === "CONTRADICTS" ? "3 3" : undefined}
                />
                {/* Active Action Potential Pulse on Selected Edge */}
                {isEdgeSelected && (
                  <circle
                    cx={(from.x + to.x) / 2}
                    cy={(from.y + to.y) / 2}
                    r="2.5"
                    fill="var(--signal-ember)"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Waypoint Nodes */}
        <g className="topo-waypoints">
          {filteredCoordinates.map((c) => {
            const isSelected = selectedId === c.id;
            const isHovered = hoverNodeId === c.id;
            const isSummit = c.tier === "SUMMIT";

            return (
              <g
                key={c.id}
                className="topo-waypoint"
                style={{ cursor: "pointer" }}
                onClick={(e) => handleNodeClick(c, e)}
                onDoubleClick={(e) => handleNodeDoubleClick(c, e)}
                onMouseEnter={() => setHoverNodeId(c.id)}
                onMouseLeave={() => setHoverNodeId(null)}
              >
                {/* Summit Pulsing Beacon Glow */}
                {isSummit && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isSelected ? 32 : 22}
                    fill="url(#summit-pulse-glow)"
                    opacity={isSelected ? 1 : 0.6}
                  />
                )}

                {/* Selection Range Ring */}
                {(isSelected || isHovered) && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isSummit ? 18 : 14}
                    fill="none"
                    stroke={isSummit ? "var(--signal-ember)" : "var(--paper)"}
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Core Waypoint Icon by Tier */}
                {isSummit ? (
                  // Summit Beacon (Diamond)
                  <polygon
                    points={`${c.x},${c.y - 8} ${c.x + 8},${c.y} ${c.x},${c.y + 8} ${c.x - 8},${c.y}`}
                    fill="var(--signal-ember)"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                ) : c.tier === "RIDGE" ? (
                  // Ridge Marker (Square)
                  <rect
                    x={c.x - 5}
                    y={c.y - 5}
                    width="10"
                    height="10"
                    fill="var(--ink-surface)"
                    stroke="var(--paper)"
                    strokeWidth="1.4"
                  />
                ) : c.tier === "PLATEAU" ? (
                  // Plateau Marker (Circle with center point)
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="5"
                    fill="var(--ink-surface)"
                    stroke="var(--paper-dim)"
                    strokeWidth="1.2"
                  />
                ) : (
                  // Valley Marker (Concentric Ring)
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="4"
                    fill="var(--ink-surface)"
                    stroke="var(--paper-muted)"
                    strokeWidth="1"
                  />
                )}

                {/* Elevation Label */}
                <text
                  x={c.x + 12}
                  y={c.y + 4}
                  fill={isSummit ? "var(--signal-ember)" : isSelected ? "var(--paper)" : "var(--paper-dim)"}
                  fontFamily="var(--font-mono)"
                  fontSize={isSelected || isSummit ? "10" : "8.5"}
                  fontWeight={isSelected || isSummit ? "700" : "400"}
                  letterSpacing="0.08em"
                  style={{ userSelect: "none" }}
                >
                  {c.node.label.length > 20 ? `${c.node.label.slice(0, 19)}…` : c.node.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Drone GPS Reticle & Crosshair (Locks onto Target Waypoint) */}
        <g
          className="topo-reticle-group"
          style={{
            transform: `translate(${crosshairPos.x}px, ${crosshairPos.y}px)`,
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Outer Crosshair Ring */}
          <circle cx="0" cy="0" r="28" fill="none" stroke="rgba(255, 59, 0, 0.45)" strokeWidth="1" />
          <circle cx="0" cy="0" r="20" fill="none" stroke="var(--signal-ember)" strokeWidth="0.8" strokeDasharray="3 3" />
          {/* Cardinal Ticks */}
          <line x1="-36" y1="0" x2="-22" y2="0" stroke="var(--signal-ember)" strokeWidth="1.2" />
          <line x1="22" y1="0" x2="36" y2="0" stroke="var(--signal-ember)" strokeWidth="1.2" />
          <line x1="0" y1="-36" x2="0" y2="-22" stroke="var(--signal-ember)" strokeWidth="1.2" />
          <line x1="0" y1="22" x2="0" y2="36" stroke="var(--signal-ember)" strokeWidth="1.2" />
          {/* Center Target Point */}
          <circle cx="0" cy="0" r="1.5" fill="var(--signal-ember)" />
        </g>
      </svg>

      {/* Cartographic Waypoint Survey Drawer (When Node is Selected) */}
      {selectedCoord && (
        <div className="topo-survey-drawer">
          <div className="topo-survey-header">
            <span className="topo-survey-title">{selectedCoord.node.label}</span>
            <span
              className="topo-survey-tier"
              style={{
                background: selectedCoord.tier === "SUMMIT" ? "rgba(255, 59, 0, 0.2)" : "rgba(255, 255, 255, 0.1)",
                color: selectedCoord.tier === "SUMMIT" ? "var(--signal-ember)" : "var(--paper)",
                borderColor: selectedCoord.tier === "SUMMIT" ? "var(--signal-ember)" : "var(--paper-dim)",
              }}
            >
              {selectedCoord.tier} · +{selectedCoord.elevation}m
            </span>
          </div>

          <div style={{ fontSize: "var(--text-2xs)", color: "var(--paper-dim)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
            <div>
              Coordinates: <span style={{ color: "var(--paper)" }}>X: {selectedCoord.x} · Y: {selectedCoord.y}</span>
            </div>
            <div>
              Classification: <span style={{ color: "var(--signal-ember)", fontWeight: 700 }}>{selectedCoord.node.kind}</span>
            </div>
            <div>
              Confidence:{" "}
              <span style={{ color: "var(--paper)" }}>{Math.round((selectedCoord.node.confidence ?? 1) * 100)}%</span>
            </div>
            <div>
              Status: <span style={{ color: "var(--pass)" }}>{selectedCoord.node.status ?? "Active"}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleNodeDoubleClick(selectedCoord, { stopPropagation: () => {} } as React.MouseEvent)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                background: "var(--signal-ember)",
                color: "#ffffff",
                fontWeight: 700,
                flex: 1,
                cursor: "pointer",
                border: "none",
                padding: "0.4rem",
              }}
            >
              Zoom to Coordinate
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                sound.playTactileClick();
                setInternalSelectedId(null);
                if (onSelectNode) onSelectNode(null);
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                color: "var(--paper-dim)",
                border: "1px solid var(--ink-line)",
                cursor: "pointer",
                padding: "0.4rem 0.6rem",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrainMapView;
