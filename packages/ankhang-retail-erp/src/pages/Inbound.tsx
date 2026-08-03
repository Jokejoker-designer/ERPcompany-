import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@retail/components/ui";
import { BarcodeScanner } from "@retail/components/BarcodeScanner";
import {
  computeMap,
  formatVnd,
  toBaseQty,
  type GrnLine,
} from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

export function InboundPage() {
  const products = useRetailStore((s) => s.products);
  const suppliers = useRetailStore((s) => s.suppliers);
  const purchaseOrders = useRetailStore((s) => s.purchaseOrders);
  const grns = useRetailStore((s) => s.grns);
  const postGrn = useRetailStore((s) => s.postGrn);
  const adjustStockByScan = useRetailStore((s) => s.adjustStockByScan);
  const resolveScan = useRetailStore((s) => s.resolveScan);

  const openPos = purchaseOrders.filter(
    (p) => p.status === "ordered" || p.status === "partial",
  );
  const [poId, setPoId] = useState(openPos[0]?.id || "");
  const po = purchaseOrders.find((p) => p.id === poId);

  const [lines, setLines] = useState<
    Record<
      string,
      {
        qtyPurchase: number;
        batchNo: string;
        expiryDate: string;
        unitCost: number;
        qcOk: boolean;
      }
    >
  >({});
  const [scanOpen, setScanOpen] = useState(false);
  const [scanQty, setScanQty] = useState(1);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    if (!po) return;
    const init: typeof lines = {};
    for (const l of po.lines) {
      const p = products.find((x) => x.id === l.productId);
      init[l.productId] = {
        qtyPurchase: l.qty,
        batchNo: `L-${Date.now().toString(36).toUpperCase()}`,
        expiryDate: "2027-06-30",
        unitCost: l.unitCost / (p?.conversion[l.uom] || 1),
        qcOk: true,
      };
    }
    setLines(init);
  }, [poId, po, products]);

  function post() {
    if (!po) return toast.error("Chọn đơn đặt hàng");
    const grnLines: GrnLine[] = [];
    for (const l of po.lines) {
      const row = lines[l.productId];
      if (!row) continue;
      const p = products.find((x) => x.id === l.productId);
      if (!p) continue;
      const qtyBase = toBaseQty(p, row.qtyPurchase, l.uom);
      grnLines.push({
        productId: l.productId,
        qtyPurchase: row.qtyPurchase,
        uom: l.uom,
        qtyBase,
        unitCost: row.unitCost,
        batchNo: row.batchNo,
        expiryDate: row.expiryDate,
        qcOk: row.qcOk,
        varianceNote:
          row.qtyPurchase !== l.qty
            ? `Chênh PO: nhận ${row.qtyPurchase} / đặt ${l.qty}`
            : undefined,
      });
    }
    if (grnLines.some((l) => !l.qcOk)) {
      toast.error("Có dòng QC chưa đạt — bật QC đạt để ghi sổ");
      return;
    }
    const previews = grnLines.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      const newMap = computeMap(p.stock, p.costMap, l.qtyBase, l.unitCost);
      return `${p.sku}: GV ${formatVnd(p.costMap)} → ${formatVnd(newMap)}`;
    });
    const id = postGrn({
      supplierId: po.supplierId,
      poId: po.id,
      lines: grnLines,
    });
    toast.success(`Đã ghi phiếu nhập ${id}`, {
      description: previews.join(" · "),
    });
  }

  function onScanInbound(code: string) {
    const p = resolveScan(code);
    if (!p) {
      toast.error("Không nhận diện được SKU/mã vạch — kiểm tra nhãn QR");
      return;
    }
    // If product is on open PO line, bump qty; else direct stock adjust
    if (po) {
      const line = po.lines.find((l) => l.productId === p.id);
      if (line) {
        setLines((s) => {
          const row = s[p.id] || {
            qtyPurchase: 0,
            batchNo: `L-${Date.now().toString(36).toUpperCase()}`,
            expiryDate: "2027-06-30",
            unitCost: p.costMap,
            qcOk: true,
          };
          return {
            ...s,
            [p.id]: {
              ...row,
              qtyPurchase: row.qtyPurchase + scanQty,
            },
          };
        });
        setLastScan(
          `PO · ${p.sku} · +${scanQty} ${line.uom} · ${p.name}`,
        );
        toast.success(`Đã quét vào phiếu PO: ${p.name}`);
        return;
      }
    }
    const r = adjustStockByScan(code, scanQty, {
      unitCost: p.costMap,
      batchNo: `SCAN-${Date.now().toString(36)}`,
      expiryDate: "2027-12-31",
    });
    if (r.ok) {
      setLastScan(r.message);
      toast.success(r.message);
    } else toast.error(r.message);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>Nhập kho chuẩn hóa:</strong> quét QR/barcode/SKU trên điện
          thoại → đối chiếu đơn đặt hàng → kiểm chất lượng → ghi lô/HSD → cập
          nhật tồn & giá vốn bình quân. Tồn kho bám đúng SKU từ nhập đến bán.
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quét nhập nhanh (camera / súng quét)</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-xs text-muted">
            Số lượng mỗi lần quét
            <Input
              type="number"
              className="mt-1 w-28"
              min={1}
              value={scanQty}
              onChange={(e) => setScanQty(Number(e.target.value) || 1)}
            />
          </label>
          <Button onClick={() => setScanOpen(true)}>
            <Camera className="h-4 w-4" />
            Quét mã nhập kho
          </Button>
          {lastScan ? (
            <div className="flex-1 rounded-[var(--radius-md)] bg-ok-soft/40 px-3 py-2 text-sm text-ok">
              {lastScan}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nhập theo đơn đặt hàng</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">— Chọn đơn đặt hàng —</option>
              {openPos.map((p) => {
                const sup = suppliers.find((s) => s.id === p.supplierId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.code} · {sup?.name} · {p.status}
                  </option>
                );
              })}
            </Select>

            {!po ? (
              <p className="text-sm text-muted">
                Chưa có đơn mở — dùng «Quét nhập nhanh» theo SKU/QR.
              </p>
            ) : (
              <div className="space-y-3">
                {po.lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  const row = lines[l.productId];
                  if (!p || !row) return null;
                  const qtyBase = toBaseQty(p, row.qtyPurchase, l.uom);
                  const newMap = computeMap(
                    p.stock,
                    p.costMap,
                    qtyBase,
                    row.unitCost,
                  );
                  const variance = row.qtyPurchase !== l.qty;
                  return (
                    <div
                      key={l.productId}
                      className={`rounded-[var(--radius-md)] border p-3 ${
                        variance
                          ? "border-danger/40 bg-danger-soft/20"
                          : "border-border"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="font-mono text-[11px] text-muted">
                            SKU {p.sku} · {p.barcode}
                          </div>
                          <div className="text-xs text-muted">
                            Đặt: {l.qty} {l.uom} · tồn {p.stock} {p.baseUom} ·
                            GV {formatVnd(p.costMap)}
                          </div>
                        </div>
                        {variance ? (
                          <Badge variant="danger">Chênh đơn</Badge>
                        ) : (
                          <Badge variant="ok">Khớp đơn</Badge>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs">
                          SL nhận ({l.uom})
                          <Input
                            type="number"
                            className="mt-1"
                            value={row.qtyPurchase}
                            onChange={(e) =>
                              setLines((s) => ({
                                ...s,
                                [l.productId]: {
                                  ...row,
                                  qtyPurchase: Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Giá vốn / {p.baseUom}
                          <Input
                            type="number"
                            className="mt-1"
                            value={row.unitCost}
                            onChange={(e) =>
                              setLines((s) => ({
                                ...s,
                                [l.productId]: {
                                  ...row,
                                  unitCost: Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Số lô
                          <Input
                            className="mt-1"
                            value={row.batchNo}
                            onChange={(e) =>
                              setLines((s) => ({
                                ...s,
                                [l.productId]: {
                                  ...row,
                                  batchNo: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Hạn dùng
                          <Input
                            type="date"
                            className="mt-1"
                            value={row.expiryDate}
                            onChange={(e) =>
                              setLines((s) => ({
                                ...s,
                                [l.productId]: {
                                  ...row,
                                  expiryDate: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={row.qcOk}
                            onChange={(e) =>
                              setLines((s) => ({
                                ...s,
                                [l.productId]: {
                                  ...row,
                                  qcOk: e.target.checked,
                                },
                              }))
                            }
                          />
                          QC đạt
                        </label>
                        <span className="text-muted">
                          → {qtyBase} {p.baseUom} · giá vốn mới{" "}
                          <strong className="text-brand-ink">
                            {formatVnd(newMap)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
                <Button onClick={post}>Hoàn thành nhập kho</Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phiếu nhập đã ghi</CardTitle>
            <Badge variant="brand">{grns.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {!grns.length ? (
              <p className="text-sm text-muted">Chưa có phiếu nhập.</p>
            ) : (
              grns.map((g) => (
                <div
                  key={g.id}
                  className="rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm"
                >
                  <div className="font-semibold">{g.code}</div>
                  <div className="text-xs text-muted">
                    {new Date(g.createdAt).toLocaleString("vi-VN")} ·{" "}
                    {g.lines.length} dòng
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <BarcodeScanner
        open={scanOpen}
        title="Quét mã nhập kho"
        hint="Quét QR nhãn (SKU) hoặc barcode nhà sản xuất để cộng tồn / gắn vào đơn đặt hàng."
        onClose={() => setScanOpen(false)}
        onScan={onScanInbound}
      />
    </div>
  );
}
