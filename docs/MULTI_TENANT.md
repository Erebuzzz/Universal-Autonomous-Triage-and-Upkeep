# Multi-tenant local & split deploy (Phase K)

## Local fixture demo (no cloud / no GitHub App)

```bash
# From repo root
set UATU_BEDROCK_ENABLED=false
set UATU_AUTH_REQUIRED=false
set UATU_DETECTION_MODE=auto
npm run demo
# or: npm run dev:api  +  npm run dev:web
```

- Dashboard uses session user `local-demo` when auth is not required.
- Authorize fixture → start → run still works end-to-end with local PR artifacts.
- LLM/Bedrock stays off; triage/planNextAction use rules. Detection falls back to fixture when general finds nothing.
- Deployed CDK stacks default `UATU_AUTH_REQUIRED=true` (fail closed). Set `false` only for local/break-glass demos.

### Detection vs remediation installs

- Detection-time `npm install` uses `--ignore-scripts` (no lifecycle hooks).
- Remediation package bumps may run `npm install` **with** scripts when refreshing lockfiles after a version bump.

### LLM variance (when Bedrock is on)

- Use inference profile ids in ap-south-1 (e.g. `apac.amazon.nova-micro-v1:0`), not bare foundation model ids.
- Agent decisions log `provider=bedrock|rules` plus reasoning in the audit trail.
- Functional diffs and code-review JSON can vary between runs; verify + reject/retry apply.

## GitHub App + OAuth (API host only)

Set on **AWS Lambda / local API**, never on Vercel:

- `UATU_GITHUB_APP_ID`, `UATU_GITHUB_APP_PRIVATE_KEY`
- `UATU_GITHUB_OAUTH_CLIENT_ID`, `UATU_GITHUB_OAUTH_CLIENT_SECRET`
- `UATU_GITHUB_OAUTH_CALLBACK_URL` → `https://<api>/auth/github/callback`
- `UATU_BEDROCK_*`, AWS credentials

Vercel web only needs:

- `VITE_UATU_API_URL=https://<api-gw-url>`

## Split deploy (K8)

1. `npm run cdk:synth` / deploy `infra/cdk` (API GW + Lambda API + SQS worker + DynamoDB + S3).
2. `npm run build -w @uatu/web` and deploy `apps/web` to Vercel (`apps/web/vercel.json`).
3. Set `UATU_WEB_ORIGIN` / `UATU_CORS_ORIGIN` to the Vercel origin; enable `UATU_CORS_CREDENTIALS=true` and `UATU_COOKIE_SECURE=true` with `SameSite=None` for cross-site cookies.
4. Do **not** put App private key or Bedrock credentials in Vercel env.

## Quotas

- `UATU_QUOTA_MAX_CONCURRENT` (default 1)
- `UATU_QUOTA_MAX_DAILY` (default 20)
- `UATU_QUOTA_MAX_MONTHLY` (default 200)
- `UATU_RUN_WALL_CLOCK_MS` (default 600000)
