import { createFileRoute } from "@tanstack/react-router";
import { Banknote } from "lucide-react";
import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import { Metric, ReceivableStatusBadge } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
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

      <Card>
        <CardHeader>
          <CardTitle>
            Công nợ phải thu
            {filterCt && project ? ` · ${project.code}` : " · tất cả"}
          </CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">Khách hàng</th>
                <th className="px-4 py-3 font-semibold">Hợp đồng</th>
                <th className="px-4 py-3 font-semibold">CT</th>
                <th className="px-4 py-3 text-right font-semibold">Giá trị</th>
                <th className="px-4 py-3 text-right font-semibold">Đã thu</th>
                <th className="px-4 py-3 text-right font-semibold">Còn lại</th>
                <th className="px-4 py-3 font-semibold">TT</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const remain = r.value - r.collected;
                return (
                  <tr key={r.id} className="border-b border-border-soft">
                    <td className="px-4 py-3 font-medium">{r.customer}</td>
                    <td className="px-4 py-3 text-muted">{r.contract}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          project?.code === r.projectCode ? "brand" : "default"
                        }
                      >
                        {r.projectCode}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatVnd(r.value)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatVnd(r.collected)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatVnd(remain)}
                    </td>
                    <td className="px-4 py-3">
                      <ReceivableStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {remain > 0 ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            collect(
                              r.id,
                              Math.min(remain, Math.round(remain / 2) || remain),
                            )
                          }
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          Thu
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!list.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    {filterCt
                      ? "CT này chưa có công nợ — đánh trúng báo giá để tạo HĐ + phải thu."
                      : "Chưa có công nợ."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
