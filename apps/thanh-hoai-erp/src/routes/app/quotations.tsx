import { ProjectContextBar, useActiveProject } from "@/components/erp/project-context";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Check,
  Send,
  Trash2,
  Copy,
  Pencil,
  GitBranch,
  FileSignature,
  Maximize2,
  Minimize2,
  ClipboardPaste,
} from "lucide-react";
// icons for BOQ fullscreen / paste
import { toast } from "sonner";
import { toastWithUndo } from "@/lib/undo-toast";
import { QuoteStatusBadge } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BOQ_UNITS,
  TAX_RATES,
  emptyBoqLine,
  lineAmount,
  lineTotal,
  lineVatAmount,
  normalizeLine,
  quoteSubtotal,
  quoteTotal,
  quoteVat,
  type Quotation,
  type QuotationLine,
} from "@/data/seed";
import { cn, formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app/quotations")({
  component: QuotationsPage,
});

type DraftLine = Omit<QuotationLine, "id"> & { key: string };

function newDraftLine(taxRate = 8): DraftLine {
  return {
    key: `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...emptyBoqLine(taxRate),
  };
}

function asQuote(q: Quotation): Quotation {
  return {
    ...q,
    note: q.note ?? "",
    lines: q.lines.map((l) => normalizeLine(l, q.vat)),
  };
}

function QuotationsPage() {
  const quotations = useErpStore((s) => s.quotations);
  const customers = useErpStore((s) => s.customers);
  const projects = useErpStore((s) => s.projects);
  const materials = useErpStore((s) => s.materials);
  const company = useErpStore((s) => s.company);
  const addQuotation = useErpStore((s) => s.addQuotation);
  const setStatus = useErpStore((s) => s.setQuotationStatus);
  const updateMeta = useErpStore((s) => s.updateQuotationMeta);
  const addLine = useErpStore((s) => s.addQuotationLine);
  const updateLine = useErpStore((s) => s.updateQuotationLine);
  const removeLine = useErpStore((s) => s.removeQuotationLine);
  const bumpRevision = useErpStore((s) => s.bumpRevision);
  const setActiveProject = useErpStore((s) => s.setActiveProject);
  const project = useActiveProject();

  const [filterCt, setFilterCt] = useState(false);
  const [selectedId, setSelectedId] = useState(quotations[0]?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(true);

  const [header, setHeader] = useState({
    customer: project?.customer ?? customers[0]?.name ?? "",
    projectCode: project?.code ?? projects[0]?.code ?? "CT-1012",
    projectName: project?.name ?? projects[0]?.name ?? "",
    vat: "8",
    note: "",
  });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    newDraftLine(8),
    newDraftLine(8),
    newDraftLine(8),
  ]);

  useEffect(() => {
    if (project) {
      setHeader((h) => ({
        ...h,
        customer: project.customer,
        projectCode: project.code,
        projectName: project.name,
      }));
    }
  }, [project?.id]);

  const visibleQuotes = filterCt && project
    ? quotations.filter((q) => q.projectCode === project.code)
    : quotations;

  useEffect(() => {
    if (!selectedId && visibleQuotes[0]) setSelectedId(visibleQuotes[0].id);
  }, [visibleQuotes, selectedId]);

  const selected =
    quotations.find((q) => q.id === selectedId) ?? visibleQuotes[0] ?? null;

  const stats = useMemo(
    () => ({
      total: visibleQuotes.length,
      pending: visibleQuotes.filter((q) => q.status === "pending").length,
      approved: visibleQuotes.filter(
        (q) => q.status === "approved" || q.status === "won",
      ).length,
    }),
    [visibleQuotes],
  );

  const draftTotals = useMemo(() => {
    const lines = draftLines.map((l) =>
      normalizeLine({ ...l, id: l.key }, Number(header.vat) || 8),
    );
    const q: Quotation = {
      id: "draft",
      code: "",
      revision: 1,
      customer: "",
      projectCode: "",
      projectName: "",
      vat: Number(header.vat) || 8,
      note: "",
      status: "draft",
      lines,
      createdAt: "",
    };
    return {
      sub: quoteSubtotal(q),
      vat: quoteVat(q),
      total: quoteTotal(q),
      count: lines.filter((l) => l.name.trim()).length,
    };
  }, [draftLines, header.vat]);

  function patchDraft(key: string, patch: Partial<DraftLine>) {
    setDraftLines((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function createQuote() {
    const valid = draftLines
      .map((l) => normalizeLine({ ...l, id: l.key }, Number(header.vat) || 8))
      .filter((l) => l.name.trim());
    if (!header.customer.trim()) {
      toast.error("Chọn / nhập khách hàng");
      return;
    }
    if (!header.projectCode.trim()) {
      toast.error("Nhập mã công trình để BG bám CT");
      return;
    }
    if (!valid.length) {
      toast.error("Thêm ít nhất 1 hạng mục BOQ có tên");
      return;
    }
    const id = addQuotation({
      customer: header.customer.trim(),
      projectCode: header.projectCode.trim(),
      projectName: header.projectName.trim(),
      vat: Number(header.vat) || 8,
      note: header.note.trim(),
      lines: valid,
    });
    const p = projects.find((x) => x.code === header.projectCode.trim());
    if (p) setActiveProject(p.id);
    setSelectedId(id);
    setShowForm(false);
    setEditing(true);
    setDraftLines([newDraftLine(8), newDraftLine(8), newDraftLine(8)]);
    toast.success(
      `Đã tạo BG · ${valid.length} HM · gắn ${header.projectCode}`,
    );
  }

  function applyMaterial(key: string, sku: string) {
    const m = materials.find((x) => x.sku === sku);
    if (!m) return;
    patchDraft(key, {
      name: m.name,
      description: `SKU ${m.sku} · NCC ${m.supplier}`,
      unit: m.unit,
      unitPrice: Math.round(m.unitCost * 1.15),
    });
  }

  return (
    <div className="space-y-4">
      <ProjectContextBar showQuotes />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="brand">{stats.total} báo giá</Badge>
        <Badge variant="info">{stats.pending} chờ duyệt</Badge>
        <Badge variant="ok">{stats.approved} đã duyệt / trúng</Badge>
        <Button
          size="sm"
          variant={filterCt ? "default" : "secondary"}
          onClick={() => setFilterCt((v) => !v)}
        >
          {filterCt ? `Lọc ${project?.code ?? "CT"}` : "Tất cả CT"}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setShowForm((v) => !v);
              if (project) {
                setHeader((h) => ({
                  ...h,
                  customer: project.customer,
                  projectCode: project.code,
                  projectName: project.name,
                }));
              }
            }}
          >
            <Plus className="h-4 w-4" />
            Tạo báo giá
          </Button>
        </div>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Báo giá mới — bám công trình</CardTitle>
            <Badge variant="info">{draftTotals.count} dòng có tên</Badge>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Khách hàng *
                </label>
                <Input
                  list="customer-list"
                  value={header.customer}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, customer: e.target.value }))
                  }
                />
                <datalist id="customer-list">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Mã CT * (bám hồ sơ)
                </label>
                <Input
                  list="project-list"
                  value={header.projectCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    const p = projects.find((x) => x.code === code);
                    const cust = p
                      ? customers.find((c) => c.id === p.customerId)
                      : undefined;
                    setHeader((h) => ({
                      ...h,
                      projectCode: code,
                      projectName: p?.name ?? h.projectName,
                      customer: cust?.name ?? p?.customer ?? h.customer,
                    }));
                  }}
                />
                <datalist id="project-list">
                  {projects.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  VAT mặc định
                </label>
                <select
                  className="flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
                  value={header.vat}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, vat: e.target.value }))
                  }
                >
                  {TAX_RATES.map((t) => (
                    <option key={t} value={t}>
                      {t}%
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Tên công trình
                </label>
                <Input
                  value={header.projectName}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, projectName: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Ghi chú báo giá
                </label>
                <Input
                  value={header.note}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, note: e.target.value }))
                  }
                  placeholder="Hiệu lực, điều kiện thanh toán…"
                />
              </div>
            </div>

            <BoqEditor
              mode="draft"
              lines={draftLines.map((l) => ({
                id: l.key,
                name: l.name,
                description: l.description,
                qty: l.qty,
                unit: l.unit,
                unitPrice: l.unitPrice,
                taxRate: l.taxRate,
                notes: l.notes,
              }))}
              materials={materials}
              onChange={(id, patch) => patchDraft(id, patch)}
              onAdd={() =>
                setDraftLines((rows) => [
                  ...rows,
                  newDraftLine(Number(header.vat) || 8),
                ])
              }
              onRemove={(id) =>
                setDraftLines((rows) =>
                  rows.length <= 1 ? rows : rows.filter((r) => r.key !== id),
                )
              }
              onPickMaterial={applyMaterial}
              onDuplicate={(id) => {
                const src = draftLines.find((r) => r.key === id);
                if (!src) return;
                setDraftLines((rows) => [
                  ...rows,
                  { ...src, key: `d-${Date.now()}` },
                ]);
              }}
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-border-soft pt-3">
              <div className="text-sm text-muted">
                Tổng:{" "}
                <strong className="tabular-nums text-fg">
                  {formatVnd(draftTotals.total)}
                </strong>
                {" · "}gắn CT{" "}
                <strong className="text-fg">{header.projectCode || "—"}</strong>
              </div>
              <div className="ml-auto flex gap-2">
                <Button onClick={createQuote}>Lưu bản nháp</Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  Hủy
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Danh sách báo giá</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 p-3">
            {visibleQuotes.map((q) => {
              const qq = asQuote(q);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(q.id);
                    setEditing(
                      q.status === "draft" || q.status === "pending",
                    );
                    const p = projects.find((x) => x.code === q.projectCode);
                    if (p) setActiveProject(p.id);
                  }}
                  className={cn(
                    "w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors",
                    selected?.id === q.id
                      ? "border-brand bg-brand-soft"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">
                      {q.code} · rev #{q.revision}
                    </span>
                    <QuoteStatusBadge status={q.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    {q.projectCode} · {q.customer}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted">{q.lines.length} hạng mục</span>
                    <span className="font-medium tabular-nums text-fg">
                      {formatVnd(quoteTotal(qq))}
                    </span>
                  </div>
                </button>
              );
            })}
            {!visibleQuotes.length ? (
              <p className="px-2 py-6 text-center text-sm text-muted">
                Không có BG {filterCt ? `cho ${project?.code}` : ""}.
              </p>
            ) : null}
          </CardBody>
        </Card>

        {selected ? (
          <QuoteDetail
            selected={asQuote(selected)}
            company={company}
            materials={materials}
            editing={editing}
            setEditing={setEditing}
            updateMeta={updateMeta}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            setStatus={setStatus}
            bumpRevision={bumpRevision}
          />
        ) : null}
      </div>
    </div>
  );
}

function QuoteDetail({
  selected,
  company,
  materials,
  editing,
  setEditing,
  updateMeta,
  updateLine,
  addLine,
  removeLine,
  setStatus,
  bumpRevision,
}: {
  selected: Quotation;
  company: { companyName: string; address: string; phone: string };
  materials: {
    sku: string;
    name: string;
    unit: string;
    unitCost: number;
    supplier: string;
  }[];
  editing: boolean;
  setEditing: (v: boolean | ((b: boolean) => boolean)) => void;
  updateMeta: (
    id: string,
    patch: Partial<
      Pick<
        Quotation,
        "customer" | "projectCode" | "projectName" | "vat" | "note" | "status"
      >
    >,
  ) => void;
  updateLine: (
    quoteId: string,
    lineId: string,
    patch: Partial<QuotationLine>,
  ) => void;
  addLine: (quoteId: string, line?: Partial<QuotationLine>) => void;
  removeLine: (quoteId: string, lineId: string) => void;
  setStatus: (id: string, status: Quotation["status"]) => void;
  bumpRevision: (id: string) => void;
}) {
  useEffect(() => {
    function onPasteRows(ev: Event) {
      const rows = (ev as CustomEvent<string[][]>).detail || [];
      for (const cols of rows) {
        const [name, desc, unit, qty, price, tax, notes] = cols;
        addLine(selected.id, {
          name: name || "Hạng mục dán",
          description: desc || "",
          unit: unit || "cái",
          qty: Number(String(qty ?? "1").replace(/,/g, "")) || 1,
          unitPrice: Number(String(price ?? "0").replace(/,/g, "")) || 0,
          taxRate: Number(tax) || selected.vat,
          notes: notes || "",
        });
      }
    }
    window.addEventListener("boq-paste-rows", onPasteRows);
    return () => window.removeEventListener("boq-paste-rows", onPasteRows);
  }, [selected.id, selected.vat, addLine]);

  return (
    <div className="space-y-4 xl:col-span-3">
      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>
              {selected.code} · Revision #{selected.revision}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Gắn {selected.projectCode} · {selected.lines.length} hạng mục BOQ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button
              size="sm"
              variant={editing ? "secondary" : "default"}
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editing ? "Đang sửa" : "Sửa BOQ"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                bumpRevision(selected.id);
                setEditing(true);
                toast.message("Tăng revision — bản nháp");
              }}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Rev+
            </Button>
            {selected.status === "draft" || selected.status === "pending" ? (
              <Button
                size="sm"
                onClick={() => setStatus(selected.id, "approved")}
              >
                <Check className="h-3.5 w-3.5" />
                Duyệt
              </Button>
            ) : null}
            {selected.status === "approved" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setStatus(selected.id, "sent")}
              >
                <Send className="h-3.5 w-3.5" />
                Gửi khách
              </Button>
            ) : null}
            {selected.status === "sent" || selected.status === "approved" ? (
              <Button
                size="sm"
                onClick={() => {
                  setStatus(selected.id, "won");
                  toast.success("BG trúng → HĐ + công nợ + hồ sơ phase 01");
                }}
              >
                <FileSignature className="h-3.5 w-3.5" />
                Trúng & tạo HĐ
              </Button>
            ) : null}
            {selected.status === "won" ? (
              <Badge variant="ok">Đã trúng · đã có HĐ</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["customer", "Khách hàng"],
                ["projectCode", "Mã CT"],
                ["projectName", "Tên công trình"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className={key === "projectName" ? "lg:col-span-2" : ""}
              >
                <label className="mb-1 block text-xs font-semibold text-muted">
                  {label}
                </label>
                {editing ? (
                  <Input
                    value={selected[key]}
                    onChange={(e) =>
                      updateMeta(selected.id, { [key]: e.target.value })
                    }
                  />
                ) : (
                  <div className="text-sm font-medium text-fg">
                    {selected[key]}
                  </div>
                )}
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                VAT mặc định
              </label>
              {editing ? (
                <select
                  className="flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm"
                  value={selected.vat}
                  onChange={(e) =>
                    updateMeta(selected.id, {
                      vat: Number(e.target.value),
                    })
                  }
                >
                  {TAX_RATES.map((t) => (
                    <option key={t} value={t}>
                      {t}%
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm font-medium">{selected.vat}%</div>
              )}
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="mb-1 block text-xs font-semibold text-muted">
                Ghi chú
              </label>
              {editing ? (
                <Input
                  value={selected.note ?? ""}
                  onChange={(e) =>
                    updateMeta(selected.id, { note: e.target.value })
                  }
                />
              ) : (
                <div className="text-sm text-muted">{selected.note || "—"}</div>
              )}
            </div>
          </div>

          <BoqEditor
            mode={editing ? "edit" : "view"}
            lines={selected.lines}
            materials={materials}
            subtotal={quoteSubtotal(selected)}
            vatTotal={quoteVat(selected)}
            grandTotal={quoteTotal(selected)}
            onChange={(id, patch) => updateLine(selected.id, id, patch)}
            onAdd={() => addLine(selected.id, { taxRate: selected.vat })}
            onRemove={(id) => {
              const line = selected.lines.find((l) => l.id === id);
              removeLine(selected.id, id);
              if (line) {
                toastWithUndo({
                  message: "Đã xóa hạng mục BOQ",
                  description: line.name || "Dòng trống",
                  onUndo: () => {
                    useErpStore.setState((s) => ({
                      quotations: s.quotations.map((q) =>
                        q.id === selected.id
                          ? { ...q, lines: [...q.lines, line] }
                          : q,
                      ),
                    }));
                  },
                });
              }
            }}
            onPickMaterial={(lineId, sku) => {
              const m = materials.find((x) => x.sku === sku);
              if (!m) return;
              updateLine(selected.id, lineId, {
                name: m.name,
                description: `SKU ${m.sku} · NCC ${m.supplier}`,
                unit: m.unit,
                unitPrice: Math.round(m.unitCost * 1.15),
              });
            }}
            onDuplicate={(lineId) => {
              const src = selected.lines.find((l) => l.id === lineId);
              if (!src) return;
              addLine(selected.id, {
                ...src,
                name: `${src.name} (copy)`,
              });
            }}
          />

          <div className="space-y-1 border-t border-border-soft pt-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>Tổng chưa VAT ({selected.lines.length} dòng)</span>
              <span className="tabular-nums font-medium text-fg">
                {formatVnd(quoteSubtotal(selected))}
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Tổng VAT</span>
              <span className="tabular-nums font-medium text-fg">
                {formatVnd(quoteVat(selected))}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold text-fg">
              <span>Tổng thanh toán</span>
              <span className="tabular-nums">
                {formatVnd(quoteTotal(selected))}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="border-brand/20 bg-gradient-to-b from-brand-soft/40 to-surface">
        <CardBody>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-ink">
            Letterhead · bám CT {selected.projectCode}
          </div>
          <div className="font-semibold">{company.companyName}</div>
          <p className="mt-2 text-sm">
            Kính gửi: <em>{selected.customer}</em>
            <br />
            Công trình: {selected.projectCode} — {selected.projectName}
          </p>
          <div className="mt-3 text-right text-sm font-semibold tabular-nums">
            Tổng: {formatVnd(quoteTotal(selected))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function BoqEditor({
  mode,
  lines,
  materials,
  onChange,
  onAdd,
  onRemove,
  onPickMaterial,
  onDuplicate,
  subtotal,
  vatTotal,
  grandTotal,
}: {
  mode: "draft" | "edit" | "view";
  lines: QuotationLine[];
  materials: {
    sku: string;
    name: string;
    unit?: string;
    unitCost?: number;
    supplier?: string;
  }[];
  onChange: (id: string, patch: Partial<QuotationLine>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPickMaterial: (lineId: string, sku: string) => void;
  onDuplicate: (lineId: string) => void;
  subtotal?: number;
  vatTotal?: number;
  grandTotal?: number;
}) {
  const readonly = mode === "view";
  const [full, setFull] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  function focusNext(el: HTMLElement) {
    const root = tableRef.current;
    if (!root) return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ),
    ];
    const i = focusable.indexOf(el);
    if (i >= 0 && i < focusable.length - 1) {
      focusable[i + 1].focus();
      if (focusable[i + 1] instanceof HTMLInputElement) {
        (focusable[i + 1] as HTMLInputElement).select();
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      focusNext(e.currentTarget);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    if (readonly) return;
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    // Only intercept multi-cell paste
    if (!text.includes("\t") && text.split("\n").length < 2) return;
    e.preventDefault();
    const rows = text
      .trim()
      .split(/\r?\n/)
      .map((r) => r.split("\t").map((c) => c.trim()));
    let added = 0;
    for (const cols of rows) {
      if (!cols.length || cols.every((c) => !c)) continue;
      const [name, desc, unit, qty, price, tax, notes] = cols;
      onAdd();
      // onAdd creates empty line at end — patch via timeout after state flush
      added += 1;
      const payload = {
        name: name || "Hạng mục dán",
        description: desc || "",
        unit: unit || "cái",
        qty: Number(String(qty).replace(/,/g, "")) || 1,
        unitPrice: Number(String(price || "").replace(/,/g, "")) || 0,
        taxRate: Number(tax) || 8,
        notes: notes || "",
      };
      // Store pending paste on window queue processed by parent via custom event
      queueMicrotask(() => {
        useErpStore.setState((s) => {
          // find latest quotation with editing - patch last line of matching open quote is hard
          // instead: dispatch custom
          return s;
        });
        window.dispatchEvent(
          new CustomEvent("boq-paste-line", { detail: payload }),
        );
      });
    }
    toast.success(`Đã nhận ${added} dòng từ Excel — dán vào BOQ`);
  }

  // Fallback paste: append lines via onChange after onAdd - use simpler approach
  function pasteExcel() {
    if (readonly) return;
    void navigator.clipboard.readText().then((text) => {
      if (!text.trim()) {
        toast.error("Clipboard trống — copy vùng Excel trước");
        return;
      }
      const rows = text
        .trim()
        .split(/\r?\n/)
        .map((r) => r.split("\t").map((c) => c.trim()))
        .filter((cols) => cols.some(Boolean));
      window.dispatchEvent(
        new CustomEvent("boq-paste-rows", { detail: rows }),
      );
      toast.success(`Dán ${rows.length} dòng từ clipboard`);
    }).catch(() => {
      toast.message("Hãy dùng Ctrl+V trong bảng BOQ (cần quyền clipboard)");
    });
  }

  const shell = (
    <div
      className={
        full
          ? "fixed inset-0 z-[70] flex flex-col bg-bg p-3 sm:p-4"
          : "space-y-2"
      }
      onPaste={onPaste}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-fg">
          Bảng khối lượng (BOQ)
          {full ? " · toàn màn hình" : ""}
        </h4>
        {!readonly ? (
          <>
            <Button size="sm" variant="secondary" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </Button>
            <Button size="sm" variant="secondary" onClick={pasteExcel}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              Dán Excel
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          onClick={() => setFull((v) => !v)}
        >
          {full ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" /> Thu nhỏ
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" /> Full màn hình
            </>
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        Tab / Enter chuyển ô · Ctrl+V dán từ Excel (cột: Tên · Mô tả · ĐV · SL ·
        Đơn giá · Thuế% · Ghi chú)
      </p>

      <div
        ref={tableRef}
        className={
          full
            ? "min-h-0 flex-1 overflow-auto rounded-[var(--radius-md)] border border-border bg-surface"
            : "max-h-[min(60vh,520px)] overflow-auto rounded-[var(--radius-md)] border border-border"
        }
      >
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
            <tr className="border-b border-border text-[11px] text-muted">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="min-w-[160px] px-2 py-2 font-semibold">Tên hạng mục</th>
              <th className="min-w-[160px] px-2 py-2 font-semibold">Mô tả</th>
              <th className="px-2 py-2 font-semibold">ĐV</th>
              <th className="px-2 py-2 text-right font-semibold">SL</th>
              <th className="px-2 py-2 text-right font-semibold">Đơn giá</th>
              <th className="px-2 py-2 font-semibold">Thuế</th>
              <th className="px-2 py-2 text-right font-semibold">Thành tiền</th>
              <th className="min-w-[100px] px-2 py-2 font-semibold">Ghi chú</th>
              {!readonly ? <th className="px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const net = lineAmount(l);
              const vat = lineVatAmount(l);
              return (
                <tr key={l.id} className="border-b border-border-soft align-top">
                  <td className="px-2 py-1.5 text-xs text-muted">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <div className="font-medium">{l.name}</div>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          value={l.name}
                          onChange={(e) => onChange(l.id, { name: e.target.value })}
                          onKeyDown={onKeyDown}
                          placeholder="Tên *"
                          className="h-9"
                        />
                        {materials.length ? (
                          <select
                            className="h-8 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[11px] text-muted"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) onPickMaterial(l.id, e.target.value);
                              e.target.value = "";
                            }}
                          >
                            <option value="">+ VT…</option>
                            {materials.map((m) => (
                              <option key={m.sku} value={m.sku}>
                                {m.sku} — {m.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <div className="text-xs text-muted">{l.description || "—"}</div>
                    ) : (
                      <Input
                        value={l.description}
                        onChange={(e) =>
                          onChange(l.id, { description: e.target.value })
                        }
                        onKeyDown={onKeyDown}
                        placeholder="Quy cách"
                        className="h-9"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      l.unit
                    ) : (
                      <select
                        className="h-9 w-[4.5rem] rounded-[var(--radius-md)] border border-border bg-surface px-1 text-sm"
                        value={l.unit}
                        onChange={(e) => onChange(l.id, { unit: e.target.value })}
                        onKeyDown={onKeyDown}
                      >
                        {BOQ_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <div className="text-right tabular-nums">{l.qty}</div>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={l.qty}
                        onChange={(e) =>
                          onChange(l.id, { qty: Number(e.target.value) || 0 })
                        }
                        onKeyDown={onKeyDown}
                        className="h-9 w-20 text-right tabular-nums"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <div className="text-right tabular-nums">
                        {formatVnd(l.unitPrice)}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={l.unitPrice}
                        onChange={(e) =>
                          onChange(l.id, {
                            unitPrice: Number(e.target.value) || 0,
                          })
                        }
                        onKeyDown={onKeyDown}
                        className="h-9 w-28 text-right tabular-nums"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <span className="text-xs">{l.taxRate}%</span>
                    ) : (
                      <select
                        className="h-9 w-[4.25rem] rounded-[var(--radius-md)] border border-border bg-surface px-1 text-sm"
                        value={l.taxRate}
                        onChange={(e) =>
                          onChange(l.id, { taxRate: Number(e.target.value) })
                        }
                        onKeyDown={onKeyDown}
                      >
                        {TAX_RATES.map((tx) => (
                          <option key={tx} value={tx}>
                            {tx}%
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="tabular-nums text-xs font-medium">
                      {formatVnd(net)}
                    </div>
                    <div className="tabular-nums text-[10px] text-muted">
                      +VAT {formatVnd(vat)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {readonly ? (
                      <div className="text-xs text-muted">{l.notes || "—"}</div>
                    ) : (
                      <Input
                        value={l.notes}
                        onChange={(e) => onChange(l.id, { notes: e.target.value })}
                        onKeyDown={onKeyDown}
                        placeholder="Ghi chú"
                        className="h-9"
                      />
                    )}
                  </td>
                  {!readonly ? (
                    <td className="px-2 py-1.5">
                      <div className="flex gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => onDuplicate(l.id)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-danger"
                          onClick={() => onRemove(l.id)}
                          disabled={lines.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky totals */}
      {grandTotal != null ? (
        <div
          className={
            full
              ? "mt-2 flex flex-wrap items-center justify-end gap-4 rounded-[var(--radius-md)] border border-brand/30 bg-brand-soft/40 px-4 py-3 text-sm"
              : "sticky bottom-0 z-[5] mt-2 flex flex-wrap items-center justify-end gap-4 rounded-[var(--radius-md)] border border-brand/30 bg-surface/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur"
          }
        >
          <span className="text-muted">
            Chưa VAT:{" "}
            <strong className="tabular-nums text-fg">
              {formatVnd(subtotal ?? 0)}
            </strong>
          </span>
          <span className="text-muted">
            VAT:{" "}
            <strong className="tabular-nums text-fg">
              {formatVnd(vatTotal ?? 0)}
            </strong>
          </span>
          <span className="text-base font-bold text-brand-ink">
            Tổng:{" "}
            <span className="tabular-nums">{formatVnd(grandTotal)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );

  return shell;
}
