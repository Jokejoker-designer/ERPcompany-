import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  FileSignature,
  FolderOpen,
  Landmark,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectPicker } from "@/components/erp/project-context";
import { DataTable } from "@/components/erp/data-table";
import { DocStatusBadge, Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CT_PHASES, CT_TEMPLATES } from "@/data/ct-registry";
import {
  STAGE_LABEL,
  WORKFLOW_STEPS,
  normalizeLine,
  quoteTotal,
  workflowCompletion,
  type WorkflowStepId,
} from "@/data/seed";
import { cn, formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import { resolveUserKey } from "@/lib/user-scope";
import type { Project, ProjectStage } from "@/data/seed";

export const Route = createFileRoute("/app/projects")({
  component: ProjectsPage,
});

const STEP_ROUTE: Partial<Record<WorkflowStepId, string>> = {
  quote: "/app/quotations",
  contract: "/app/chungtu",
  docs01: "/app/documents",
  docs02: "/app/documents",
  docs03: "/app/documents",
  docs04: "/app/documents",
  docs05: "/app/documents",
  docs06: "/app/documents",
  docs07: "/app/documents",
  docs08: "/app/documents",
  docs09: "/app/documents",
  ar: "/app/receivables",
  bank: "/app/bank",
  profile: "/app/customers",
};

function ProjectsPage() {
  const projects = useErpStore((s) => s.projects);
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const userKey = resolveUserKey(session, user?.username);
  const quotations = useErpStore((s) => s.quotations);
  const receivables = useErpStore((s) => s.receivables);
  const activeProjectId = useErpStore((s) => s.activeProjectId);
  const setActiveProject = useErpStore((s) => s.setActiveProject);
  const markWorkflow = useErpStore((s) => s.markWorkflow);
  const markPhaseDocs = useErpStore((s) => s.markPhaseDocs);
  const promoteQuoteToContract = useErpStore((s) => s.promoteQuoteToContract);
  const setProjectStage = useErpStore((s) => s.setProjectStage);
  const setQuotationStatus = useErpStore((s) => s.setQuotationStatus);

  const project =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const quotes = useMemo(
    () =>
      project
        ? quotations.filter((q) => q.projectCode === project.code)
        : [],
    [quotations, project],
  );
  const ar = useMemo(
    () =>
      project
        ? receivables.filter((r) => r.projectCode === project.code)
        : [],
    [receivables, project],
  );

  const docStats = useMemo(() => {
    if (!project) return { enough: 0, missing: 0, pending: 0, draft: 0, total: 0 };
    let enough = 0,
      missing = 0,
      pending = 0,
      draft = 0;
    for (const t of CT_TEMPLATES) {
      const st = project.docStatuses[t.code] ?? "missing";
      if (st === "enough") enough++;
      else if (st === "missing") missing++;
      else if (st === "pending") pending++;
      else draft++;
    }
    return { enough, missing, pending, draft, total: CT_TEMPLATES.length };
  }, [project]);

  if (!project) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center text-sm text-muted">
        Chưa có công trình. Tạo CT trong Setup A→Z hoặc menu Khách hàng.
      </div>
    );
  }

  const pct = workflowCompletion(project.workflow);
  const primaryQuote =
    quotes.find((q) => q.status === "won") ||
    quotes.find((q) => q.status === "approved" || q.status === "sent") ||
    quotes[0];

  function completeStep(step: WorkflowStepId) {
    const def = WORKFLOW_STEPS.find((s) => s.id === step);
    markWorkflow(project!.id, step, true);
    if (def?.phase) {
      markPhaseDocs(project!.id, def.phase, "enough");
    }
    if (step === "docs05") {
      setProjectStage(project!.id, "thi_cong", Math.max(project!.progress, 40));
    }
    if (step === "docs06") {
      setProjectStage(project!.id, "nghiem_thu", Math.max(project!.progress, 85));
    }
    if (step === "docs07" || step === "docs08") {
      setProjectStage(project!.id, "hoan_thanh", 100);
    }
    toast.success(`Đã hoàn tất bước: ${def?.label ?? step}`, {
      description: `${project!.code} — dữ liệu bám CT / khách đã nạp`,
    });
  }

  function promote() {
    if (!primaryQuote) {
      toast.error("Chưa có báo giá gắn CT này — tạo BG trước");
      return;
    }
    if (primaryQuote.status !== "won") {
      setQuotationStatus(primaryQuote.id, "won");
    } else {
      const res = promoteQuoteToContract(primaryQuote.id);
      if (res) {
        toast.success(`Đã tạo ${res.contract}`, {
          description: "Công nợ + hồ sơ HĐ phase 01 bám theo BG / CT",
        });
      }
    }
  }

  return (
    <div className="space-y-4">
      <DataTable<Project>
        rows={projects}
        rowKey={(p) => p.id}
        tableId="projects"
        userKey={userKey}
        selectedKey={activeProjectId}
        onRowClick={(p) => setActiveProject(p.id)}
        searchKeys={[
          (p) => p.code,
          (p) => p.name,
          (p) => p.customer,
          (p) => p.address ?? "",
        ]}
        searchPlaceholder="Lọc mã CT, tên, khách…"
        facets={[
          {
            id: "stage",
            options: [
              { value: "all", label: "Mọi giai đoạn" },
              { value: "bao_gia", label: STAGE_LABEL.bao_gia },
              { value: "thi_cong", label: STAGE_LABEL.thi_cong },
              { value: "nghiem_thu", label: STAGE_LABEL.nghiem_thu },
              { value: "hoan_thanh", label: STAGE_LABEL.hoan_thanh },
            ],
            match: (p, v) => v === "all" || p.stage === (v as ProjectStage),
          },
          {
            id: "overdue",
            options: [
              { value: "all", label: "Hạn mọi" },
              { value: "yes", label: "Trễ hạn" },
              { value: "no", label: "Trong hạn" },
            ],
            match: (p, v) => {
              if (v === "all") return true;
              const overdue = Boolean(p.overdue);
              return v === "yes" ? overdue : !overdue;
            },
          },
        ]}
        columns={[
          {
            id: "code",
            header: "Mã CT",
            sortValue: (p) => p.code,
            cell: (p) => (
              <span className="font-mono text-xs font-bold text-brand-ink">
                {p.code}
              </span>
            ),
          },
          {
            id: "name",
            header: "Công trình",
            sortValue: (p) => p.name,
            cell: (p) => (
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.customer}</div>
              </div>
            ),
          },
          {
            id: "stage",
            header: "Giai đoạn",
            sortValue: (p) => p.stage,
            cell: (p) => STAGE_LABEL[p.stage],
          },
          {
            id: "progress",
            header: "%",
            sortValue: (p) => p.progress,
            cell: (p) => `${p.progress}%`,
            className: "w-14",
          },
          {
            id: "value",
            header: "Giá trị",
            sortValue: (p) => p.value,
            cell: (p) => formatVnd(p.value),
            hideOnMobile: true,
          },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Công trình đang thao tác
          </p>
          <ProjectPicker className="mt-1 w-full max-w-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="brand">{projects.length} CT</Badge>
          <Badge variant="info">{pct}% vòng đời</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Khách hàng"
          value={project.customer}
          foot={project.contractCode || "Chưa ký HĐ"}
        />
        <Metric
          label="Giá trị CT"
          value={formatVnd(project.value)}
          foot={`${STAGE_LABEL[project.stage]} · ${project.progress}%`}
          tone="info"
        />
        <Metric
          label="Hồ sơ đủ"
          value={`${docStats.enough}/${docStats.total}`}
          foot={`${docStats.missing} thiếu · ${docStats.pending} chờ`}
          tone={docStats.missing ? "warn" : "ok"}
        />
        <Metric
          label="Báo giá / công nợ"
          value={`${quotes.length} BG`}
          foot={`${ar.length} HĐ phải thu`}
        />
      </div>

      {/* Identity card — data bound */}
      <Card>
        <CardHeader>
          <CardTitle>
            {project.code} · {project.name}
          </CardTitle>
          <Badge variant="brand">{STAGE_LABEL[project.stage]}</Badge>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Mã CT", project.code],
            ["Tên công trình", project.name],
            ["Khách hàng", project.customer],
            ["Địa điểm", project.address || "—"],
            ["Hợp đồng", project.contractCode || "— (tạo từ BG trúng)"],
            ["Giá trị", formatVnd(project.value)],
            ["Tiến độ", `${project.progress}%`],
            ["Giai đoạn", STAGE_LABEL[project.stage]],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="text-xs text-muted">{l}</div>
              <div className="text-sm font-medium text-fg">{v}</div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Vòng đời đầy đủ — bám dữ liệu đã nạp</CardTitle>
          <span className="text-xs text-muted">Bấm «Hoàn tất» hoặc nhảy module</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {WORKFLOW_STEPS.map((step, i) => {
            const done = project.workflow[step.id];
            const phaseDocs = step.phase
              ? CT_TEMPLATES.filter((t) => t.phase_code === step.phase)
              : [];
            const phaseEnough = phaseDocs.filter(
              (t) => project.docStatuses[t.code] === "enough",
            ).length;
            const route = STEP_ROUTE[step.id];

            return (
              <div
                key={step.id}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--radius-md)] border px-3 py-3 sm:flex-row sm:items-center",
                  done
                    ? "border-ok/30 bg-ok-soft/30"
                    : "border-border bg-surface",
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                      done ? "bg-ok text-white" : "bg-surface-2 text-muted",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-fg">
                      {step.label}
                      {step.phase ? (
                        <span className="ml-2 text-xs font-normal text-muted">
                          Phase {step.phase} · {CT_PHASES[step.phase]}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">{step.desc}</div>
                    {step.phase ? (
                      <div className="mt-1 text-[11px] text-muted">
                        Hồ sơ phase: {phaseEnough}/{phaseDocs.length} đủ —{" "}
                        <strong className="text-fg">{project.code}</strong>
                      </div>
                    ) : null}
                    {step.id === "quote" ? (
                      <div className="mt-1 text-[11px] text-muted">
                        {quotes.length
                          ? quotes
                              .map(
                                (q) =>
                                  `${q.code} (${q.lines.length} HM · ${formatVnd(quoteTotal(q))})`,
                              )
                              .join(" · ")
                          : "Chưa có BG — tạo tại Báo giá với mã CT này"}
                      </div>
                    ) : null}
                    {step.id === "contract" || step.id === "ar" ? (
                      <div className="mt-1 text-[11px] text-muted">
                        {project.contractCode
                          ? `HĐ ${project.contractCode}`
                          : "Chưa có HĐ"}
                        {ar.length
                          ? ` · ${ar.map((r) => `${r.contract} còn ${formatVnd(r.value - r.collected)}`).join(", ")}`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  {!done ? (
                    <Button size="sm" variant="secondary" onClick={() => completeStep(step.id)}>
                      Hoàn tất bước
                    </Button>
                  ) : (
                    <Badge variant="ok">Xong</Badge>
                  )}
                  {step.id === "contract" && !project.contractCode ? (
                    <Button size="sm" onClick={promote}>
                      <FileSignature className="h-3.5 w-3.5" />
                      Tạo HĐ từ BG
                    </Button>
                  ) : null}
                  {route ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to={route}
                        onClick={() => setActiveProject(project.id)}
                      >
                        Mở
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Báo giá gắn {project.code}</CardTitle>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/app/quotations" onClick={() => setActiveProject(project.id)}>
                Mở báo giá
              </Link>
            </Button>
          </CardHeader>
          <CardBody className="space-y-2">
            {!quotes.length ? (
              <p className="text-sm text-muted">
                Chưa có báo giá. Tạo BG với mã CT = <strong>{project.code}</strong>{" "}
                để BOQ và chứng từ bám đúng công trình.
              </p>
            ) : (
              quotes.map((q) => (
                <div
                  key={q.id}
                  className="rounded-[var(--radius-md)] border border-border px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {q.code} · rev #{q.revision}
                    </span>
                    <Badge variant="info">{q.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {q.customer} · {q.lines.length} hạng mục ·{" "}
                    {formatVnd(quoteTotal(q))}
                  </div>
                  <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                    {q.lines.slice(0, 6).map((raw) => {
                      const l = normalizeLine(raw, q.vat);
                      return (
                        <li key={l.id}>
                          · {l.name} — {l.qty} {l.unit} × {formatVnd(l.unitPrice)}
                        </li>
                      );
                    })}
                    {q.lines.length > 6 ? (
                      <li>… +{q.lines.length - 6} hạng mục</li>
                    ) : null}
                  </ul>
                  {q.status !== "won" && q.status !== "lost" ? (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setQuotationStatus(q.id, "won");
                        toast.success("BG trúng → HĐ + công nợ + phase 01");
                      }}
                    >
                      Đánh trúng & tạo HĐ
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hồ sơ CT — tóm tắt theo phase</CardTitle>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/app/documents" onClick={() => setActiveProject(project.id)}>
                <FolderOpen className="h-3.5 w-3.5" />
                Checklist
              </Link>
            </Button>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.keys(CT_PHASES)
              .sort()
              .map((ph) => {
                const list = CT_TEMPLATES.filter((t) => t.phase_code === ph);
                const enough = list.filter(
                  (t) => project.docStatuses[t.code] === "enough",
                ).length;
                const missing = list.filter(
                  (t) => (project.docStatuses[t.code] ?? "missing") === "missing",
                ).length;
                return (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => {
                      setActiveProject(project.id);
                      markPhaseDocs(project.id, ph, "enough");
                      markWorkflow(
                        project.id,
                        `docs${ph}` as WorkflowStepId,
                        true,
                      );
                      toast.success(`Phase ${ph}: đánh dấu đủ (${project.code})`);
                    }}
                    className="rounded-[var(--radius-md)] border border-border px-2.5 py-2 text-left hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    <div className="text-xs font-bold text-brand-ink">
                      {ph} · {CT_PHASES[ph]}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {enough}/{list.length} đủ
                      {missing ? ` · ${missing} thiếu` : ""}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-border-soft">
                      <div
                        className="h-full bg-brand"
                        style={{
                          width: `${Math.round((enough / list.length) * 100)}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/chungtu" onClick={() => setActiveProject(project.id)}>
            Xuất chứng từ (bám CT)
          </Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/receivables" onClick={() => setActiveProject(project.id)}>
            <Wallet className="h-3.5 w-3.5" />
            Công nợ CT
          </Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/bank" onClick={() => setActiveProject(project.id)}>
            <Landmark className="h-3.5 w-3.5" />
            Sao kê
          </Link>
        </Button>
      </div>

      {/* Sample doc statuses for this project */}
      <Card>
        <CardHeader>
          <CardTitle>Một số hồ sơ bắt buộc — trạng thái trên {project.code}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs text-muted">
                <th className="px-4 py-2.5 font-semibold">Mã</th>
                <th className="px-4 py-2.5 font-semibold">Tên</th>
                <th className="px-4 py-2.5 font-semibold">Phase</th>
                <th className="px-4 py-2.5 font-semibold">TT trên CT này</th>
              </tr>
            </thead>
            <tbody>
              {CT_TEMPLATES.filter((t) =>
                ["CT-00-CLDH", "HD-03", "CT-04-BOQ", "BG-01", "CT-05-NKTC", "CT-06-BBNTGD", "CT-07-BBBG", "CT-08-TDNTT", "CT-09-CKBH"].includes(
                  t.code,
                ),
              ).map((t) => (
                <tr key={t.code} className="border-b border-border-soft">
                  <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                  <td className="px-4 py-2">{t.title}</td>
                  <td className="px-4 py-2 text-muted">
                    {t.phase_code} · {CT_PHASES[t.phase_code]}
                  </td>
                  <td className="px-4 py-2">
                    <DocStatusBadge
                      status={project.docStatuses[t.code] ?? "missing"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
