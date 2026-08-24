import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type FormApprovalStatus,
  type FormWorkflowRecord,
  nextFormApprovalStatus,
} from "@/data/form-workflow";

type UserWorkspace = {
  activeProjectId: string | null;
  /** projectId → templateCode → record */
  forms: Record<string, Record<string, FormWorkflowRecord>>;
};

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
};

const emptyWorkspace = (): UserWorkspace => ({
  activeProjectId: null,
  forms: {},
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
          proj[templateCode] = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy,
            note,
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
    }),
    {
      name: "thanh-hoai-form-workflow-v1",
      partialize: (s) => ({ byUser: s.byUser }),
    },
  ),
);
