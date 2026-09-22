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
import { sound } from "./SoundEngine";

type BrainNode = BrainMap["nodes"][number];
type BrainEdge = BrainMap["edges"][number];

type Pt = { x: number; y: number };
type ViewTransform = { x: number; y: number; k: number };

type LayoutTree = {
  id: string;
  node: BrainNode;
  children: LayoutTree[];
  depth: number;
  slot: number;
};

const MAX_NODES = 90;
const MAX_EDGES = 140;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.2;

const STRUCTURAL = new Set(["Organization", "Repository", "Directory", "File"]);

const KIND_STROKE: Record<string, string> = {
  Organization: "#ffffff",
  Repository: "#00ff9d",
  Directory: "#64748b",
  File: "#cbd5e1",
  Dependency: "#10b981",
  Test: "#38bdf8",
  Bug: "#ff0055",
  SecurityFinding: "#ff0055",
  Patch: "#00ff9d",
  VerificationResult: "#00ff88",
  Observation: "#94a3b8",
  Hypothesis: "#a78bfa",
  Issue: "#ef4444",
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

function truncate(label: string, max = 26): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function kindStroke(kind: string): string {
  return KIND_STROKE[kind] ?? "#7f8b9a";
}

function nodeRadius(kind: string, activated: boolean, selected: boolean): number {
  const base =
    kind === "Organization" || kind === "Repository"
      ? 11
      : kind === "Directory"
        ? 8
        : 6;
  if (selected) return base + 3;
  if (activated) return base + 1.5;
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
    if (!parent.has(e.to)) parent.set(e.to, e.from);
  }

  // Org -> repo linking
  if (orgs.length === 1) {
    for (const r of repos) {
      if (!parent.has(r.id)) parent.set(r.id, orgs[0].id);
    }
  }

  // Path-inferred Directory/File hierarchy
  const dirsByPath = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === "Directory") dirsByPath.set(normalizePath(n.label), n.id);
  }

  const repoForPathNode = (n: BrainNode): string | undefined => {
    let cur: string | undefined = parent.get(n.id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = byId.get(cur);
      if (node?.kind === "Repository") return cur;
      cur = parent.get(cur);
    }
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

  // Attach non-structural findings to code targets
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
    }
  }

  // Attach remaining orphans under primary repo
  const fallbackRoot = repos[0]?.id ?? orgs[0]?.id;
  if (fallbackRoot) {
    for (const n of nodes) {
      if (n.id === fallbackRoot) continue;
      if (!parent.has(n.id) && n.kind !== "Organization") {
        parent.set(n.id, fallbackRoot);
      }
    }
  }

  return parent;
}

function buildForest(
  nodes: BrainNode[],
  parentOf: Map<string, string>,
  expandedIds: Set<string>,
): { forest: LayoutTree[]; childrenMap: Map<string, string[]> } {
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
    if (!node || seen.has(id)) return null;
    const next = new Set(seen);
    next.add(id);

    const isExpanded = expandedIds.has(id);
    const kids = isExpanded
      ? (children.get(id) ?? [])
          .map((cid) => make(cid, depth + 1, next))
          .filter((t): t is LayoutTree => Boolean(t))
      : [];
    return { id, node, children: kids, depth, slot: 0 };
  }

  const forest = roots.map((id) => make(id, 0, new Set())).filter((t): t is LayoutTree => Boolean(t));
  return { forest, childrenMap: children };
}

function assignSlots(tree: LayoutTree, cursor: { n: number }): void {
  if (!tree.children.length) {
    tree.slot = cursor.n;
    cursor.n += 1;
    return;
  }
  for (const c of tree.children) assignSlots(c, cursor);
  tree.slot = (tree.children[0].slot + tree.children[tree.children.length - 1].slot) / 2;
}

function shiftSlots(t: LayoutTree, delta: number): void {
  t.slot += delta;
  for (const c of t.children) shiftSlots(c, delta);
}

function subtreeLeafSpan(t: LayoutTree): number {
  if (!t.children.length) return 1;
  return t.children.reduce((s, c) => s + subtreeLeafSpan(c), 0);
}

function layoutDendrogram(
  nodes: BrainNode[],
  edges: BrainEdge[],
  expandedIds: Set<string>,
): {
  positions: Map<string, Pt>;
  treeEdges: Array<{ from: string; to: string }>;
  maxDepth: number;
  leafCount: number;
  parentOf: Map<string, string>;
  childrenMap: Map<string, string[]>;
  placedNodeIds: Set<string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const positions = new Map<string, Pt>();
  const parentOf = buildParentMap(nodes, edges);
  if (!nodes.length) {
    return {
      positions,
      treeEdges: [],
      maxDepth: 0,
      leafCount: 0,
      parentOf,
      childrenMap: new Map(),
      placedNodeIds: new Set(),
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 500 },
    };
  }

  const { forest, childrenMap } = buildForest(nodes, parentOf, expandedIds);
  const cursor = { n: 0 };
  for (const root of forest) assignSlots(root, cursor);

  let slotOffset = 0;
  const placed: LayoutTree[] = [];
  for (const root of forest) {
    shiftSlots(root, slotOffset);
    const span = subtreeLeafSpan(root);
    placed.push(root);
    slotOffset += span + 1.2;
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
  // Dynamic biological node spacing: generous spacing so tree spans canvas
  const depthSpacing = Math.max(160, Math.min(240, 780 / Math.max(1, maxDepth)));
  const slotSpacing = Math.max(48, Math.min(68, 520 / Math.max(1, leafCount)));

  const padX = 60;
  const padY = 50;
  const treeEdges: Array<{ from: string; to: string }> = [];
  const placedNodeIds = new Set<string>();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const place = (t: LayoutTree) => {
    const x = padX + t.depth * depthSpacing;
    const y = padY + t.slot * slotSpacing;
    positions.set(t.id, { x, y });
    placedNodeIds.add(t.id);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    for (const c of t.children) {
      treeEdges.push({ from: t.id, to: c.id });
      place(c);
    }
  };

  for (const r of placed) place(r);

  for (const r of forest) {
    if (!positions.has(r.id)) {
      positions.set(r.id, { x: padX, y: padY });
      placedNodeIds.add(r.id);
    }
  }

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 500;
  }

  return {
    positions,
    treeEdges,
    maxDepth,
    leafCount,
    parentOf,
    childrenMap,
    placedNodeIds,
    bounds: { minX, minY, maxX, maxY },
  };
}

function pickVisible(nodes: BrainNode[], kinds: Set<string>): BrainNode[] {
  const filtered = nodes.filter((n) => kinds.has(n.kind));
  if (filtered.length <= MAX_NODES) return filtered;

  const hubs = filtered.filter((n) => n.kind === "Repository" || n.kind === "Organization");
  const dirs = filtered.filter((n) => n.kind === "Directory");
  const rest = filtered
    .filter((n) => !hubs.includes(n) && n.kind !== "Directory")
    .sort((a, b) => b.confidence - a.confidence);

  const out: BrainNode[] = [...hubs, ...dirs];
  const budget = Math.max(0, MAX_NODES - out.length);
  out.push(...rest.slice(0, budget));
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

/** Smooth organic cubic Bézier curve for biological axon pathways */
function organicAxonPath(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const curvature = Math.max(28, dx * 0.52);
  return `M ${a.x} ${a.y} C ${a.x + curvature} ${a.y}, ${b.x - curvature} ${b.y}, ${b.x} ${b.y}`;
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
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [shockwaveId, setShockwaveId] = useState<string | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const safeNodes = Array.isArray(brain?.nodes) ? brain.nodes : [];
  const safeEdges = Array.isArray(brain?.edges) ? brain.edges : [];
  const safeActivatedIds = Array.isArray(brain?.activatedIds) ? brain.activatedIds : [];

  // Start with root repositories and directories expanded by default
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const n of safeNodes) {
      if (n.kind === "Organization" || n.kind === "Repository") {
        initial.add(n.id);
      }
      if (n.kind === "Directory" && !n.label.includes("/")) {
        initial.add(n.id);
      }
    }
    return initial;
  });

  useEffect(() => {
    if (safeNodes.length > 0) {
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        const next = new Set<string>();
        for (const n of safeNodes) {
          if (n.kind === "Organization" || n.kind === "Repository") {
            next.add(n.id);
          }
          if (n.kind === "Directory" && !n.label.includes("/")) {
            next.add(n.id);
          }
        }
        return next;
      });
    }
  }, [safeNodes]);

  const activated = useMemo(() => new Set(safeActivatedIds), [safeActivatedIds]);

  const presentKinds = useMemo(() => {
    const kinds = new Set(safeNodes.map((n) => n.kind));
    return DEFAULT_KINDS.filter((k) => kinds.has(k));
  }, [safeNodes]);

  const visible = useMemo(
    () => pickVisible(safeNodes, filterKinds),
    [safeNodes, filterKinds],
  );

  const layout = useMemo(
    () => layoutDendrogram(visible, safeEdges, expandedIds),
    [visible, safeEdges, expandedIds],
  );

  const positions = layout.positions;
  const childrenMap = layout.childrenMap;
  const placedNodeIds = layout.placedNodeIds;
  const bounds = layout.bounds;

  // ViewBox encompasses the dynamic tree bounds with comfortable biological padding
  const viewW = Math.max(860, bounds.maxX + 180);
  const viewH = Math.max(520, bounds.maxY + 100);

  const renderedNodes = useMemo(
    () => visible.filter((n) => placedNodeIds.has(n.id)),
    [visible, placedNodeIds],
  );

  const treeEdgeSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of layout.treeEdges) s.add(`${e.from}->${e.to}`);
    return s;
  }, [layout.treeEdges]);

  const edges = useMemo(() => {
    const list = brain.edges.filter((e) => placedNodeIds.has(e.from) && placedNodeIds.has(e.to));
    if (list.length <= MAX_EDGES) return list;
    const score = (e: BrainEdge) => {
      let s = e.confidence;
      if (treeEdgeSet.has(`${e.from}->${e.to}`)) s += 4;
      if (activated.has(e.from) || activated.has(e.to)) s += 2;
      if (selectedId && (e.from === selectedId || e.to === selectedId)) s += 3;
      return s;
    };
    return [...list].sort((a, b) => score(b) - score(a)).slice(0, MAX_EDGES);
  }, [brain.edges, placedNodeIds, activated, selectedId, treeEdgeSet]);

  const focus = neighborIds(selectedId, edges, placedNodeIds);

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
    if (selectedId && !placedNodeIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, placedNodeIds]);

  const byId = useMemo(() => new Map(safeNodes.map((n) => [n.id, n])), [safeNodes]);
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
    setFocusedBranchId(null);
    setSelectedId(null);
  }, []);

  const showAllKinds = useCallback(() => {
    setFilterKinds(new Set(presentKinds.length ? presentKinds : DEFAULT_KINDS));
  }, [presentKinds]);

  const expandAllBranches = useCallback(() => {
    const all = new Set<string>();
    for (const n of safeNodes) all.add(n.id);
    setExpandedIds(all);
  }, [safeNodes]);

  const collapseAllBranches = useCallback(() => {
    const rootsOnly = new Set<string>();
    for (const n of safeNodes) {
      if (n.kind === "Organization" || n.kind === "Repository") rootsOnly.add(n.id);
    }
    setExpandedIds(rootsOnly);
    setFocusedBranchId(null);
    setSelectedId(null);
    setTransform({ x: 0, y: 0, k: 1 });
  }, [safeNodes]);

  /** Double-click or double-tap on a node: expands branch with dramatic zoom-in, or collapses with zoom-out */
  const handleNodeDoubleClick = useCallback(
    (id: string, ev?: React.SyntheticEvent) => {
      if (ev) {
        ev.stopPropagation();
      }

      // Trigger visual shockwave burst animation and celestial sound synthesis
      setShockwaveId(id);
      sound.playCelestialChime();
      sound.playShockwavePulse();
      window.setTimeout(() => {
        setShockwaveId((curr) => (curr === id ? null : curr));
      }, 700);

      const isCurrentlyExpanded = expandedIds.has(id);
      const kids = childrenMap.get(id) ?? [];
      const hasKids = kids.length > 0;

      if (!isCurrentlyExpanded && hasKids) {
        // Expand branch
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        setFocusedBranchId(id);
        setSelectedId(id);

        // Dramatic zoom-in effect focusing on the node with view room for children
        const p = positions.get(id);
        if (p) {
          const targetK = 2.45;
          const targetX = viewW / 2 - (p.x + 85) * targetK;
          const targetY = viewH / 2 - p.y * targetK;
          setTransform({ x: targetX, y: targetY, k: targetK });
        }
      } else if (isCurrentlyExpanded && hasKids) {
        // Collapse branch
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        // Smoothly zoom out to parent or overview
        const parentId = layout.parentOf.get(id);
        if (parentId && positions.has(parentId)) {
          setFocusedBranchId(parentId);
          setSelectedId(parentId);
          const pp = positions.get(parentId)!;
          const targetK = 1.25;
          setTransform({
            x: viewW / 2 - (pp.x + 40) * targetK,
            y: viewH / 2 - pp.y * targetK,
            k: targetK,
          });
        } else {
          setFocusedBranchId(null);
          setSelectedId(id);
          setTransform({ x: 0, y: 0, k: 1 });
        }
      } else {
        // Leaf node: toggle inspection zoom-in / zoom-out
        const p = positions.get(id);
        if (p) {
          if (focusedBranchId === id) {
            const parentId = layout.parentOf.get(id);
            if (parentId && positions.has(parentId)) {
              setFocusedBranchId(parentId);
              setSelectedId(parentId);
              const pp = positions.get(parentId)!;
              const targetK = 1.25;
              setTransform({
                x: viewW / 2 - (pp.x + 40) * targetK,
                y: viewH / 2 - pp.y * targetK,
                k: targetK,
              });
            } else {
              setFocusedBranchId(null);
              setTransform({ x: 0, y: 0, k: 1 });
            }
          } else {
            setFocusedBranchId(id);
            setSelectedId(id);
            const targetK = 2.45;
            const targetX = viewW / 2 - p.x * targetK;
            const targetY = viewH / 2 - p.y * targetK;
            setTransform({ x: targetX, y: targetY, k: targetK });
          }
        }
      }
    },
    [expandedIds, childrenMap, positions, layout.parentOf, viewW, viewH, focusedBranchId],
  );

  /** Direct Synaptic Gateway toggle: expands or collapses branch with dramatic zoom-in */
  const toggleSynapticBranch = useCallback(
    (id: string, ev?: React.MouseEvent | React.KeyboardEvent) => {
      if (ev) {
        ev.stopPropagation();
      }
      handleNodeDoubleClick(id, ev);
    },
    [handleNodeDoubleClick],
  );

  /** Clicking the soma node body selects/inspects node; detects double-tap for touch */
  const onSomaClick = useCallback(
    (id: string, clientX: number, clientY: number, ev?: React.SyntheticEvent) => {
      if (ev) {
        ev.stopPropagation();
      }

      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (lastTap && lastTap.id === id && now - lastTap.time < 360) {
        // Double-tap detected (touch or quick click)
        lastTapRef.current = null;
        handleNodeDoubleClick(id, ev);
        return;
      }
      lastTapRef.current = { id, time: now };

      // Single click: inspect/select node with tactile feedback
      sound.playTactileClick();
      setSelectedId((prev) => (prev === id ? null : id));
      const rect = shellRef.current?.getBoundingClientRect();
      if (rect && clientX && clientY) {
        setTooltip({ x: clientX - rect.left, y: clientY - rect.top });
      }
    },
    [handleNodeDoubleClick],
  );

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const p = clientToSvg(svg, e.clientX, e.clientY);
    // Smooth, dampened exponential zoom curve preventing trackpad sensitivity spikes
    const clampedDelta = Math.max(-50, Math.min(50, e.deltaY));
    const factor = Math.exp(-clampedDelta * 0.0018);
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
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
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

  const breadcrumbs = useMemo(() => {
    const targetId = focusedBranchId || selectedId;
    if (!targetId) return [];
    const trail: Array<{ id: string; label: string; kind: string }> = [];
    let cur: string | null = targetId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = byId.get(cur);
      if (node) {
        trail.unshift({ id: node.id, label: shortLabel(node), kind: node.kind });
      }
      cur = layout.parentOf.get(cur) ?? null;
    }
    return trail;
  }, [focusedBranchId, selectedId, byId, layout.parentOf]);

  const jumpToCrumb = useCallback(
    (id: string | null) => {
      if (!id) {
        setFocusedBranchId(null);
        setSelectedId(null);
        setTransform({ x: 0, y: 0, k: 1 });
        return;
      }
      setFocusedBranchId(id);
      setSelectedId(id);
      const p = positions.get(id);
      if (p) {
        const targetK = 1.4;
        setTransform({ x: viewW / 2 - p.x * targetK, y: viewH / 2 - p.y * targetK, k: targetK });
      }
    },
    [positions, viewW, viewH],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      setTransform((t) => {
        const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
        const cx = viewW / 2;
        const cy = viewH / 2;
        const wx = (cx - t.x) / t.k;
        const wy = (cy - t.y) / t.k;
        return { k: nextK, x: cx - wx * nextK, y: cy - wy * nextK };
      });
    },
    [viewW, viewH],
  );

  const treeLinks = layout.treeEdges.filter(
    (e) => placedNodeIds.has(e.from) && placedNodeIds.has(e.to),
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
      {breadcrumbs.length > 0 ? (
        <div className="brain-topbar">
          <div className="brain-breadcrumbs">
            <button
              type="button"
              className="brain-crumb-item"
              onClick={() => jumpToCrumb(null)}
            >
              <span>Repository Overview</span>
            </button>
            {breadcrumbs.map((c, i) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span className="brain-crumb-sep">/</span>
                <button
                  type="button"
                  className={`brain-crumb-item ${i === breadcrumbs.length - 1 ? "active" : ""}`}
                  onClick={() => jumpToCrumb(c.id)}
                >
                  <span style={{ color: kindStroke(c.kind) }}>●</span>
                  <span>{c.label}</span>
                </button>
              </span>
            ))}
          </div>
          <div className="brain-zoom-controls">
            <button
              type="button"
              className="brain-zoom-btn"
              onClick={expandAllBranches}
              title="Expand all branches"
            >
              Expand All
            </button>
            <button
              type="button"
              className="brain-zoom-btn"
              onClick={collapseAllBranches}
              title="Collapse to roots"
            >
              Collapse All
            </button>
          </div>
        </div>
      ) : null}

      <div className="brain-map-toolbar" role="toolbar" aria-label="Brain map filters and controls">
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
                <span className="brain-chip-dot" style={{ backgroundColor: kindStroke(kind) }} />
                {kind}
              </button>
            );
          })}
          <button type="button" className="brain-chip ghost" onClick={showAllKinds}>
            All
          </button>
        </div>
        <div className="brain-map-controls">
          <button type="button" className="brain-ctrl" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
            +
          </button>
          <button type="button" className="brain-ctrl" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <button type="button" className="brain-ctrl brain-ctrl-wide" onClick={resetView}>
            Fit
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
        onDoubleClick={resetView}
        role="application"
        aria-label="Biological neural repository map. Click the Synaptic Gateway (+/-) to expand or collapse branches. Click soma to inspect."
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className="brain-svg"
        >
          <defs>
            <radialGradient id="bio-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0, 255, 157, 0.35)" />
              <stop offset="60%" stopColor="rgba(0, 255, 157, 0.12)" />
              <stop offset="100%" stopColor="rgba(0, 255, 157, 0)" />
            </radialGradient>
            <radialGradient id="ruby-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255, 0, 85, 0.35)" />
              <stop offset="100%" stopColor="rgba(255, 0, 85, 0)" />
            </radialGradient>
            <filter id="bio-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="bio-pulse-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={viewW} height={viewH} fill="transparent" />

          <g
            className="brain-world"
            transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
            style={{
              transition: reducedMotion ? "none" : "transform 0.65s cubic-bezier(0.19, 1, 0.22, 1)",
              transformOrigin: "0 0",
            }}
          >
            {/* Celestial Astrolabe Coordinate Grid & Constellation Rings */}
            {(() => {
              const rootNode = renderedNodes.find((n) => n.kind === "Organization" || n.kind === "Repository") ?? renderedNodes[0];
              const center = rootNode ? positions.get(rootNode.id) : null;
              if (!center) return null;
              const radii = [140, 280, 460, 680, 920];
              return (
                <g className="astrolabe-grid" aria-hidden="true">
                  {/* Concentric Astrolabe Coordinate Rings */}
                  {radii.map((r, ri) => (
                    <g key={`astrolabe-${r}`}>
                      <circle
                        cx={center.x}
                        cy={center.y}
                        r={r}
                        className={`astrolabe-ring ${ri % 2 === 1 ? "astrolabe-ring-major" : ""}`}
                      />
                      <text
                        x={center.x + r + 4}
                        y={center.y - 4}
                        className="astrolabe-coordinate-tick"
                      >
                        +{r}px · R{ri + 1}
                      </text>
                    </g>
                  ))}
                  {/* Celestial Meridian and Equator Axes */}
                  <line
                    x1={center.x - 980}
                    y1={center.y}
                    x2={center.x + 980}
                    y2={center.y}
                    className="astrolabe-axis"
                  />
                  <line
                    x1={center.x}
                    y1={center.y - 680}
                    x2={center.x}
                    y2={center.y + 680}
                    className="astrolabe-axis"
                  />
                  <text x={center.x + 12} y={center.y - 650} className="astrolabe-coordinate-tick">
                    CELESTIAL MERIDIAN 00h 00m
                  </text>
                </g>
              );
            })()}

            {/* Primary Hub Auric Halos */}
            {renderedNodes
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
                    r={32}
                    fill="url(#bio-glow)"
                  />
                );
              })}

            {/* Organic Bézier Axon Pathways */}
            {treeLinks.map((e, i) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const hot =
                activated.has(e.from) ||
                activated.has(e.to) ||
                (selectedId != null && (e.from === selectedId || e.to === selectedId));
              const dimmed = selectedId != null && !focus.has(e.from) && !focus.has(e.to);
              const pathD = organicAxonPath(a, b);
              const pathId = `axon-${e.from}-${e.to}`;

              return (
                <g key={`tree-axon-${e.from}-${e.to}`}>
                  <path
                    id={pathId}
                    className={`synapse bio-axon-path ${hot ? "hot" : ""} ${dimmed ? "dimmed" : ""}`}
                    d={pathD}
                    style={
                      reducedMotion
                        ? undefined
                        : { transitionDelay: `${Math.min(i, 40) * 8}ms` }
                    }
                  />

                  {/* Animated Action Potential Impulse along active axons */}
                  {!reducedMotion && hot ? (
                    <circle r={2.5} className="bio-axon-action-potential">
                      <animateMotion
                        dur="2.4s"
                        repeatCount="indefinite"
                        path={pathD}
                        keyPoints="0;1"
                        keyTimes="0;1"
                        begin={`${(i % 5) * 0.4}s`}
                      />
                    </circle>
                  ) : null}
                </g>
              );
            })}

            {/* Cross-Cutting Secondary Synapses (Dependencies, Bug Affects, Fixes) */}
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

            {/* Biological Neuron Somas & Synaptic Gateways */}
            {renderedNodes.map((n, i) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const isActivated = activated.has(n.id);
              const isSelected = selectedId === n.id;
              const isNeighbor = focus.has(n.id);
              const dimmed = selectedId != null && !isNeighbor;
              const isHover = hoverId === n.id;
              const r = nodeRadius(n.kind, isActivated, isSelected);
              const showLabel = isSelected || isHover || n.kind === "Repository" || n.kind === "Directory";

              const kids = childrenMap.get(n.id) ?? [];
              const hasKids = kids.length > 0;
              const isExpanded = expandedIds.has(n.id);

              return (
                <g
                  key={n.id}
                  data-neuron={n.id}
                  className={[
                    "neuron-group",
                    "brain-node-hitbox",
                    isActivated ? "activated" : "",
                    isSelected ? "selected" : "",
                    isNeighbor && !isSelected ? "neighbor" : "",
                    dimmed ? "dimmed" : "",
                    isHover ? "hovered" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={reducedMotion ? undefined : { transitionDelay: `${Math.min(i, 40) * 10}ms` }}
                  transform={`translate(${p.x}, ${p.y})`}
                  onDoubleClick={(ev) => handleNodeDoubleClick(n.id, ev)}
                >
                  {/* Fidgety Shockwave Burst Ring on Double-Click Expand/Collapse */}
                  {shockwaveId === n.id ? (
                    <circle className="neuron-shockwave" r={r + 4} />
                  ) : null}

                  {/* Outer Pulsing Synaptic Membrane */}
                  {isSelected || isActivated ? (
                    <circle className="neuron-pulse-ring" r={r + 6} />
                  ) : null}

                  {/* Soma Cell Body (Membrane) */}
                  <circle
                    className="neuron-node bio-soma-membrane"
                    r={r}
                    style={{ stroke: kindStroke(n.kind), strokeWidth: isSelected ? 2.5 : 1.8 }}
                    filter={isSelected || isHover ? "url(#bio-soft)" : undefined}
                    onClick={(ev) => {
                      onSomaClick(n.id, ev.clientX, ev.clientY, ev);
                    }}
                    onDoubleClick={(ev) => {
                      handleNodeDoubleClick(n.id, ev);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.kind}: ${n.label}, confidence ${Math.round(n.confidence * 100)}%`}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        handleNodeDoubleClick(n.id, ev);
                      }
                    }}
                    onPointerEnter={(ev) => {
                      setHoverId(n.id);
                      const rect = shellRef.current?.getBoundingClientRect();
                      if (rect) setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                    }}
                    onPointerLeave={() => {
                      setHoverId((h) => (h === n.id ? null : h));
                    }}
                  />

                  {/* Inner Glowing Nucleus */}
                  <circle
                    className="bio-soma-nucleus"
                    r={Math.max(2.2, r * 0.38)}
                    fill={kindStroke(n.kind)}
                  />

                  {/* Dedicated Synaptic Gateway Badge (+ / - expansion button) */}
                  {hasKids ? (
                    <g
                      className="synaptic-gateway-badge"
                      transform={`translate(${r + 8}, 0)`}
                      onClick={(ev) => toggleSynapticBranch(n.id, ev)}
                      role="button"
                      tabIndex={0}
                      aria-label={isExpanded ? `Collapse ${n.label} branch` : `Expand ${n.label} branch`}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          toggleSynapticBranch(n.id, ev);
                        }
                      }}
                    >
                      {/* Synaptic Gateway Hitbox / Enlarged Hit Area */}
                      <circle r={16} fill="transparent" pointerEvents="all" />
                      <circle
                        r={10}
                        fill={isExpanded ? "#030708" : "#00ff9d"}
                        stroke={isExpanded ? "#ff0055" : "#030708"}
                        strokeWidth={1.5}
                      />
                      {/* Plus or Minus Icon */}
                      {isExpanded ? (
                        // Minus
                        <line
                          x1={-4}
                          y1={0}
                          x2={4}
                          y2={0}
                          stroke="#ff0055"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      ) : (
                        // Plus
                        <g stroke="#030708" strokeWidth={2} strokeLinecap="round">
                          <line x1={-4} y1={0} x2={4} y2={0} />
                          <line x1={0} y1={-4} x2={0} y2={4} />
                        </g>
                      )}
                    </g>
                  ) : null}

                  {/* Biological Dendrite Branch Label */}
                  {showLabel ? (
                    <text
                      className="neuron-label"
                      x={r + (hasKids ? 24 : 10)}
                      y={4}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        letterSpacing: "0.02em",
                        fontWeight: isSelected ? 600 : 500,
                      }}
                    >
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
              left: Math.min(tooltip.x + 14, (shellRef.current?.clientWidth ?? 320) - 200),
              top: Math.max(8, tooltip.y - 12),
            }}
            role="status"
          >
            {(() => {
              const n = hoverNode ?? selectedNode!;
              const kids = childrenMap.get(n.id) ?? [];
              const isExpanded = expandedIds.has(n.id);
              return (
                <>
                  <div className="brain-tooltip-kind" style={{ color: kindStroke(n.kind) }}>
                    {n.kind}
                    {activated.has(n.id) ? " · active impulse" : ""}
                    {kids.length > 0 ? ` · ${kids.length} sub-branches` : ""}
                  </div>
                  <div className="brain-tooltip-title">{n.label}</div>
                  <div className="brain-tooltip-meta">
                    confidence {(n.confidence * 100).toFixed(0)}% · {n.status.toLowerCase()}
                    {kids.length > 0
                      ? isExpanded
                        ? " (double-click node or badge to collapse)"
                        : " (double-click node or badge to expand & zoom)"
                      : " (double-click node to inspect & zoom)"}
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>

      <div className="brain-map-footer">
        <span className="brain-map-meta">
          {renderedNodes.length}/{safeNodes.length} stellar nodes active · depth {layout.maxDepth}
          {" · celestial astrolabe cartography"}
        </span>
        {selectedNode ? (
          <span className="brain-map-focus">
            Focus: <strong>{selectedNode.kind}</strong> · {truncate(displayBasename(selectedNode.label), 36)} ·{" "}
            {(childrenMap.get(selectedNode.id) ?? []).length > 0
              ? `${(childrenMap.get(selectedNode.id) ?? []).length} branches`
              : `${Math.max(0, focus.size - 1)} neighbors`}
          </span>
        ) : (
          <span className="brain-map-hint">
            Double-click node or click Synaptic Gateway (+/-) to expand &amp; zoom · Double-click to collapse · Drag to pan
          </span>
        )}
      </div>
    </div>
  );
}
