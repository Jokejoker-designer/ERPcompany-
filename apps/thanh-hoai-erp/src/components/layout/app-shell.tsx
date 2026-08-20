import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Menu,
  X,
  LogOut,
  Building2,
  Rocket,
  ShieldAlert,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import { Button } from "@/components/ui/button";
import {
  STAGE_LABEL,
  setupCompletion,
} from "@/data/seed";
import {
  applyBrandToDocument,
  applyDensityToDocument,
  applyHighContrastToDocument,
  applyMotionPref,
} from "@/lib/ui-prefs";
import {
  canAccessRoute,
  denyMessage,
  firstAllowedRoute,
  resolveEffectiveUser,
} from "@/lib/rbac";
import {
  NAV_GROUPS,
  MOBILE_PRIMARY,
  PAGE_META,
  ALL_NAV_ITEMS,
} from "@/lib/nav";
import { CommandPalette } from "@/components/erp/command-palette";
import {
  ProjectPicker,
  useActiveProject,
} from "@/components/erp/project-context";
import { SkipLink, SrOnly } from "@/components/ui/a11y";
import { SpotlightTour } from "@/components/erp/spotlight-tour";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const storeUser = useErpStore((s) => s.user);
  const session = useErpStore((s) => s.session);
  const company = useErpStore((s) => s.company);
  const onboarding = useErpStore((s) => s.onboarding);
  const logout = useErpStore((s) => s.logout);
  const openWizard = useErpStore((s) => s.openWizard);
  const refreshSession = useErpStore((s) => s.refreshSession);
  const project = useActiveProject();
  const uiPrefs = useErpStore((s) => s.uiPrefs);

  const user = useMemo(
    () => resolveEffectiveUser(session, storeUser),
    [session, storeUser],
  );
  const role = user?.role;

  const visibleNav = useMemo(() => {
    if (!role) return [];
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.roles.includes(role)),
    })).filter((g) => g.items.length > 0);
  }, [role]);

  const mobileNav = useMemo(() => {
    if (!role) return [];
    const allowed = ALL_NAV_ITEMS.filter((i) => i.roles.includes(role));
    const primary = MOBILE_PRIMARY.map((to) =>
      allowed.find((i) => i.to === to),
    ).filter(Boolean) as typeof allowed;
    const rest = allowed.filter((i) => !primary.some((p) => p.to === i.to));
    return [...primary, ...rest].slice(0, 5);
  }, [role]);

  const allowed = role ? canAccessRoute(role, pathname) : false;
  const meta = PAGE_META[pathname] ?? PAGE_META["/app/dashboard"];
  const pct = setupCompletion(onboarding.flags);
  const currentNav = ALL_NAV_ITEMS.find((i) => i.to === pathname);

  useEffect(() => {
    void refreshSession();
  }, [pathname, refreshSession]);

  useEffect(() => {
    applyBrandToDocument(company.brandColor);
    applyDensityToDocument(uiPrefs.density);
    applyMotionPref(uiPrefs.reducedMotion);
    applyHighContrastToDocument(uiPrefs.highContrast);
  }, [
    company.brandColor,
    uiPrefs.density,
    uiPrefs.reducedMotion,
    uiPrefs.highContrast,
  ]);

  useEffect(() => {
    if (!role) return;
    if (!canAccessRoute(role, pathname)) {
      const dest = firstAllowedRoute(role);
      toast.error(denyMessage(role, pathname));
      void navigate({ to: dest });
    }
  }, [role, pathname, navigate]);

  const canSetup =
    role === "admin" || role === "giamdoc" || role === "kinhdoanh";

  const showProjectStrip = [
    "/app/projects",
    "/app/quotations",
    "/app/documents",
    "/app/chungtu",
    "/app/receivables",
    "/app/editor",
  ].some((p) => pathname.startsWith(p));

  return (
    <div className="flex min-h-dvh max-w-[100vw] overflow-x-hidden bg-bg">
      <SkipLink />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <SpotlightTour />

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-fg/40 lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        aria-label="Menu điều hướng chính"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(272px,88vw)] flex-col bg-nav text-nav-ink transition-transform duration-200 lg:static lg:w-[272px] lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-nav-line px-4 py-4">
          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-brand text-sm font-bold text-on-brand">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt={`Logo ${company.companyName || company.productName}`} className="h-full w-full object-cover" />
            ) : (
              "TH"
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {company.productName}
            </div>
            <div className="truncate text-xs text-nav-muted">
              RBAC · Ctrl/⌘K tìm nhanh
            </div>
          </div>
          <button
            type="button"
            className="ml-auto rounded-md p-2 text-nav-muted hover:bg-nav-hover lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {canSetup ? (
          <div className="border-b border-nav-line px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openWizard();
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] bg-brand px-3 py-2.5 text-left text-on-brand transition-colors hover:bg-brand-ink"
            >
              <Rocket className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight">
                  Setup A→Z
                </span>
                <span className="block text-[11px] text-white/80">
                  {onboarding.completed
                    ? onboarding.wipedAfterSetup
                      ? "Đã xong · dữ liệu về 0"
                      : "Mở lại hướng dẫn"
                    : `${pct}% · hướng dẫn setup`}
                </span>
              </span>
            </button>
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Modules ERP 1 đến 13">
          {visibleNav.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-nav-muted">
                {g.group}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      data-tour={item.to.replace("/app/", "")}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-brand text-on-brand"
                          : "text-nav-ink hover:bg-nav-hover",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-[11px] font-bold",
                          active ? "bg-white/20" : "bg-white/10 text-nav-muted",
                        )}
                      >
                        {item.no}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                          {item.label}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block text-[11px] leading-snug",
                            active ? "text-white/80" : "text-nav-muted",
                          )}
                        >
                          {item.sub}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-nav-line p-3">
          <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-white/5 px-2.5 py-2">
            <Building2 className="h-4 w-4 shrink-0 text-nav-muted" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {company.companyName || "Chưa đặt tên công ty"}
              </div>
              <div className="truncate text-[10px] text-nav-muted">
                {user?.roleLabel || "—"} · MST {company.taxId || "—"}
              </div>
            </div>
          </div>
          <Button
            variant="nav"
            size="sm"
            className="w-full justify-start gap-2 text-nav-muted hover:text-nav-ink"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header role="banner" className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-surface text-fg lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <nav
                className="mb-0.5 flex items-center gap-1 text-[11px] text-muted"
                aria-label="Breadcrumb"
              >
                <Link to="/app/dashboard" className="hover:text-fg">
                  ERP
                </Link>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                <span className="truncate font-medium text-fg">
                  {currentNav
                    ? `${currentNav.no} · ${currentNav.label}`
                    : meta.title}
                </span>
                {project && showProjectStrip ? (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                    <span className="truncate text-brand-ink">{project.code}</span>
                  </>
                ) : null}
              </nav>
              <h1 className="truncate text-base font-semibold text-fg sm:text-lg">
                {meta.title}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-xs text-muted hover:border-brand/40 hover:text-fg"
              aria-label="Tìm nhanh"
              data-tour="cmdk"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tìm</span>
              <kbd className="hidden rounded border border-border bg-surface-2 px-1 font-mono text-[10px] md:inline">
                ⌘K
              </kbd>
            </button>

            {canSetup ? (
              <Button
                size="sm"
                variant={onboarding.completed ? "secondary" : "default"}
                className="hidden shrink-0 sm:inline-flex"
                onClick={() => openWizard()}
              >
                <Rocket className="h-3.5 w-3.5" />
                Setup
              </Button>
            ) : null}

            {user ? (
              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden text-right md:block">
                  <div className="text-sm font-semibold text-fg">{user.name}</div>
                  <div className="text-xs text-muted">{user.roleLabel}</div>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                  {user.initials}
                </div>
              </div>
            ) : null}
          </div>

          {showProjectStrip ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-brand-soft/25 px-3 py-2 sm:px-5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink">
                CT đang làm
              </span>
              <ProjectPicker className="min-w-0 flex-1 sm:max-w-md sm:flex-none" />
              {project ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-fg">
                    {STAGE_LABEL[project.stage] ?? project.stage}
                  </span>
                  <span className="hidden sm:inline">{project.customer}</span>
                  <span className="tabular-nums text-brand-ink">
                    {Math.round(project.progress)}%
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <main id="main-content" tabIndex={-1} className="page-enter min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-5 sm:pb-5 outline-none">
          {!allowed ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ShieldAlert className="h-10 w-10 text-danger" />
              <div className="text-base font-semibold">Không có quyền truy cập</div>
              <p className="max-w-md text-sm text-muted">
                {role ? denyMessage(role, pathname) : "Vui lòng đăng nhập lại."}
              </p>
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: role ? firstAllowedRoute(role) : "/login",
                  })
                }
              >
                Về trang được phép
              </Button>
            </div>
          ) : (
            children
          )}
        </main>

        <nav data-tour="mobile-nav" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden" aria-label="Menu chính mobile">
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pt-1">
            {mobileNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-[10px] font-semibold",
                    active
                      ? "bg-brand-soft text-brand-ink"
                      : "text-muted hover:bg-surface-2",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-brand")} />
                  <span className="truncate">{item.short}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
