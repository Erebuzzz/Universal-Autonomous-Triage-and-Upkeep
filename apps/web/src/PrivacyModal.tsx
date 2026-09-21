interface Props {
  isOpen?: boolean;
  onClose: () => void;
  asFullPage?: boolean;
}

export function PrivacyModal({ isOpen = true, onClose, asFullPage = false }: Props) {
  if (!isOpen && !asFullPage) return null;

  const content = (
    <div className={asFullPage ? "void-card" : "modal-card"}>
      <header className={asFullPage ? "" : "modal-header"}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="hero-beacon" style={{ margin: 0, padding: "0.2rem 0.5rem" }}>
            <span className="beacon-dot" />
            Security Protocol
          </span>
          <h3 style={{ margin: 0, fontSize: "1.35rem", color: "var(--paper)" }}>
            Privacy Policy &amp; Code Safety
          </h3>
        </div>
        {!asFullPage && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close Privacy Policy"
            style={{ fontSize: "1.1rem", minHeight: "36px", padding: "0.2rem 0.6rem" }}
          >
            ✕
          </button>
        )}
      </header>

      <div className={asFullPage ? "" : "modal-body"}>
        <p style={{ fontSize: "1rem", color: "var(--paper-dim)", marginTop: asFullPage ? "1rem" : 0 }}>
          UATU is engineered with a strict <strong>zero-trust security model</strong>. We treat your software
          codebase, proprietary algorithms, and team git history as strictly confidential assets.
        </p>

        <h4>1. Zero Model Training Guarantee</h4>
        <p>
          UATU utilizes enterprise foundation models (such as Amazon Nova, Anthropic Claude, and Meta Llama)
          strictly through enterprise inference APIs with zero retention. Under our AWS Bedrock deployment
          architecture, <strong>your code, repository AST trees, issue contents, and git diffs are never stored,
          logged, or used to train or fine-tune public or private foundation models</strong>.
        </p>

        <h4>2. Ephemeral Sandbox Execution</h4>
        <p>
          All static analysis, dependency graph inspection, and verification test suites run inside isolated,
          single-tenant temporary filesystem sandboxes. These workspaces:
        </p>
        <ul>
          <li>Are provisioned in volatile memory or isolated storage.</li>
          <li>Enforce strict OS-level command allowlists (blocking dangerous lifecycle hooks or network egress).</li>
          <li>Are destroyed and purged immediately once a triage or verification run terminates.</li>
        </ul>

        <h4>3. Multi-Tenant Cryptographic Partitioning</h4>
        <p>
          Every repository Brain memory graph, capability grant, and audit log row is partitioned by your
          authenticated GitHub User ID. Even in cross-repository dependency vulnerability tracking, only
          public open-source package coordinates (e.g. <code>minimist@0.0.8</code>) are referenced; private
          business logic and organizational repository names are never leaked across tenants.
        </p>

        <h4>4. Human Authority &amp; Zero Auto-Merge</h4>
        <p>
          UATU never merges code into your main or production branches. The system creates isolated feature
          branches (prefixed with <code>uatu/</code>) and opens reviewable draft pull requests. You and your team
          maintain total authority over whether to accept, modify, or reject every change.
        </p>

        <h4>5. Automatic Secret Redaction</h4>
        <p>
          Before any error trace, git output, or audit event is persisted to storage or rendered in the web dashboard,
          it passes through a cryptographic secret redaction filter that strips GitHub tokens, API keys, and session
          hashes automatically.
        </p>

        <h4>6. One-Click Revocation</h4>
        <p>
          You can revoke authorization grants at any moment via the UATU Dashboard or uninstall the GitHub App
          directly from your personal or organization GitHub settings. Access tokens expire automatically within
          60 minutes.
        </p>
      </div>

      <footer className={asFullPage ? "void-actions" : "modal-footer"} style={{ marginTop: asFullPage ? "1.5rem" : 0 }}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {asFullPage ? "← Return to App" : "Understood"}
        </button>
      </footer>
    </div>
  );

  if (asFullPage) {
    return (
      <div className="void-page">
        <div className="landing-atmosphere" aria-hidden>
          <div className="landing-grid" />
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()}>{content}</div>
    </div>
  );
}
