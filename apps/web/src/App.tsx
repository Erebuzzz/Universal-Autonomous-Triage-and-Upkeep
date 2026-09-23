import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  flags,
  mockLocalUser,
  mockMeResponse,
  type Grant,
  type HealthStatus,
  type MeResponse,
  type UatuUser,
} from "./api";
import { BrainMapPreview } from "./BrainMapPreview";
import { BrandLockup } from "./BrandLockup";
import { Dashboard } from "./Dashboard";
import { DocsPage } from "./DocsPage";
import { Landing } from "./Landing";
import { NotFoundPage } from "./NotFoundPage";
import { Onboarding } from "./Onboarding";
import { OnboardingComplete } from "./OnboardingComplete";
import { PrivacyModal } from "./PrivacyModal";
import {
  currentPath,
  isDocsPath,
  isKnownPath,
  isOnboardingCompletePath,
  isPrivacyPath,
  navigate,
  resumePendingInstallIfNeeded,
} from "./path";
import { useTheme } from "./ThemeToggle";

type Gate = "loading" | "landing" | "onboarding" | "dashboard";

function wantsBrainPreview(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("brainPreview") === "1";
  } catch {
    return false;
  }
}

function wantsSignedIn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("signedIn") === "1" || q.get("demo") === "1";
  } catch {
    return false;
  }
}

function clearSignedInParam() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("signedIn") || url.searchParams.has("demo")) {
      url.searchParams.delete("signedIn");
      url.searchParams.delete("demo");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  } catch {
    /* ignore */
  }
}

export function App() {
  useTheme();
  const [path, setPath] = useState(currentPath);
  const [gate, setGate] = useState<Gate>("loading");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [user, setUser] = useState<UatuUser | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [mockSession, setMockSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBusy(true);
      setBootError(null);

      let healthSnap: HealthStatus | null = null;
      try {
        healthSnap = await api.health();
        if (!cancelled) {
          setHealth(healthSnap);
          setHealthError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setHealthError(e instanceof Error ? e.message : String(e));
        }
      }

      const forceDemo = flags.mockAuth || wantsSignedIn();
      if (flags.mockAuth && !cancelled) setMockSession(true);

      const onCompleteRoute = isOnboardingCompletePath();

      try {
        const meSnap = await api.me();
        if (cancelled) return;
        setMe(meSnap);
        setUser(meSnap.user);

        let existingGrant: Grant | null = null;
        try {
          const { grants } = await api.listGrants();
          existingGrant = grants[0] ?? null;
          setGrant(existingGrant);
        } catch {
          /* grants optional at boot */
        }

        if (onCompleteRoute) {
          clearSignedInParam();
          setGate("onboarding");
          return;
        }

        if (wantsSignedIn() && resumePendingInstallIfNeeded()) {
          clearSignedInParam();
          setGate("onboarding");
          return;
        }

        if (forceDemo || meSnap.user.id !== "local-demo" || healthSnap?.authRequired) {
          clearSignedInParam();
          setGate(existingGrant ? "dashboard" : "onboarding");
        } else if (!healthSnap?.authRequired && !forceDemo) {
          setGate("landing");
        } else {
          setGate("landing");
        }
      } catch (e) {
        if (cancelled) return;
        if (onCompleteRoute) {
          // Stay on complete route; OnboardingComplete handles need_auth
          setGate("landing");
          if (forceDemo || flags.mockAuth) enterMock();
          return;
        }
        if (e instanceof ApiError && e.isUnauthorized) {
          if (forceDemo || flags.mockAuth) {
            enterMock();
          } else {
            setGate("landing");
          }
        } else if (forceDemo || flags.mockAuth) {
          enterMock();
          setBootError(e instanceof Error ? e.message : String(e));
        } else {
          setGate("landing");
          setBootError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    function enterMock() {
      const u = mockLocalUser();
      setMockSession(true);
      setUser(u);
      setMe(mockMeResponse({ user: u, githubAppConfigured: false }));
      clearSignedInParam();
      setGate("onboarding");
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  function enterLocalDemo() {
    const u = mockLocalUser();
    setMockSession(true);
    setUser(u);
    setMe(
      mockMeResponse({
        user: u,
        githubAppConfigured: health?.githubAppConfigured ?? false,
      }),
    );
    setGate("onboarding");
  }

  async function handleLogout() {
    setBusy(true);
    try {
      if (!mockSession) await api.logout();
    } catch {
      /* best effort */
    } finally {
      setMockSession(false);
      setUser(null);
      setMe(null);
      setGrant(null);
      setGate("landing");
      setBusy(false);
      navigate("/", { replace: true });
    }
  }

  function handleGrantReady(g: Grant) {
    setGrant(g);
    setGate("dashboard");
    navigate("/", { replace: true });
  }

  if (wantsBrainPreview()) {
    return <BrainMapPreview />;
  }

  if (isDocsPath(path)) {
    return (
      <DocsPage
        onBack={() => {
          if (user && grant) {
            setGate("dashboard");
            navigate("/", { replace: true });
          } else if (user) {
            setGate("onboarding");
            navigate("/onboarding", { replace: true });
          } else {
            setGate("landing");
            navigate("/", { replace: true });
          }
        }}
      />
    );
  }

  if (isPrivacyPath(path)) {
    return (
      <PrivacyModal
        asFullPage
        onClose={() => {
          if (user && grant) {
            setGate("dashboard");
            navigate("/", { replace: true });
          } else if (user) {
            setGate("onboarding");
            navigate("/onboarding", { replace: true });
          } else {
            setGate("landing");
            navigate("/", { replace: true });
          }
        }}
      />
    );
  }

  if (!isKnownPath(path)) {
    return (
      <NotFoundPage
        onGoHome={() => {
          if (user && grant) {
            setGate("dashboard");
            navigate("/", { replace: true });
          } else if (user) {
            setGate("onboarding");
            navigate("/onboarding", { replace: true });
          } else {
            setGate("landing");
            navigate("/", { replace: true });
          }
        }}
      />
    );
  }

  if (gate === "loading") {
    return (
      <div className="boot-screen utopia-cross-grid" role="status" aria-live="polite">
        <BrandLockup size="lg" variant="minimal" subtitle="[ 19.0760°N // 72.8777°E // INITIALIZING_OPERATOR_SURFACE ]" />
        {bootError ? <p className="landing-health-warn">{bootError}</p> : null}
      </div>
    );
  }

  // Path takes precedence for GitHub App Setup URL returns
  if (isOnboardingCompletePath(path)) {
    return (
      <OnboardingComplete
        me={me}
        authLoading={busy && !me}
        oauthConfigured={health?.oauthConfigured ?? false}
        onGrantReady={handleGrantReady}
        onGoDashboard={() => setGate("dashboard")}
        onLogout={handleLogout}
        onEnterLocalDemo={enterLocalDemo}
      />
    );
  }

  if (gate === "landing" || !user || !me) {
    return (
      <Landing
        oauthConfigured={health?.oauthConfigured ?? false}
        authRequired={health?.authRequired ?? false}
        healthError={healthError}
        busy={busy}
        onLocalDemo={enterLocalDemo}
        onMockSignIn={enterLocalDemo}
      />
    );
  }

  if (gate === "onboarding") {
    const hasInstalled = Boolean(
      (me.user.installationIds && me.user.installationIds.length > 0) ||
      (user?.installationIds && user.installationIds.length > 0)
    );
    return (
      <Onboarding
        me={me}
        initialStep={hasInstalled ? "pick" : "install"}
        initialInstallationId={
          me.user.installationIds?.[0]
            ? String(me.user.installationIds[0])
            : user?.installationIds?.[0]
              ? String(user.installationIds[0])
              : undefined
        }
        onGrantReady={handleGrantReady}
        onSkipToDashboard={() => {
          setGate("dashboard");
          navigate("/", { replace: true });
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      grant={grant}
      health={health}
      onGrantChange={setGrant}
      onReonboard={async () => {
        try {
          const fresh = await api.me();
          setMe(fresh);
          setUser(fresh.user);
        } catch {
          /* ignore */
        }
        setGate("onboarding");
        navigate("/onboarding", { replace: true });
      }}
      onLogout={handleLogout}
    />
  );
}
