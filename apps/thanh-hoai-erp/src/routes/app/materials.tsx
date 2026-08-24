import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/erp/data-table";
import { Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MaterialItem } from "@/data/seed";
import {
  exportMaterialsCsv,
  readMaterialsFile,
} from "@/lib/materials-export";
import { formatVnd } from "@/lib/utils";
import { resolveUserKey } from "@/lib/user-scope";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app/materials")({
  component: MaterialsPage,
});

function MaterialsPage() {
  const materials = useErpStore((s) => s.materials);
  const addMaterial = useErpStore((s) => s.addMaterial);
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const userKey = resolveUserKey(session, user?.username);
  const importRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    unit: "cái",
    unitCost: "",
    stock: "",
    supplier: "",
  });

  const stockValue = useMemo(
    () => materials.reduce((s, m) => s + m.stock * m.unitCost, 0),
    [materials],
  );
  const lowStock = useMemo(
    () => materials.filter((m) => m.stock <= 0).length,
    [materials],
  );

  async function onImportFile(file: File) {
    try {
      const rows = await readMaterialsFile(file);
      if (!rows.length) {
        toast.error("Không đọc được dòng vật tư — dùng CSV hoặc Excel (tab)");
        return;
      }
      for (const r of rows) addMaterial(r);
      toast.success(`Đã nhập ${rows.length} vật tư / tồn kho`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nhập file thất bại");
    }
  }

  function submit() {
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error("Nhập SKU và tên vật tư");
      return;
    }
    addMaterial({
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit: form.unit.trim() || "cái",
      unitCost: Number(form.unitCost) || 0,
      stock: Number(form.stock) || 0,
      supplier: form.supplier.trim() || "—",
      source: "manual",
    });
    setForm({
      sku: "",
      name: "",
      unit: "cái",
      unitCost: "",
      stock: "",
      supplier: "",
    });
    setShowForm(false);
    toast.success("Đã thêm vật tư");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Tổng SKU" value={String(materials.length)} tone="info" />
        <Metric
          label="Giá trị tồn (MAP)"
          value={formatVnd(stockValue)}
          tone="ok"
        />
        <Metric
          label="Tồn = 0"
          value={String(lowStock)}
          tone={lowStock ? "danger" : "ok"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          Thêm vật tư
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => exportMaterialsCsv(materials)}
        >
          <Download className="h-3.5 w-3.5" />
          Xuất Excel/CSV
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => importRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Nhập Excel/CSV
        </Button>
        <Badge variant="info">Ctrl+V từ Excel · cột SKU, tên, ĐV, giá, tồn, NCC</Badge>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Vật tư mới</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              placeholder="SKU *"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            />
            <Input
              placeholder="Tên hàng *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder="Đơn vị"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
            <Input
              type="number"
              placeholder="Giá vốn"
              value={form.unitCost}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitCost: e.target.value }))
              }
            />
            <Input
              type="number"
              placeholder="Tồn kho"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            />
            <Input
              placeholder="NCC"
              value={form.supplier}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplier: e.target.value }))
              }
            />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button onClick={submit}>Lưu</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Hủy
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <DataTable<MaterialItem>
        rows={materials}
        rowKey={(m) => m.id}
        tableId="materials"
        userKey={userKey}
        searchKeys={[
          (m) => m.sku,
          (m) => m.name,
          (m) => m.supplier,
          (m) => m.unit,
        ]}
        searchPlaceholder="Lọc SKU, tên, NCC…"
        facets={[
          {
            id: "stock",
            options: [
              { value: "all", label: "Mọi tồn" },
              { value: "zero", label: "Tồn = 0" },
              { value: "ok", label: "Có tồn" },
            ],
            match: (m, v) => {
              if (v === "all") return true;
              return v === "zero" ? m.stock <= 0 : m.stock > 0;
            },
          },
        ]}
        columns={[
          {
            id: "sku",
            header: "SKU",
            sortValue: (m) => m.sku,
            cell: (m) => (
              <code className="text-xs font-bold text-brand-ink">{m.sku}</code>
            ),
          },
          {
            id: "name",
            header: "Tên",
            sortValue: (m) => m.name,
            cell: (m) => <span className="font-medium">{m.name}</span>,
          },
          {
            id: "unit",
            header: "ĐV",
            sortValue: (m) => m.unit,
            cell: (m) => m.unit,
          },
          {
            id: "cost",
            header: "Giá vốn",
            sortValue: (m) => m.unitCost,
            cell: (m) => (
              <span className="tabular-nums">{formatVnd(m.unitCost)}</span>
            ),
          },
          {
            id: "stock",
            header: "Tồn",
            sortValue: (m) => m.stock,
            cell: (m) => (
              <Badge variant={m.stock <= 0 ? "danger" : "ok"}>
                {m.stock}
              </Badge>
            ),
          },
          {
            id: "supplier",
            header: "NCC",
            sortValue: (m) => m.supplier,
            cell: (m) => <span className="text-muted">{m.supplier}</span>,
            hideOnMobile: true,
          },
        ]}
      />
    </div>
  );
}
