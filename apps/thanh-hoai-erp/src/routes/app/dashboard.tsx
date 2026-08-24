import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileText, Upload } from "lucide-react";
import { Metric } from "@/components/erp/status";
import { SetupProgressBanner } from "@/components/erp/setup-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  filterQuotations,
  filterReceivables,
  quotationStatusChart,
  salesByCategoryChart,
  type DashboardFilterState,
} from "@/lib/dashboard-filters";
import {
  PRODUCT_CATEGORIES,
  defaultDashboardRange,
  type ProductCategory,
} from "@/lib/product-categories";
import { fetchDashboardAnalytics } from "@/lib/runtime-data";
import type { RuntimeDashboardAnalytics } from "@/lib/runtime-data";
import { formatVnd, formatVndShort } from "@/lib/utils";
import { resolveUserKey } from "@/lib/user-scope";
import { useErpStore } from "@/store/erp-store";
import { useDocsStore } from "@/store/docs-store";
import {
  approvalStatsForChart,
  useFormWorkflowStore,
} from "@/store/form-workflow-store";

export const Route = createFileRoute("/app/dashboard")({
  component: DashboardPage,
});

const STAGE_LABEL = {
  bao_gia: "Báo giá",
  thi_cong: "Thi công",
  nghiem_thu: "Nghiệm thu",
  hoan_thanh: "Hoàn thành",
} as const;

const CHART_COLORS = [
  "var(--color-brand)",
  "var(--color-info)",
  "var(--color-warn)",
  "var(--color-ok)",
  "var(--color-danger)",
  "#6366f1",
  "#94a3b8",
];

function DashboardPage() {
  const defaults = defaultDashboardRange();
  const [filters, setFilters] = useState<DashboardFilterState>({
    from: defaults.from,
    to: defaults.to,
    category: "all",
  });
  const [runtimeAnalytics, setRuntimeAnalytics] =
    useState<RuntimeDashboardAnalytics | null>(null);

  const receivables = useErpStore((s) => s.receivables);
  const quotations = useErpStore((s) => s.quotations);
  const projects = useErpStore((s) => s.projects);
  const customers = useErpStore((s) => s.customers);
  const bankLines = useErpStore((s) => s.bankLines);
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const activeProjectId = useErpStore((s) => s.activeProjectId);
  const serverPermissions = useErpStore((s) => s.serverPermissions);
  const documents = useDocsStore((s) => s.documents);
  const auditQueue = useDocsStore((s) => s.auditQueue);
  const getApprovalStats = useFormWorkflowStore((s) => s.getApprovalStats);

  const userKey = resolveUserKey(session, user?.username);

  const runtimeDashboard = useErpStore((s) => s.runtimeDashboard);
  const dataSource = useErpStore((s) => s.dataSource);

  const openAudits = useMemo(
    () => auditQueue.filter((a) => a.status === "open"),
    [auditQueue],
  );

  const signed = projects.reduce((s, p) => s + p.value, 0);
  const running = projects.filter(
    (p) => p.stage === "thi_cong" || p.stage === "nghiem_thu",
  ).length;
  const overdueProjects = projects.filter((p) => p.overdue).length;

  const filteredQuotes = useMemo(
    () => filterQuotations(quotations, filters),
    [quotations, filters],
  );
  const filteredReceivables = useMemo(
    () => filterReceivables(receivables, filters),
    [receivables, filters],
  );

  useEffect(() => {
    if (dataSource !== "runtime") {
      setRuntimeAnalytics(null);
      return;
    }
    let cancelled = false;
    void fetchDashboardAnalytics({
      tu_ngay: filters.from,
      den_ngay: filters.to,
      hang_muc:
        filters.category === "all" ? undefined : filters.category,
    })
      .then((data) => {
        if (!cancelled) setRuntimeAnalytics(data);
      })
      .catch(() => {
        if (!cancelled) setRuntimeAnalytics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource, filters.from, filters.to, filters.category]);

  const categoryOptions = useMemo(() => {
    const fromRuntime = runtimeAnalytics?.categories ?? [];
    const fromDemo = PRODUCT_CATEGORIES.map((c) => c.label);
    const merged = [...new Set([...fromRuntime, ...fromDemo])].sort();
    return merged;
  }, [runtimeAnalytics]);

  const filteredPending = filteredQuotes.filter((q) => q.status === "pending").length;
  const filteredTotalAR = filteredReceivables.reduce(
    (s, r) => s + (r.value - r.collected),
    0,
  );

  const revenueSeries = useMemo(() => {
    if (
      dataSource === "runtime" &&
      runtimeDashboard?.weeks &&
      runtimeDashboard.weeks.some((w) => Number(w) > 0)
    ) {
      return runtimeDashboard.weeks.map((v, i) => ({
        month: `T${i + 1}`,
        value: Math.round((Number(v) / 1_000_000_000) * 100) / 100,
      }));
    }
    const months = ["T1", "T2", "T3", "T4", "T5", "T6"];
    const buckets = months.map((m) => ({ month: m, value: 0 }));
    projects.forEach((p, i) => {
      buckets[i % 6].value += p.value / 1_000_000_000;
    });
    receivables.forEach((r, i) => {
      buckets[(i + 2) % 6].value += r.collected / 1_000_000_000;
    });
    return buckets.map((b) => ({
      month: b.month,
      value: Math.round(b.value * 100) / 100,
    }));
  }, [projects, receivables, dataSource, runtimeDashboard]);

  const hasRevenue = revenueSeries.some((r) => r.value > 0);

  const approvalChart = useMemo(() => {
    const stats = getApprovalStats(userKey, activeProjectId);
    return approvalStatsForChart(stats);
  }, [getApprovalStats, userKey, activeProjectId]);

  const quoteStatusChart = useMemo(() => {
    if (
      dataSource === "runtime" &&
      runtimeAnalytics?.quotation_status?.length
    ) {
      return runtimeAnalytics.quotation_status.map((r) => ({
        label: r.label,
        value: r.value,
      }));
    }
    return quotationStatusChart(quotations, filters);
  }, [quotations, filters, dataSource, runtimeAnalytics]);

  const salesCategoryChart = useMemo(() => {
    if (
      dataSource === "runtime" &&
      runtimeAnalytics?.sales_by_category?.length
    ) {
      return runtimeAnalytics.sales_by_category.map((r) => ({
        label: r.label,
        value: r.value,
      }));
    }
    return salesByCategoryChart(quotations, filters);
  }, [quotations, filters, dataSource, runtimeAnalytics]);

  const hasQuoteChart = quoteStatusChart.some((d) => d.value > 0);
  const hasSalesCategory = salesCategoryChart.some((d) => d.value > 0);

  const approvals = useMemo(() => {
    const items: {
      id: string;
      type: string;
      title: string;
      deadline: string;
      urgent?: boolean;
      to: string;
    }[] = [];
    quotations
      .filter((q) => q.status === "pending" || q.status === "draft")
      .slice(0, 4)
      .forEach((q) => {
        items.push({
          id: `bg-${q.id}`,
          type: "BG",
          title: `Duyệt báo giá ${q.code} · ${q.projectCode}`,
          deadline: q.status === "pending" ? "2 ngày" : "Bản nháp",
          to: "/app/quotations",
        });
      });
    receivables
      .filter((r) => r.status === "overdue")
      .forEach((r) => {
        items.push({
          id: `ar-${r.id}`,
          type: "CN",
          title: `Công nợ quá hạn ${r.contract} — ${r.customer}`,
          deadline: r.dueDate,
          urgent: true,
          to: "/app/receivables",
        });
      });
    bankLines
      .filter((b) => b.status === "pending")
      .slice(0, 3)
      .forEach((b) => {
        items.push({
          id: `bk-${b.id}`,
          type: "UNC",
          title: b.desc,
          deadline: b.date,
          urgent: true,
          to: "/app/bank",
        });
      });
    projects
      .filter((p) => p.overdue)
      .forEach((p) => {
        items.push({
          id: `ct-${p.id}`,
          type: "CT",
          title: `Công trình trễ tiến độ ${p.code} — ${p.name}`,
          deadline: `${p.progress}%`,
          urgent: true,
          to: "/app/projects",
        });
      });
    openAudits.slice(0, 3).forEach((a) => {
      items.push({
        id: `au-${a.id}`,
        type: "HS",
        title: `Audit: ${a.field} — ${a.reason}`,
        deadline: "Cần xác nhận",
        to: "/app/import",
      });
    });
    return items.slice(0, 8);
  }, [quotations, receivables, bankLines, openAudits, projects]);

  const pipeline = {
    bao_gia: projects.filter((p) => p.stage === "bao_gia"),
    thi_cong: projects.filter((p) => p.stage === "thi_cong"),
    nghiem_thu: projects.filter((p) => p.stage === "nghiem_thu"),
  };

  return (
    <div className="min-w-0 space-y-4">
      <SetupProgressBanner />

      <Card className="border-border-soft">
        <CardBody className="flex flex-wrap items-end gap-3 py-3">
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-semibold text-muted">
              Từ ngày
            </label>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-semibold text-muted">
              Đến ngày
            </label>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-semibold text-muted">
              Danh mục sản phẩm / hạng mục
            </label>
            <select
              className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
              value={filters.category}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  category: e.target.value as ProductCategory | "all",
                }))
              }
            >
              <option value="all">Tất cả danh mục</option>
              {dataSource === "runtime"
                ? categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))
                : PRODUCT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const d = defaultDashboardRange();
                setFilters({ from: d.from, to: d.to, category: "all" });
              }}
            >
              6 tháng
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const to = new Date();
                const from = new Date();
                from.setDate(from.getDate() - 30);
                setFilters({
                  from: from.toISOString().slice(0, 10),
                  to: to.toISOString().slice(0, 10),
                  category: filters.category,
                });
              }}
            >
              30 ngày
            </Button>
          </div>
          {dataSource === "runtime" && serverPermissions ? (
            <Badge variant="ok" className="ml-auto">
              RBAC server · {serverPermissions.erp_routes.length} menu
            </Badge>
          ) : null}
          {categoryOptions.length ? (
            <span className="text-xs text-muted">
              {categoryOptions.length} hạng mục trong dữ liệu
            </span>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/editor">
            <FileText className="h-3.5 w-3.5" />
            Mở tài liệu ({documents.length})
          </Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/import">
            <Upload className="h-3.5 w-3.5" />
            Import chuẩn hóa
            {openAudits.length ? ` · ${openAudits.length} audit` : ""}
          </Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/scan">Quét dữ liệu DN</Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/chungtu">9 · Xuất chứng từ</Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/materials">Vật tư · Kho</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Doanh thu / GT công trình"
          value={formatVnd(signed)}
          foot={
            <Badge variant="ok">
              {customers.length} khách · {projects.length} CT
            </Badge>
          }
          tone="info"
        />
        <Metric
          label="Phải thu còn lại"
          value={formatVnd(filteredTotalAR)}
          foot={
            <Badge variant="warn">
              {filteredReceivables.filter((r) => r.status !== "paid").length} HĐ
            </Badge>
          }
          tone="warn"
        />
        <Metric
          label="Công trình đang chạy"
          value={String(running)}
          foot={
            overdueProjects ? (
              <Badge variant="danger">{overdueProjects} trễ tiến độ</Badge>
            ) : (
              <Badge variant="ok">
                {projects.length ? "Theo dõi" : "Chưa có CT"}
              </Badge>
            )
          }
        />
        <Metric
          label="Báo giá chờ duyệt"
          value={String(filteredPending)}
          foot={
            <Badge variant="info">
              {filteredQuotes.length} BG trong kỳ
            </Badge>
          }
          tone="danger"
        />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>
              Giá trị CT / thu theo tháng (tỷ VND) — dữ liệu thật
            </CardTitle>
          </CardHeader>
          <CardBody className="h-64 min-w-0">
            {!hasRevenue ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
                <p>Chưa có dữ liệu — biểu đồ về 0.</p>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/app/import">Import dữ liệu</Link>
                </Button>
              </div>
            ) : (
              <div className="h-full w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueSeries}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border-soft)"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                    />
                    <YAxis
                      width={36}
                      tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v} tỷ`, "Giá trị"]}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid var(--color-border)",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--color-brand)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Hành động hôm nay</CardTitle>
            <Badge variant="brand">{approvals.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {!approvals.length ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-8 text-center text-sm text-muted">
                Không có việc gấp — dữ liệu trống hoặc đã xử lý hết.
              </div>
            ) : (
              approvals.map((a) => (
                <Link
                  key={a.id}
                  to={a.to}
                  className="flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-border-soft bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-brand/40"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          a.type === "UNC"
                            ? "warn"
                            : a.type === "BG"
                              ? "info"
                              : a.type === "HS"
                                ? "brand"
                                : "default"
                        }
                      >
                        {a.type}
                      </Badge>
                      {a.urgent ? <Badge variant="danger">Gấp</Badge> : null}
                    </div>
                    <div className="text-sm font-medium text-fg">{a.title}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted">{a.deadline}</div>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Phê duyệt biểu mẫu (84 mẫu CT)</CardTitle>
            <Link
              to="/app/documents"
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              Hồ sơ CT
            </Link>
          </CardHeader>
          <CardBody className="h-64 min-w-0">
            {!approvalChart.length ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Chưa có trạng thái phê duyệt — mở Hồ sơ CT để soạn / gửi duyệt.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={approvalChart}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {approvalChart.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _n, p) => [
                      `${v} mẫu`,
                      p.payload.label,
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Doanh số theo danh mục (lọc)</CardTitle>
          </CardHeader>
          <CardBody className="h-64 min-w-0">
            {!hasSalesCategory ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Không có dòng BOQ khớp bộ lọc.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesCategoryChart} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-soft)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={100}
                    tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatVnd(v), "Giá trị"]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--color-brand)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Báo giá theo trạng thái</CardTitle>
            <Link
              to="/app/quotations"
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              Danh sách BG
            </Link>
          </CardHeader>
          <CardBody className="h-64 min-w-0">
            {!hasQuoteChart ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
                <p>Chưa có báo giá trong hệ thống.</p>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/app/quotations">Tạo báo giá</Link>
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quoteStatusChart} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-soft)"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={72}
                    tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v} BG`, "Số lượng"]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--color-info)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Pipeline công trình</CardTitle>
            <Link
              to="/app/documents"
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              Xem hồ sơ CT
            </Link>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(pipeline) as Array<keyof typeof pipeline>).map(
                (stage) => (
                  <div
                    key={stage}
                    className="rounded-[var(--radius-md)] border border-border bg-surface-2/50 p-3"
                  >
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                      {STAGE_LABEL[stage]}
                    </div>
                    <div className="space-y-2">
                      {pipeline[stage].length === 0 ? (
                        <div className="text-xs text-muted">Trống</div>
                      ) : null}
                      {pipeline[stage].map((p) => (
                        <div
                          key={p.id}
                          className={`rounded-[var(--radius-sm)] border bg-surface px-2.5 py-2 text-xs ${
                            p.overdue
                              ? "border-danger/30 bg-danger-soft/40"
                              : "border-border-soft"
                          }`}
                        >
                          <div className="font-semibold text-fg">
                            {p.code}
                            {p.overdue ? " · trễ" : ""}
                          </div>
                          <div className="text-muted">{p.name}</div>
                          <div className="mt-1 tabular-nums text-muted">
                            {formatVndShort(p.value)} · {p.progress}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Công nợ tóm tắt</CardTitle>
            <Link
              to="/app/receivables"
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              Chi tiết
            </Link>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            {!receivables.length ? (
              <p className="py-6 text-center text-sm text-muted">
                Chưa có công nợ trong hệ thống.
              </p>
            ) : (
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="pb-2 font-semibold">Khách</th>
                    <th className="pb-2 font-semibold">HĐ</th>
                    <th className="pb-2 text-right font-semibold">Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((r) => (
                    <tr key={r.id} className="border-b border-border-soft">
                      <td className="max-w-[140px] truncate py-2.5 pr-2">
                        {r.customer}
                      </td>
                      <td className="py-2.5 pr-2 text-muted">{r.contract}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">
                        {formatVnd(r.value - r.collected)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
