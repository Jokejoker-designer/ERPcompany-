import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import { DataTable } from "@/components/erp/data-table";
import { DocStatusBadge, Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CT_PHASES, CT_TEMPLATES } from "@/data/ct-registry";
import { type DocStatus, type WorkflowStepId } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

const STATUS_CYCLE: DocStatus[] = ["enough", "pending", "draft", "missing"];

type DocRow = (typeof CT_TEMPLATES)[number] & { status: DocStatus };

function DocumentsPage() {
  const project = useActiveProject();
  const setProjectDocStatus = useErpStore((s) => s.setProjectDocStatus);
  const markPhaseDocs = useErpStore((s) => s.markPhaseDocs);
  const markWorkflow = useErpStore((s) => s.markWorkflow);
  const quotations = useErpStore((s) => s.quotations);
  const [phase, setPhase] = useState<string>("all");

  const projectQuotes = project
    ? quotations.filter((x) => x.projectCode === project.code)
    : [];

  const withStatus: DocRow[] = useMemo(() => {
    return CT_TEMPLATES.filter((t) => {
      if (phase !== "all" && t.phase_code !== phase) return false;
      return true;
    }).map((t) => ({
      ...t,
      status: (project?.docStatuses[t.code] ?? "missing") as DocStatus,
    }));
  }, [phase, project]);

  const counts = useMemo(() => {
    if (!project) return { missing: 0, enough: 0, pending: 0 };
    let missing = 0,
      enough = 0,
      pending = 0;
    for (const t of CT_TEMPLATES) {
      const st = project.docStatuses[t.code] ?? "missing";
      if (st === "missing") missing++;
      else if (st === "enough") enough++;
      else if (st === "pending") pending++;
    }
    return { missing, enough, pending };
  }, [project]);

  function cycle(code: string, current: DocStatus) {
    if (!project) return;
    const i = STATUS_CYCLE.indexOf(current);
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    setProjectDocStatus(project.id, code, next);
  }

  function markPhaseDone(ph: string) {
    if (!project) return;
    markPhaseDocs(project.id, ph, "enough");
    markWorkflow(project.id, `docs${ph}` as WorkflowStepId, true);
    toast.success(`Phase ${ph} đủ trên ${project.code}`, {
      description: project.name,
    });
  }

  return (
    <div className="space-y-4">
      <ProjectContextBar showQuotes />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Tổng mẫu CT" value={String(CT_TEMPLATES.length)} />
        <Metric
          label={`Đủ · ${project?.code ?? "—"}`}
          value={String(counts.enough)}
          tone="ok"
        />
        <Metric
          label="Chờ / nháp"
          value={String(counts.pending)}
          tone="info"
        />
        <Metric
          label="Thiếu trên CT này"
          value={String(counts.missing)}
          tone={counts.missing ? "danger" : "ok"}
        />
      </div>

      {project ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-panel)]">
          Checklist <strong className="text-fg">84 mẫu</strong> đang gắn với{" "}
          <strong className="text-fg">
            {project.code} — {project.name}
          </strong>
          {" · "}
          khách <strong className="text-fg">{project.customer}</strong>
          {project.contractCode ? (
            <>
              {" · "}HĐ <strong className="text-fg">{project.contractCode}</strong>
            </>
          ) : null}
          {projectQuotes.length ? (
            <>
              {" · "}
              BG {projectQuotes.map((qq) => qq.code).join(", ")}
            </>
          ) : (
            " · chưa có báo giá gắn mã CT này"
          )}
          . Đổi trạng thái chỉ ảnh hưởng công trình đang chọn.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPhase("all")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
            phase === "all"
              ? "border-brand bg-brand text-on-brand"
              : "border-border bg-surface text-muted hover:bg-surface-2",
          )}
        >
          Tất cả ({CT_TEMPLATES.length})
        </button>
        {Object.keys(CT_PHASES)
          .sort()
          .map((ph) => {
            const count = CT_TEMPLATES.filter(
              (t) => t.phase_code === ph,
            ).length;
            const enough = project
              ? CT_TEMPLATES.filter(
                  (t) =>
                    t.phase_code === ph &&
                    project.docStatuses[t.code] === "enough",
                ).length
              : 0;
            return (
              <button
                key={ph}
                type="button"
                onClick={() => setPhase(ph)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  phase === ph
                    ? "border-brand bg-brand text-on-brand"
                    : "border-border bg-surface text-muted hover:bg-surface-2",
                )}
              >
                {ph} · {CT_PHASES[ph]} ({enough}/{count})
              </button>
            );
          })}
      </div>

      {phase !== "all" && project ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => markPhaseDone(phase)}>
            Đánh dấu phase {phase} đủ trên {project.code}
          </Button>
          <Badge variant="info">Checklist theo giai đoạn</Badge>
        </div>
      ) : null}

      <DataTable<DocRow>
        rows={withStatus}
        rowKey={(t) => t.code}
        searchKeys={[
          (t) => t.code,
          (t) => t.title,
          (t) => t.owner_role,
          (t) => t.phase_code,
          (t) => CT_PHASES[t.phase_code] ?? "",
        ]}
        searchPlaceholder="Tìm mã, tên, owner, phase…"
        density="compact"
        emptyTitle="Không có mẫu khớp"
        emptyDescription="Đổi phase hoặc từ khóa tìm kiếm."
        toolbar={
          <span className="text-xs font-semibold text-muted">
            Hồ sơ · bám {project?.code ?? "CT"}
          </span>
        }
        columns={[
          {
            id: "code",
            header: "Mã",
            sortValue: (t) => t.code,
            cell: (t) => (
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
                {t.code}
              </code>
            ),
          },
          {
            id: "title",
            header: "Tên mẫu",
            sortValue: (t) => t.title,
            cell: (t) => (
              <span className="max-w-[280px]">{t.title}</span>
            ),
          },
          {
            id: "phase",
            header: "Phase",
            sortValue: (t) => t.phase_code,
            cell: (t) => (
              <span className="text-xs text-muted">
                {t.phase_code} — {CT_PHASES[t.phase_code]}
              </span>
            ),
            hideOnMobile: true,
          },
          {
            id: "type",
            header: "Loại",
            sortValue: (t) => t.file_type,
            cell: (t) => <span className="text-muted">{t.file_type}</span>,
            hideOnMobile: true,
          },
          {
            id: "owner",
            header: "Owner",
            sortValue: (t) => t.owner_role,
            cell: (t) => <span className="text-muted">{t.owner_role}</span>,
            hideOnMobile: true,
          },
          {
            id: "ct",
            header: "Gắn CT",
            cell: () => (
              <Badge variant="default">{project?.code ?? "—"}</Badge>
            ),
          },
          {
            id: "status",
            header: "Trạng thái",
            sortValue: (t) => t.status,
            cell: (t) => (
              <Button
                size="sm"
                variant="ghost"
                className="h-auto p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  cycle(t.code, t.status);
                }}
                title="Bấm để đổi trạng thái trên CT đang chọn"
              >
                <DocStatusBadge status={t.status} />
              </Button>
            ),
          },
        ]}
      />
      <p className="text-xs text-muted">
        Registry V3.1 — trạng thái lưu theo từng công trình. Đổi CT ở thanh trên
        để xem hồ sơ của CT khác.
      </p>
    </div>
  );
}
