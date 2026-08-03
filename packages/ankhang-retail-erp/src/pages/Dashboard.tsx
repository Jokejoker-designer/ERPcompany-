import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Metric,
} from "@retail/components/ui";
import { SetupProgressBanner } from "@retail/components/SetupWizard";
import { PHASES, formatVnd, grossMargin } from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";
import type { PageId } from "@retail/App";

export function DashboardPage({
  onNavigate,
}: {
  onNavigate: (id: PageId) => void;
}) {
  const products = useRetailStore((s) => s.products);
  const sales = useRetailStore((s) => s.sales);
  const lots = useRetailStore((s) => s.lots);
  const grns = useRetailStore((s) => s.grns);
  const shifts = useRetailStore((s) => s.shifts);

  const nearExpiry = useMemo(() => {
    const now = Date.now();
    return lots
      .map((l) => {
        const days = Math.ceil(
          (new Date(l.expiryDate + "T00:00:00").getTime() - now) /
            (1000 * 60 * 60 * 24),
        );
        return {
          ...l,
          product: products.find((p) => p.id === l.productId),
          days,
        };
      })
      .filter((l) => l.qty > 0 && l.days <= 45)
      .sort((a, b) => a.days - b.days);
  }, [lots, products]);

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
  const lowStock = products.filter((p) => p.stock <= p.minStock);
  const openShift = shifts.find((s) => s.status === "open");

  const abcData = useMemo(() => {
    return [
      {
        name: "A",
        value: products.filter((p) => p.abc === "A").length,
        fill: "var(--color-brand)",
      },
      {
        name: "B",
        value: products.filter((p) => p.abc === "B").length,
        fill: "var(--color-info)",
      },
      {
        name: "C",
        value: products.filter((p) => p.abc === "C").length,
        fill: "var(--color-warn)",
      },
    ];
  }, [products]);

  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales) {
      for (const l of s.lines) {
        map.set(l.name, (map.get(l.name) || 0) + l.qty * l.unitPrice);
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value / 1000) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [sales]);

  return (
    <div className="min-w-0 space-y-4">
      <SetupProgressBanner />

      <div className="grid gap-2 sm:grid-cols-5">
        {PHASES.map((ph) => (
          <button
            key={ph.id}
            type="button"
            onClick={() => {
              const map: Record<number, PageId> = {
                1: "products",
                2: "inbound",
                3: "pos",
                4: "inventory",
                5: "reports",
              };
              onNavigate(map[ph.id]);
            }}
            className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-left shadow-[var(--shadow-panel)] hover:border-brand/40"
          >
            <div className="text-[10px] font-bold uppercase text-brand">
              Giai đoạn {ph.id}
            </div>
            <div className="text-sm font-semibold">{ph.title}</div>
            <div className="text-[11px] text-muted">{ph.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Doanh thu (hóa đơn đã thu)"
          value={formatVnd(revenue)}
          foot={<Badge variant="info">{sales.length} hóa đơn</Badge>}
          tone="info"
        />
        <Metric
          label="Biên lợi nhuận gộp"
          value={`${margin.toFixed(1)}%`}
          foot={<Badge variant="ok">Giá vốn {formatVnd(cogs)}</Badge>}
          tone="ok"
        />
        <Metric
          label="Giá trị tồn kho"
          value={formatVnd(stockValue)}
          foot={
            <Badge variant={lowStock.length ? "warn" : "ok"}>
              {lowStock.length} mặt hàng dưới định mức
            </Badge>
          }
          tone="warn"
        />
        <Metric
          label="Cảnh báo cận hạn dùng"
          value={String(nearExpiry.length)}
          foot={<Badge variant="danger">Trong 45 ngày · FEFO</Badge>}
          tone="danger"
        />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>Top hàng theo doanh thu (nghìn ₫)</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            {!topProducts.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
                <p>
                  {products.length === 0
                    ? "Dữ liệu đang trống — hãy nạp danh mục và bắt đầu bán hàng."
                    : "Chưa có hóa đơn — vào Bán hàng (POS) để ghi nhận doanh thu."}
                </p>
                <Button size="sm" onClick={() => onNavigate("pos")}>
                  Mở quầy bán hàng
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-soft)"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis width={40} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v}k`, "Doanh thu"]} />
                  <Bar
                    dataKey="value"
                    fill="var(--color-brand)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Phân nhóm ABC</CardTitle>
          </CardHeader>
          <CardBody className="h-64">
            {!products.length ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Chưa có hàng hóa
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={abcData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {abcData.map((e) => (
                        <Cell key={e.name} fill={e.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-3 text-xs">
                  {abcData.map((d) => (
                    <span key={d.name}>
                      <strong>{d.name}</strong>: {d.value} MH
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Cần xử lý
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {lowStock.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted">
                    Tồn {p.stock} {p.baseUom} · định mức {p.minStock} · nhóm{" "}
                    {p.abc}
                  </div>
                </div>
                <Badge variant="warn">Cần đặt hàng</Badge>
              </div>
            ))}
            {nearExpiry.slice(0, 3).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft/30 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-semibold">
                    {l.product?.name} · lô {l.batchNo}
                  </div>
                  <div className="text-xs text-muted">
                    HSD {l.expiryDate} · còn {l.days} ngày · SL {l.qty}
                  </div>
                </div>
                <Badge variant="danger">Cận hạn</Badge>
              </div>
            ))}
            {!lowStock.length && !nearExpiry.length ? (
              <p className="py-4 text-center text-sm text-muted">
                Không có cảnh báo vận hành.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lối tắt nghiệp vụ</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [
                  "pos",
                  "Quầy bán hàng",
                  openShift ? `Ca ${openShift.code}` : "Mở ca & bán",
                ],
                ["inbound", "Nhập kho", `${grns.length} phiếu nhập`],
                ["inventory", "Kiểm kho", "Kiểm kê · hạn dùng"],
                ["products", "Danh mục hàng", `${products.length} mặt hàng`],
                ["reports", "Báo cáo & chốt ca", "Đối soát · ROI"],
              ] as [PageId, string, string][]
            ).map(([id, title, sub]) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2/50 px-3 py-3 text-left hover:border-brand/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="truncate text-xs text-muted">{sub}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted" />
              </button>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
