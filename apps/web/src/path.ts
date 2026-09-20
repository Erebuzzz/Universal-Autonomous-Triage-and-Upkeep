/** Lightweight pathname routing for the Vite SPA (no react-router). */

export function currentPath(): string {
  try {
    return window.location.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

export function isOnboardingCompletePath(path = currentPath()): boolean {
  return path === "/onboarding/complete" || path.endsWith("/onboarding/complete");
}

export function isDocsPath(path = currentPath()): boolean {
  return path === "/docs" || path.startsWith("/docs/") || path.endsWith("/docs");
}

export function navigate(path: string, opts?: { replace?: boolean; search?: string }) {
  const url = `${path}${opts?.search ?? ""}`;
  if (opts?.replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Parse GitHub App setup redirect query params. */
export function readInstallQuery(search = window.location.search): {
  installationId: string | null;
  setupAction: string | null;
} {
  const q = new URLSearchParams(search);
  const installationId =
    q.get("installation_id") ?? q.get("installationId") ?? q.get("installation") ?? null;
  const setupAction = q.get("setup_action") ?? q.get("setupAction") ?? null;
  return { installationId, setupAction };
}

/** Strip install query params after capture (keep path). */
export function clearInstallQueryParams(): void {
  try {
    const url = new URL(window.location.href);
    for (const key of [
      "installation_id",
      "installationId",
      "installation",
      "setup_action",
      "setupAction",
    ]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* ignore */
  }
}

const PENDING_INSTALL_KEY = "uatu_pending_installation";

/** Non-secret: survive OAuth round-trip (API redirects to /?signedIn=1). sessionStorage only. */
export function stashPendingInstall(installationId: string, setupAction: string | null): void {
  try {
    sessionStorage.setItem(
      PENDING_INSTALL_KEY,
      JSON.stringify({ installationId, setupAction, at: Date.now() }),
    );
  } catch {
    /* private mode */
  }
}

export function peekPendingInstall(): { installationId: string; setupAction: string | null } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INSTALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      installationId?: string;
      setupAction?: string | null;
      at?: number;
    };
    if (!parsed.installationId) return null;
    if (parsed.at && Date.now() - parsed.at > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem(PENDING_INSTALL_KEY);
      return null;
    }
    return {
      installationId: parsed.installationId,
      setupAction: parsed.setupAction ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPendingInstall(): void {
  try {
    sessionStorage.removeItem(PENDING_INSTALL_KEY);
  } catch {
    /* ignore */
  }
}

/** After OAuth, restore Setup URL if we stashed an installation. */
export function resumePendingInstallIfNeeded(): boolean {
  const pending = peekPendingInstall();
  if (!pending) return false;
  const search = new URLSearchParams();
  search.set("installation_id", pending.installationId);
  if (pending.setupAction) search.set("setup_action", pending.setupAction);
  navigate("/onboarding/complete", { replace: true, search: `?${search.toString()}` });
  return true;
}

/** Public Setup URL operators should configure on the GitHub App. */
export function githubAppSetupUrl(origin = window.location.origin): string {
  return `${origin}/onboarding/complete`;
}

/**
 * Install deep-link. GitHub redirects to the App's configured Setup URL after install
 * (should be `/onboarding/complete`). `state` is echoed when GitHub supports it.
 * Callers must pass a real public slug (VITE_UATU_GITHUB_APP_SLUG); empty slug yields "".
 */
export function githubAppInstallUrl(slug: string, setupOrigin = window.location.origin): string {
  const clean = slug.trim();
  if (!clean) return "";
  const state = encodeURIComponent(`${setupOrigin}/onboarding/complete`);
  return `https://github.com/apps/${clean}/installations/new?state=${state}`;
}
