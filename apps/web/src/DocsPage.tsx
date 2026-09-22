import { useState, useEffect } from "react";
import { demoBrainMap } from "./BrainMapPreview";
import { BrainMapView } from "./BrainMapView";
import { BrandLockup } from "./BrandLockup";
import { Stepper, Step } from "./components/Stepper";
import { ThemeToggle } from "./ThemeToggle";

type DocId =
  | "getting-started"
  | "safety-grants"
  | "upkeep-loop"
  | "models-router"
  | "neural-brain"
  | "privacy-security";

interface DocItem {
  id: DocId;
  title: string;
  category: string;
  summary: string;
}

const DOCS: DocItem[] = [
  {
    id: "getting-started",
    title: "User Guide & Quickstart",
    category: "Getting Started",
    summary: "How UATU works, what it does for your repositories, and your first automated upkeep run.",
  },
  {
    id: "safety-grants",
    title: "Repository Safety & Permissions",
    category: "Security",
    summary: "Capability grants, path allowlists, isolated execution, and our zero auto-merge guarantee.",
  },
  {
    id: "upkeep-loop",
    title: "The 8-Stage Upkeep Lifecycle",
    category: "Core Engine",
    summary: "From passive observation to root-cause investigation, sandboxed testing, and reviewable PRs.",
  },
  {
    id: "models-router",
    title: "AI Models & The Smart Router",
    category: "AI Reasoning",
    summary: "How the Smart Complexity Router automatically matches tasks to Nova 2 Omni, Claude, or Nova Micro.",
  },
  {
    id: "neural-brain",
    title: "Reading Your Repository Brain",
    category: "Knowledge Graph",
    summary: "How UATU remembers past repairs, tracks shared dependencies, and structures code memory.",
  },
  {
    id: "privacy-security",
    title: "Privacy Policy & Code Security",
    category: "Trust & Privacy",
    summary: "Zero model training, ephemeral sandboxes, multi-tenant partitioning, and one-click revocation.",
  },
];

function getInitialDoc(): DocId {
  try {
    const q = new URLSearchParams(window.location.search).get("doc");
    if (
      q === "getting-started" ||
      q === "safety-grants" ||
      q === "upkeep-loop" ||
      q === "models-router" ||
      q === "neural-brain" ||
      q === "privacy-security"
    ) {
      return q;
    }
  } catch {
    /* ignore */
  }
  return "getting-started";
}

export function DocsPage({ onBack }: { onBack: () => void }) {
  const [activeDoc, setActiveDoc] = useState<DocId>(getInitialDoc);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("doc", activeDoc);
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [activeDoc]);

  return (
    <div className="docs-page">
      <header className="docs-topbar">
        <BrandLockup size="md" onClick={onBack} />
        <div className="docs-topbar-actions" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Back to App
          </button>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="Documentation Navigation">
          <p className="docs-sidebar-heading">User Documentation</p>
          <nav className="docs-nav-list">
            {DOCS.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`docs-nav-item ${activeDoc === doc.id ? "active" : ""}`}
                onClick={() => setActiveDoc(doc.id)}
              >
                <span className="docs-nav-category">{doc.category}</span>
                <span className="docs-nav-title">{doc.title}</span>
              </button>
            ))}
          </nav>

          <div className="docs-sidebar-card">
            <p className="docs-card-title">Ready to begin?</p>
            <p className="docs-card-body">
              Connect a repository or try the interactive sandbox fixture right now from your dashboard.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={onBack}
            >
              Launch Dashboard
            </button>
          </div>
        </aside>

        <main className="docs-content">
          {activeDoc === "getting-started" && <GettingStartedDoc />}
          {activeDoc === "safety-grants" && <SafetyGrantsDoc />}
          {activeDoc === "upkeep-loop" && <UpkeepLoopDoc />}
          {activeDoc === "models-router" && <ModelsRouterDoc />}
          {activeDoc === "neural-brain" && <NeuralBrainDoc />}
          {activeDoc === "privacy-security" && <PrivacySecurityDoc />}
        </main>
      </div>
    </div>
  );
}

function GettingStartedDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Getting Started</span>
        <h1>User Guide &amp; Overview</h1>
        <p className="docs-lead">
          Learn what UATU does for your development workflow, how it watches over your repositories,
          and how you can launch your first autonomous triage and upkeep cycle in under two minutes.
        </p>
      </header>

      <section>
        <h2>What is UATU?</h2>
        <p>
          UATU (Universal Autonomous Triage &amp; Upkeep) is an intelligent repository guardian designed to remove
          the burden of routine code maintenance, off-by-one bug hunting, and security advisory patching from your team.
        </p>
        <p>
          Unlike passive static analyzers that merely list hundreds of unfiltered warnings, UATU performs the complete
          engineering cycle: it identifies the issue, understands the root cause through deep reasoning, writes a minimal
          patch, executes your project tests in an isolated sandbox, and drafts a pull request ready for your review.
        </p>

        <div className="docs-callout">
          <strong>Key Principle: Human-Verified Contributions</strong>
          <p>
            UATU never automatically pushes to your default branch or merges pull requests. Every contribution is submitted
            as a distinct GitHub pull request or local artifact with a complete test pass certificate, allowing you to review
            and approve the work before it touches production.
          </p>
        </div>
      </section>

      <section>
        <h2>Interactive Quickstart Walkthrough</h2>
        <p>Follow the interactive stepper below to configure and run your first autonomous upkeep cycle.</p>
        <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
          <Stepper initialStep={1}>
            <Step>
              <div style={{ padding: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem", color: "var(--paper)" }}>Step 1: Authenticate with GitHub</h3>
                <p>
                  Click "Sign in with GitHub" on the landing page or use a local mock session. UATU verifies your identity
                  using standard GitHub OAuth, ensuring that only you can access or manage your repository runs.
                </p>
                <div className="docs-callout" style={{ marginTop: "1rem" }}>
                  <strong>OAuth Scope:</strong> Grants read-only access to your public GitHub profile identifier.
                </div>
              </div>
            </Step>
            <Step>
              <div style={{ padding: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem", color: "var(--paper)" }}>Step 2: Authorize a Target Repository</h3>
                <p>
                  Install the UATU GitHub App on the repositories you want monitored, or choose the built-in demo fixture
                  to test the system without connecting any live repositories. Repositories start in a passive inspection state.
                </p>
                <div className="docs-callout" style={{ marginTop: "1rem" }}>
                  <strong>Safety First:</strong> Repositories default to read-only until you initiate a remediation run.
                </div>
              </div>
            </Step>
            <Step>
              <div style={{ padding: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem", color: "var(--paper)" }}>Step 3: Run Autonomous Triage &amp; Upkeep</h3>
                <p>
                  Click "Start Remediation" on your dashboard. UATU scans your codebase AST, constructs a living biological neural map
                  of your architecture, isolates priority defects with Amazon Nova, tests candidate fixes in an isolated sandbox, and drafts a PR.
                </p>
                <div className="docs-callout" style={{ marginTop: "1rem" }}>
                  <strong>Zero Auto-Merge:</strong> Review test logs and diffs directly before merging.
                </div>
              </div>
            </Step>
          </Stepper>
        </div>
      </section>
    </article>
  );
}

function SafetyGrantsDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Security &amp; Policy</span>
        <h1>Repository Safety &amp; Capability Grants</h1>
        <p className="docs-lead">
          Discover how UATU enforces strict least-privilege security guarantees through policy boundaries,
          isolated sandboxes, and capability-gated write operations.
        </p>
      </header>

      <section>
        <h2>1. Passive by Default</h2>
        <p>
          When you connect a repository to UATU, the system operates in a passive inspection state by default.
          It cannot modify files, create branches, or run build scripts without an explicit, cryptographically
          logged authorization grant.
        </p>
      </section>

      <section>
        <h2>2. Capability Grants Explained</h2>
        <p>
          Before any maintenance action begins, an authorization grant is created with precise capabilities.
          You can inspect the active capabilities directly in your dashboard topbar:
        </p>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Scope</th>
                <th>Safety Guarantee</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>inspect</code></td>
                <td>Read-only</td>
                <td>Analyzes file structure, package dependencies, and open issues.</td>
              </tr>
              <tr>
                <td><code>run_tests</code></td>
                <td>Execution</td>
                <td>Runs your project verification tests strictly inside an isolated container.</td>
              </tr>
              <tr>
                <td><code>write_files</code></td>
                <td>Sandbox Only</td>
                <td>Applies synthesized diffs inside an ephemeral clone; never touches original git remote.</td>
              </tr>
              <tr>
                <td><code>create_branch</code></td>
                <td>Branch Isolation</td>
                <td>Creates dedicated feature branches prefixed with <code>uatu/</code>.</td>
              </tr>
              <tr>
                <td><code>draft_pr</code></td>
                <td>Contribution</td>
                <td>Opens reviewable pull requests with full audit proof for maintainers to inspect.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>3. Isolated Filesystem Sandboxes</h2>
        <p>
          Every patch and test verification step takes place inside an isolated temporary directory. Even if a
          test script attempts to read outside the sandbox or discover parent git repositories, UATU sets
          <code>GIT_CEILING_DIRECTORIES</code> and directory boundary checks to strictly deny illegal traversal.
        </p>
      </section>

      <section>
        <h2>4. Zero Auto-Merge Guarantee</h2>
        <p>
          UATU never requests administrative merge rights on your repositories. All contributions must be merged
          by an authorized human maintainer according to your existing branch protection rules and code review policies.
        </p>
      </section>
    </article>
  );
}

function UpkeepLoopDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Core Workflow</span>
        <h1>The 8-Stage Autonomous Upkeep Lifecycle</h1>
        <p className="docs-lead">
          Follow the lifecycle of an autonomous triage and remediation cycle from initial discovery
          to verified pull request composition.
        </p>
      </header>

      <div className="docs-flow-diagram" style={{ margin: "2rem 0" }}>
        <div className="docs-flow-step">
          <span className="docs-step-number">01</span>
          <strong>OBSERVE</strong>
          <p>Scan files, dependencies, and open issue context</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">02</span>
          <strong>UNDERSTAND</strong>
          <p>Build neural knowledge graph of repository structure</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">03</span>
          <strong>TRIAGE</strong>
          <p>Prioritize functional bugs and security advisories</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">04</span>
          <strong>INVESTIGATE</strong>
          <p>Synthesize root-cause hypothesis and patch plan</p>
        </div>
      </div>

      <div className="docs-flow-diagram" style={{ marginBottom: "2.5rem" }}>
        <div className="docs-flow-step">
          <span className="docs-step-number">05</span>
          <strong>PATCH</strong>
          <p>Apply minimal code changes on a clean uatu/* branch</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">06</span>
          <strong>VERIFY</strong>
          <p>Execute test suite in sandbox to confirm fix</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">07</span>
          <strong>CONSOLIDATE</strong>
          <p>Update repository brain with verified lesson</p>
        </div>
        <span className="docs-flow-arrow">→</span>
        <div className="docs-flow-step">
          <span className="docs-step-number">08</span>
          <strong>CONTRIBUTE</strong>
          <p>Compose pull request artifact with test logs</p>
        </div>
      </div>

      <section>
        <h2>Understanding the Verification Gate</h2>
        <p>
          Before any pull request artifact is created, UATU requires that your project test suite passes completely.
          If a proposed diff fails tests or causes regressions, the run transitions to <code>VERIFICATION_FAILED</code>
          and immediately halts, protecting your repository from broken code.
        </p>
      </section>
    </article>
  );
}

function ModelsRouterDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">AI Intelligence</span>
        <h1>AI Models &amp; The Smart Router</h1>
        <p className="docs-lead">
          Explore how UATU routes tasks across Amazon Bedrock foundation models based on task complexity,
          and how you can customize model preferences for your codebase.
        </p>
      </header>

      <section>
        <h2>1. The Smart Complexity Router (Default)</h2>
        <p>
          By default, UATU uses the <strong>Smart Complexity Router</strong>. Instead of sending all tasks to a single
          expensive or rate-limited model, the router automatically pairs each phase with the ideal model tier:
        </p>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Complexity Tier</th>
                <th>Assigned Tasks</th>
                <th>Default Model</th>
                <th>Throughput</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Low Complexity</strong></td>
                <td>Triage, finding prioritization, next-action planning</td>
                <td>Amazon Nova Micro</td>
                <td>20 RPM / 400K TPM</td>
              </tr>
              <tr>
                <td><strong>Medium Complexity</strong></td>
                <td>Dependency audits, lockfile bumps, code review bot</td>
                <td>Amazon Nova Lite</td>
                <td>20 RPM / 400K TPM</td>
              </tr>
              <tr>
                <td><strong>High Complexity</strong></td>
                <td>Deep root-cause analysis, complex unified diff synthesis</td>
                <td>Amazon Nova 2 Omni</td>
                <td>20 RPM / 8M TPM</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>2. Choosing Specific Models</h2>
        <p>
          You can override the automatic router anytime using the model selector on your dashboard. Available models include:
        </p>
        <ul>
          <li><strong>Amazon Nova Series:</strong> Nova Micro, Nova Lite, Nova 2 Omni.</li>
          <li><strong>Anthropic Claude Series:</strong> Claude 3 Haiku, Claude Haiku 4.5, Claude 3.5 Sonnet v2, Claude Sonnet 4.5/4.6, Claude Opus 4.5/4.6.</li>
          <li><strong>Meta Llama Series:</strong> Llama 3.2 3B Instruct.</li>
          <li><strong>Deterministic Rules Only:</strong> Disables LLM inference entirely and relies solely on static AST matching.</li>
        </ul>
      </section>

      <section>
        <h2>3. Automatic Quota Cascade</h2>
        <p>
          If a provider returns a rate-limit error (HTTP 429), UATU automatically cascades down to a high-capacity fallback
          model in real time, logging the event in the audit trail so your maintenance pipeline never halts.
        </p>
      </section>
    </article>
  );
}

function NeuralBrainDoc() {
  const brain = demoBrainMap();

  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Knowledge Graph</span>
        <h1>Reading Your Repository Brain</h1>
        <p className="docs-lead">
          Discover how UATU constructs a spatial memory graph of your files, dependencies, and past fixes,
          enabling smarter maintenance decisions over time.
        </p>
      </header>

      <section>
        <h2>1. Interactive Brain Preview</h2>
        <p>
          Below is a live interactive preview of a repository brain. You can click nodes to inspect relationships,
          filter by category, and zoom or pan across the graph:
        </p>

        <div style={{ margin: "1.5rem 0", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <BrainMapView brain={brain} />
        </div>
      </section>

      <section>
        <h2>2. Neuron Types and What They Mean</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Neuron Kind</th>
                <th>Visual Accent</th>
                <th>Role in Your Codebase</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Repository &amp; Org</strong></td>
                <td>Silver / Emerald</td>
                <td>The structural root grouping files and configurations.</td>
              </tr>
              <tr>
                <td><strong>File &amp; Directory</strong></td>
                <td>Slate Metallic</td>
                <td>The physical file tree and module paths within your project.</td>
              </tr>
              <tr>
                <td><strong>Dependency</strong></td>
                <td>Emerald Green</td>
                <td>External libraries referenced in package.json or lockfiles.</td>
              </tr>
              <tr>
                <td><strong>Bug &amp; SecurityFinding</strong></td>
                <td>Laser Crimson</td>
                <td>Identified logic errors or CVE vulnerabilities requiring attention.</td>
              </tr>
              <tr>
                <td><strong>Patch &amp; Verification</strong></td>
                <td>Cyan / Green</td>
                <td>Candidate code fixes and their automated test pass outcomes.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

function PrivacySecurityDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Trust &amp; Privacy</span>
        <h1>Privacy Policy &amp; Code Safety</h1>
        <p className="docs-lead">
          Our commitments to confidentiality, data minimization, and total maintainer control over your codebase.
        </p>
      </header>

      <div className="docs-callout">
        <strong>Our Core Guarantee</strong>
        <p>
          Your code, issue contents, and repository history are never stored, logged, or used to train public or private
          AI models. All inference requests are executed ephemerally via enterprise Amazon Bedrock endpoints.
        </p>
      </div>

      <section>
        <h2>1. Ephemeral Sandbox Destruction</h2>
        <p>
          When UATU clones a repository to test a patch or verify tests, it does so in an ephemeral directory. Once the
          remediation run finishes or reaches timeout, the sandbox is immediately purged.
        </p>
      </section>

      <section>
        <h2>2. Multi-Tenant User Isolation</h2>
        <p>
          Every repository brain, capability grant, and audit event is partitioned by your authenticated GitHub User ID.
          No other operator can see or access your repositories or audit records.
        </p>
      </section>

      <section>
        <h2>3. Revoking Access</h2>
        <p>
          You can revoke grants at any time from the UATU Dashboard or uninstall the GitHub App directly in your
          GitHub Settings. Upon uninstallation, all temporary installation tokens are immediately invalidated.
        </p>
      </section>
    </article>
  );
}
