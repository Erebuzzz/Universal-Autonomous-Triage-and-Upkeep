# GitHub App + OAuth setup (uatu-agent)

Configure these **after** you have a public API URL and a Vercel web origin.

## Why the App private key never goes in `VITE_*`

Vite inlines every `VITE_*` variable into client JavaScript. Anyone can open DevTools and read them. The GitHub App private key mints installation tokens that can clone and push to every installed repo. Keep App id/key, OAuth client secret, webhook secret, and Bedrock/AWS credentials **only** on the API host (Lambda / local `.env`).

## GitHub App settings (slug: `uatu-agent`)

| Field | Production value |
|-------|------------------|
| **Homepage URL** | `https://<your-vercel-domain>` |
| **Callback URL** (if App also does user auth) | Prefer separate OAuth App below |
| **Setup URL** (post-install redirect) | `https://<your-vercel-domain>/onboarding/complete` |
| **Redirect on update** | Optional same Setup URL |
| **Webhook URL** | `https://<ApiUrl>/api/webhooks/github` |
| **Webhook secret** | Same as Lambda `UATU_GITHUB_WEBHOOK_SECRET` |
| **Permissions** | Contents R/W, Pull requests R/W, Issues R, Metadata R (as needed for clone + PR + review comments) |
| **Subscribe to events** | `push`, `pull_request`, `issues`, `installation`, `installation_repositories` |

After install, GitHub redirects to Setup URL with `installation_id` and `setup_action`. The web app links that installation via `POST /api/me/installations`.

## OAuth App (Sign in with GitHub)

Create a **GitHub OAuth App** (can be separate from the GitHub App):

| Field | Production value |
|-------|------------------|
| **Homepage URL** | `https://<your-vercel-domain>` |
| **Authorization callback URL** | `https://<ApiUrl>/auth/github/callback` |

Lambda env:

- `UATU_GITHUB_OAUTH_CLIENT_ID`
- `UATU_GITHUB_OAUTH_CLIENT_SECRET`
- `UATU_GITHUB_OAUTH_CALLBACK_URL` = that callback URL exactly

Local callback example: `http://localhost:8787/auth/github/callback` with web on `http://localhost:5173`.

## Vercel vs API env (quick map)

| Secret / config | Vercel | AWS Lambda |
|-----------------|--------|------------|
| `VITE_UATU_API_URL` | yes | no |
| `VITE_UATU_GITHUB_APP_SLUG` | yes (optional) | no |
| App private key / App id | **no** | **yes** |
| OAuth client secret | **no** | **yes** |
| Webhook secret | **no** | **yes** |
| `UATU_CORS_ORIGIN` = Vercel origin | no | **yes** |

## Production URLs to paste (fill after deploy)

```text
Web (Vercel):     https://uatu-beta.vercel.app
                  (also) https://uatu-unstable-kernel.vercel.app
API (API GW):     https://2zq3almhy2.execute-api.ap-south-1.amazonaws.com
Setup URL:        https://uatu-beta.vercel.app/onboarding/complete
OAuth callback:   https://2zq3almhy2.execute-api.ap-south-1.amazonaws.com/auth/github/callback
Webhook URL:      https://2zq3almhy2.execute-api.ap-south-1.amazonaws.com/api/webhooks/github
```

### Operator follow-ups (required for live Sign-in)

1. Lambda env: set App id/key, OAuth client id/secret, webhook secret, `UATU_WEB_ORIGIN=https://uatu-beta.vercel.app`, `UATU_CORS_ORIGIN` same, `UATU_COOKIE_SECURE=true`, `UATU_COOKIE_SAMESITE=None`, `UATU_GITHUB_OAUTH_CALLBACK_URL` as above.
2. GitHub App: paste Setup URL + Webhook URL/secret; OAuth App: paste callback URL.
3. Redeploy web after merging local D–G work to the branch Vercel builds (current production deploy is from `main@b431f9f`; Phases D–G are local until committed/pushed).
4. If Vercel Authentication (SSO) blocks the public site, disable it under Project → Deployment Protection.

## Smoke after wiring

1. Open Vercel site → Sign in with GitHub → lands back with session cookie.
2. Install / reopen App → `/onboarding/complete?installation_id=…` → link installation → pick repo.
3. Or use **Authorize fixture** for camera-ready demo without live clone.
4. `GET /health` on API shows `oauthConfigured: true`, `githubAppConfigured: true`.
