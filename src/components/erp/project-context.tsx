import { Link } from "@tanstack/react-router";
import { AlertCircle, Building2, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  STAGE_LABEL,
  quoteTotal,
  workflowCompletion,
  type Project,
  type Quotation,
} from "@/data/seed";
import { formatVnd, cn } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";

export function useActiveProject(): Project | null {
  const projects = useErpStore((s) => s.projects);
  const activeProjectId = useErpStore((s) => s.activeProjectId);
  if (!projects.length) return null;
  return projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
}

export function ProjectPicker({ className }: { className?: string }) {
  const projects = useErpStore((s) => s.projects);
  const activeProjectId = useErpStore((s) => s.activeProjectId);
  const setActiveProject = useErpStore((s) => s.setActiveProject);

  if (!projects.length) {
    return (
      <div
        className={cn(
          "flex h-10 items-center rounded-[var(--radius-md)] border border-dashed border-warn bg-warn-soft/40 px-3 text-xs font-medium text-fg",
          className,
        )}
      >
        Chưa có công trình
      </div>
    );
  }

  const value =
    activeProjectId && projects.some((p) => p.id === activeProjectId)
      ? activeProjectId
      : projects[0].id;

  return (
    <select
      className={cn(
        "flex h-10 min-w-0 max-w-full rounded-[var(--radius-md)] border-2 border-brand bg-surface px-3 text-sm font-semibold text-fg shadow-sm sm:min-w-[280px] sm:max-w-lg",
        className,
      )}
      value={value}
      onChange={(e) => setActiveProject(e.target.value || null)}
      aria-label="Chọn công trình"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.code} — {p.name} · {p.customer}
        </option>
      ))}
    </select>
  );
}

/** Thanh chọn CT — luôn hiển thị (kể cả khi chưa có CT) */
export function ProjectContextBar({
  showQuotes,
  title = "Chọn công trình đang làm việc",
}: {
  showQuotes?: boolean;
  title?: string;
}) {
  const project = useActiveProject();
  const projects = useErpStore((s) => s.projects);
  const quotations = useErpStore((s) => s.quotations);
  const receivables = useErpStore((s) => s.receivables);

  if (!projects.length || !project) {
    return (
      <div className="rounded-[var(--radius-lg)] border-2 border-warn/50 bg-warn-soft/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-warn text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-fg">
              Chưa có công trình để xuất / gắn hồ sơ
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Làm theo thứ tự: <strong>2 · Khách hàng</strong> →{" "}
              <strong>3 · Công trình</strong> (tạo CT) → quay lại trang này và
              chọn CT trên dropdown.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/app/projects">
                <Plus className="h-3.5 w-3.5" />
                Tạo công trình (bước 3)
              </Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/app/customers">Khách hàng (bước 2)</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const quotes = quotations.filter((q) => q.projectCode === project.code);
  const ar = receivables.filter((r) => r.projectCode === project.code);
  const pct = workflowCompletion(project.workflow);

  return (
    <div className="rounded-[var(--radius-lg)] border border-brand/25 bg-gradient-to-r from-brand-soft/60 to-surface p-3 sm:p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-ink">
        {title}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-brand-ink">
                {project.code}
              </span>
              <Badge variant="brand">{STAGE_LABEL[project.stage]}</Badge>
              <Badge variant="info">{pct}% vòng đời</Badge>
              {project.contractCode ? (
                <Badge variant="ok">{project.contractCode}</Badge>
              ) : (
                <Badge variant="warn">Chưa có HĐ</Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-fg">
              {project.name}
            </div>
            <div className="truncate text-xs text-muted">
              {project.customer}
              {project.address ? ` · ${project.address}` : ""}
              {" · "}
              GT {formatVnd(project.value)} · {quotes.length} BG · {ar.length}{" "}
              công nợ
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
              Đổi công trình
            </label>
            <ProjectPicker />
          </div>
          <Link
            to="/app/projects"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs font-semibold text-brand-ink hover:bg-surface-2 sm:mt-5"
          >
            Vòng đời CT
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      {showQuotes && quotes.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border-soft pt-3">
          {quotes.map((q) => (
            <QuoteChip key={q.id} q={q} />
          ))}
        </div>
      ) : showQuotes ? (
        <div className="mt-3 border-t border-border-soft pt-3 text-xs text-muted">
          CT này chưa có báo giá — tạo ở menu{" "}
          <Link to="/app/quotations" className="font-semibold text-brand-ink underline">
            4 · Báo giá
          </Link>
          .
        </div>
      ) : null}
    </div>
  );
}

function QuoteChip({ q }: { q: Quotation }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px]">
      <strong className="text-fg">{q.code}</strong>
      <span className="text-muted">rev #{q.revision}</span>
      <span className="tabular-nums text-fg">{formatVnd(quoteTotal(q))}</span>
      <Badge
        variant={
          q.status === "won"
            ? "ok"
            : q.status === "pending"
              ? "warn"
              : q.status === "approved" || q.status === "sent"
                ? "info"
                : "default"
        }
      >
        {q.status}
      </Badge>
    </span>
  );
}
