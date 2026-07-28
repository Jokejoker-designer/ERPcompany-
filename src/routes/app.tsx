import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SetupWizard } from "@/components/erp/setup-wizard";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const user = useErpStore((s) => s.user);

  if (!user && typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <AppShell>
      <Outlet />
      <SetupWizard />
    </AppShell>
  );
}
