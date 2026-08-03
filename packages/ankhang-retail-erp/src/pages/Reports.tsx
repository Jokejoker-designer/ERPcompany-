import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Metric,
} from "@retail/components/ui";
import {
  formatVnd,
  grossMargin,
  inventoryTurnover,
} from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

export function ReportsPage() {
  const sales = useRetailStore((s) => s.sales);
  const products = useRetailStore((s) => s.products);
  const shifts = useRetailStore((s) => s.shifts);
  const activeShiftId = useRetailStore((s) => s.activeShiftId);
  const openShift = useRetailStore((s) => s.openShift);
  const closeShift = useRetailStore((s) => s.closeShift);

  const active = shifts.find((s) => s.id === activeShiftId);
  const [opening, setOpening] = useState(2_000_000);
  const [counted, setCounted] = useState(0);

  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const cogs = sales.reduce((a, s) => {
    return (
      a +
      s.lines.reduce((b, l) => {
        const p = products.find((x) => x.id === l.productId);
        const factor = p?.conversion[l.uom] ?? 1;
        return b + l.qty * factor * (p?.costMap ?? 0);
      }, 0)
    );
  }, 0);
  const margin = grossMargin(revenue, cogs);
  const stockValue = products.reduce((a, p) => a + p.stock * p.costMap, 0);
  const turnover = inventoryTurnover(cogs, stockValue || 1);

  const abcRows = useMemo(() => {
    return (["A", "B", "C"] as const).map((abc) => {
      const list = products.filter((p) => p.abc === abc);
      const value = list.reduce((a, p) => a + p.stock * p.costMap, 0);
      return { abc, count: list.length, value, skus: list.map((p) => p.name) };
    });
  }, [products]);

  const systemCash = active
    ? active.openingCash + active.systemCash
    : 0;

  function doClose() {
    if (!active) return toast.error("Chưa mở ca");
    closeShift(counted);
    const v = counted - systemCash;
    if (Math.abs(v) < 1) toast.success("Z-read: Khớp (Matched)");
    else if (v < 0)
      toast.error(`Hụt két ${formatVnd(v)} — ghi nợ thu ngân`);
    else toast.message(`Dư két ${formatVnd(v)} — thu nhập khác`);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>Giai đoạn 5 — BI & chốt ca:</strong> Z-read (blind close) ·
          gross margin từ MAP · ABC / vòng quay tồn · reorder điểm A.
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Doanh thu" value={formatVnd(revenue)} tone="info" />
        <Metric
          label="Biên LN gộp"
          value={`${margin.toFixed(1)}%`}
          tone="ok"
          foot={<Badge variant="ok">COGS {formatVnd(cogs)}</Badge>}
        />
        <Metric
          label="Giá trị tồn"
          value={formatVnd(stockValue)}
          tone="warn"
        />
        <Metric
          label="Vòng quay tồn (demo)"
          value={turnover.toFixed(2)}
          tone="brand"
          foot={<Badge variant="brand">COGS / Avg stock</Badge>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chốt ca (Z-Read / Blind close)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {!active ? (
              <div className="space-y-2">
                <label className="text-xs text-muted">
                  Tiền quỹ mở ca
                  <Input
                    type="number"
                    className="mt-1"
                    value={opening}
                    onChange={(e) => setOpening(Number(e.target.value))}
                  />
                </label>
                <Button
                  onClick={() => {
                    openShift(opening);
                    toast.success("Đã mở ca");
                  }}
                >
                  Mở ca
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-[var(--radius-md)] bg-ok-soft/40 px-3 py-2 text-sm">
                  Ca <strong>{active.code}</strong> · {active.cashierName}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-surface-2 p-2">
                    <div className="text-xs text-muted">Quỹ đầu ca</div>
                    <div className="font-semibold tabular-nums">
                      {formatVnd(active.openingCash)}
                    </div>
                  </div>
                  <div className="rounded-md bg-surface-2 p-2">
                    <div className="text-xs text-muted">
                      Hệ thống (cash thu)
                    </div>
                    <div className="font-semibold tabular-nums">
                      {formatVnd(active.systemCash)}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Blind close: thu ngân đếm két <em>không thấy</em> số hệ thống
                  trước khi nhập.
                </p>
                <label className="text-xs text-muted">
                  Tiền mặt đếm được
                  <Input
                    type="number"
                    className="mt-1"
                    value={counted || ""}
                    onChange={(e) => setCounted(Number(e.target.value))}
                    placeholder="Nhập số đếm vật lý…"
                  />
                </label>
                <div className="text-xs text-muted">
                  (Tham chiếu sau khi chốt: hệ thống kỳ vọng{" "}
                  {formatVnd(systemCash)})
                </div>
                <Button onClick={doClose}>Khóa ca / Z-read</Button>
              </div>
            )}

            {shifts.filter((s) => s.status === "closed").length ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-xs font-semibold text-muted">
                  Lịch sử ca
                </div>
                {shifts
                  .filter((s) => s.status === "closed")
                  .slice(0, 5)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="mb-1 flex justify-between text-xs"
                    >
                      <span>{s.code}</span>
                      <Badge
                        variant={
                          Math.abs(s.variance || 0) < 1
                            ? "ok"
                            : (s.variance || 0) < 0
                              ? "danger"
                              : "warn"
                        }
                      >
                        {(s.variance || 0) > 0 ? "+" : ""}
                        {formatVnd(s.variance || 0)}
                      </Badge>
                    </div>
                  ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phân tích ABC & hành động</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {abcRows.map((r) => (
              <div
                key={r.abc}
                className="rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <Badge
                    variant={
                      r.abc === "A" ? "brand" : r.abc === "B" ? "info" : "warn"
                    }
                  >
                    Nhóm {r.abc}
                  </Badge>
                  <span className="text-xs text-muted">
                    {r.count} SKU · {formatVnd(r.value)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {r.abc === "A"
                    ? "Chủ lực 80% DT — bật reorder point, không để stock-out."
                    : r.abc === "B"
                      ? "Theo dõi định kỳ, cân bằng tồn."
                      : "Dead stock risk — markdown / ngừng nhập / nhường kệ cho A."}
                </p>
                <div className="mt-1 text-[11px] text-muted">
                  {r.skus.slice(0, 3).join(" · ")}
                  {r.skus.length > 3 ? "…" : ""}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hóa đơn gần đây</CardTitle>
          <Badge variant="info">{sales.length}</Badge>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {!sales.length ? (
            <p className="p-4 text-center text-sm text-muted">
              Chưa có đơn — bán thử trên POS.
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/70 text-xs text-muted">
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2">Dòng</th>
                  <th className="px-3 py-2 text-right">Tổng</th>
                  <th className="px-3 py-2">TT</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 12).map((s) => (
                  <tr key={s.id} className="border-b border-border-soft">
                    <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {new Date(s.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.lines.length}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatVnd(s.total)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.payments.map((p) => p.method).join("+")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
