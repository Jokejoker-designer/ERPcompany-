import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileStack,
  FolderSearch,
  Package,
  Play,
  Rocket,
  Sparkles,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CHUNG_TU,
  ROLES,
  SETUP_STEPS,
  setupCompletion,
} from "@/data/seed";
import { CT_PHASES, CT_TEMPLATES } from "@/data/ct-registry";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import { trapFocus } from "@/lib/focus-trap";

export function SetupWizard() {
  const navigate = useNavigate();
  const onboarding = useErpStore((s) => s.onboarding);
  const company = useErpStore((s) => s.company);
  const customers = useErpStore((s) => s.customers);
  const projects = useErpStore((s) => s.projects);
  const materials = useErpStore((s) => s.materials);
  const scan = useErpStore((s) => s.scan);
  const updateCompany = useErpStore((s) => s.updateCompany);
  const addCustomer = useErpStore((s) => s.addCustomer);
  const addProject = useErpStore((s) => s.addProject);
  const importPurchaseDemo = useErpStore((s) => s.importPurchaseDemo);
  const runEnterpriseScan = useErpStore((s) => s.runEnterpriseScan);
  const importScanHits = useErpStore((s) => s.importScanHits);
  const markSetup = useErpStore((s) => s.markSetup);
  const setWizardStep = useErpStore((s) => s.setWizardStep);
  const closeWizard = useErpStore((s) => s.closeWizard);
  const completeOnboarding = useErpStore((s) => s.completeOnboarding);

  const step = onboarding.step;
  const open = onboarding.wizardOpen;
  const pct = setupCompletion(onboarding.flags);

  const [companyForm, setCompanyForm] = useState(company);
  const [custForm, setCustForm] = useState({
    name: "",
    taxId: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const [projForm, setProjForm] = useState({
    customerId: "",
    code: "",
    name: "",
    address: "",
    value: "",
  });

  useEffect(() => {
    if (open) setCompanyForm(company);
  }, [open, company]);

  useEffect(() => {
    if (!projForm.customerId && customers[0]) {
      setProjForm((f) => ({ ...f, customerId: customers[0].id }));
    }
  }, [customers, projForm.customerId]);

  const phaseSummary = useMemo(
    () =>
      Object.keys(CT_PHASES)
        .sort()
        .map((ph) => ({
          code: ph,
          name: CT_PHASES[ph],
          count: CT_TEMPLATES.filter((t) => t.phase_code === ph).length,
        })),
    [],
  );

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [open, step]);

  if (!open) return null;

  function go(next: number) {
    setWizardStep(Math.max(0, Math.min(SETUP_STEPS.length - 1, next)));
  }

  function saveCompany() {
    if (!companyForm.companyName.trim()) {
      toast.error("Nhập tên công ty");
      return false;
    }
    updateCompany(companyForm);
    markSetup("company");
    toast.success("Đã lưu hồ sơ công ty — letterhead chứng từ đã cập nhật");
    return true;
  }

  function saveCustomer() {
    if (!custForm.name.trim()) {
      toast.error("Nhập tên khách hàng");
      return false;
    }
    addCustomer(custForm);
    setCustForm({
      name: "",
      taxId: "",
      contact: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    toast.success("Đã tạo profile khách hàng");
    return true;
  }

  function saveProject() {
    if (!projForm.customerId) {
      toast.error("Chọn khách hàng cho công trình");
      return false;
    }
    if (!projForm.name.trim()) {
      toast.error("Nhập tên công trình");
      return false;
    }
    const p = addProject({
      customerId: projForm.customerId,
      code: projForm.code,
      name: projForm.name,
      address: projForm.address,
      value: Number(projForm.value) || 0,
    });
    if (!p) return false;
    toast.success(`Đã tạo ${p.code} — gắn checklist 84 mẫu hồ sơ CT`);
    setProjForm((f) => ({ ...f, code: "", name: "", address: "", value: "" }));
    return true;
  }

  function nextFromStep() {
    if (step === 1 && !saveCompany()) return;
    if (step === 2) markSetup("roles");
    if (step === 3) {
      if (!onboarding.flags.customers && customers.length === 0) {
        toast.message("Tạo ít nhất 1 khách, hoặc bấm «Bỏ qua»");
        return;
      }
      if (customers.length > 0) markSetup("customers");
    }
    if (step === 4) {
      if (!onboarding.flags.projects && projects.length === 0) {
        toast.message("Tạo 1 công trình, hoặc bấm «Bỏ qua»");
        return;
      }
      if (projects.length > 0) markSetup("projects");
    }
    if (step === 5) markSetup("materials");
    if (step === 6) markSetup("templates");
    if (step === 7) markSetup("scan");
    if (step === 8) markSetup("ops");
    if (step === SETUP_STEPS.length - 1) {
      completeOnboarding();
      toast.success("Setup A→Z xong — đã làm sạch dữ liệu về 0", {
        description:
          "Giữ hồ sơ công ty. Khách / CT / BG / công nợ demo đã xóa — bắt đầu nhập dữ liệu thật.",
      });
      navigate({ to: "/app/dashboard" });
      return;
    }
    go(step + 1);
  }

  function skipStep() {
    go(step + 1);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-fg/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Đóng nền"
        onClick={() => closeWizard({ dismiss: true })}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-wizard-title"
        className="relative z-[81] flex max-h-[min(920px,100dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-panel)] sm:max-h-[90dvh] sm:flex-row sm:rounded-[var(--radius-xl)]"
      >
        {/* Vertical progress (desktop) / top strip (mobile) */}
        <aside className="flex shrink-0 flex-col border-b border-border-soft bg-nav text-nav-ink sm:w-52 sm:border-b-0 sm:border-r sm:border-nav-line">
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
              <Rocket className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Setup A→Z</div>
              <div className="text-[11px] text-nav-muted">{pct}% · 1 quyết định / bước</div>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md text-nav-muted hover:bg-nav-hover sm:hidden"
              onClick={() => closeWizard({ dismiss: true })}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-1 bg-nav-line sm:hidden">
            <div className="h-full bg-brand" style={{ width: `${((step + 1) / SETUP_STEPS.length) * 100}%` }} />
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 sm:flex-1 sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:px-2 sm:py-2">
            {SETUP_STEPS.map((s, i) => {
              const done = i < step;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                    i === step
                      ? "bg-brand text-on-brand"
                      : done
                        ? "text-nav-ink hover:bg-nav-hover"
                        : "text-nav-muted hover:bg-nav-hover hover:text-nav-ink",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                      i === step
                        ? "bg-white/20"
                        : done
                          ? "bg-ok/30 text-ok"
                          : "bg-white/10",
                    )}
                  >
                    {done && i !== step ? "✓" : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.short}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="setup-wizard-title" className="truncate text-base font-semibold text-fg">
              {step + 1}. {SETUP_STEPS[step].title}
            </h2>
            <p className="text-xs text-muted">Chỉ một thao tác chính ở bước này</p>
          </div>
          <button
            type="button"
            className="hidden h-9 w-9 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface-2 sm:grid"
            onClick={() => closeWizard({ dismiss: true })}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <CompanyStep form={companyForm} setForm={setCompanyForm} onSave={saveCompany} />
          )}
          {step === 2 && <RolesStep />}
          {step === 3 && (
            <CustomerStep
              form={custForm}
              setForm={setCustForm}
              onSave={saveCustomer}
              count={customers.length}
            />
          )}
          {step === 4 && (
            <ProjectStep
              form={projForm}
              setForm={setProjForm}
              customers={customers}
              onSave={saveProject}
              count={projects.length}
            />
          )}
          {step === 5 && (
            <MaterialsStep
              count={materials.length}
              onImport={() => {
                importPurchaseDemo();
                toast.success("Đã nạp mẫu import HĐ mua vào");
              }}
            />
          )}
          {step === 6 && <TemplatesStep phases={phaseSummary} />}
          {step === 7 && (
            <ScanStep
              scanRoots={companyForm.scanRoots}
              onChange={(v) =>
                setCompanyForm((f) => ({ ...f, scanRoots: v }))
              }
              onSave={() => {
                updateCompany({ scanRoots: companyForm.scanRoots });
                markSetup("scan");
                toast.success("Đã lưu thư mục quét hồ sơ");
              }}
              onRun={() => {
                updateCompany({ scanRoots: companyForm.scanRoots });
                const n = runEnterpriseScan();
                markSetup("scan");
                toast.success(`Quét DN xong — ${n} file`);
              }}
              onImport={() => {
                const res = importScanHits();
                toast.success(
                  `Nạp scan: +${res.customers} KH · +${res.projects} CT · ${res.docs} HS`,
                );
              }}
              onOpenFull={() => {
                closeWizard();
                navigate({ to: "/app/scan" });
              }}
              stats={scan.stats}
            />
          )}
          {step === 8 && (
            <OpsStep
              onGo={(path) => {
                closeWizard();
                navigate({ to: path });
              }}
            />
          )}
          {step === 9 && (
            <DoneStep
              flags={onboarding.flags}
              counts={{
                customers: customers.length,
                projects: projects.length,
                materials: materials.length,
                scanFiles: scan.stats.files,
              }}
              onOpen={(s) => go(s)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-surface px-4 py-3 sm:px-5">
          <Button
            size="sm"
            variant="ghost"
            disabled={step === 0}
            onClick={() => go(step - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Trước
          </Button>
          {step > 0 && step < SETUP_STEPS.length - 1 ? (
            <Button size="sm" variant="ghost" onClick={skipStep}>
              Bỏ qua bước này
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => closeWizard({ dismiss: true })}
            >
              Để sau
            </Button>
            <Button size="sm" onClick={nextFromStep}>
              {step === SETUP_STEPS.length - 1 ? (
                <>
                  <Check className="h-4 w-4" />
                  Hoàn tất & xóa về 0
                </>
              ) : (
                <>
                  Tiếp tục
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function StepIntro({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-brand-ink">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-fg sm:text-base">{title}</h3>
        <div className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div>
      <StepIntro icon={Sparkles} title="Lộ trình setup đầy đủ A → Z">

        10 bước · mỗi bước một việc. Demo chỉ để tập — bấm <strong className="text-fg">Hoàn tất</strong> sẽ xóa data về 0 (giữ letterhead).
      </StepIntro>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        {[
          "Hồ sơ & letterhead công ty",
          "Tài khoản theo 7 vai trò",
          "Profile khách hàng",
          "Công trình + checklist 84 mẫu",
          "Vật tư / import HĐ mua",
          "Mẫu chứng từ xuất file",
          "Quét folder dữ liệu DN (PDF/Word/Excel)",
          "Luồng vận hành BG → HĐ → HS → CN",
          "Hoàn tất & làm sạch dữ liệu demo",
        ].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </div>
  );
}

function CompanyStep({
  form,
  setForm,
  onSave,
}: {
  form: ReturnType<typeof useErpStore.getState>["company"];
  setForm: React.Dispatch<
    React.SetStateAction<ReturnType<typeof useErpStore.getState>["company"]>
  >;
  onSave: () => boolean;
}) {
  const fields: [keyof typeof form, string][] = [
    ["companyName", "Tên công ty *"],
    ["taxId", "Mã số thuế"],
    ["address", "Địa chỉ"],
    ["phone", "Điện thoại"],
    ["hotline", "Hotline"],
    ["website", "Website"],
  ];
  return (
    <div>
      <StepIntro icon={Building2} title="Hồ sơ công ty">
        Tên, MST, địa chỉ — in lên letterhead báo giá / BBNT / HĐ. Giữ lại sau
        khi setup xóa demo.
      </StepIntro>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-semibold text-muted">
              {label}
            </label>
            <Input
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" onClick={onSave}>
        Lưu hồ sơ công ty
      </Button>
    </div>
  );
}

function RolesStep() {
  return (
    <div>
      <StepIntro icon={Users} title="Tài khoản & vai trò">
        7 vai trò sẵn: GĐ, kế toán, kinh doanh, KTT, KTV, thủ kho, admin. Đăng
        nhập demo bằng nút trên màn login.
      </StepIntro>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <div
            key={r.id}
            className="rounded-[var(--radius-md)] border border-border px-3 py-2"
          >
            <div className="text-sm font-semibold text-fg">{r.label}</div>
            <div className="text-xs text-muted">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerStep({
  form,
  setForm,
  onSave,
  count,
}: {
  form: {
    name: string;
    taxId: string;
    contact: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  onSave: () => boolean;
  count: number;
}) {
  return (
    <div>
      <StepIntro icon={UserPlus} title="Profile khách hàng">
        Tạo khách thật hoặc thử với dữ liệu mẫu. Hiện có{" "}
        <strong className="text-fg">{count}</strong> profile.
      </StepIntro>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["name", "Tên khách *"],
            ["taxId", "MST"],
            ["contact", "Người liên hệ"],
            ["phone", "SĐT"],
            ["email", "Email"],
            ["address", "Địa chỉ"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-semibold text-muted">
              {label}
            </label>
            <Input
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" onClick={onSave}>
        Lưu khách hàng
      </Button>
    </div>
  );
}

function ProjectStep({
  form,
  setForm,
  customers,
  onSave,
  count,
}: {
  form: {
    customerId: string;
    code: string;
    name: string;
    address: string;
    value: string;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  customers: { id: string; name: string }[];
  onSave: () => boolean;
  count: number;
}) {
  return (
    <div>
      <StepIntro icon={ClipboardList} title="Công trình / hồ sơ CT">
        Mỗi CT gắn 84 mẫu hồ sơ theo phase. Hiện{" "}
        <strong className="text-fg">{count}</strong> công trình.
      </StepIntro>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-muted">
            Khách hàng
          </label>
          <select
            className="flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
            value={form.customerId}
            onChange={(e) =>
              setForm((f) => ({ ...f, customerId: e.target.value }))
            }
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {(
          [
            ["code", "Mã CT"],
            ["name", "Tên công trình *"],
            ["address", "Địa điểm"],
            ["value", "Giá trị (VND)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-semibold text-muted">
              {label}
            </label>
            <Input
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" onClick={onSave}>
        Tạo công trình
      </Button>
    </div>
  );
}

function MaterialsStep({
  count,
  onImport,
}: {
  count: number;
  onImport: () => void;
}) {
  return (
    <div>
      <StepIntro icon={Package} title="Vật tư & HĐ mua vào">
        Import Excel HĐ mua để có danh mục mặt hàng, giá vốn, tồn. Hiện{" "}
        <strong className="text-fg">{count}</strong> SKU.
      </StepIntro>
      <Button size="sm" onClick={onImport}>
        Nạp mẫu import HĐ mua vào
      </Button>
    </div>
  );
}

function TemplatesStep({
  phases,
}: {
  phases: { code: string; name: string; count: number }[];
}) {
  return (
    <div>
      <StepIntro icon={FileStack} title="Mẫu chứng từ hệ thống">
        {CHUNG_TU.length} mẫu xuất + {CT_TEMPLATES.length} mẫu hồ sơ CT theo
        phase.
      </StepIntro>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {phases.map((p) => (
          <div
            key={p.code}
            className="rounded-[var(--radius-md)] border border-border px-2.5 py-2 text-xs"
          >
            <span className="text-muted">
              {p.code} · {p.name}
            </span>
            <div className="font-semibold text-fg">{p.count} mẫu</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanStep({
  scanRoots,
  onChange,
  onSave,
  onRun,
  onImport,
  onOpenFull,
  stats,
}: {
  scanRoots: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRun: () => void;
  onImport: () => void;
  onOpenFull: () => void;
  stats: { files: number; customers: number; projects: number; imported: number };
}) {
  return (
    <div>
      <StepIntro icon={FolderSearch} title="Quét dữ liệu doanh nghiệp">
        Đây là bước <strong className="text-fg">quét folder hồ sơ DN</strong>{" "}
        trên ổ đĩa: index PDF, Word, Excel, ảnh theo folder khách → map vào
        profile / công trình / checklist CT. Chỉ đọc metadata, không sửa file
        gốc.
      </StepIntro>
      <label className="mb-1 block text-xs font-semibold text-muted">
        Thư mục quét (scan_roots — phân tách bằng ; )
      </label>
      <Input
        value={scanRoots}
        onChange={(e) => onChange(e.target.value)}
        placeholder="D:/2025; D:/2026; E:/HoSoKhach"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onSave}>
          Lưu cấu hình
        </Button>
        <Button size="sm" onClick={onRun}>
          <Play className="h-3.5 w-3.5" />
          Chạy quét DN
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onImport}
          disabled={!stats.files}
        >
          Nạp kết quả vào ERP
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenFull}>
          Mở module Quét đầy đủ →
        </Button>
      </div>
      {stats.files > 0 ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-ok/30 bg-ok-soft/30 px-3 py-2 text-sm">
          Đã quét <strong>{stats.files}</strong> file ·{" "}
          <strong>{stats.customers}</strong> khách ·{" "}
          <strong>{stats.projects}</strong> CT · đã nạp{" "}
          <strong>{stats.imported}</strong>
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>• 1 folder khách = thư mục con (hợp đồng, bản vẽ, BOQ…)</li>
          <li>• Map file → mã CT-00…CT-09 / HD / BG</li>
          <li>
            • Module đầy đủ: menu <strong className="text-fg">Quét dữ liệu DN</strong>
          </li>
        </ul>
      )}
    </div>
  );
}

function OpsStep({ onGo }: { onGo: (path: string) => void }) {
  const items = [
    { t: "Quét dữ liệu DN", d: "Folder khách → nạp HS / CT", path: "/app/scan" },
    { t: "Báo giá / BOQ", d: "Lập, revision, VAT, xuất BG", path: "/app/quotations" },
    { t: "Công trình / vòng đời", d: "CT → BG → HĐ → HS → CN", path: "/app/projects" },
    { t: "Hồ sơ CT", d: "Tick đủ/thiếu 84 mẫu theo phase", path: "/app/documents" },
    { t: "Chứng từ", d: "BBNT, BQT, HĐ, PXK, Thư ĐNTT…", path: "/app/chungtu" },
    { t: "Công nợ", d: "Phải thu theo HĐ, ghi nhận thu", path: "/app/receivables" },
  ] as const;

  return (
    <div>
      <StepIntro icon={Workflow} title="Vận hành hằng ngày">
        Luồng chuẩn:{" "}
        <strong className="text-fg">
          Quét DN / Khách → Công trình → Báo giá → Hợp đồng → Hồ sơ → Nghiệm thu
          → Công nợ → Sao kê
        </strong>
        .
      </StepIntro>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <button
            key={it.path}
            type="button"
            onClick={() => onGo(it.path)}
            className="rounded-[var(--radius-md)] border border-border px-3 py-3 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft"
          >
            <div className="text-sm font-semibold text-fg">{it.t}</div>
            <div className="text-xs text-muted">{it.d}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DoneStep({
  flags,
  counts,
  onOpen,
}: {
  flags: ReturnType<typeof useErpStore.getState>["onboarding"]["flags"];
  counts: {
    customers: number;
    projects: number;
    materials: number;
    scanFiles: number;
  };
  onOpen: (step: number) => void;
}) {
  const rows: {
    key: keyof typeof flags;
    label: string;
    step: number;
    meta: string;
  }[] = [
    { key: "company", label: "Hồ sơ công ty", step: 1, meta: "Letterhead (giữ lại)" },
    { key: "roles", label: "Vai trò & tài khoản", step: 2, meta: "7 roles" },
    {
      key: "customers",
      label: "Profile khách",
      step: 3,
      meta: `${counts.customers} KH (sẽ xóa demo)`,
    },
    {
      key: "projects",
      label: "Công trình",
      step: 4,
      meta: `${counts.projects} CT (sẽ xóa demo)`,
    },
    {
      key: "materials",
      label: "Vật tư / HĐ mua",
      step: 5,
      meta: `${counts.materials} SKU`,
    },
    { key: "templates", label: "Mẫu chứng từ", step: 6, meta: "8 + 84" },
    {
      key: "scan",
      label: "Quét dữ liệu DN",
      step: 7,
      meta: `${counts.scanFiles} file đã quét`,
    },
    { key: "ops", label: "Luồng vận hành", step: 8, meta: "BG→CN" },
  ];

  return (
    <div>
      <StepIntro icon={Check} title="Hoàn tất & làm sạch về 0">
        Khi bấm <strong className="text-fg">Hoàn tất & xóa về 0</strong>:
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            <strong className="text-fg">Giữ</strong> hồ sơ công ty / letterhead
            bạn vừa nhập
          </li>
          <li>
            <strong className="text-fg">Xóa hết</strong> khách, CT, BG, công nợ,
            vật tư, sao kê, kết quả quét demo
          </li>
          <li>
            Hệ thống về trạng thái <strong className="text-fg">sạch 0</strong> —
            sẵn sàng nạp dữ liệu thật (tay hoặc Quét DN)
          </li>
        </ul>
      </StepIntro>
      <div className="mb-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 px-3 py-2 text-xs text-fg">
        Đây là bước bắt buộc sau khi chạy thử setup — tránh lẫn dữ liệu demo với
        dữ liệu vận hành thật.
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onOpen(r.step)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-left hover:bg-surface-2"
          >
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                flags[r.key]
                  ? "bg-ok-soft text-ok"
                  : "bg-warn-soft text-warn",
              )}
            >
              {flags[r.key] ? "✓" : "!"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">
                {r.label}
              </span>
              <span className="text-xs text-muted">{r.meta}</span>
            </span>
            <Badge variant={flags[r.key] ? "ok" : "warn"}>
              {flags[r.key] ? "Xong" : "Còn thiếu"}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SetupProgressBanner() {
  const onboarding = useErpStore((s) => s.onboarding);
  const openWizard = useErpStore((s) => s.openWizard);
  const pct = setupCompletion(onboarding.flags);

  if (onboarding.completed) {
    if (onboarding.wipedAfterSetup) {
      return (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-ok/30 bg-ok-soft/40 p-3 sm:p-4">
          <div className="text-sm font-semibold text-fg">
            Setup A→Z xong — dữ liệu đã về 0
          </div>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">
            Letterhead công ty được giữ. Hãy nạp khách / CT mới, hoặc mở{" "}
            <strong>Quét dữ liệu DN</strong> để import từ folder.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-brand/30 bg-brand-soft/50 p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-brand-ink">
          Setup công ty chưa hoàn tất ({pct}%)
        </div>
        <p className="text-xs text-muted sm:text-sm">
          Làm theo wizard A→Z — gồm cả <strong>quét dữ liệu DN</strong>. Hoàn
          tất sẽ tự xóa demo về 0.
        </p>
        <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Button size="sm" onClick={() => openWizard()}>
        <Rocket className="h-4 w-4" />
        Tiếp tục setup
      </Button>
    </div>
  );
}
