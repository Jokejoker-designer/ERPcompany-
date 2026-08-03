import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ContactRound,
  Truck,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Users,
  Settings2,
  Menu,
  X,
  LogOut,
  Store,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@retail/lib/utils";
import { Button, Card, CardBody, Field, Input, SkipLink, SrOnly } from "@retail/components/ui";
import {
  DEMO_USERS,
  PHASES,
  setupCompletion,
  type Role,
} from "@retail/data/retail";
import { DEMO_PLAIN_PASSWORDS } from "@retail/lib/auth";
import { useRetailStore } from "@retail/store/retail-store";
import { SetupWizard } from "@retail/components/SetupWizard";
import { ForceChangePassword } from "@retail/components/ForceChangePassword";
import { ForgotPassword } from "@retail/components/ForgotPassword";
import { TotpLogin } from "@retail/components/TotpLogin";
import { DashboardPage } from "@retail/pages/Dashboard";
import { ProductsPage } from "@retail/pages/Products";
import { SuppliersPage } from "@retail/pages/Suppliers";
import { CustomersPage } from "@retail/pages/Customers";
import { InboundPage } from "@retail/pages/Inbound";
import { PosPage } from "@retail/pages/Pos";
import { InventoryPage } from "@retail/pages/Inventory";
import { ReportsPage } from "@retail/pages/Reports";
import { RolesPage } from "@retail/pages/Roles";
import { SettingsPage } from "@retail/pages/Settings";

export type PageId =
  | "dashboard"
  | "products"
  | "suppliers"
  | "customers"
  | "inbound"
  | "pos"
  | "inventory"
  | "reports"
  | "roles"
  | "settings";

const NAV: {
  group: string;
  items: {
    id: PageId;
    no: string;
    label: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    roles?: Role[];
  }[];
}[] = [
  {
    group: "Tổng quan",
    items: [
      {
        id: "dashboard",
        no: "1",
        label: "Bảng điều khiển",
        sub: "Doanh thu · tồn · cảnh báo",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    group: "GĐ 1 · Dữ liệu gốc",
    items: [
      {
        id: "products",
        no: "2",
        label: "Danh mục hàng hóa",
        sub: "Mã hàng · mã vạch · ĐVT",
        icon: Package,
        roles: ["owner", "manager", "warehouse", "accountant"],
      },
      {
        id: "suppliers",
        no: "3",
        label: "Nhà cung cấp",
        sub: "Danh mục NCC · thời gian giao",
        icon: Warehouse,
        roles: ["owner", "manager", "warehouse", "accountant"],
      },
      {
        id: "customers",
        no: "4",
        label: "Khách hàng thân thiết",
        sub: "Hạng thẻ · điểm · SĐT",
        icon: ContactRound,
        roles: ["owner", "manager", "cashier"],
      },
    ],
  },
  {
    group: "GĐ 2–3 · Luồng hàng",
    items: [
      {
        id: "inbound",
        no: "5",
        label: "Nhập kho",
        sub: "Đặt hàng · phiếu nhập · giá vốn",
        icon: Truck,
        roles: ["owner", "manager", "warehouse"],
      },
      {
        id: "pos",
        no: "6",
        label: "Bán hàng (POS)",
        sub: "Quét mã · thu tiền · in hóa đơn",
        icon: ShoppingCart,
      },
    ],
  },
  {
    group: "GĐ 4–5 · Kiểm soát",
    items: [
      {
        id: "inventory",
        no: "7",
        label: "Kiểm kho & hạn dùng",
        sub: "Kiểm kê · chênh lệch · cận date",
        icon: ClipboardList,
        roles: ["owner", "manager", "warehouse"],
      },
      {
        id: "reports",
        no: "8",
        label: "Báo cáo & chốt ca",
        sub: "Đối soát ca · biên LN · ABC",
        icon: BarChart3,
        roles: ["owner", "manager", "accountant", "cashier"],
      },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      {
        id: "roles",
        no: "9",
        label: "Phân quyền",
        sub: "Thu ngân · quản lý · kho",
        icon: Users,
        roles: ["owner", "manager"],
      },
      {
        id: "settings",
        no: "10",
        label: "Cấu hình cửa hàng",
        sub: "QR TT · STK · chỉ Chủ CH",
        icon: Settings2,
        roles: ["owner"],
      },
    ],
  },
];


/** Primary destinations on phone bottom bar */
const MOBILE_NAV: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }>; roles?: Role[] }[] = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "pos", label: "Bán hàng", icon: ShoppingCart },
  { id: "inbound", label: "Nhập kho", icon: Truck, roles: ["owner", "manager", "warehouse"] },
  { id: "products", label: "Hàng hóa", icon: Package, roles: ["owner", "manager", "warehouse", "accountant"] },
  { id: "reports", label: "Báo cáo", icon: BarChart3, roles: ["owner", "manager", "accountant", "cashier"] },
];

const TITLES: Record<PageId, { title: string; note: string }> = {
  dashboard: {
    title: "1 · Bảng điều khiển",
    note: "Nguồn dữ liệu duy nhất — doanh thu, biên lợi nhuận, tồn kho, cảnh báo.",
  },
  products: {
    title: "2 · Danh mục hàng hóa",
    note: "Mã hàng, mã vạch, đơn vị tính và hệ số quy đổi.",
  },
  suppliers: {
    title: "3 · Nhà cung cấp",
    note: "Danh mục NCC — đặt hàng, nhập kho và trả hàng.",
  },
  customers: {
    title: "4 · Khách hàng thân thiết",
    note: "Hạng thẻ · điểm tích lũy · gợi ý bán kèm.",
  },
  inbound: {
    title: "5 · Nhập kho",
    note: "Đối chiếu đơn · kiểm hàng · lô/HSD · giá vốn.",
  },
  pos: {
    title: "6 · Bán hàng tại quầy (POS)",
    note: "Quét mã · khuyến mãi · thu tiền · trừ tồn.",
  },
  inventory: {
    title: "7 · Kiểm kho & hạn dùng",
    note: "Kiểm kê · chênh lệch · cận date.",
  },
  reports: {
    title: "8 · Báo cáo & chốt ca",
    note: "Đối soát ca · biên LN · ABC.",
  },
  roles: {
    title: "9 · Phân quyền người dùng",
    note: "RBAC · reset mật khẩu nhân viên (Chủ CH).",
  },
  settings: {
    title: "10 · Cấu hình cửa hàng",
    note: "Chỉ Chủ cửa hàng · QR · STK · loa TT.",
  },
};

export default function App() {
  const user = useRetailStore((s) => s.user);
  const session = useRetailStore((s) => s.session);
  const credentials = useRetailStore((s) => s.credentials);
  const refreshSession = useRetailStore((s) => s.refreshSession);
  const needsPasswordChange = useRetailStore((s) => s.needsPasswordChange);
  const pendingTotp = useRetailStore((s) => s.pendingTotpUser);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (session) await refreshSession();
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      void refreshSession();
    };
    const id = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [session, refreshSession]);

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">
        Đang xác thực phiên đăng nhập…
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (needsPasswordChange()) {
    return <ForceChangePassword />;
  }

  void credentials;

  return (
    <>
      <Shell />
      <SetupWizard />
    </>
  );
}

function LoginScreen() {
  const login = useRetailStore((s) => s.login);
  const store = useRetailStore((s) => s.store);
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  async function doLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await login(username, password);
      if (r.ok) {
        if (r.mustChangePassword) {
          toast.message("Đăng nhập thành công — bắt buộc đổi mật khẩu", {
            description:
              "Thiết lập mật khẩu mới + câu hỏi bảo mật (quên MK).",
          });
        } else {
          toast.success(r.message);
        }
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  function pickUser(u: string) {
    setUsername(u);
    setPassword(DEMO_PLAIN_PASSWORDS[u] || "");
  }

  if (mode === "forgot") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <ForgotPassword
          initialUsername={username}
          onBack={() => setMode("login")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      <SkipLink href="#login-form" />
      <div className="relative flex flex-1 flex-col justify-between bg-nav px-6 py-10 text-nav-ink sm:px-10">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-brand font-bold text-on-brand">
              AK
            </div>
            <div>
              <div className="text-lg font-bold">
                {store.productName || "AnKhang POS"}
              </div>
              <div className="text-sm text-nav-muted">
                Phần mềm bán hàng · ERP thu nhỏ cho cửa hàng
              </div>
            </div>
          </div>
          <h1 className="max-w-md text-2xl font-bold leading-tight sm:text-3xl">
            Đăng nhập · đổi MK lần đầu · quên mật khẩu
          </h1>
          <p className="mt-3 max-w-md text-sm text-nav-muted">
            Lần đầu: đổi MK + câu hỏi bảo mật. Quên MK: khôi phục bằng câu trả
            lời bảo mật, hoặc nhờ Chủ cửa hàng reset.
          </p>
        </div>
        <div className="mt-10 grid gap-2 sm:grid-cols-2">
          {PHASES.map((ph) => (
            <div
              key={ph.id}
              className="rounded-[var(--radius-md)] border border-nav-line bg-white/5 px-3 py-2.5"
            >
              <div className="text-xs font-bold text-brand">
                Giai đoạn {ph.id}
              </div>
              <div className="text-sm font-semibold">{ph.title}</div>
              <div className="text-[11px] text-nav-muted">{ph.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md">
          <CardBody className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-ink">
              <ShieldCheck className="h-4 w-4" />
              Đăng nhập hệ thống
            </div>
            <form
              id="login-form"
              className="space-y-3"
              onSubmit={(e) => void doLogin(e)}
              aria-labelledby="login-heading"
            >
              <SrOnly as="h2" id="login-heading">
                Form đăng nhập POS
              </SrOnly>
              <Field id="pos-login-user" label="Tài khoản" required>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field id="pos-login-pass" label="Mật khẩu" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Nhập mật khẩu"
                />
              </Field>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-ink underline-offset-2 hover:underline"
                  onClick={() => setMode("forgot")}
                >
                  Quên mật khẩu?
                </button>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Đang đăng nhập…" : "Đăng nhập"}
              </Button>
            </form>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase text-muted">
                Chọn nhanh (MK mặc định — lần đầu bắt đổi + câu hỏi BM)
              </div>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand-soft/30",
                    username === u.username && "border-brand bg-brand-soft/40",
                  )}
                  onClick={() => pickUser(u.username)}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                    {u.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">
                      {u.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {u.username} · {u.roleLabel}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-[11px] text-muted">
              <Store className="mb-1 inline h-3.5 w-3.5 text-brand" /> Demo:{" "}
              <code className="text-fg">owner / Owner@2026</code>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PageId>("dashboard");
  const user = useRetailStore((s) => s.user)!;
  const session = useRetailStore((s) => s.session);
  const store = useRetailStore((s) => s.store);
  const logout = useRetailStore((s) => s.logout);
  const openWizard = useRetailStore((s) => s.openWizard);
  const onboarding = useRetailStore((s) => s.onboarding);
  const requireOwner = useRetailStore((s) => s.requireOwner);
  const refreshSession = useRetailStore((s) => s.refreshSession);
  const shift = useRetailStore((s) =>
    s.shifts.find((x) => x.id === s.activeShiftId),
  );
  const meta = TITLES[page];
  const pct = setupCompletion(onboarding.flags);

  const effectiveRole: Role = (() => {
    const fresh = DEMO_USERS.find((u) => u.id === session?.userId);
    return fresh?.role ?? user.role;
  })();

  function canSee(roles?: Role[]) {
    if (!roles) return true;
    return roles.includes(effectiveRole);
  }

  function go(id: PageId) {
    if (id === "settings") {
      const gate = requireOwner();
      if (!gate.ok) {
        toast.error(gate.message);
        return;
      }
    }
    void refreshSession();
    setPage(id);
    setOpen(false);
  }

  useEffect(() => {
    if (page === "settings" && effectiveRole !== "owner") {
      setPage("dashboard");
      toast.error("Không có quyền xem Cấu hình cửa hàng");
    }
  }, [page, effectiveRole]);

  return (
    <div className="flex min-h-dvh max-w-[100vw] overflow-x-hidden bg-bg">
      <SkipLink />
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-fg/40 lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        aria-label="Menu điều hướng POS"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-nav-line bg-nav text-nav-ink transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 border-b border-nav-line px-4 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-brand text-sm font-bold text-on-brand">
            AK
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">
              {store.productName || "AnKhang POS"}
            </div>
            <div className="truncate text-[11px] text-nav-muted">
              {store.storeName || "Cửa hàng"}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-nav-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="Modules 1 đến 10">
          {NAV.map((g) => {
            const items = g.items.filter((i) => canSee(i.roles));
            if (!items.length) return null;
            return (
              <div key={g.group}>
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-nav-muted">
                  {g.group}
                </div>
                <div className="space-y-0.5">
                  {items.map((i) => {
                    const Icon = i.icon;
                    const active = page === i.id;
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => go(i.id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition",
                          active
                            ? "bg-brand/20 text-nav-ink"
                            : "text-nav-muted hover:bg-white/5 hover:text-nav-ink",
                        )}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            <span className="mr-1 text-brand">{i.no}.</span>
                            {i.label}
                          </span>
                          <span className="block text-[11px] opacity-80">
                            {i.sub}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-nav-line p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="text-[11px] text-nav-muted">
                {DEMO_USERS.find((u) => u.id === session?.userId)?.roleLabel ||
                  user.roleLabel}
              </div>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full border-nav-line bg-white/5 text-nav-ink"
            onClick={() => logout()}
          >
            <LogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header role="banner" className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/95 px-3 py-2.5 backdrop-blur sm:px-5">
          <button
            type="button"
            className="rounded-md p-2 text-muted lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold sm:text-lg">
              {meta.title}
            </h1>
            <p className="hidden truncate text-xs text-muted sm:block">
              {meta.note}
            </p>
          </div>
          {!onboarding.completed ? (
            <Button size="sm" variant="secondary" onClick={() => openWizard()}>
              <Rocket className="h-3.5 w-3.5" />
              Setup {pct}%
            </Button>
          ) : null}
          {shift ? (
            <span className="hidden rounded-full bg-ok-soft px-2 py-1 text-[11px] font-semibold text-ok sm:inline">
              Ca mở · {shift.code}
            </span>
          ) : null}
        </header>

        <main id="main-content" tabIndex={-1} className="page-enter flex-1 overflow-x-hidden p-3 pb-24 sm:p-5 sm:pb-5 outline-none">
          {page === "dashboard" && <DashboardPage onNavigate={go} />}
          {page === "products" && <ProductsPage />}
          {page === "suppliers" && <SuppliersPage />}
          {page === "customers" && <CustomersPage />}
          {page === "inbound" && <InboundPage />}
          {page === "pos" && <PosPage />}
          {page === "inventory" && <InventoryPage />}
          {page === "reports" && <ReportsPage />}
          {page === "roles" && <RolesPage />}
          {page === "settings" && effectiveRole === "owner" ? (
            <SettingsPage />
          ) : page === "settings" ? (
            <Card>
              <CardBody className="p-6 text-sm text-danger">
                Truy cập bị từ chối — chỉ Chủ cửa hàng.
              </CardBody>
            </Card>
          ) : null}
        </main>

        {/* Mobile bottom navigation — thumb-friendly */}
        <nav aria-label="Menu chính mobile" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pt-1">
            {MOBILE_NAV.filter((i) => canSee(i.roles)).map((i) => {
              const Icon = i.icon;
              const active = page === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => go(i.id)}
                  className={cn(
                    "pressable flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-[10px] font-semibold",
                    active
                      ? "bg-brand-soft text-brand-ink"
                      : "text-muted hover:bg-surface-2",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-brand")} />
                  <span className="truncate">{i.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
