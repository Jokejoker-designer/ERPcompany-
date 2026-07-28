import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  FolderSearch,
  Play,
  Download,
  CheckCircle2,
  FileSearch,
  HardDrive,
  FileText,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CT_PHASES } from "@/data/ct-registry";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";
import { useDocsStore } from "@/store/docs-store";

export const Route = createFileRoute("/app/scan")({
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const company = useErpStore((s) => s.company);
  const scan = useErpStore((s) => s.scan);
  const setScanRoots = useErpStore((s) => s.setScanRoots);
  const runEnterpriseScan = useErpStore((s) => s.runEnterpriseScan);
  const importScanHits = useErpStore((s) => s.importScanHits);
  const markSetup = useErpStore((s) => s.markSetup);
  const customers = useErpStore((s) => s.customers);
  const projects = useErpStore((s) => s.projects);
  const openOrCreateFromScan = useDocsStore((s) => s.openOrCreateFromScan);

  const [roots, setRoots] = useState(company.scanRoots || "D:\\2025; D:\\2026");
  const [filter, setFilter] = useState("");
  const [phase, setPhase] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const hits = useMemo(() => {
    return scan.hits.filter((h) => {
      if (phase !== "all" && h.phase !== phase) return false;
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return (
        h.fileName.toLowerCase().includes(q) ||
        h.customerHint.toLowerCase().includes(q) ||
        h.projectHint.toLowerCase().includes(q) ||
        h.ctCode.toLowerCase().includes(q) ||
        h.path.toLowerCase().includes(q)
      );
    });
  }, [scan.hits, filter, phase]);

  const allSelectedIds = hits.filter((h) => selected[h.id]).map((h) => h.id);

  function saveRoots() {
    setScanRoots(roots);
    toast.success("Đã lưu thư mục quét (scan_roots)", { description: roots });
  }

  function runScan() {
    setScanRoots(roots);
    const n = runEnterpriseScan();
    markSetup("scan");
    setSelected({});
    toast.success(`Quét xong — ${n} file doanh nghiệp`);
  }

  function importSelected() {
    const ids =
      allSelectedIds.length > 0
        ? allSelectedIds
        : scan.hits.filter((h) => !h.imported).map((h) => h.id);
    if (!ids.length) {
      toast.message("Không còn file để nạp");
      return;
    }
    const res = importScanHits(ids);
    toast.success(
      `Đã nạp: +${res.customers} khách · +${res.projects} CT · ${res.docs} hồ sơ`,
    );
    setSelected({});
  }

  function openDoc(h: (typeof hits)[0]) {
    openOrCreateFromScan({
      fileName: h.fileName,
      path: h.path,
      ext: h.ext,
      customer: h.customerHint,
      project: h.projectHint,
      ctCode: h.ctCode,
      companyName: company.companyName,
    });
    toast.success("Đã mở tài liệu trong trình soạn thảo");
    void navigate({ to: "/app/editor" });
  }

  function toggleAll(on: boolean) {
    if (!on) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const h of hits) next[h.id] = true;
    setSelected(next);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/30 bg-gradient-to-r from-brand-soft/50 to-surface">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
            <FolderSearch className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg">
              Quét dữ liệu doanh nghiệp
            </h2>
            <p className="text-xs text-muted sm:text-sm">
              Index PDF / Word / Excel / ảnh từ folder khách. Bấm{" "}
              <strong>Mở & sửa</strong> để soạn thảo + lưu version. Bảng
              dữ liệu master →{" "}
              <Link
                to="/app/import"
                className="font-semibold text-brand-ink underline"
              >
                Import chuẩn hóa
              </Link>
              .
            </p>
          </div>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/app/editor">
              <FileText className="h-3.5 w-3.5" />
              Thư viện tài liệu
            </Link>
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="File đã quét"
          value={String(scan.stats.files)}
          foot={
            scan.lastRunAt
              ? new Date(scan.lastRunAt).toLocaleString("vi-VN")
              : "Chưa quét"
          }
          tone="info"
        />
        <Metric
          label="Khách nhận diện"
          value={String(scan.stats.customers)}
          foot={`Hệ thống: ${customers.length}`}
        />
        <Metric
          label="Công trình"
          value={String(scan.stats.projects)}
          foot={`Hệ thống: ${projects.length}`}
        />
        <Metric
          label="Đã nạp ERP"
          value={String(scan.stats.imported)}
          tone="ok"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-brand" />
            Thư mục gốc (scan_roots)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            value={roots}
            onChange={(e) => setRoots(e.target.value)}
            placeholder="D:\2025; D:\2026"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={saveRoots}>
              Lưu cấu hình
            </Button>
            <Button size="sm" onClick={runScan}>
              <Play className="h-3.5 w-3.5" />
              Chạy quét
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!scan.hits.length}
              onClick={importSelected}
            >
              <Download className="h-3.5 w-3.5" />
              Nạp vào ERP
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-brand" />
            Kết quả — mở & chỉnh sửa
          </CardTitle>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Lọc…"
            className="sm:ml-auto sm:w-48"
          />
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPhase("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                phase === "all"
                  ? "border-brand bg-brand text-on-brand"
                  : "border-border text-muted",
              )}
            >
              Tất cả
            </button>
            {Object.keys(CT_PHASES)
              .sort()
              .map((ph) => {
                const n = scan.hits.filter((h) => h.phase === ph).length;
                if (!n) return null;
                return (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => setPhase(ph)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      phase === ph
                        ? "border-brand bg-brand text-on-brand"
                        : "border-border text-muted",
                    )}
                  >
                    {ph} ({n})
                  </button>
                );
              })}
            <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>
              Chọn trang
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>
              Bỏ chọn
            </Button>
          </div>

          {!scan.hits.length ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-border px-4 py-10 text-center">
              <Button size="sm" onClick={runScan}>
                <Play className="h-3.5 w-3.5" />
                Quét ngay
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/70 text-xs text-muted">
                    <th className="px-3 py-2.5"> </th>
                    <th className="px-3 py-2.5 font-semibold">File</th>
                    <th className="px-3 py-2.5 font-semibold">Khách</th>
                    <th className="px-3 py-2.5 font-semibold">CT</th>
                    <th className="px-3 py-2.5 font-semibold">Mã HS</th>
                    <th className="px-3 py-2.5 font-semibold">TT</th>
                    <th className="px-3 py-2.5 font-semibold"> </th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => (
                    <tr key={h.id} className="border-b border-border-soft">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selected[h.id]}
                          disabled={h.imported}
                          onChange={(e) =>
                            setSelected((s) => ({
                              ...s,
                              [h.id]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{h.fileName}</div>
                        <div className="max-w-[220px] truncate text-[10px] text-muted">
                          {h.path}
                        </div>
                      </td>
                      <td className="px-3 py-2">{h.customerHint}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {h.projectHint}
                      </td>
                      <td className="px-3 py-2">
                        <code className="rounded bg-surface-2 px-1.5 text-xs">
                          {h.ctCode}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        {h.imported ? (
                          <Badge variant="ok">
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            Đã nạp
                          </Badge>
                        ) : (
                          <Badge variant="info">Đã map</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openDoc(h)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Mở & sửa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
