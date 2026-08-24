import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/erp/data-table";
import { BankStatusBadge, Metric } from "@/components/erp/status";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import type { BankLine } from "@/data/seed";

export const Route = createFileRoute("/app/bank")({
  component: BankPage,
});

function BankPage() {
  const lines = useErpStore((s) => s.bankLines);
  const setStatus = useErpStore((s) => s.setBankStatus);

  const inflow = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const outflow = lines
    .filter((l) => l.amount < 0)
    .reduce((s, l) => s + Math.abs(l.amount), 0);
  const pending = lines.filter((l) => l.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Tiền vào (mẫu)" value={formatVnd(inflow)} tone="ok" />
        <Metric label="Tiền ra (mẫu)" value={formatVnd(outflow)} tone="danger" />
        <Metric
          label="Chờ đối soát"
          value={`${pending} dòng`}
          tone={pending ? "warn" : "ok"}
        />
      </div>

      <DataTable<BankLine>
        rows={lines}
        rowKey={(b) => b.id}
        searchKeys={[
          (b) => b.desc,
          (b) => b.matchHint,
          (b) => b.date,
          (b) => b.status,
        ]}
        searchPlaceholder="Lọc diễn giải, gợi ý khớp, ngày…"
        density="compact"
        emptyTitle="Chưa có dòng sao kê"
        emptyDescription="Import sao kê ngân hàng hoặc nạp lại demo để đối soát."
        toolbar={
          <span className="text-xs font-semibold text-muted">Dòng sao kê mẫu</span>
        }
        columns={[
          {
            id: "date",
            header: "Ngày",
            sortValue: (b) => b.date,
            cell: (b) => (
              <span className="tabular-nums text-muted">{b.date}</span>
            ),
          },
          {
            id: "desc",
            header: "Diễn giải",
            sortValue: (b) => b.desc,
            cell: (b) => <span className="font-medium">{b.desc}</span>,
          },
          {
            id: "amount",
            header: "Số tiền",
            sortValue: (b) => b.amount,
            cell: (b) => (
              <span
                className={`font-semibold tabular-nums ${
                  b.amount >= 0 ? "text-ok" : "text-danger"
                }`}
              >
                {b.amount >= 0 ? "+" : ""}
                {formatVnd(b.amount)}
              </span>
            ),
            className: "text-right",
          },
          {
            id: "hint",
            header: "Gợi ý khớp",
            sortValue: (b) => b.matchHint,
            cell: (b) => <span className="text-muted">{b.matchHint}</span>,
            hideOnMobile: true,
          },
          {
            id: "status",
            header: "TT",
            sortValue: (b) => b.status,
            cell: (b) => <BankStatusBadge status={b.status} />,
          },
          {
            id: "actions",
            header: "",
            cell: (b) => (
              <div className="flex flex-wrap justify-end gap-1.5">
                {b.status !== "matched" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus(b.id, "matched");
                    }}
                  >
                    Khớp
                  </Button>
                ) : null}
                {b.status !== "ignored" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus(b.id, "ignored");
                    }}
                  >
                    Bỏ qua
                  </Button>
                ) : null}
                {b.status !== "pending" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus(b.id, "pending");
                    }}
                  >
                    Chờ
                  </Button>
                ) : null}
              </div>
            ),
            className: "text-right",
          },
        ]}
      />
    </div>
  );
}
