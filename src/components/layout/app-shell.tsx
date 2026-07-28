import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Wallet,
  FolderOpen,
  FileOutput,
  Landmark,
  Settings2,
  Users,
  Menu,
  X,
  LogOut,
  Building2,
  ContactRound,
  Rocket,
  HardHat,
  FolderSearch,
  FileText,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import { Button } from "@/components/ui/button";
import { setupCompletion } from "@/data/seed";

/**
 * Menu chuẩn theo thứ tự quy trình 1 → 13 (không dùng 1a, 2b…).
 * 1 Dashboard → 2 KH → 3 CT → 4 BG → 5 Quét → 6 Import → 7 Sửa TL
 * → 8 Hồ sơ → 9 Chứng từ → 10 Công nợ → 11 Sao kê → 12 Cấu hình → 13 Quyền
 */
const NAV = [
  {
    group: "Bắt đầu",
    items: [
      {
        to: "/app/dashboard",
        label: "Dashboard điều hành",
        sub: "Tổng quan vận hành",
        icon: LayoutDashboard,
        no: "1",
      },
    ],
  },
  {
    group: "Nạp dữ liệu",
    items: [
      {
        to: "/app/customers",
        label: "Khách hàng",
        sub: "Profile · liên hệ · MST",
        icon: ContactRound,
        no: "2",
      },
      {
        to: "/app/projects",
        label: "Công trình / vòng đời",
        sub: "CT → BG → HĐ → HS → CN",
        icon: HardHat,
        no: "3",
      },
      {
        to: "/app/quotations",
        label: "Báo giá",
        sub: "BOQ · VAT · revision",
        icon: FileSpreadsheet,
        no: "4",
      },
      {
        to: "/app/scan",
        label: "Quét dữ liệu DN",
        sub: "Folder khách · map hồ sơ",
        icon: FolderSearch,
        no: "5",
      },
      {
        to: "/app/import",
        label: "Import chuẩn hóa",
        sub: "CSV 1 mẫu · audit ô lạ",
        icon: Upload,
        no: "6",
      },
      {
        to: "/app/editor",
        label: "Mở / sửa tài liệu",
        sub: "Word · Excel · version",
        icon: FileText,
        no: "7",
      },
    ],
  },
  {
    group: "Hồ sơ & chứng từ",
    items: [
      {
        to: "/app/documents",
        label: "Hồ sơ công trình",
        sub: "Checklist theo giai đoạn",
        icon: FolderOpen,
        no: "8",
      },
      {
        to: "/app/chungtu",
        label: "Chứng từ xuất file",
        sub: "BG · BBNT · BQT · HĐ",
        icon: FileOutput,
        no: "9",
      },
    ],
  },
  {
    group: "Công nợ & tiền",
    items: [
      {
        to: "/app/receivables",
        label: "Theo dõi công nợ",
        sub: "Phải thu / phải trả",
        icon: Wallet,
        no: "10",
      },
      {
        to: "/app/bank",
        label: "Sao kê ngân hàng",
        sub: "Đối soát dòng tiền",
        icon: Landmark,
        no: "11",
      },
    ],
  },
  {
    group: "Cấu hình",
    items: [
      {
        to: "/app/settings",
        label: "Cấu hình & Danh mục",
        sub: "Công ty · mẫu · danh mục",
        icon: Settings2,
        no: "12",
      },
      {
        to: "/app/roles",
        label: "Tài khoản & phân quyền",
        sub: "Đúng vai · đúng quyền",
        icon: Users,
        no: "13",
      },
    ],
  },
] as const;

const PAGE_META: Record<string, { title: string; note: string }> = {
  "/app/dashboard": {
    title: "1 · Dashboard điều hành",
    note: "Số liệu từ dữ liệu thật trong hệ thống.",
  },
  "/app/customers": {
    title: "2 · Khách hàng",
    note: "Tạo profile khách trước — nền cho công trình, báo giá, công nợ.",
  },
  "/app/projects": {
    title: "3 · Công trình & vòng đời",
    note: "Tạo / chọn CT tại đây — mọi hồ sơ & chứng từ bám CT đã chọn.",
  },
  "/app/quotations": {
    title: "4 · Báo giá",
    note: "BOQ nhiều hạng mục · VAT · revision — gắn đúng công trình đang chọn.",
  },
  "/app/scan": {
    title: "5 · Quét dữ liệu doanh nghiệp",
    note: "Index folder · mở file · chỉnh sửa · nạp ERP.",
  },
  "/app/import": {
    title: "6 · Import chuẩn hóa",
    note: "Một schema CSV · map cột · audit ô không chắc.",
  },
  "/app/editor": {
    title: "7 · Mở / sửa tài liệu",
    note: "Soạn thảo Word & Excel cơ bản · lưu version.",
  },
  "/app/documents": {
    title: "8 · Hồ sơ công trình",
    note: "84 mẫu theo giai đoạn — chọn CT ở thanh phía trên trang.",
  },
  "/app/chungtu": {
    title: "9 · Chứng từ vận hành",
    note: "Bước 1: chọn công trình · Bước 2: bấm Xuất (dữ liệu CT + BOQ).",
  },
  "/app/receivables": {
    title: "10 · Theo dõi công nợ",
    note: "Phải thu / phải trả theo hợp đồng đã ký từ CT.",
  },
  "/app/bank": {
    title: "11 · Sao kê ngân hàng",
    note: "Đối soát dòng tiền, khớp công nợ và phiếu chi.",
  },
  "/app/settings": {
    title: "12 · Cấu hình & Danh mục",
    note: "Thiết lập công ty, mẫu và thông số vận hành.",
  },
  "/app/roles": {
    title: "13 · Tài khoản & phân quyền",
    note: "GĐ, kế toán, kinh doanh, KTT, KTV, thủ kho.",
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useErpStore((s) => s.user);
  const company = useErpStore((s) => s.company);
  const onboarding = useErpStore((s) => s.onboarding);
  const logout = useErpStore((s) => s.logout);
  const openWizard = useErpStore((s) => s.openWizard);
  const meta = PAGE_META[pathname] ?? PAGE_META["/app/dashboard"];
  const pct = setupCompletion(onboarding.flags);

  return (
    <div className="flex min-h-dvh max-w-[100vw] overflow-x-hidden bg-bg">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-fg/40 lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(272px,88vw)] flex-col bg-nav text-nav-ink transition-transform duration-200 lg:static lg:w-[272px] lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-nav-line px-4 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-brand text-sm font-bold text-on-brand">
            TH
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {company.productName}
            </div>
            <div className="truncate text-xs text-nav-muted">
              Quy trình 1→13 · Local demo
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

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((g) => (
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
                MST {company.taxId || "—"}
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/95 px-3 py-3 backdrop-blur sm:px-5">
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-surface text-fg lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-fg sm:text-lg">
              {meta.title}
            </h1>
            <p className="hidden truncate text-xs text-muted sm:block">
              {meta.note}
            </p>
          </div>
          <Button
            size="sm"
            variant={onboarding.completed ? "secondary" : "default"}
            className="shrink-0"
            onClick={() => openWizard()}
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Setup A→Z</span>
            <span className="sm:hidden">Setup</span>
          </Button>
          {user ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="hidden text-right md:block">
                <div className="text-sm font-semibold text-fg">{user.name}</div>
                <div className="text-xs text-muted">{user.roleLabel}</div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                {user.initials}
              </div>
            </div>
          ) : null}
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
