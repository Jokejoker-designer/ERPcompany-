import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CT_TEMPLATES } from "@/data/ct-registry";
import {
  FORM_APPROVAL_LABEL,
  type FormApprovalStatus,
  type FormAttachment,
  type FormWorkflowRecord,
  nextFormApprovalStatus,
} from "@/data/form-workflow";

type UserWorkspace = {
  activeProjectId: string | null;
  /** projectId → templateCode → record */
  forms: Record<string, Record<string, FormWorkflowRecord>>;
};

export type ApprovalStats = Record<FormApprovalStatus, number>;

type FormWorkflowState = {
  byUser: Record<string, UserWorkspace>;
  getWorkspace: (userKey: string) => UserWorkspace;
  setActiveProject: (userKey: string, projectId: string | null) => void;
  getFormStatus: (
    userKey: string,
    projectId: string,
    templateCode: string,
  ) => FormWorkflowRecord | null;
  setFormStatus: (
    userKey: string,
    projectId: string,
    templateCode: string,
    status: FormApprovalStatus,
    updatedBy: string,
    note?: string,
  ) => void;
  cycleFormStatus: (
    userKey: string,
    projectId: string,
    templateCode: string,
    updatedBy: string,
  ) => FormApprovalStatus;
  submitForApproval: (
    userKey: string,
    projectId: string,
    templateCode: string,
    updatedBy: string,
  ) => void;
  approveForm: (
    userKey: string,
    projectId: string,
    templateCode: string,
    updatedBy: string,
  ) => void;
  addAttachment: (
    userKey: string,
    projectId: string,
    templateCode: string,
    attachment: Omit<FormAttachment, "id" | "uploadedAt"> & { id?: string },
    updatedBy: string,
  ) => FormAttachment;
  removeAttachment: (
    userKey: string,
    projectId: string,
    templateCode: string,
    attachmentId: string,
    updatedBy: string,
  ) => void;
  getApprovalStats: (
    userKey: string,
    projectId?: string | null,
  ) => ApprovalStats;
};

const emptyWorkspace = (): UserWorkspace => ({
  activeProjectId: null,
  forms: {},
});

const emptyStats = (): ApprovalStats => ({
  thieu: 0,
  dang_soan: 0,
  cho_duyet: 0,
  da_duyet: 0,
  da_ky: 0,
  khong_ap_dung: 0,
});

export const useFormWorkflowStore = create<FormWorkflowState>()(
  persist(
    (set, get) => ({
      byUser: {},
      getWorkspace: (userKey) => get().byUser[userKey] ?? emptyWorkspace(),
      setActiveProject: (userKey, projectId) =>
        set((s) => ({
          byUser: {
            ...s.byUser,
            [userKey]: {
              ...(s.byUser[userKey] ?? emptyWorkspace()),
              activeProjectId: projectId,
            },
          },
        })),
      getFormStatus: (userKey, projectId, templateCode) => {
        const w = get().byUser[userKey];
        return w?.forms[projectId]?.[templateCode] ?? null;
      },
      setFormStatus: (userKey, projectId, templateCode, status, updatedBy, note) =>
        set((s) => {
          const w = { ...(s.byUser[userKey] ?? emptyWorkspace()) };
          const proj = { ...(w.forms[projectId] ?? {}) };
          const prev = proj[templateCode];
          proj[templateCode] = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy,
            note,
            attachments: prev?.attachments,
          };
          w.forms = { ...w.forms, [projectId]: proj };
          return { byUser: { ...s.byUser, [userKey]: w } };
        }),
      cycleFormStatus: (userKey, projectId, templateCode, updatedBy) => {
        const cur =
          get().getFormStatus(userKey, projectId, templateCode)?.status ??
          "thieu";
        const next = nextFormApprovalStatus(cur);
        get().setFormStatus(userKey, projectId, templateCode, next, updatedBy);
        return next;
      },
      submitForApproval: (userKey, projectId, templateCode, updatedBy) => {
        get().setFormStatus(
          userKey,
          projectId,
          templateCode,
          "cho_duyet",
          updatedBy,
        );
      },
      approveForm: (userKey, projectId, templateCode, updatedBy) => {
        get().setFormStatus(
          userKey,
          projectId,
          templateCode,
          "da_duyet",
          updatedBy,
        );
      },
      addAttachment: (userKey, projectId, templateCode, attachment, updatedBy) => {
        const att: FormAttachment = {
          id: attachment.id ?? `att-${Date.now()}`,
          name: attachment.name,
          sizeKb: attachment.sizeKb,
          uploadedAt: new Date().toISOString(),
          uploadedBy: attachment.uploadedBy || updatedBy,
          docId: attachment.docId,
        };
        set((s) => {
          const w = { ...(s.byUser[userKey] ?? emptyWorkspace()) };
          const proj = { ...(w.forms[projectId] ?? {}) };
          const prev = proj[templateCode];
          const status = prev?.status ?? "dang_soan";
          proj[templateCode] = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy,
            note: prev?.note,
            attachments: [...(prev?.attachments ?? []), att],
          };
          w.forms = { ...w.forms, [projectId]: proj };
          return { byUser: { ...s.byUser, [userKey]: w } };
        });
        return att;
      },
      removeAttachment: (
        userKey,
        projectId,
        templateCode,
        attachmentId,
        updatedBy,
      ) =>
        set((s) => {
          const w = { ...(s.byUser[userKey] ?? emptyWorkspace()) };
          const proj = { ...(w.forms[projectId] ?? {}) };
          const prev = proj[templateCode];
          if (!prev) return s;
          proj[templateCode] = {
            ...prev,
            updatedAt: new Date().toISOString(),
            updatedBy,
            attachments: (prev.attachments ?? []).filter(
              (a) => a.id !== attachmentId,
            ),
          };
          w.forms = { ...w.forms, [projectId]: proj };
          return { byUser: { ...s.byUser, [userKey]: w } };
        }),
      getApprovalStats: (userKey, projectId) => {
        const stats = emptyStats();
        const w = get().byUser[userKey];
        if (!w) return stats;
        const projects = projectId
          ? { [projectId]: w.forms[projectId] ?? {} }
          : w.forms;
        for (const projForms of Object.values(projects)) {
          for (const code of CT_TEMPLATES.map((t) => t.code)) {
            const st = projForms[code]?.status ?? "thieu";
            stats[st] += 1;
          }
        }
        return stats;
      },
    }),
    {
      name: "thanh-hoai-form-workflow-v1",
      partialize: (s) => ({ byUser: s.byUser }),
    },
  ),
);

export function approvalStatsForChart(stats: ApprovalStats) {
  return Object.entries(FORM_APPROVAL_LABEL)
    .map(([key, label]) => ({
      status: key as FormApprovalStatus,
      label,
      value: stats[key as FormApprovalStatus] ?? 0,
    }))
    .filter((d) => d.value > 0);
}
