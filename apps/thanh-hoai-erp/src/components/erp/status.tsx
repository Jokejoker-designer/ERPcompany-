import { Badge } from "@/components/ui/badge";
import type { DocStatus, Quotation, Receivable, BankLine } from "@/data/seed";
import {
  FORM_APPROVAL_LABEL,
  type FormApprovalStatus,
} from "@/data/form-workflow";

export function QuoteStatusBadge({ status }: { status: Quotation["status"] }) {
  const map = {
    draft: { v: "default" as const, t: "Bản nháp" },
    pending: { v: "info" as const, t: "Chờ duyệt" },
    approved: { v: "ok" as const, t: "Đã duyệt" },
    sent: { v: "brand" as const, t: "Đã gửi" },
    won: { v: "ok" as const, t: "Trúng thầu" },
    lost: { v: "danger" as const, t: "Trượt" },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}

export function ReceivableStatusBadge({
  status,
}: {
  status: Receivable["status"];
}) {
  const map = {
    paid: { v: "ok" as const, t: "Đã TT" },
    pending: { v: "warn" as const, t: "Chờ TT" },
    overdue: { v: "danger" as const, t: "Quá hạn" },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}

export function BankStatusBadge({ status }: { status: BankLine["status"] }) {
  const map = {
    matched: { v: "ok" as const, t: "Khớp" },
    pending: { v: "warn" as const, t: "Chờ GĐ" },
    ignored: { v: "default" as const, t: "Bỏ qua" },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}

export function DocStatusBadge({ status }: { status: DocStatus }) {
  const map = {
    enough: { v: "ok" as const, t: "Đủ" },
    missing: { v: "danger" as const, t: "Thiếu" },
    pending: { v: "warn" as const, t: "Chờ duyệt" },
    draft: { v: "info" as const, t: "Bản nháp" },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}

export function FormApprovalBadge({ status }: { status: FormApprovalStatus }) {
  const variant =
    status === "da_duyet" || status === "da_ky"
      ? "ok"
      : status === "cho_duyet"
        ? "warn"
        : status === "dang_soan"
          ? "info"
          : status === "khong_ap_dung"
            ? "default"
            : "danger";
  return <Badge variant={variant}>{FORM_APPROVAL_LABEL[status]}</Badge>;
}

export function Metric({
  label,
  value,
  foot,
  tone = "default",
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  tone?: "default" | "info" | "warn" | "danger" | "ok";
}) {
  const bar =
    tone === "info"
      ? "border-t-info"
      : tone === "warn"
        ? "border-t-warn"
        : tone === "danger"
          ? "border-t-danger"
          : tone === "ok"
            ? "border-t-ok"
            : "border-t-brand";
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-panel)] border-t-[3px] ${bar}`}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-fg sm:text-2xl">
        {value}
      </div>
      {foot ? <div className="mt-2 text-xs text-muted">{foot}</div> : null}
    </div>
  );
}
