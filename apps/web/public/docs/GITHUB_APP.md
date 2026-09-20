# GitHub App & live PR setup

UATU can open **local PR artifacts** without GitHub credentials. **Live pull requests** require App/token configuration on the **API host** (never in `VITE_*` browser env).

## Local demo (no live PR)

1. Run the API and web app from the monorepo root.
2. Authorize a fixture (or GitHub target) in the dashboard.
3. Run triage → investigate → verify. Contribution shows a **local artifact** (branch name + body) when ready.

## Live GitHub PRs

Set these on the API process / Lambda / host (server-side only):

```bash
UATU_GITHUB_TOKEN=<fine-grained or classic PAT with repo + pull request scopes>
UATU_GITHUB_REPO=owner/name
UATU_GITHUB_BASE_BRANCH=main
```

Optional webhook verification:

```bash
UATU_GITHUB_WEBHOOK_SECRET=<shared secret for /api/webhooks/github>
```

## GitHub App (multi-tenant)

For OAuth install + installation tokens, configure the GitHub App and related server env as described in [MULTI_TENANT.md](./MULTI_TENANT.md).

Web-only vars (safe in `VITE_*`):

- `VITE_UATU_API_URL` — API origin for the dashboard
- `VITE_UATU_GITHUB_APP_SLUG` — public App slug for install deep-links
- `VITE_UATU_MOCK_AUTH` — local mock sign-in (dev only)

**Do not** put `UATU_GITHUB_TOKEN`, App private keys, or webhook secrets in `VITE_*`.

## Deploy notes

See the root [README.md](../README.md) CDK / Vercel sections and [MULTI_TENANT.md](./MULTI_TENANT.md) for split frontend/API deploy.
