import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileText, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import {
  ProjectContextBar,
  ProjectPicker,
  useActiveProject,
} from "@/components/erp/project-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHUNG_TU,
  type Project,
  type Quotation,
  type Receivable,
  normalizeLine,
  quoteSubtotal,
  quoteTotal,
  quoteVat,
} from "@/data/seed";
import { formatVnd } from "@/lib/utils";
import {
  CHUNG_TU_EXPORT_LOAI,
  downloadProjectExport,
  downloadQuotationExport,
} from "@/lib/sales-export";
import { useErpStore } from "@/store/erp-store";
import { PrintPreviewModal } from "@/components/erp/print-preview";

export const Route = createFileRoute("/app/chungtu")({
  component: ChungTuPage,
});

function ChungTuPage() {
  const company = useErpStore((s) => s.company);
  const dataSource = useErpStore((s) => s.dataSource);
  const projects = useErpStore((s) => s.projects);
  const project = useActiveProject();
  const quotations = useErpStore((s) => s.quotations);
  const receivables = useErpStore((s) => s.receivables);
  const markWorkflow = useErpStore((s) => s.markWorkflow);
  const [exported, setExported] = useState<string[]>([]);
  const [previewType, setPreviewType] = useState("Báo giá");
  const [previewOpen, setPreviewOpen] = useState(false);

  const quotes = useMemo(
    () =>
      project
        ? quotations.filter((q) => q.projectCode === project.code)
        : [],
    [quotations, project],
  );
  const quote =
    quotes.find((q) => q.status === "won") ||
    quotes.find((q) => q.status === "approved") ||
    quotes[0] ||
    null;
  const ar = project
    ? receivables.find((r) => r.projectCode === project.code)
    : null;

  async function exportDoc(type: string) {
    if (!project) {
      toast.error("Chọn công trình trước khi xuất", {
        description:
          projects.length === 0
            ? "Chưa có CT — vào menu 3 · Công trình để tạo"
            : "Dùng dropdown «Đổi công trình» phía trên",
      });
      document
        .getElementById("chon-cong-trinh")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const loai = CHUNG_TU_EXPORT_LOAI[type];
    if (dataSource === "runtime" && loai) {
      const docId =
        loai === "quotation" && quote ? quote.id : project.id;
      try {
        await downloadProjectExport(loai, docId, "xlsx");
        setExported((e) => (e.includes(type) ? e : [...e, type]));
        setPreviewType(type);
        toast.success(`Xuất Excel ${type} — runtime`, {
          description: `${project.code} · ${project.customer}`,
        });
        if (type === "Hợp đồng" || type === "Báo giá") {
          markWorkflow(
            project.id,
            type === "Hợp đồng" ? "contract" : "quote",
            true,
          );
        }
        if (type === "BBNT") markWorkflow(project.id, "docs06", true);
        if (type === "BQT" || type === "Thư ĐNTT" || type === "ĐCCN") {
          markWorkflow(project.id, "docs08", true);
          markWorkflow(project.id, "ar", true);
        }
        return;
      } catch (e) {
        if (loai === "quotation" && quote) {
          try {
            await downloadQuotationExport(quote.id, "xlsx");
            toast.success(`Xuất báo giá ${quote.code}`);
            return;
          } catch {
            /* fall through to preview */
          }
        }
        toast.message(
          e instanceof Error ? e.message : "Runtime chưa có chứng từ — xem trước",
        );
      }
    }

    setExported((e) => (e.includes(type) ? e : [...e, type]));
    setPreviewType(type);
    if (type === "Hợp đồng" || type === "Báo giá") {
      markWorkflow(
        project.id,
        type === "Hợp đồng" ? "contract" : "quote",
        true,
      );
    }
    if (type === "BBNT") markWorkflow(project.id, "docs06", true);
    if (type === "BQT" || type === "Thư ĐNTT" || type === "ĐCCN") {
      markWorkflow(project.id, "docs08", true);
      markWorkflow(project.id, "ar", true);
    }
    toast.success(`Xuất ${type} — đã điền dữ liệu ${project.code}`, {
      description: `${project.customer} · ${company.companyName}`,
    });
    setPreviewOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Hướng dẫn rõ bước */}
      <Card className="border-brand/30 bg-gradient-to-r from-brand-soft/40 to-surface">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
            <ListOrdered className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-fg">
              Cách xuất chứng từ (2 bước)
            </div>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted sm:text-sm">
              <li>
                <strong className="text-fg">Chọn công trình</strong> ở khung bên
                dưới (hoặc tạo mới ở menu{" "}
                <Link
                  to="/app/projects"
                  className="font-semibold text-brand-ink underline"
                >
                  3 · Công trình
                </Link>
                ).
              </li>
              <li>
                Bấm <strong className="text-fg">Xuất</strong> trên từng loại —
                hệ thống điền sẵn khách / CT / BOQ / HĐ của CT đang chọn.
              </li>
            </ol>
          </div>
          {projects.length > 0 ? (
            <div id="chon-cong-trinh" className="w-full shrink-0 sm:w-auto sm:min-w-[260px]">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-brand-ink">
                Bước 1 — Chọn công trình tại đây
              </label>
              <ProjectPicker className="w-full" />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div id={projects.length ? undefined : "chon-cong-trinh"}>
        <ProjectContextBar
          showQuotes
          title="Công trình đang xuất chứng từ"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chứng từ xuất theo công trình</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">{CHUNG_TU.length} mẫu</Badge>
            {project ? (
              <Badge variant="ok">{project.code}</Badge>
            ) : (
              <Badge variant="warn">Chưa chọn CT</Badge>
            )}
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">Loại</th>
                <th className="px-4 py-3 font-semibold">Dùng khi</th>
                <th className="px-4 py-3 font-semibold">Dữ liệu bám</th>
                <th className="px-4 py-3 font-semibold">Vai trò</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {CHUNG_TU.map((c) => (
                <tr key={c.type} className="border-b border-border-soft">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <FileText className="h-4 w-4 text-brand" />
                      {c.type}
                      {exported.includes(c.type) ? (
                        <Badge variant="ok">Đã xuất</Badge>
                      ) : null}
                    </div>
                    <code className="text-[10px] text-muted">{c.code}</code>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.when}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {c.bind === "quote" && (
                      <>
                        BG {quote?.code ?? "—"} · {quote?.lines.length ?? 0} HM
                      </>
                    )}
                    {c.bind === "contract" && (
                      <>
                        HĐ {project?.contractCode ?? "chưa có"} ·{" "}
                        {project?.code ?? "—"}
                      </>
                    )}
                    {c.bind === "ar" && (
                      <>
                        {ar?.contract ?? "—"} · còn{" "}
                        {ar ? formatVnd(ar.value - ar.collected) : "—"}
                      </>
                    )}
                    {c.bind === "project" && (
                      <>
                        {project?.code ?? "—"} · {project?.name ?? "chưa chọn"}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.role}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={project ? "default" : "secondary"}
                      onClick={() => void exportDoc(c.type)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Xuất
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <PrintPreviewModal
        open={previewOpen}
        title={`${previewType} · ${project?.code ?? "—"}`}
        onClose={() => setPreviewOpen(false)}
      >
        {!project ? (
          <p className="py-8 text-center text-muted">
            Chọn công trình để xem chứng từ đã điền dữ liệu.
          </p>
        ) : (
          <ChungTuPreviewBody
            previewType={previewType}
            project={project}
            company={company}
            quote={quote}
            ar={ar}
          />
        )}
      </PrintPreviewModal>

      <Card className="border-brand/20 bg-gradient-to-b from-brand-soft/30 to-surface">
        <CardHeader>
          <CardTitle>Xem trước chứng từ đã điền — {previewType}</CardTitle>
          <Badge variant="info">{project?.code ?? "Chưa chọn CT"}</Badge>
        </CardHeader>
        <CardBody className="space-y-4 text-sm">
          {!project ? (
            <p className="py-8 text-center text-muted">
              Chọn công trình ở bước 1 để xem chứng từ đã điền dữ liệu.
            </p>
          ) : (
            <ChungTuPreviewBody
              previewType={previewType}
              project={project}
              company={company}
              quote={quote}
              ar={ar}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ChungTuPreviewBody({
  previewType,
  project,
  company,
  quote,
  ar,
}: {
  previewType: string;
  project: Project;
  company: {
    companyName: string;
    taxId: string;
    address: string;
    phone: string;
  };
  quote: Quotation | null;
  ar: Receivable | null | undefined;
}) {
  return (
    <>
      <div className="flex items-start gap-3 border-b border-border-soft pb-3">
        <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-brand text-xs font-bold text-on-brand">
          TH
        </div>
        <div>
          <div className="text-base font-bold uppercase tracking-wide text-brand-ink">
            {company.companyName}
          </div>
          <div className="text-xs text-muted">
            MST {company.taxId} · {company.address}
          </div>
          <div className="text-xs text-muted">{company.phone}</div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-lg font-bold uppercase text-fg">{previewType}</div>
        <div className="text-xs text-muted">
          Mã CT: {project.code}
          {project.contractCode ? ` · HĐ: ${project.contractCode}` : ""}
          {quote ? ` · BG: ${quote.code} rev #${quote.revision}` : ""}
        </div>
      </div>

      <div className="grid gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase text-muted">
            Khách hàng
          </div>
          <div className="font-semibold">{project.customer}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-muted">
            Công trình
          </div>
          <div className="font-semibold">{project.name}</div>
          <div className="text-xs text-muted">{project.address ?? ""}</div>
        </div>
      </div>

      {previewType === "Báo giá" && quote ? (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2/70 text-muted">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Hạng mục</th>
                <th className="px-2 py-2">ĐV</th>
                <th className="px-2 py-2 text-right">SL</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l, i) => {
                const line = normalizeLine(l, quote.vat);
                return (
                  <tr key={line.id} className="border-b border-border-soft">
                    <td className="px-2 py-1.5">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{line.name}</div>
                      {line.description ? (
                        <div className="text-muted">{line.description}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">{line.unit}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {line.qty}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatVnd(line.unitPrice)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatVnd(line.qty * line.unitPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-col items-end gap-0.5 border-t border-border px-3 py-2 text-xs">
            <div>
              Chưa VAT: <strong>{formatVnd(quoteSubtotal(quote))}</strong>
            </div>
            <div>
              VAT: <strong>{formatVnd(quoteVat(quote))}</strong>
            </div>
            <div className="text-sm">
              Tổng:{" "}
              <strong className="text-brand-ink">
                {formatVnd(quoteTotal(quote))}
              </strong>
            </div>
          </div>
        </div>
      ) : previewType === "Báo giá" ? (
        <p className="text-center text-muted">
          CT chưa có báo giá — tạo ở menu 4 · Báo giá.
        </p>
      ) : (
        <p className="rounded-[var(--radius-md)] border border-border-soft bg-surface-2/50 px-3 py-4 text-xs text-muted">
          Chứng từ <strong className="text-fg">{previewType}</strong> sẽ điền:
          khách <strong className="text-fg">{project.customer}</strong>, CT{" "}
          <strong className="text-fg">{project.code}</strong>
          {project.contractCode ? `, HĐ ${project.contractCode}` : ""}
          {ar
            ? `, công nợ còn ${formatVnd(ar.value - ar.collected)}`
            : ""}
          .
        </p>
      )}
    </>
  );
}
