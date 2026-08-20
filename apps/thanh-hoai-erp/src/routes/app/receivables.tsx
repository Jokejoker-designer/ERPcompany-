import { createFileRoute } from "@tanstack/react-router";
import { Banknote } from "lucide-react";
import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import { DataTable } from "@/components/erp/data-table";
import { Metric, ReceivableStatusBadge } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import type { Receivable } from "@/data/seed";
import { useState } from "react";

export const Route = createFileRoute("/app/receivables")({
  component: ReceivablesPage,
});

function ReceivablesPage() {
  const receivables = useErpStore((s) => s.receivables);
  const collect = useErpStore((s) => s.collectReceivable);
  const project = useActiveProject();
  const [filterCt, setFilterCt] = useState(true);

  const list = filterCt && project
    ? receivables.filter((r) => r.projectCode === project.code)
    : receivables;

  const ar = list.reduce((s, r) => s + (r.value - r.collected), 0);
  const ap = 890_000_000;
  const overdue = list.filter((r) => r.status === "overdue").length;

  return (
    <div className="space-y-4">
      <ProjectContextBar />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filterCt ? "default" : "secondary"}
          onClick={() => setFilterCt(true)}
        >
          Chỉ CT đang chọn
        </Button>
        <Button
          size="sm"
          variant={!filterCt ? "default" : "secondary"}
          onClick={() => setFilterCt(false)}
        >
          Tất cả HĐ
        </Button>
        {project ? (
          <Badge variant="info">
            Lọc: {project.code}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Phải thu" value={formatVnd(ar)} tone="warn" />
        <Metric label="Phải trả NCC (mẫu)" value={formatVnd(ap)} />
        <Metric
          label="Quá hạn"
          value={`${overdue} HĐ`}
          tone={overdue ? "danger" : "ok"}
        />
      </div>

      <DataTable<Receivable>
        rows={list}
        rowKey={(r) => r.id}
        searchKeys={[
          (r) => r.customer,
          (r) => r.contract,
          (r) => r.projectCode,
          (r) => r.status,
        ]}
        searchPlaceholder="Lọc khách, HĐ, mã CT, trạng thái…"
        density="compact"
        emptyTitle="Chưa có công nợ"
        emptyDescription={
          filterCt
            ? "CT này chưa có công nợ — đánh trúng báo giá để tạo HĐ + phải thu."
            : "Chưa có công nợ trong hệ thống."
        }
        toolbar={
          <span className="text-xs font-semibold text-muted">
            Công nợ phải thu
            {filterCt && project ? ` · ${project.code}` : " · tất cả"}
          </span>
        }
        columns={[
          {
            id: "customer",
            header: "Khách hàng",
            sortValue: (r) => r.customer,
            cell: (r) => <span className="font-medium">{r.customer}</span>,
          },
          {
            id: "contract",
            header: "Hợp đồng",
            sortValue: (r) => r.contract,
            cell: (r) => <span className="text-muted">{r.contract}</span>,
            hideOnMobile: true,
          },
          {
            id: "ct",
            header: "CT",
            sortValue: (r) => r.projectCode,
            cell: (r) => (
              <Badge
                variant={
                  project?.code === r.projectCode ? "brand" : "default"
                }
              >
                {r.projectCode}
              </Badge>
            ),
          },
          {
            id: "value",
            header: "Giá trị",
            sortValue: (r) => r.value,
            cell: (r) => (
              <span className="tabular-nums">{formatVnd(r.value)}</span>
            ),
            className: "text-right",
            hideOnMobile: true,
          },
          {
            id: "collected",
            header: "Đã thu",
            sortValue: (r) => r.collected,
            cell: (r) => (
              <span className="tabular-nums">{formatVnd(r.collected)}</span>
            ),
            className: "text-right",
            hideOnMobile: true,
          },
          {
            id: "remain",
            header: "Còn lại",
            sortValue: (r) => r.value - r.collected,
            cell: (r) => (
              <span className="font-semibold tabular-nums">
                {formatVnd(r.value - r.collected)}
              </span>
            ),
            className: "text-right",
          },
          {
            id: "status",
            header: "TT",
            sortValue: (r) => r.status,
            cell: (r) => <ReceivableStatusBadge status={r.status} />,
          },
          {
            id: "actions",
            header: "",
            cell: (r) => {
              const remain = r.value - r.collected;
              if (remain <= 0) return null;
              return (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    collect(
                      r.id,
                      Math.min(remain, Math.round(remain / 2) || remain),
                    );
                  }}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Thu
                </Button>
              );
            },
            className: "text-right",
          },
        ]}
      />
    </div>
  );
}
