import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  STANDARD_IMPORT_SCHEMA,
  type FieldConfidence,
} from "@/data/documents";
import { cn } from "@/lib/utils";
import { useDocsStore } from "@/store/docs-store";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app/import")({
  component: ImportPage,
});

type Sheet = "customers" | "projects" | "materials" | "quotation_lines";

const SHEETS: { id: Sheet; label: string; desc: string }[] = [
  {
    id: "customers",
    label: "1. Khách hàng",
    desc: "code, name, taxId, contact, phone, email, address",
  },
  {
    id: "projects",
    label: "2. Công trình",
    desc: "code, name, customerCode/Name, address, value, stage",
  },
  {
    id: "materials",
    label: "3. Vật tư",
    desc: "sku, name, unit, unitCost, stock, supplier",
  },
  {
    id: "quotation_lines",
    label: "4. Dòng BOQ / BG",
    desc: "quoteCode, projectCode, lineName, qty, unit, unitPrice, taxRate",
  },
];

function ImportPage() {
  const getTemplateCsv = useDocsStore((s) => s.getTemplateCsv);
  const analyzeImport = useDocsStore((s) => s.analyzeImport);
  const auditQueue = useDocsStore((s) => s.auditQueue);
  const resolveAudit = useDocsStore((s) => s.resolveAudit);
  const ignoreAudit = useDocsStore((s) => s.ignoreAudit);
  const clearAudit = useDocsStore((s) => s.clearAudit);
  const addCustomer = useErpStore((s) => s.addCustomer);
  const addProject = useErpStore((s) => s.addProject);
  const addMaterial = useErpStore((s) => s.addMaterial);
  const addQuotation = useErpStore((s) => s.addQuotation);
  const customers = useErpStore((s) => s.customers);

  const [sheet, setSheet] = useState<Sheet>("customers");
  const [csv, setCsv] = useState(getTemplateCsv("customers"));
  const [result, setResult] = useState<ReturnType<typeof analyzeImport> | null>(
    null,
  );
  const [step, setStep] = useState(1);

  const openAudits = useMemo(
    () => auditQueue.filter((a) => a.status === "open"),
    [auditQueue],
  );

  function loadTemplate(s: Sheet) {
    setSheet(s);
    setCsv(getTemplateCsv(s));
    setResult(null);
    setStep(2);
  }

  function downloadTemplate(s: Sheet) {
    const text = getTemplateCsv(s);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ThanhHoaiERP_${s}_v1.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải mẫu CSV chuẩn");
  }

  function analyze() {
    const r = analyzeImport(sheet, csv);
    setResult(r);
    setStep(3);
    toast.message(
      `Phân tích: ${r.rowCount} dòng · ${r.auditCreated} mục cần audit`,
    );
  }

  function commitImport() {
    if (!result?.preview.length) {
      toast.error("Chưa có dữ liệu preview");
      return;
    }
    let n = 0;
    if (sheet === "customers") {
      for (const row of result.preview) {
        if (!row.name?.trim()) continue;
        addCustomer({
          code: row.code,
          name: row.name,
          taxId: row.taxId || "",
          contact: row.contact || "",
          phone: row.phone || "",
          email: row.email || "",
          address: row.address || "",
          notes: row.notes || "Import chuẩn hóa v1",
        });
        n++;
      }
    } else if (sheet === "projects") {
      for (const row of result.preview) {
        if (!row.name?.trim()) continue;
        const cust =
          customers.find(
            (c) =>
              c.code === row.customerCode ||
              c.name.toLowerCase() === (row.customerName || "").toLowerCase(),
          ) || customers[0];
        if (!cust) {
          toast.error("Cần có khách trước khi import CT");
          return;
        }
        addProject({
          code: row.code || "",
          name: row.name,
          customerId: cust.id,
          address: row.address,
          value: Number(String(row.value || "0").replace(/[,\s]/g, "")) || 0,
        });
        n++;
      }
    } else if (sheet === "materials") {
      for (const row of result.preview) {
        if (!row.name?.trim() && !row.sku?.trim()) continue;
        addMaterial({
          sku: row.sku || `VT-${Date.now()}`,
          name: row.name || row.sku,
          unit: row.unit || "cái",
          unitCost: Number(String(row.unitCost || "0").replace(/[,\s]/g, "")) || 0,
          stock: Number(String(row.stock || "0").replace(/[,\s]/g, "")) || 0,
          supplier: row.supplier || "",
          source: "import_hd",
        });
        n++;
      }
    } else {
      // group by quote
      const groups = new Map<string, typeof result.preview>();
      for (const row of result.preview) {
        const key = row.quoteCode || "BG-IMPORT";
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
      }
      for (const [, lines] of groups) {
        const first = lines[0];
        addQuotation({
          customer: first.customerName || "Khách import",
          projectCode: first.projectCode || "CT-IMPORT",
          projectName: first.projectCode || "Công trình import",
          lines: lines
            .filter((l) => l.lineName || l.name)
            .map((l) => ({
              name: l.lineName || l.name || "Hạng mục",
              description: l.description || "",
              qty: Number(l.qty) || 1,
              unit: l.unit || "cái",
              unitPrice: Number(String(l.unitPrice || "0").replace(/[,\s]/g, "")) || 0,
              taxRate: Number(l.taxRate) || 8,
              notes: l.notes || "",
            })),
        });
        n++;
      }
    }
    setStep(4);
    toast.success(`Đã nạp ${n} bản ghi · còn ${openAudits.length} mục audit`);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-gradient-to-r from-brand-soft/40 to-surface">
        <CardBody>
          <h2 className="text-base font-semibold text-fg">
            Chuẩn hóa & import dữ liệu khách hàng
          </h2>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Hệ thống chỉ đọc chắc chắn định dạng{" "}
            <strong className="text-fg">
              {STANDARD_IMPORT_SCHEMA.name}
            </strong>
            . Làm theo 4 bước: tải mẫu → điền/dán CSV → phân tích & map → nạp +
            audit các ô không chắc.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((s) => (
              <span
                key={s}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  step === s
                    ? "bg-brand text-on-brand"
                    : step > s
                      ? "bg-ok-soft text-ok"
                      : "bg-surface-2 text-muted",
                )}
              >
                Bước {s}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Step 1 */}
      <Card>
        <CardHeader>
          <CardTitle>Bước 1 — Chọn loại dữ liệu & tải mẫu chuẩn</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-2 sm:grid-cols-2">
          {SHEETS.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-[var(--radius-md)] border px-3 py-3",
                sheet === s.id ? "border-brand bg-brand-soft/40" : "border-border",
              )}
            >
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-xs text-muted">{s.desc}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => loadTemplate(s.id)}>
                  Dùng mẫu
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadTemplate(s.id)}>
                  <Download className="h-3.5 w-3.5" />
                  Tải CSV
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Step 2 */}
      <Card>
        <CardHeader>
          <CardTitle>Bước 2 — Dán / chỉnh CSV theo mẫu</CardTitle>
          <Badge variant="info">{sheet}</Badge>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs text-muted">
            Cột header phải map được sang schema. Tên cột tiếng Việt (MST, SĐT,
            Tên…) được nhận diện gần đúng; cột lạ sẽ vào checklist audit.
          </p>
          <textarea
            className="min-h-[180px] w-full rounded-[var(--radius-md)] border border-border bg-surface p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            spellCheck={false}
          />
          <Button size="sm" onClick={analyze}>
            <Upload className="h-3.5 w-3.5" />
            Phân tích & map cột
          </Button>
        </CardBody>
      </Card>

      {/* Step 3 */}
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Bước 3 — Kết quả map & độ tin cậy</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-xs text-muted">
                    <th className="px-3 py-2">Cột file khách</th>
                    <th className="px-3 py-2">→ Trường chuẩn</th>
                    <th className="px-3 py-2">Tin cậy</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mappedHeaders.map((m) => (
                    <tr key={m.header} className="border-b border-border-soft">
                      <td className="px-3 py-2 font-mono text-xs">{m.header}</td>
                      <td className="px-3 py-2">
                        {m.field ? (
                          <code className="text-xs">{m.field}</code>
                        ) : (
                          <span className="text-danger">Chưa map</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <ConfBadge c={m.confidence as FieldConfidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-muted">
              Preview {result.preview.length} dòng · tạo{" "}
              <strong className="text-fg">{result.auditCreated}</strong> mục
              audit (ô không chắc / cột lạ).
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-muted">
                    {Object.keys(result.preview[0] || {})
                      .filter((k) => !k.startsWith("_raw_"))
                      .slice(0, 8)
                      .map((k) => (
                        <th key={k} className="px-2 py-1.5 font-semibold">
                          {k}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border-soft">
                      {Object.entries(row)
                        .filter(([k]) => !k.startsWith("_raw_"))
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <td
                            key={k}
                            className={cn(
                              "max-w-[140px] truncate px-2 py-1.5",
                              !v && "bg-warn-soft/50",
                            )}
                          >
                            {v || "∅"}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" onClick={commitImport}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Nạp vào ERP (bước 4)
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* Audit checklist */}
      <Card className={openAudits.length ? "border-warn/40" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" />
            Checklist audit — hệ thống không chắc
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="warn">{openAudits.length} mở</Badge>
            <Button size="sm" variant="ghost" onClick={() => clearAudit()}>
              Xóa hết
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs text-muted">
            Ô highlight: không nhận diện / tin cậy thấp / cột ngoài schema. Bạn
            chỉnh giá trị đúng hoặc bỏ qua — sau đó hệ thống dùng dữ liệu đã
            chuẩn.
          </p>
          {!openAudits.length ? (
            <div className="rounded-[var(--radius-md)] border border-ok/30 bg-ok-soft/30 px-3 py-4 text-sm text-fg">
              Không còn mục audit mở — dữ liệu đã rõ ràng.
            </div>
          ) : (
            openAudits.slice(0, 40).map((a) => (
              <AuditRow
                key={a.id}
                item={a}
                onResolve={(v) => {
                  resolveAudit(a.id, v);
                  toast.success(`Đã xác nhận: ${a.field}`);
                }}
                onIgnore={() => ignoreAudit(a.id)}
              />
            ))
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/editor">Mở / sửa tài liệu</Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/scan">Quét folder DN</Link>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/app/customers">Khách hàng</Link>
        </Button>
      </div>
    </div>
  );
}

function ConfBadge({ c }: { c: FieldConfidence | string }) {
  if (c === "high") return <Badge variant="ok">Cao</Badge>;
  if (c === "medium") return <Badge variant="warn">TB — kiểm tra</Badge>;
  if (c === "low") return <Badge variant="danger">Thấp</Badge>;
  return <Badge variant="danger">Không rõ</Badge>;
}

function AuditRow({
  item,
  onResolve,
  onIgnore,
}: {
  item: {
    id: string;
    field: string;
    rawValue: string;
    suggestedValue: string;
    confidence: FieldConfidence;
    reason: string;
    entity: string;
  };
  onResolve: (v: string) => void;
  onIgnore: () => void;
}) {
  const [val, setVal] = useState(item.suggestedValue || item.rawValue);
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-2.5",
        item.confidence === "unknown" || item.confidence === "low"
          ? "border-danger/40 bg-danger-soft/20"
          : "border-warn/40 bg-warn-soft/25",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ConfBadge c={item.confidence} />
        <span className="text-xs font-semibold uppercase text-muted">
          {item.entity}
        </span>
        <code className="text-xs font-bold text-fg">{item.field}</code>
      </div>
      <p className="mt-1 text-xs text-muted">{item.reason}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-9 text-sm"
          placeholder="Giá trị đúng / chỉ rõ trường"
        />
        <div className="flex gap-1">
          <Button size="sm" onClick={() => onResolve(val)}>
            <Check className="h-3.5 w-3.5" />
            Xác nhận
          </Button>
          <Button size="sm" variant="ghost" onClick={onIgnore}>
            <X className="h-3.5 w-3.5" />
            Bỏ qua
          </Button>
        </div>
      </div>
    </div>
  );
}
