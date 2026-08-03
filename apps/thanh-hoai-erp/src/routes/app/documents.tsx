import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import { DocStatusBadge, Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CT_PHASES, CT_TEMPLATES } from "@/data/ct-registry";
import { type DocStatus, type WorkflowStepId } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

const STATUS_CYCLE: DocStatus[] = ["enough", "pending", "draft", "missing"];

function DocumentsPage() {
  const project = useActiveProject();
  const setProjectDocStatus = useErpStore((s) => s.setProjectDocStatus);
  const markPhaseDocs = useErpStore((s) => s.markPhaseDocs);
  const markWorkflow = useErpStore((s) => s.markWorkflow);
  const quotations = useErpStore((s) => s.quotations);
  const [phase, setPhase] = useState<string>("all");
  const [q, setQ] = useState("");

  const projectQuotes = project
    ? quotations.filter((x) => x.projectCode === project.code)
    : [];

  const rows = useMemo(() => {
    return CT_TEMPLATES.filter((t) => {
      if (phase !== "all" && t.phase_code !== phase) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        t.code.toLowerCase().includes(s) ||
        t.title.toLowerCase().includes(s) ||
        t.owner_role.toLowerCase().includes(s)
      );
    });
  }, [phase, q]);

  const withStatus = rows.map((t) => ({
    ...t,
    status: (project?.docStatuses[t.code] ?? "missing") as DocStatus,
  }));

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
        <Card className="border-border">
          <CardBody className="text-sm text-muted">
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
                BG{" "}
                {projectQuotes.map((qq) => qq.code).join(", ")}
              </>
            ) : (
              " · chưa có báo giá gắn mã CT này"
            )}
            . Đổi trạng thái chỉ ảnh hưởng công trình đang chọn — không lẫn CT
            khác.
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <CardTitle>Checklist hồ sơ theo giai đoạn</CardTitle>
            <Badge variant="info">Bám {project?.code ?? "CT"}</Badge>
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã, tên, owner…"
            className="sm:max-w-xs"
          />
        </CardHeader>
        <CardBody className="space-y-3">
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
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/70 text-xs text-muted">
                  <th className="px-3 py-2.5 font-semibold">Mã</th>
                  <th className="px-3 py-2.5 font-semibold">Tên mẫu</th>
                  <th className="px-3 py-2.5 font-semibold">Phase</th>
                  <th className="px-3 py-2.5 font-semibold">Loại</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Gắn CT</th>
                  <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {withStatus.map((t) => (
                  <tr key={t.code} className="border-b border-border-soft">
                    <td className="px-3 py-2">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
                        {t.code}
                      </code>
                    </td>
                    <td className="max-w-[280px] px-3 py-2">{t.title}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {t.phase_code} — {CT_PHASES[t.phase_code]}
                    </td>
                    <td className="px-3 py-2 text-muted">{t.file_type}</td>
                    <td className="px-3 py-2 text-muted">{t.owner_role}</td>
                    <td className="px-3 py-2">
                      <Badge variant="default">{project?.code ?? "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-auto p-0 hover:bg-transparent"
                        onClick={() => cycle(t.code, t.status)}
                        title="Bấm để đổi trạng thái trên CT đang chọn"
                      >
                        <DocStatusBadge status={t.status} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!withStatus.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted">
                      Không có mẫu khớp bộ lọc.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Registry V3.1 — trạng thái lưu theo từng công trình. Đổi CT ở thanh
            trên để xem hồ sơ của CT khác.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
