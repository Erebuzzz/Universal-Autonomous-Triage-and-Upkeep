import type { BrainMap } from "./api";
import { BrainMapView } from "./BrainMapView";

/** Local-only fixture — nested paths exercise dendrogram layout. */
export function demoBrainMap(): BrainMap {
  const nodes: BrainMap["nodes"] = [
    { id: "org", kind: "Organization", label: "acme-labs", status: "ACTIVE", confidence: 1 },
    { id: "repo-a", kind: "Repository", label: "payments-api", status: "ACTIVE", confidence: 1 },
    { id: "dir-src", kind: "Directory", label: "src", status: "ACTIVE", confidence: 0.95 },
    { id: "dir-src-auth", kind: "Directory", label: "src/auth", status: "ACTIVE", confidence: 0.93 },
    { id: "dir-lib", kind: "Directory", label: "lib", status: "ACTIVE", confidence: 0.92 },
    { id: "f-auth", kind: "File", label: "src/auth/session.ts", status: "ACTIVE", confidence: 0.94 },
    { id: "f-http", kind: "File", label: "src/http-app.ts", status: "ACTIVE", confidence: 0.93 },
    { id: "f-quota", kind: "File", label: "src/quota.ts", status: "ACTIVE", confidence: 0.9 },
    { id: "f-gw", kind: "File", label: "lib/proxy.ts", status: "ACTIVE", confidence: 0.88 },
    { id: "dep-lodash", kind: "Dependency", label: "lodash", status: "ACTIVE", confidence: 0.99 },
    { id: "dep-express", kind: "Dependency", label: "express", status: "ACTIVE", confidence: 0.97 },
    { id: "bug-range", kind: "Bug", label: "inclusiveRange off-by-one", status: "ACTIVE", confidence: 0.86 },
    { id: "sec-proto", kind: "SecurityFinding", label: "Prototype pollution", status: "ACTIVE", confidence: 0.91 },
    { id: "test-auth", kind: "Test", label: "src/auth/session.test.ts", status: "ACTIVE", confidence: 0.9 },
    { id: "patch-1", kind: "Patch", label: "bump lodash → 4.17.21", status: "ACTIVE", confidence: 0.84 },
  ];

  const edges: BrainMap["edges"] = [
    { id: "e1", from: "org", to: "repo-a", kind: "CONTAINS", confidence: 1 },
    { id: "e2", from: "repo-a", to: "dir-src", kind: "CONTAINS", confidence: 0.95 },
    { id: "e3", from: "repo-a", to: "dir-lib", kind: "CONTAINS", confidence: 0.94 },
    { id: "e4", from: "repo-a", to: "dir-src-auth", kind: "CONTAINS", confidence: 0.93 },
    { id: "e5", from: "repo-a", to: "f-auth", kind: "CONTAINS", confidence: 0.93 },
    { id: "e6", from: "repo-a", to: "f-http", kind: "CONTAINS", confidence: 0.93 },
    { id: "e7", from: "repo-a", to: "f-quota", kind: "CONTAINS", confidence: 0.9 },
    { id: "e8", from: "repo-a", to: "f-gw", kind: "CONTAINS", confidence: 0.9 },
    { id: "e9", from: "repo-a", to: "dep-lodash", kind: "DEPENDS_ON", confidence: 0.99 },
    { id: "e10", from: "repo-a", to: "dep-express", kind: "DEPENDS_ON", confidence: 0.97 },
    { id: "e11", from: "sec-proto", to: "dep-lodash", kind: "AFFECTS", confidence: 0.92 },
    { id: "e12", from: "sec-proto", to: "f-auth", kind: "LOCATED_IN", confidence: 0.8 },
    { id: "e13", from: "bug-range", to: "f-quota", kind: "LOCATED_IN", confidence: 0.88 },
    { id: "e14", from: "patch-1", to: "sec-proto", kind: "FIXES", confidence: 0.85 },
    { id: "e15", from: "test-auth", to: "f-auth", kind: "TESTED_BY", confidence: 0.9 },
  ];

  return {
    nodes,
    edges,
    activatedIds: ["sec-proto", "dep-lodash", "patch-1", "f-auth", "repo-a"],
  };
}

export function BrainMapPreview() {
  const brain = demoBrainMap();
  return (
    <div className="app-shell" style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
      <header className="brand" style={{ marginBottom: "1rem" }}>
        <div className="brand-mark">UATU</div>
        <div className="brand-sub">Brain map · dendrogram preview</div>
      </header>
      <BrainMapView brain={brain} />
    </div>
  );
}
