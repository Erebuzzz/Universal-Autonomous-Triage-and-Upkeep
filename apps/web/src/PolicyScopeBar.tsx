import type { Grant, HealthStatus } from "./api";

type Props = {
  grant: Grant | null;
  health: HealthStatus | null;
  policyDenial: string | null;
  onDismissDenial?: () => void;
};

export function PolicyScopeBar({ grant, health, policyDenial, onDismissDenial }: Props) {
  const caps = grant?.capabilities?.length ? grant.capabilities.join(" · ") : "none";
  const source = grant?.source ?? (grant ? "fixture" : null);
  const repo = grant?.repositoryFullName ?? grant?.repositoryName ?? "-";

  return (
    <div className="policy-scope" role="region" aria-label="Authorization and policy scope">
      <div className="policy-scope-grid">
        <div>
          <span className="policy-label">Grant</span>
          <span className="policy-value mono">{grant ? grant.id.slice(0, 10) : "none"}</span>
        </div>
        <div>
          <span className="policy-label">Target</span>
          <span className="policy-value">{repo}</span>
        </div>
        <div>
          <span className="policy-label">Source</span>
          <span className={`policy-pill ${source === "github" ? "pill-gh" : source ? "pill-fx" : ""}`}>
            {source ?? "-"}
          </span>
        </div>
        <div>
          <span className="policy-label">Capabilities</span>
          <span className="policy-value mono">{caps}</span>
        </div>
        <div>
          <span className="policy-label">Reasoning</span>
          <span className={`policy-pill ${health?.bedrock ? "pill-bedrock" : "pill-rules"}`}>
            {health?.bedrock ? "bedrock on" : "rules only"}
          </span>
        </div>
      </div>

      {policyDenial ? (
        <div className="policy-denial" role="alert">
          <div>
            <strong>Policy denied</strong>
            <p>{policyDenial}</p>
          </div>
          {onDismissDenial ? (
            <button className="btn btn-ghost" type="button" onClick={onDismissDenial}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
