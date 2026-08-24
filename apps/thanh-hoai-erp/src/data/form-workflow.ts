/** Biểu mẫu CT — trạng thái phê duyệt (runtime parity). */

export type FormApprovalStatus =
  | "thieu"
  | "dang_soan"
  | "cho_duyet"
  | "da_duyet"
  | "da_ky"
  | "khong_ap_dung";

export const FORM_APPROVAL_LABEL: Record<FormApprovalStatus, string> = {
  thieu: "Thiếu",
  dang_soan: "Đang soạn",
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  da_ky: "Đã ký",
  khong_ap_dung: "Không áp dụng",
};

export const FORM_APPROVAL_CYCLE: FormApprovalStatus[] = [
  "thieu",
  "dang_soan",
  "cho_duyet",
  "da_duyet",
  "da_ky",
  "khong_ap_dung",
];

export type FormWorkflowRecord = {
  status: FormApprovalStatus;
  updatedAt: string;
  updatedBy: string;
  note?: string;
};

export function nextFormApprovalStatus(
  current: FormApprovalStatus,
): FormApprovalStatus {
  const i = FORM_APPROVAL_CYCLE.indexOf(current);
  if (i < 0) return "dang_soan";
  return FORM_APPROVAL_CYCLE[(i + 1) % FORM_APPROVAL_CYCLE.length];
}

/** Map legacy 4-state checklist → approval status */
export function docStatusToFormApproval(
  st: "missing" | "draft" | "pending" | "enough",
): FormApprovalStatus {
  switch (st) {
    case "missing":
      return "thieu";
    case "draft":
      return "dang_soan";
    case "pending":
      return "cho_duyet";
    case "enough":
      return "da_duyet";
    default: {
      const _exhaustive: never = st;
      return _exhaustive;
    }
  }
}

export function formApprovalToDocStatus(
  st: FormApprovalStatus,
): "missing" | "draft" | "pending" | "enough" {
  switch (st) {
    case "thieu":
    case "khong_ap_dung":
      return "missing";
    case "dang_soan":
      return "draft";
    case "cho_duyet":
      return "pending";
    case "da_duyet":
    case "da_ky":
      return "enough";
    default: {
      const _exhaustive: never = st;
      return _exhaustive;
    }
  }
}
