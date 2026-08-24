import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import { DataTable } from "@/components/erp/data-table";
import { FormApprovalBadge, Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CT_PHASES, CT_TEMPLATES } from "@/data/ct-registry";
import {
  FORM_APPROVAL_LABEL,
  type FormApprovalStatus,
  docStatusToFormApproval,
  formApprovalToDocStatus,
} from "@/data/form-workflow";
import { type WorkflowStepId } from "@/data/seed";
import { resolveUserKey } from "@/lib/user-scope";
import { useErpStore } from "@/store/erp-store";
import { useFormWorkflowStore } from "@/store/form-workflow-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/documents")({
  component: DocumentsPage,
});

type DocRow = (typeof CT_TEMPLATES)[number] & {
  approvalStatus: FormApprovalStatus;
};

function DocumentsPage() {
  const project = useActiveProject();
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const userKey = resolveUserKey(session, user?.username);
  const setProjectDocStatus = useErpStore((s) => s.setProjectDocStatus);
  const markPhaseDocs = useErpStore((s) => s.markPhaseDocs);
  const markWorkflow = useErpStore((s) => s.markWorkflow);
  const quotations = useErpStore((s) => s.quotations);
  const approveForm = useFormWorkflowStore((s) => s.approveForm);
  const addAttachment = useFormWorkflowStore((s) => s.addAttachment);
  const removeAttachment = useFormWorkflowStore((s) => s.removeAttachment);
  const getFormStatus = useFormWorkflowStore((s) => s.getFormStatus);
  const formWorkspace = useFormWorkflowStore((s) => s.byUser[userKey]);
  const cycleFormStatus = useFormWorkflowStore((s) => s.cycleFormStatus);
  const submitForApproval = useFormWorkflowStore((s) => s.submitForApproval);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachCode, setAttachCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("all");

  const projectQuotes = project
    ? quotations.filter((x) => x.projectCode === project.code)
    : [];

  function resolveApproval(templateCode: string): FormApprovalStatus {
    if (!project) return "thieu";
    const rec = getFormStatus(userKey, project.id, templateCode);
    if (rec) return rec.status;
    const legacy = project.docStatuses[templateCode] ?? "missing";
    return docStatusToFormApproval(legacy);
  }

  function syncDocStatus(templateCode: string, approval: FormApprovalStatus) {
    if (!project) return;
    setProjectDocStatus(
      project.id,
      templateCode,
      formApprovalToDocStatus(approval),
    );
  }

  const withStatus: DocRow[] = useMemo(() => {
    return CT_TEMPLATES.filter((t) => {
      if (phase !== "all" && t.phase_code !== phase) return false;
      return true;
    }).map((t) => ({
      ...t,
      approvalStatus: resolveApproval(t.code),
    }));
  }, [phase, project, formWorkspace]);

  const counts = useMemo(() => {
    if (!project) return { thieu: 0, cho_duyet: 0, da_duyet: 0 };
    let thieu = 0,
      cho_duyet = 0,
      da_duyet = 0;
    for (const t of CT_TEMPLATES) {
      const st = resolveApproval(t.code);
      if (st === "cho_duyet") cho_duyet++;
      else if (st === "da_duyet" || st === "da_ky") da_duyet++;
      else if (st === "thieu" || st === "khong_ap_dung") thieu++;
    }
    return { thieu, cho_duyet, da_duyet };
  }, [project, formWorkspace]);

  function cycle(code: string, current: FormApprovalStatus) {
    if (!project) return;
    const next = cycleFormStatus(
      userKey,
      project.id,
      code,
      user?.username ?? userKey,
    );
    syncDocStatus(code, next);
    toast.message(FORM_APPROVAL_LABEL[next]);
  }

  function submit(code: string) {
    if (!project) return;
    submitForApproval(
      userKey,
      project.id,
      code,
      user?.username ?? userKey,
    );
    syncDocStatus(code, "cho_duyet");
    toast.success("Đã gửi phê duyệt");
  }

  function approve(code: string) {
    if (!project) return;
    approveForm(userKey, project.id, code, user?.username ?? userKey);
    syncDocStatus(code, "da_duyet");
    toast.success("Đã phê duyệt biểu mẫu");
  }

  function pickAttachment(templateCode: string) {
    setAttachCode(templateCode);
    fileRef.current?.click();
  }

  function onAttachFile(file: File) {
    if (!project || !attachCode) return;
    const code = attachCode;
    addAttachment(
      userKey,
      project.id,
      code,
      {
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        uploadedBy: user?.username ?? userKey,
      },
      user?.username ?? userKey,
    );
    const cur = getFormStatus(userKey, project.id, code)?.status ?? "thieu";
    if (cur === "thieu") {
      syncDocStatus(code, "dang_soan");
    }
    setAttachCode(null);
    toast.success(`Đã đính kèm ${file.name}`);
  }

  function markPhaseDone(ph: string) {
    if (!project) return;
    markPhaseDocs(project.id, ph, "enough");
    for (const t of CT_TEMPLATES.filter((x) => x.phase_code === ph)) {
      approveForm(userKey, project.id, t.code, user?.username ?? userKey);
    }
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
          label={`Đã duyệt · ${project?.code ?? "—"}`}
          value={String(counts.da_duyet)}
          tone="ok"
        />
        <Metric
          label="Chờ duyệt"
          value={String(counts.cho_duyet)}
          tone="info"
        />
        <Metric
          label="Thiếu / N/A"
          value={String(counts.thieu)}
          tone={counts.thieu ? "danger" : "ok"}
        />
      </div>

      {project ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-sm text-muted shadow-[var(--shadow-panel)]">
          Quy trình biểu mẫu lưu theo người dùng{" "}
          <strong className="text-fg">{user?.username ?? userKey}</strong>
          {" · "}checklist <strong className="text-fg">84 mẫu</strong> gắn{" "}
          <strong className="text-fg">
            {project.code} — {project.name}
          </strong>
          {" · "}
          khách <strong className="text-fg">{project.customer}</strong>
          {project.contractCode ? (
            <>
              {" · "}HĐ{" "}
              <strong className="text-fg">{project.contractCode}</strong>
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
          . Tạo → sửa → gửi duyệt → phê duyệt; đổi CT ở thanh trên không làm
          mất trạng thái của user.
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
                    (resolveApproval(t.code) === "da_duyet" ||
                      resolveApproval(t.code) === "da_ky"),
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
          <Badge variant="info">Phê duyệt theo user</Badge>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAttachFile(f);
          e.target.value = "";
        }}
      />

      <DataTable<DocRow>
        rows={withStatus}
        rowKey={(t) => t.code}
        tableId="documents"
        userKey={userKey}
        searchKeys={[
          (t) => t.code,
          (t) => t.title,
          (t) => t.owner_role,
          (t) => t.phase_code,
          (t) => CT_PHASES[t.phase_code] ?? "",
          (t) => FORM_APPROVAL_LABEL[t.approvalStatus],
        ]}
        searchPlaceholder="Tìm mã, tên, owner, phase, trạng thái…"
        density="compact"
        emptyTitle="Không có mẫu khớp"
        emptyDescription="Đổi phase hoặc từ khóa tìm kiếm."
        facets={[
          {
            id: "approval",
            options: [
              { value: "all", label: "Mọi trạng thái" },
              ...Object.entries(FORM_APPROVAL_LABEL).map(([value, label]) => ({
                value,
                label,
              })),
            ],
            match: (t, v) => v === "all" || t.approvalStatus === v,
          },
        ]}
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
            id: "attachments",
            header: "Đính kèm",
            cell: (t) => {
              if (!project) return <span className="text-muted">—</span>;
              const rec = getFormStatus(userKey, project.id, t.code);
              const atts = rec?.attachments ?? [];
              return (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      pickAttachment(t.code);
                    }}
                    title="Đính kèm chứng từ / tài liệu"
                  >
                    <Paperclip className="h-3 w-3" />
                    {atts.length ? ` ${atts.length}` : ""}
                  </Button>
                  {atts.slice(0, 2).map((a) => (
                    <span
                      key={a.id}
                      className="flex max-w-[120px] items-center gap-0.5 truncate text-xs text-muted"
                    >
                      {a.docId ? (
                        <Link
                          to="/app/editor"
                          className="truncate hover:text-brand-ink"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {a.name}
                        </Link>
                      ) : (
                        <span className="truncate">{a.name}</span>
                      )}
                      <button
                        type="button"
                        className="shrink-0 text-danger hover:opacity-80"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAttachment(
                            userKey,
                            project.id,
                            t.code,
                            a.id,
                            user?.username ?? userKey,
                          );
                          toast.message("Đã gỡ file đính kèm");
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {atts.length > 2 ? (
                    <span className="text-xs text-muted">+{atts.length - 2}</span>
                  ) : null}
                </div>
              );
            },
            hideOnMobile: true,
          },
          {
            id: "status",
            header: "Phê duyệt",
            sortValue: (t) => t.approvalStatus,
            cell: (t) => (
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto p-0 hover:bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycle(t.code, t.approvalStatus);
                  }}
                  title="Bấm để chuyển trạng thái (lưu theo user)"
                >
                  <FormApprovalBadge status={t.approvalStatus} />
                </Button>
                {t.approvalStatus === "dang_soan" ||
                t.approvalStatus === "thieu" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      submit(t.code);
                    }}
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                ) : null}
                {t.approvalStatus === "cho_duyet" ? (
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      approve(t.code);
                    }}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      <p className="text-xs text-muted">
        Registry V3.1 — trạng thái phê duyệt lưu theo user + công trình (
        <code>thanh-hoai-form-workflow-v1</code>). Đồng bộ checklist CT khi gửi
        / duyệt.
      </p>
    </div>
  );
}
