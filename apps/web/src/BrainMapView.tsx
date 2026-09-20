import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { BrainMap } from "./api";

type BrainNode = BrainMap["nodes"][number];
type BrainEdge = BrainMap["edges"][number];

type Pt = { x: number; y: number };

type ViewTransform = { x: number; y: number; k: number };

type LayoutTree = {
  id: string;
  node: BrainNode;
  children: LayoutTree[];
  depth: number;
  /** leaf-slot coordinate before scaling */
  slot: number;
};

const MAX_NODES = 80;
const MAX_EDGES = 120;
const VIEW_W = 720;
const VIEW_H = 460;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.8;
const PAD_X = 36;
const PAD_Y = 28;
const DEPTH_GAP = 118;
const SLOT_GAP = 22;

const STRUCTURAL = new Set(["Organization", "Repository", "Directory", "File"]);

const KIND_STROKE: Record<string, string> = {
  Organization: "#cfc6b4",
  Repository: "#e8c48a",
  Directory: "#7f8b9a",
  File: "#9aa6b4",
  Dependency: "#3d8f6e",
  Test: "#6a9bb8",
  Bug: "#c45c4a",
  SecurityFinding: "#c9842a",
  Patch: "#e8c48a",
  VerificationResult: "#3d8f6e",
  Observation: "#9aa6b4",
  Hypothesis: "#cfc6b4",
  Issue: "#c45c4a",
};

const DEFAULT_KINDS = [
  "Organization",
  "Repository",
  "Directory",
  "File",
  "Dependency",
  "Bug",
  "SecurityFinding",
  "Test",
  "Patch",
  "Hypothesis",
  "Observation",
  "Issue",
  "VerificationResult",
] as const;

const TREE_EDGE_KINDS = new Set(["CONTAINS"]);

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function truncate(label: string, max = 28): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function kindStroke(kind: string): string {
  return KIND_STROKE[kind] ?? "#7f8b9a";
}

function nodeRadius(kind: string, activated: boolean, selected: boolean): number {
  const base =
    kind === "Organization" || kind === "Repository"
      ? 9
      : kind === "Directory"
        ? 6.5
        : 5;
  if (selected) return base + 2;
  if (activated) return base + 1.25;
  return base;
}

function shortLabel(n: BrainNode): string {
  if (n.kind === "File" || n.kind === "Directory" || n.kind === "Test") {
    const parts = normalizePath(n.label).split("/");
    return parts[parts.length - 1] || n.label;
  }
  return n.label;
}

function normalizePath(label: string): string {
  return label
    .replace(/\\/g, "/")
    .replace(/^test:/i, "")
    .replace(/\/+$/, "");
}

function pathParent(p: string): string | null {
  const i = p.lastIndexOf("/");
  if (i <= 0) return null;
  return p.slice(0, i);
}

function displayBasename(label: string): string {
  const n = normalizePath(label);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Prefer CONTAINS parent; else infer Directory/File parents from path labels. */
function buildParentMap(nodes: BrainNode[], edges: BrainEdge[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = new Map<string, string>();

  const orgs = nodes.filter((n) => n.kind === "Organization");
  const repos = nodes.filter((n) => n.kind === "Repository");

  // Explicit CONTAINS edges
  for (const e of edges) {
    if (e.kind !== "CONTAINS") continue;
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    // Prefer deeper structural parent later; first pass records
    if (!parent.has(e.to)) parent.set(e.to, e.from);
  }

  // Org → each repo if missing
  if (orgs.length === 1) {
    for (const r of repos) {
      if (!parent.has(r.id)) parent.set(r.id, orgs[0].id);
    }
  }

  // Path-inferred Directory/File nesting (overrides flat repo→file CONTAINS when better parent exists)
  const dirsByPath = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === "Directory") dirsByPath.set(normalizePath(n.label), n.id);
  }

  const repoForPathNode = (n: BrainNode): string | undefined => {
    // Walk existing parent chain to repository
    let cur: string | undefined = parent.get(n.id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = byId.get(cur);
      if (node?.kind === "Repository") return cur;
      cur = parent.get(cur);
    }
    // Fallback: single repo, or first repo
    if (repos.length === 1) return repos[0].id;
    return repos[0]?.id;
  };

  for (const n of nodes) {
    if (n.kind !== "Directory" && n.kind !== "File") continue;
    const path = normalizePath(n.label);
    let p = pathParent(path);
    let attached = false;
    while (p) {
      const dirId = dirsByPath.get(p);
      if (dirId && dirId !== n.id) {
        parent.set(n.id, dirId);
        attached = true;
        break;
      }
      p = pathParent(p);
    }
    if (!attached) {
      const repoId = repoForPathNode(n);
      if (repoId) parent.set(n.id, repoId);
    }
  }

  // Non-structural: hang under LOCATED_IN / AFFECTS / FIXES / TESTED_BY / DEPENDS_ON target
  const attachKinds = new Set([
    "LOCATED_IN",
    "AFFECTS",
    "FIXES",
    "TESTED_BY",
    "DEPENDS_ON",
    "RELATED_TO",
    "DERIVED_FROM",
    "VERIFIED_BY",
    "CAUSED_BY",
  ]);
  for (const e of edges) {
    if (!attachKinds.has(e.kind)) continue;
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const structuralB = STRUCTURAL.has(b.kind);
    const structuralA = STRUCTURAL.has(a.kind);
    if (!structuralA && structuralB && !parent.has(a.id)) {
      parent.set(a.id, b.id);
    } else if (!structuralB && structuralA && !parent.has(b.id)) {
      parent.set(b.id, a.id);
    } else if (!structuralA && !parent.has(a.id) && structuralB) {
      parent.set(a.id, b.id);
    }
  }

  // Remaining orphans under first repo / org / synthetic root handled later
  const fallbackRoot = orgs[0]?.id ?? repos[0]?.id;
  if (fallbackRoot) {
    for (const n of nodes) {
      if (n.id === fallbackRoot) continue;
      if (!parent.has(n.id) && n.kind !== "Organization") {
        // Don't attach other orgs
        if (n.kind === "Organization") continue;
        parent.set(n.id, fallbackRoot);
      }
    }
  }

  return parent;
}

function buildForest(nodes: BrainNode[], parentOf: Map<string, string>): LayoutTree[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes) children.set(n.id, []);

  const roots: string[] = [];
  for (const n of nodes) {
    const p = parentOf.get(n.id);
    if (p && byId.has(p) && p !== n.id) {
      children.get(p)!.push(n.id);
    } else {
      roots.push(n.id);
    }
  }

  const kindOrder = (id: string) => {
    const k = byId.get(id)?.kind ?? "";
    const order: Record<string, number> = {
      Organization: 0,
      Repository: 1,
      Directory: 2,
      File: 3,
      Dependency: 4,
      Test: 5,
      Bug: 6,
      SecurityFinding: 6,
      Patch: 7,
      Observation: 8,
      Hypothesis: 8,
      Issue: 8,
      VerificationResult: 9,
    };
    return order[k] ?? 10;
  };

  const sortIds = (ids: string[]) =>
    ids.sort((a, b) => {
      const ko = kindOrder(a) - kindOrder(b);
      if (ko !== 0) return ko;
      return (byId.get(a)?.label ?? "").localeCompare(byId.get(b)?.label ?? "");
    });

  for (const [, kids] of children) sortIds(kids);
  sortIds(roots);

  function make(id: string, depth: number, seen: Set<string>): LayoutTree | null {
    const node = byId.get(id);
    if (!node) return null;
    if (seen.has(id)) return null;
    const next = new Set(seen);
    next.add(id);
    const kids = (children.get(id) ?? [])
      .map((cid) => make(cid, depth + 1, next))
      .filter((t): t is LayoutTree => Boolean(t));
    return { id, node, children: kids, depth, slot: 0 };
  }

  return roots.map((id) => make(id, 0, new Set())).filter((t): t is LayoutTree => Boolean(t));
}

/** Reingold–Tilford style: assign contiguous leaf slots, center parents. */
function assignSlots(tree: LayoutTree, cursor: { n: number }): void {
  if (!tree.children.length) {
    tree.slot = cursor.n;
    cursor.n += 1;
    return;
  }
  for (const c of tree.children) assignSlots(c, cursor);
  tree.slot = (tree.children[0].slot + tree.children[tree.children.length - 1].slot) / 2;
}

function layoutDendrogram(nodes: BrainNode[], edges: BrainEdge[]): {
  positions: Map<string, Pt>;
  treeEdges: Array<{ from: string; to: string }>;
  maxDepth: number;
  leafCount: number;
} {
  const positions = new Map<string, Pt>();
  if (!nodes.length) {
    return { positions, treeEdges: [], maxDepth: 0, leafCount: 0 };
  }

  const parentOf = buildParentMap(nodes, edges);
  const forest = buildForest(nodes, parentOf);
  const cursor = { n: 0 };
  for (const root of forest) assignSlots(root, cursor);

  // Offset multiple roots vertically
  let slotOffset = 0;
  const placed: LayoutTree[] = [];
  for (const root of forest) {
    shiftSlots(root, slotOffset);
    const span = subtreeLeafSpan(root);
    placed.push(root);
    slotOffset += span + 1.5;
  }

  let maxDepth = 0;
  let maxSlot = 0;
  const walk = (t: LayoutTree) => {
    maxDepth = Math.max(maxDepth, t.depth);
    maxSlot = Math.max(maxSlot, t.slot);
    for (const c of t.children) walk(c);
  };
  for (const r of placed) walk(r);

  const leafCount = Math.max(1, Math.ceil(maxSlot + 1));
  const usableW = VIEW_W - PAD_X * 2;
  const usableH = VIEW_H - PAD_Y * 2;
  const dx = Math.min(DEPTH_GAP, maxDepth > 0 ? usableW / maxDepth : usableW);
  const dy = Math.min(SLOT_GAP, leafCount > 1 ? usableH / Math.max(1, leafCount - 1) : usableH / 2);

  const treeEdges: Array<{ from: string; to: string }> = [];

  const place = (t: LayoutTree) => {
    const x = PAD_X + t.depth * dx;
    const y = PAD_Y + t.slot * dy;
    positions.set(t.id, { x, y });
    for (const c of t.children) {
      treeEdges.push({ from: t.id, to: c.id });
      place(c);
    }
  };
  for (const r of placed) place(r);

  // Any node missing position (cycle edge cases)
  let orphanSlot = maxSlot + 2;
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, {
        x: PAD_X + (maxDepth + 1) * dx,
        y: PAD_Y + orphanSlot * dy,
      });
      orphanSlot += 1;
    }
  }

  return { positions, treeEdges, maxDepth, leafCount };
}

function shiftSlots(t: LayoutTree, delta: number): void {
  t.slot += delta;
  for (const c of t.children) shiftSlots(c, delta);
}

function subtreeLeafSpan(t: LayoutTree): number {
  if (!t.children.length) return 1;
  return t.children.reduce((s, c) => s + subtreeLeafSpan(c), 0);
}

function pickVisible(nodes: BrainNode[], kinds: Set<string>): BrainNode[] {
  const filtered = nodes.filter((n) => kinds.has(n.kind));
  if (filtered.length <= MAX_NODES) return filtered;

  const hubs = filtered.filter((n) => n.kind === "Repository" || n.kind === "Organization");
  const dirs = filtered
    .filter((n) => n.kind === "Directory")
    .sort((a, b) => a.label.length - b.label.length);
  const rest = filtered
    .filter((n) => !hubs.includes(n) && n.kind !== "Directory")
    .sort((a, b) => b.confidence - a.confidence);

  const out: BrainNode[] = [...hubs];
  const budget = MAX_NODES - hubs.length;
  const dirBudget = Math.min(dirs.length, Math.floor(budget * 0.35));
  out.push(...dirs.slice(0, dirBudget));
  out.push(...rest.slice(0, Math.max(0, MAX_NODES - out.length)));
  return out;
}

function neighborIds(
  selectedId: string | null,
  edges: BrainEdge[],
  visibleIds: Set<string>,
): Set<string> {
  const out = new Set<string>();
  if (!selectedId) return out;
  out.add(selectedId);
  for (const e of edges) {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) continue;
    if (e.from === selectedId) out.add(e.to);
    if (e.to === selectedId) out.add(e.from);
  }
  return out;
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Pt {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function elbowPath(a: Pt, b: Pt): string {
  const midX = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} H ${midX} V ${b.y} H ${b.x}`;
}

export function BrainMapView({ brain }: { brain: BrainMap }) {
  const reducedMotion = usePrefersReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startSvgX: number;
    startSvgY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const [filterKinds, setFilterKinds] = useState<Set<string>>(() => new Set(DEFAULT_KINDS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [entered, setEntered] = useState(reducedMotion);

  const safeNodes = Array.isArray(brain?.nodes) ? brain.nodes : [];
  const safeEdges = Array.isArray(brain?.edges) ? brain.edges : [];
  const safeActivatedIds = Array.isArray(brain?.activatedIds) ? brain.activatedIds : [];

  const activated = useMemo(() => new Set(safeActivatedIds), [safeActivatedIds]);

  const presentKinds = useMemo(() => {
    const kinds = new Set(safeNodes.map((n) => n.kind));
    return DEFAULT_KINDS.filter((k) => kinds.has(k));
  }, [safeNodes]);

  const visible = useMemo(
    () => pickVisible(safeNodes, filterKinds),
    [safeNodes, filterKinds],
  );
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);

  const layout = useMemo(() => layoutDendrogram(visible, safeEdges), [visible, safeEdges]);
  const positions = layout.positions;

  const treeEdgeSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of layout.treeEdges) s.add(`${e.from}->${e.to}`);
    return s;
  }, [layout.treeEdges]);

  const edges = useMemo(() => {
    const list = brain.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
    // Prefer hierarchical + activated; clamp
    if (list.length <= MAX_EDGES) return list;
    const score = (e: BrainEdge) => {
      let s = e.confidence;
      if (TREE_EDGE_KINDS.has(e.kind) || treeEdgeSet.has(`${e.from}->${e.to}`)) s += 4;
      if (activated.has(e.from) || activated.has(e.to)) s += 2;
      if (selectedId && (e.from === selectedId || e.to === selectedId)) s += 3;
      return s;
    };
    return [...list].sort((a, b) => score(b) - score(a)).slice(0, MAX_EDGES);
  }, [brain.edges, visibleIds, activated, selectedId, treeEdgeSet]);

  const focus = neighborIds(selectedId, edges, visibleIds);

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), 40);
    return () => window.clearTimeout(t);
  }, [safeNodes.length, safeEdges.length, reducedMotion]);

  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleIds]);

  const byId = useMemo(() => new Map(visible.map((n) => [n.id, n])), [visible]);
  const hoverNode = hoverId ? byId.get(hoverId) : undefined;
  const selectedNode = selectedId ? byId.get(selectedId) : undefined;

  const toggleKind = useCallback((kind: string) => {
    setFilterKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 });
    setSelectedId(null);
  }, []);

  const showAllKinds = useCallback(() => {
    setFilterKinds(new Set(presentKinds.length ? presentKinds : DEFAULT_KINDS));
  }, [presentKinds]);

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const p = clientToSvg(svg, e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setTransform((t) => {
      const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
      const wx = (p.x - t.x) / t.k;
      const wy = (p.y - t.y) / t.k;
      return { k: nextK, x: p.x - wx * nextK, y: p.y - wy * nextK };
    });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const p = clientToSvg(svg, e.clientX, e.clientY);
      dragRef.current = {
        pointerId: e.pointerId,
        startSvgX: p.x,
        startSvgY: p.y,
        origX: transform.x,
        origY: transform.y,
        moved: false,
      };
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const svg = svgRef.current;
    if (!d || !svg || d.pointerId !== e.pointerId) return;
    const p = clientToSvg(svg, e.clientX, e.clientY);
    const dx = p.x - d.startSvgX;
    const dy = p.y - d.startSvgY;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    setTransform((t) => ({ ...t, x: d.origX + dx, y: d.origY + dy }));
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.moved && !(e.target as Element).closest?.("[data-neuron]")) {
      setSelectedId(null);
    }
  }, []);

  const onNeuronActivate = useCallback((id: string, clientX: number, clientY: number) => {
    setSelectedId((prev) => (prev === id ? null : id));
    const rect = shellRef.current?.getBoundingClientRect();
    if (rect && clientX && clientY) {
      setTooltip({ x: clientX - rect.left, y: clientY - rect.top });
    }
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const wx = (cx - t.x) / t.k;
      const wy = (cy - t.y) / t.k;
      return { k: nextK, x: cx - wx * nextK, y: cy - wy * nextK };
    });
  }, []);

  const clampedShown = safeNodes.length > visible.length;

  // Tree links for hierarchy; secondary synapses only when focused/activated
  const treeLinks = layout.treeEdges.filter(
    (e) => visibleIds.has(e.from) && visibleIds.has(e.to),
  );

  const secondaryLinks = edges.filter((e) => {
    if (treeEdgeSet.has(`${e.from}->${e.to}`) || treeEdgeSet.has(`${e.to}->${e.from}`)) {
      return false;
    }
    if (selectedId) {
      return e.from === selectedId || e.to === selectedId;
    }
    return activated.has(e.from) || activated.has(e.to);
  });

  return (
    <div className={`brain-map ${entered ? "is-entered" : ""} ${reducedMotion ? "is-reduced" : ""}`}>
      <div className="brain-map-toolbar" role="toolbar" aria-label="Brain map filters and view">
        <div className="brain-map-filters" role="group" aria-label="Filter neuron kinds">
          {(presentKinds.length ? presentKinds : ["Repository", "File", "Dependency"]).map((kind) => {
            const on = filterKinds.has(kind);
            return (
              <button
                key={kind}
                type="button"
                className={`brain-chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleKind(kind)}
                style={{ ["--chip-accent" as string]: kindStroke(kind) }}
              >
                {kind}
              </button>
            );
          })}
          <button type="button" className="brain-chip ghost" onClick={showAllKinds}>
            All
          </button>
        </div>
        <div className="brain-map-controls">
          <button type="button" className="brain-ctrl" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
            +
          </button>
          <button type="button" className="brain-ctrl" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
            −
          </button>
          <button type="button" className="brain-ctrl brain-ctrl-wide" onClick={resetView}>
            Reset
          </button>
        </div>
      </div>

      <div
        ref={shellRef}
        className="brain-map-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Hierarchical neural repository map. Drag to pan, scroll to zoom, click a neuron to focus."
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="brain-svg"
        >
          <defs>
            <radialGradient id="brain-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(232, 196, 138, 0.2)" />
              <stop offset="100%" stopColor="rgba(232, 196, 138, 0)" />
            </radialGradient>
            <filter id="brain-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.1" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={VIEW_W} height={VIEW_H} fill="transparent" />

          <g
            className="brain-world"
            transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
          >
            {visible
              .filter((n) => n.kind === "Repository" || n.kind === "Organization")
              .map((n) => {
                const p = positions.get(n.id);
                if (!p) return null;
                return (
                  <circle
                    key={`aura-${n.id}`}
                    className="neuron-aura"
                    cx={p.x}
                    cy={p.y}
                    r={22}
                    fill="url(#brain-glow)"
                  />
                );
              })}

            {treeLinks.map((e, i) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const hot =
                activated.has(e.from) ||
                activated.has(e.to) ||
                (selectedId != null && (e.from === selectedId || e.to === selectedId));
              const dimmed = selectedId != null && !focus.has(e.from) && !focus.has(e.to);
              return (
                <path
                  key={`tree-${e.from}-${e.to}`}
                  className={`synapse synapse-tree ${hot ? "hot" : ""} ${dimmed ? "dimmed" : ""}`}
                  d={elbowPath(a, b)}
                  style={
                    reducedMotion
                      ? undefined
                      : { transitionDelay: `${Math.min(i, 48) * 10}ms` }
                  }
                />
              );
            })}

            {secondaryLinks.map((e) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`sec-${e.id}`}
                  className="synapse synapse-secondary hot"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}

            {visible.map((n, i) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const isActivated = activated.has(n.id);
              const isSelected = selectedId === n.id;
              const isNeighbor = focus.has(n.id);
              const dimmed = selectedId != null && !isNeighbor;
              const isHover = hoverId === n.id;
              const r = nodeRadius(n.kind, isActivated, isSelected);
              // Labels only on hover/selection: prevents path bleed on dense trees
              const showLabel = isSelected || isHover;

              return (
                <g
                  key={n.id}
                  data-neuron={n.id}
                  className={[
                    "neuron-group",
                    isActivated ? "activated" : "",
                    isSelected ? "selected" : "",
                    isNeighbor && !isSelected ? "neighbor" : "",
                    dimmed ? "dimmed" : "",
                    isHover ? "hovered" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={reducedMotion ? undefined : { transitionDelay: `${Math.min(i, 48) * 14}ms` }}
                  transform={`translate(${p.x}, ${p.y})`}
                  onPointerEnter={(ev) => {
                    setHoverId(n.id);
                    const rect = shellRef.current?.getBoundingClientRect();
                    if (rect) setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                  }}
                  onPointerLeave={() => {
                    setHoverId((h) => (h === n.id ? null : h));
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onNeuronActivate(n.id, ev.clientX, ev.clientY);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.kind}: ${n.label}, confidence ${Math.round(n.confidence * 100)}%`}
                  aria-pressed={isSelected}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onNeuronActivate(n.id, 0, 0);
                    }
                  }}
                >
                  {isSelected || isActivated ? (
                    <circle className="neuron-pulse-ring" r={r + 5} />
                  ) : null}
                  <circle
                    className="neuron-node"
                    r={r}
                    style={{ stroke: kindStroke(n.kind) }}
                    filter={isSelected || isHover ? "url(#brain-soft)" : undefined}
                  />
                  {showLabel ? (
                    <text className="neuron-label" x={r + 7} y={3}>
                      {truncate(shortLabel(n), 28)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {(hoverNode || (selectedNode && tooltip)) && tooltip ? (
          <div
            className="brain-tooltip"
            style={{
              left: Math.min(tooltip.x + 14, (shellRef.current?.clientWidth ?? 320) - 180),
              top: Math.max(8, tooltip.y - 12),
            }}
            role="status"
          >
            {(() => {
              const n = hoverNode ?? selectedNode!;
              return (
                <>
                  <div className="brain-tooltip-kind" style={{ color: kindStroke(n.kind) }}>
                    {n.kind}
                    {activated.has(n.id) ? " · live" : ""}
                  </div>
                  <div className="brain-tooltip-title">{n.label}</div>
                  <div className="brain-tooltip-meta">
                    conf {(n.confidence * 100).toFixed(0)}% · {n.status.toLowerCase()}
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>

      <div className="brain-map-footer">
        <span className="brain-map-meta">
          {visible.length}/{safeNodes.length} neurons · tree depth {layout.maxDepth}
          {clampedShown ? " · capped" : ""}
        </span>
        {selectedNode ? (
          <span className="brain-map-focus">
            Focus: <strong>{selectedNode.kind}</strong> · {truncate(displayBasename(selectedNode.label), 36)} ·{" "}
            {Math.max(0, focus.size - 1)} neighbors
          </span>
        ) : (
          <span className="brain-map-hint">Hover for path · click to focus · drag / scroll</span>
        )}
      </div>
    </div>
  );
}
