import { useEffect } from "react";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SetupWizard } from "@/components/erp/setup-wizard";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const user = useErpStore((s) => s.user);
  const session = useErpStore((s) => s.session);
  const credentials = useErpStore((s) => s.credentials);
  const needsPasswordChange = useErpStore((s) => s.needsPasswordChange);
  const refreshSession = useErpStore((s) => s.refreshSession);
  const navigate = useNavigate();

  const mustChange = Boolean(user && needsPasswordChange());

  useEffect(() => {
    void (async () => {
      if (session) {
        const ok = await refreshSession();
        if (!ok) {
          window.location.href = "/login";
        }
      } else if (!user) {
        window.location.href = "/login";
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    } else if (mustChange) {
      void navigate({ to: "/login" });
    }
  }, [user, mustChange, navigate, credentials]);

  if (!user || mustChange) return null;

  return (
    <AppShell>
      <Outlet />
      <SetupWizard />
    </AppShell>
  );
}
