import { useState, useEffect } from "react";

type DocId = "github-app" | "deployment" | "multi-tenant" | "architecture";

interface DocItem {
  id: DocId;
  title: string;
  category: string;
  summary: string;
}

const DOCS: DocItem[] = [
  {
    id: "github-app",
    title: "GitHub App & Live PR Setup",
    category: "Integration",
    summary: "Configure the GitHub App, OAuth sign-in, and secret isolation for live pull requests.",
  },
  {
    id: "deployment",
    title: "Cloud & Split Deployment",
    category: "Infrastructure",
    summary: "Host the frontend on Vercel and backend services on AWS API Gateway and Lambda.",
  },
  {
    id: "multi-tenant",
    title: "Multi-Tenant Isolation & Quotas",
    category: "Security",
    summary: "Per-user partitioning, usage limits, and execution sandboxing.",
  },
  {
    id: "architecture",
    title: "System Design & Brain Model",
    category: "Architecture",
    summary: "Neuron graph knowledge layer, policy boundaries, and autonomous upkeep loops.",
  },
];

function getInitialDoc(): DocId {
  try {
    const q = new URLSearchParams(window.location.search).get("doc");
    if (q === "deployment" || q === "multi-tenant" || q === "architecture" || q === "github-app") {
      return q;
    }
  } catch {
    /* ignore */
  }
  return "github-app";
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="docs-code-block">
      <div className="docs-code-header">
        <span className="docs-code-lang">{language}</span>
        <button type="button" className="btn btn-ghost btn-sm docs-copy-btn" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="docs-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
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
        <div className="brand-header-group" style={{ cursor: "pointer" }} onClick={onBack}>
          <img src="/logo.png" alt="UATU Logo" className="brand-logo" />
          <div className="brand-text">
            <div className="brand-mark">UATU</div>
            <div className="brand-tag">Operator Documentation</div>
          </div>
        </div>
        <div className="docs-topbar-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Back to App
          </button>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="Documentation Navigation">
          <p className="docs-sidebar-heading">Guides &amp; Reference</p>
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
            <p className="docs-card-title">Need help?</p>
            <p className="docs-card-body">
              UATU operates safely with local fixtures when cloud credentials or GitHub Apps are not configured.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={onBack}
            >
              Launch Operator View
            </button>
          </div>
        </aside>

        <main className="docs-content">
          {activeDoc === "github-app" && <GitHubAppDoc />}
          {activeDoc === "deployment" && <DeploymentDoc />}
          {activeDoc === "multi-tenant" && <MultiTenantDoc />}
          {activeDoc === "architecture" && <ArchitectureDoc />}
        </main>
      </div>
    </div>
  );
}

function GitHubAppDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Integration Guide</span>
        <h1>GitHub App &amp; Live PR Setup</h1>
        <p className="docs-lead">
          Connect your GitHub repositories to UATU with fine-grained permissions, secure installation token minting,
          and automated PR contributions.
        </p>
      </header>

      <div className="docs-callout docs-callout-warning">
        <strong>Security Rule: Never put private keys in browser environment variables</strong>
        <p>
          Vite bundles every <code>VITE_*</code> variable into client JavaScript. Keep GitHub App private keys,
          OAuth client secrets, and webhook secrets exclusively on the API host (Lambda or server <code>.env</code>).
        </p>
      </div>

      <section>
        <h2>1. GitHub App Settings (Slug: uatu-agent)</h2>
        <p>Configure the following values in your GitHub App settings console:</p>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Production Value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Homepage URL</strong></td>
                <td><code>https://&lt;your-vercel-domain&gt;</code></td>
                <td>Root URL of the deployed web interface</td>
              </tr>
              <tr>
                <td><strong>Setup URL</strong></td>
                <td><code>https://&lt;your-vercel-domain&gt;/onboarding/complete</code></td>
                <td>Where GitHub redirects after App installation</td>
              </tr>
              <tr>
                <td><strong>Webhook URL</strong></td>
                <td><code>https://&lt;ApiUrl&gt;/api/webhooks/github</code></td>
                <td>API Gateway endpoint for event ingestion</td>
              </tr>
              <tr>
                <td><strong>Webhook secret</strong></td>
                <td>Match <code>UATU_GITHUB_WEBHOOK_SECRET</code></td>
                <td>Used for cryptographic HMAC-SHA256 signature checks</td>
              </tr>
              <tr>
                <td><strong>Permissions</strong></td>
                <td>Contents (R/W), Pull requests (R/W), Issues (R), Metadata (R)</td>
                <td>Allows cloning repositories, opening PRs, and posting review comments</td>
              </tr>
              <tr>
                <td><strong>Events</strong></td>
                <td><code>push</code>, <code>pull_request</code>, <code>issues</code>, <code>installation</code></td>
                <td>Triggers autonomous triage and maintenance pipelines</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>2. GitHub OAuth App Configuration</h2>
        <p>
          To enable user authentication with the "Sign in with GitHub" button, register a companion OAuth application:
        </p>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Homepage URL</strong></td>
                <td><code>https://&lt;your-vercel-domain&gt;</code></td>
              </tr>
              <tr>
                <td><strong>Authorization callback URL</strong></td>
                <td><code>https://&lt;ApiUrl&gt;/auth/github/callback</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>3. Environment Variable Segregation</h2>
        <p>
          To protect administrative credentials, variables must be split strictly between Vercel and the backend API:
        </p>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Variable Name</th>
                <th>Vercel (Frontend)</th>
                <th>AWS Lambda (Backend)</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>VITE_UATU_API_URL</code></td>
                <td>Yes</td>
                <td>No</td>
                <td>Public API endpoint URL</td>
              </tr>
              <tr>
                <td><code>VITE_UATU_GITHUB_APP_SLUG</code></td>
                <td>Yes</td>
                <td>No</td>
                <td>Used to generate installation links</td>
              </tr>
              <tr>
                <td><code>UATU_GITHUB_APP_ID</code></td>
                <td>No</td>
                <td>Yes</td>
                <td>GitHub App ID for JWT generation</td>
              </tr>
              <tr>
                <td><code>UATU_GITHUB_APP_PRIVATE_KEY</code></td>
                <td>No</td>
                <td>Yes</td>
                <td>RSA private key for App authentication</td>
              </tr>
              <tr>
                <td><code>UATU_GITHUB_OAUTH_CLIENT_SECRET</code></td>
                <td>No</td>
                <td>Yes</td>
                <td>Secret for user OAuth flow</td>
              </tr>
              <tr>
                <td><code>UATU_GITHUB_WEBHOOK_SECRET</code></td>
                <td>No</td>
                <td>Yes</td>
                <td>HMAC secret for webhook verification</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>4. Verification &amp; Testing</h2>
        <p>After completing configuration, verify the setup with this step-by-step checklist:</p>
        <ol className="docs-step-list">
          <li>Check <code>GET /health</code> on your API. Ensure both <code>oauthConfigured</code> and <code>githubAppConfigured</code> return <code>true</code>.</li>
          <li>Open the web app and click "Sign in with GitHub". Ensure the session completes and sets the httpOnly cookie.</li>
          <li>Install the GitHub App on a target repository and confirm that the redirect brings you to <code>/onboarding/complete</code>.</li>
          <li>Pick a repository to create an authorization grant and start an autonomous triage run.</li>
        </ol>
      </section>
    </article>
  );
}

function DeploymentDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Operations Guide</span>
        <h1>Cloud &amp; Split Deployment</h1>
        <p className="docs-lead">
          Deploy UATU using a split-cloud architecture: Vercel for high-performance static UI hosting, and AWS for
          secure backend services, background workers, and persistent state.
        </p>
      </header>

      <section>
        <h2>1. System Architecture</h2>
        <p>
          UATU separates public web surfaces from heavy computing and secret storage:
        </p>
        <div className="docs-diagram-box">
          <p className="docs-diagram-caption">Deployment Topology</p>
          <pre className="docs-ascii-diagram">
{`Browser (Operator)
   │
   ├──► Vercel (apps/web) ─────────► Static assets & UI
   │
   └──► AWS API Gateway ───────────► Lambda API (auth & triage)
            │
            ├──► SQS Queue ────────► Lambda Worker (cloning & testing)
            │
            ├──► DynamoDB ─────────► Tasks & Knowledge Brain
            │
            └──► S3 Bucket ────────► Remediation PR Artifacts`}
          </pre>
        </div>
      </section>

      <section>
        <h2>2. AWS CDK Deployment</h2>
        <p>Deploy the backend infrastructure with AWS CDK:</p>
        <CodeBlock
          code={`cd infra/cdk
npm install
npx cdk synth
npx cdk deploy --outputs-file ../../data/cdk-outputs.json`}
        />
        <p>The CDK stack provisions the following resources:</p>
        <ul>
          <li><strong>API Gateway HTTP API:</strong> Routes incoming requests and handles CORS headers.</li>
          <li><strong>Lambda API with Git Layer:</strong> Processes incoming requests, webhook events, and OAuth handshakes.</li>
          <li><strong>SQS Job Queue:</strong> Buffers background tasks with a dedicated Dead Letter Queue (DLQ).</li>
          <li><strong>Lambda Worker:</strong> Clones sandboxes, applies patches, and executes test suites.</li>
          <li><strong>DynamoDB Tasks Table:</strong> Stores multi-tenant tasks and brain neuron graphs.</li>
          <li><strong>S3 Artifacts Bucket:</strong> Retains verification logs, diffs, and PR artifacts.</li>
        </ul>
      </section>

      <section>
        <h2>3. Vercel Frontend Configuration</h2>
        <p>To deploy the web app on Vercel:</p>
        <ol className="docs-step-list">
          <li>Set the root directory to <code>apps/web</code> (or link via the monorepo root with <code>apps/web/vercel.json</code>).</li>
          <li>Configure <code>VITE_UATU_API_URL</code> to point to your AWS API Gateway endpoint.</li>
          <li>Configure <code>VITE_UATU_GITHUB_APP_SLUG</code> to match your registered GitHub App.</li>
        </ol>
      </section>

      <section>
        <h2>4. Local Fallback Mode</h2>
        <p>To run the complete system locally without AWS infrastructure:</p>
        <CodeBlock
          code={`# Terminal 1: Launch API
set UATU_AUTH_REQUIRED=false
set UATU_BEDROCK_ENABLED=false
npm run dev:api

# Terminal 2: Launch Web App
npm run dev:web`}
        />
      </section>
    </article>
  );
}

function MultiTenantDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">Security Architecture</span>
        <h1>Multi-Tenant Isolation &amp; Quotas</h1>
        <p className="docs-lead">
          UATU safeguards operator data through strict user partitioning, usage limits, and isolated sandbox
          filesystems.
        </p>
      </header>

      <section>
        <h2>1. Tenant Data Partitioning</h2>
        <p>
          Every grant, task, and brain memory graph is isolated by user ID. Data is never shared across tenants:
        </p>
        <ul>
          <li><strong>File Storage:</strong> Partitioned as <code>data/sandbox/tenants/&lt;userId&gt;/&lt;runId&gt;/&lt;repo&gt;</code>.</li>
          <li><strong>DynamoDB Storage:</strong> Keys are partitioned with <code>TENANT#&lt;userId&gt;#BRAIN#&lt;repoId&gt;</code>.</li>
          <li><strong>Session Integrity:</strong> The <code>grantedBy</code> property must match the authenticated session user ID.</li>
        </ul>
      </section>

      <section>
        <h2>2. Usage Limits &amp; Execution Quotas</h2>
        <p>
          To prevent resource exhaustion and abuse, UATU enforces strict execution quotas per tenant:
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Quota Variable</th>
                <th>Default Value</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>UATU_QUOTA_MAX_CONCURRENT</code></td>
                <td>1</td>
                <td>Maximum concurrent active tasks per operator</td>
              </tr>
              <tr>
                <td><code>UATU_QUOTA_MAX_DAILY</code></td>
                <td>20</td>
                <td>Maximum task runs initiated within a rolling 24-hour window</td>
              </tr>
              <tr>
                <td><code>UATU_QUOTA_MAX_MONTHLY</code></td>
                <td>200</td>
                <td>Maximum task runs per calendar month</td>
              </tr>
              <tr>
                <td><code>UATU_RUN_WALL_CLOCK_MS</code></td>
                <td>600,000 (10 min)</td>
                <td>Maximum wall-clock execution time before automatic termination</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>3. Dependency Installation Safety</h2>
        <p>
          UATU prevents arbitrary code execution during package inspection:
        </p>
        <ul>
          <li><strong>Detection Phase:</strong> <code>npm install</code> is executed strictly with <code>--ignore-scripts</code>. No lifecycle scripts (preinstall, postinstall) are executed.</li>
          <li><strong>Remediation Phase:</strong> Package version upgrades only execute lifecycle scripts if regression testing requires them inside an isolated container.</li>
        </ul>
      </section>
    </article>
  );
}

function ArchitectureDoc() {
  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <span className="docs-badge">System Core</span>
        <h1>System Design &amp; Brain Model</h1>
        <p className="docs-lead">
          Explore UATU's evolving knowledge graph, capability-bounded policy engine, and autonomous repair lifecycle.
        </p>
      </header>

      <section>
        <h2>1. The Autonomous Upkeep Loop</h2>
        <p>
          UATU operates through a nine-stage autonomous lifecycle:
        </p>
        <div className="docs-flow-diagram">
          <div className="docs-flow-step">
            <span className="docs-step-number">01</span>
            <strong>OBSERVE</strong>
            <p>Scan repository layout, dependencies, and issues</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">02</span>
            <strong>UNDERSTAND</strong>
            <p>Construct neuron nodes and establish synaptic connections</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">03</span>
            <strong>REMEMBER</strong>
            <p>Recall past experiences, known risks, and historical fixes</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">04</span>
            <strong>TRIAGE</strong>
            <p>Rank actionable defects and prioritize high-confidence items</p>
          </div>
        </div>

        <div className="docs-flow-diagram" style={{ marginTop: "1rem" }}>
          <div className="docs-flow-step">
            <span className="docs-step-number">05</span>
            <strong>INVESTIGATE</strong>
            <p>Isolate root causes and analyze affected code paths</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">06</span>
            <strong>FIX</strong>
            <p>Synthesize candidate unified diffs and patch target files</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">07</span>
            <strong>VERIFY</strong>
            <p>Run regression tests and confirm fix effectiveness</p>
          </div>
          <div className="docs-flow-arrow">→</div>
          <div className="docs-flow-step">
            <span className="docs-step-number">08</span>
            <strong>LEARN &amp; PR</strong>
            <p>Update Brain confidence and generate pull request artifacts</p>
          </div>
        </div>
      </section>

      <section>
        <h2>2. Live Neuron Knowledge Graph</h2>
        <p>
          Unlike static analyzers, UATU maintains an internal graph that models code relationships and historical outcomes:
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Neuron Kind</th>
                <th>Description</th>
                <th>Relationship Types</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Organization</strong></td>
                <td>Root boundary grouping related repositories</td>
                <td><code>CONTAINS</code></td>
              </tr>
              <tr>
                <td><strong>Repository</strong></td>
                <td>Root code structure for a single codebase</td>
                <td><code>CONTAINS</code>, <code>DEPENDS_ON</code></td>
              </tr>
              <tr>
                <td><strong>File &amp; Directory</strong></td>
                <td>Filesystem hierarchy elements</td>
                <td><code>LOCATED_IN</code>, <code>AFFECTS</code></td>
              </tr>
              <tr>
                <td><strong>Dependency</strong></td>
                <td>External libraries; shared across organization repositories</td>
                <td><code>DEPENDS_ON</code></td>
              </tr>
              <tr>
                <td><strong>Bug &amp; SecurityFinding</strong></td>
                <td>Identified defects with severity scores and evidence links</td>
                <td><code>CAUSED_BY</code>, <code>FIXES</code></td>
              </tr>
              <tr>
                <td><strong>Patch &amp; VerificationResult</strong></td>
                <td>Applied diffs and their automated test verification results</td>
                <td><code>FIXES</code>, <code>VERIFIED_BY</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>3. Capability-Based Policy Engine</h2>
        <p>
          Every write action requires explicit capability grants. The agent cannot escalate privileges on its own:
        </p>
        <ul>
          <li><strong>Path Allowlist:</strong> Filesystem modifications outside the designated repository sandbox are denied immediately.</li>
          <li><strong>Command Allowlist:</strong> Only pre-approved test and build commands can be executed by the runner.</li>
          <li><strong>Security Research Gating:</strong> Vulnerability research and CVE remediation require an explicit <code>security-research</code> scope grant.</li>
        </ul>
      </section>
    </article>
  );
}
