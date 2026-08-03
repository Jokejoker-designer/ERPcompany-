import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoleId } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { cn } from "@/lib/utils";

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector for highlight target */
  target?: string;
  route?: string;
};

const TOURS: Record<RoleId, TourStep[]> = {
  admin: [
    {
      id: "cmdk",
      title: "Tìm nhanh Ctrl/⌘K",
      body: "Nhảy tới menu, khách, công trình, báo giá không cần cuộn sidebar.",
      target: '[data-tour="cmdk"]',
    },
    {
      id: "settings",
      title: "Cấu hình & thương hiệu",
      body: "Logo, màu letterhead, dark mode, 2FA — chỉ Admin/GĐ.",
      route: "/app/settings",
      target: '[data-tour="settings"]',
    },
    {
      id: "roles",
      title: "Phân quyền",
      body: "Ma trận menu 1→13 theo vai. Role không tin chỉnh F12.",
      route: "/app/roles",
      target: '[data-tour="roles"]',
    },
  ],
  giamdoc: [
    {
      id: "dash",
      title: "Hành động hôm nay",
      body: "CT trễ, CN quá hạn, BG chờ duyệt — ưu tiên việc gấp.",
      route: "/app/dashboard",
      target: '[data-tour="dashboard"]',
    },
    {
      id: "ar",
      title: "Công nợ & tiền",
      body: "Theo dõi phải thu và sao kê NH trước khi duyệt chi.",
      route: "/app/receivables",
      target: '[data-tour="receivables"]',
    },
    {
      id: "cmdk",
      title: "Tìm nhanh",
      body: "Ctrl/⌘K mở palette — tìm CT / BG ngay.",
      target: '[data-tour="cmdk"]',
    },
  ],
  ketoan: [
    {
      id: "ar",
      title: "Công nợ",
      body: "Đây là màn chính của kế toán — đối soát phải thu.",
      route: "/app/receivables",
      target: '[data-tour="receivables"]',
    },
    {
      id: "bank",
      title: "Sao kê NH",
      body: "Khớp dòng tiền với công nợ và phiếu chi.",
      route: "/app/bank",
      target: '[data-tour="bank"]',
    },
    {
      id: "import",
      title: "Import chuẩn",
      body: "Nạp CSV một mẫu — audit ô không chắc chắn.",
      route: "/app/import",
      target: '[data-tour="import"]',
    },
  ],
  kinhdoanh: [
    {
      id: "kh",
      title: "Khách hàng trước",
      body: "Tạo profile KH rồi mới lập CT / báo giá.",
      route: "/app/customers",
      target: '[data-tour="customers"]',
    },
    {
      id: "bg",
      title: "Báo giá BOQ",
      body: "Nhiều hạng mục · Full màn hình · Dán Excel · tổng dính đáy.",
      route: "/app/quotations",
      target: '[data-tour="quotations"]',
    },
    {
      id: "ct",
      title: "Xuất chứng từ",
      body: "Chọn CT → Xuất BG/HĐ — preview trước khi in.",
      route: "/app/chungtu",
      target: '[data-tour="chungtu"]',
    },
  ],
  ktt: [
    {
      id: "projects",
      title: "Công trình",
      body: "Chọn CT đang làm — mọi hồ sơ bám đúng CT.",
      route: "/app/projects",
      target: '[data-tour="projects"]',
    },
    {
      id: "docs",
      title: "Hồ sơ CT",
      body: "Checklist theo giai đoạn 01–09 · BBNT · tiến độ.",
      route: "/app/documents",
      target: '[data-tour="documents"]',
    },
    {
      id: "mobile",
      title: "Mobile bottom nav",
      body: "Ngoài hiện trường: CT · Hồ sơ · Chứng từ trong tầm ngón cái.",
      target: '[data-tour="mobile-nav"]',
    },
  ],
  ktv: [
    {
      id: "projects",
      title: "Công trình đang thi công",
      body: "Xem tiến độ và nhật ký theo CT được giao.",
      route: "/app/projects",
      target: '[data-tour="projects"]',
    },
    {
      id: "docs",
      title: "Hồ sơ & checklist",
      body: "Cập nhật checklist KTV · ảnh hiện trường.",
      route: "/app/documents",
      target: '[data-tour="documents"]',
    },
  ],
  thukho: [
    {
      id: "projects",
      title: "Công trình nhận hàng",
      body: "Chọn CT trước khi xuất kho / PXK.",
      route: "/app/projects",
      target: '[data-tour="projects"]',
    },
    {
      id: "ctu",
      title: "Chứng từ PXK",
      body: "Xuất phiếu giao hàng / xuất kho gắn đúng CT.",
      route: "/app/chungtu",
      target: '[data-tour="chungtu"]',
    },
  ],
};

export function SpotlightTour() {
  const user = useErpStore((s) => s.user);
  const uiPrefs = useErpStore((s) => s.uiPrefs);
  const completeTour = useErpStore((s) => s.completeTour);
  const restartTour = useErpStore((s) => s.restartTour);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [force, setForce] = useState(false);

  const role = user?.role as RoleId | undefined;
  const steps = useMemo(
    () => (role ? TOURS[role] ?? TOURS.kinhdoanh : []),
    [role],
  );
  const done = role ? Boolean(uiPrefs.tourDone[role]) : true;
  const open = force || (!done && steps.length > 0);
  const current = steps[step];

  useEffect(() => {
    if (!open || !current) return;
    if (current.route) {
      void navigate({ to: current.route });
    }
    const t = window.setTimeout(() => {
      if (!current.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(current.target);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
      } else setRect(null);
    }, 280);
    return () => clearTimeout(t);
  }, [open, current, navigate, step]);

  // expose restart from settings via custom event
  useEffect(() => {
    function onRestart() {
      if (role) restartTour(role);
      setStep(0);
      setForce(true);
    }
    window.addEventListener("erp-restart-tour", onRestart);
    return () => window.removeEventListener("erp-restart-tour", onRestart);
  }, [role, restartTour]);

  if (!open || !current || !role) return null;

  function finish() {
    completeTour(role!);
    setForce(false);
    setStep(0);
  }

  function next() {
    if (step >= steps.length - 1) finish();
    else setStep((s) => s + 1);
  }

  const pad = 8;
  const hole = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      {/* dim with spotlight cutout */}
      <div className="absolute inset-0 bg-fg/55" aria-hidden />
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[var(--radius-md)] ring-2 ring-brand shadow-[0_0_0_9999px_rgba(15,20,24,0.55)] transition-all duration-[var(--motion-fast)]"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
        />
      ) : null}

      <div
        className={cn(
          "absolute z-10 w-[min(360px,calc(100vw-1.5rem))] rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-2xl page-enter",
          hole
            ? hole.top > 200
              ? "left-1/2 -translate-x-1/2"
              : "left-1/2 -translate-x-1/2"
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={
          hole
            ? {
                top: Math.min(
                  hole.top + hole.height + 12,
                  window.innerHeight - 220,
                ),
                left: Math.min(
                  Math.max(12, hole.left),
                  window.innerWidth - 372,
                ),
                transform: "none",
              }
            : undefined
        }
      >
        <div className="mb-2 flex items-start gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-brand-ink">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase text-muted">
              Tour {user?.roleLabel} · {step + 1}/{steps.length}
            </div>
            <h2 id="tour-title" className="text-sm font-bold text-fg">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2"
            onClick={finish}
            aria-label="Bỏ qua tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted">{current.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={finish}>
            Bỏ qua
          </Button>
          <Button size="sm" className="ml-auto" onClick={next}>
            {step >= steps.length - 1 ? "Xong" : "Tiếp"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
