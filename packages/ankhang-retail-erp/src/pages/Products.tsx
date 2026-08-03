import { useMemo, useState } from "react";
import { Camera, Plus, QrCode, Search } from "lucide-react";
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
import { ProductQrPrint } from "@retail/components/ProductQrPrint";
import { formatQty, formatVnd, type Product } from "@retail/data/retail";
import { findProductByScan } from "@retail/lib/product-code";
import { useRetailStore } from "@retail/store/retail-store";

export function ProductsPage() {
  const products = useRetailStore((s) => s.products);
  const categories = useRetailStore((s) => s.categories);
  const addProduct = useRetailStore((s) => s.addProduct);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"lookup" | "import">("lookup");
  const [printProduct, setPrintProduct] = useState<Product | null>(null);
  const [importForm, setImportForm] = useState({
    barcode: "",
    sku: "",
    name: "",
    price: "",
    cost: "",
  });

  const list = useMemo(() => {
    return products.filter((p) => {
      if (cat !== "all" && p.categoryId !== cat) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        p.barcode.includes(s)
      );
    });
  }, [products, q, cat]);

  function quickAdd() {
    const n = products.length + 1;
    const id = addProduct({
      sku: `SKU-${1000 + n}`,
      name: `Sản phẩm mới ${n}`,
      categoryId: categories[0]?.id || "cat-fmcg",
      barcode: `8900000${String(n).padStart(5, "0")}`,
      baseUom: "Cái",
      purchaseUom: "Thùng",
      salesUoms: ["Cái", "Thùng"],
      conversion: { Cái: 1, Thùng: 12 },
      costMap: 10000,
      price: 15000,
      stock: 0,
      minStock: 10,
      abc: "C",
      trackLot: false,
      trackExpiry: false,
      active: true,
    });
    toast.success("Đã thêm SKU — hãy in QR nhãn");
    const p = useRetailStore.getState().products.find((x) => x.id === id);
    if (p) setPrintProduct(p);
  }

  function onScan(code: string) {
    if (scanMode === "lookup") {
      const p = findProductByScan(products, code);
      if (p) {
        setQ(p.sku);
        toast.success(`Đã nhận diện: ${p.name} · SKU ${p.sku}`);
        setPrintProduct(p);
      } else {
        toast.message("Chưa có trong danh mục — chuyển sang nhập mới");
        setImportForm((f) => ({
          ...f,
          barcode: code.startsWith("{") ? "" : code.includes("|") ? code.split("|")[2] || code : code,
          sku: code.includes("|") ? code.split("|")[1] || "" : f.sku,
        }));
        setScanMode("import");
      }
      return;
    }
    // import mode: fill barcode/sku
    if (code.startsWith("{")) {
      try {
        const j = JSON.parse(code) as { sku?: string; barcode?: string; name?: string };
        setImportForm((f) => ({
          ...f,
          sku: j.sku || f.sku,
          barcode: j.barcode || f.barcode,
          name: j.name || f.name,
        }));
      } catch {
        setImportForm((f) => ({ ...f, barcode: code }));
      }
    } else if (code.startsWith("AK|")) {
      const [, sku, bar] = code.split("|");
      setImportForm((f) => ({
        ...f,
        sku: sku || f.sku,
        barcode: bar || f.barcode,
      }));
    } else {
      setImportForm((f) => ({ ...f, barcode: code }));
    }
    toast.success("Đã gắn mã vào form nhập hàng");
  }

  function saveImport() {
    if (!importForm.name.trim()) {
      toast.error("Nhập tên hàng hóa");
      return;
    }
    const n = products.length + 1;
    const id = addProduct({
      sku: importForm.sku.trim() || `SKU-${1000 + n}`,
      name: importForm.name.trim(),
      categoryId: categories[0]?.id || "cat-fmcg",
      barcode:
        importForm.barcode.trim() ||
        `890${String(Date.now()).slice(-10)}`,
      baseUom: "Cái",
      purchaseUom: "Thùng",
      salesUoms: ["Cái", "Thùng"],
      conversion: { Cái: 1, Thùng: 12 },
      costMap: Number(importForm.cost) || 10000,
      price: Number(importForm.price) || 15000,
      stock: 0,
      minStock: 10,
      abc: "C",
      trackLot: true,
      trackExpiry: false,
      active: true,
    });
    toast.success("Đã tạo mặt hàng — in QR để dán kệ / kiểm tồn");
    setImportForm({ barcode: "", sku: "", name: "", price: "", cost: "" });
    const p = useRetailStore.getState().products.find((x) => x.id === id);
    if (p) setPrintProduct(p);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>Dữ liệu gốc · SKU + mã vạch + QR:</strong> mỗi mặt hàng có SKU
          (nội bộ) và barcode (nhà SX). In QR nhãn để quét khi nhập kho / bán
          hàng / kiểm tồn. Camera điện thoại hỗ trợ quét.
        </CardBody>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Tìm SKU / tên / barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="sm:w-48"
        >
          <option value="all">Tất cả nhóm</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setScanMode("lookup");
            setScanOpen(true);
          }}
        >
          <Camera className="h-3.5 w-3.5" />
          Quét tra cứu
        </Button>
        <Button size="sm" onClick={quickAdd}>
          <Plus className="h-3.5 w-3.5" />
          Thêm SKU
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nhập hàng mới bằng quét mã</CardTitle>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setScanMode("import");
              setScanOpen(true);
            }}
          >
            <Camera className="h-3.5 w-3.5" />
            Quét mã nhà SX
          </Button>
        </CardHeader>
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-muted">
            Mã vạch
            <Input
              className="mt-1 font-mono"
              value={importForm.barcode}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, barcode: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-muted">
            SKU (mã nội bộ)
            <Input
              className="mt-1 font-mono"
              value={importForm.sku}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, sku: e.target.value }))
              }
              placeholder="Tự sinh nếu trống"
            />
          </label>
          <label className="text-xs text-muted sm:col-span-2 lg:col-span-1">
            Tên hàng hóa
            <Input
              className="mt-1"
              value={importForm.name}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-muted">
            Giá bán (₫)
            <Input
              type="number"
              className="mt-1"
              value={importForm.price}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, price: e.target.value }))
              }
            />
          </label>
          <label className="text-xs text-muted">
            Giá vốn (₫)
            <Input
              type="number"
              className="mt-1"
              value={importForm.cost}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, cost: e.target.value }))
              }
            />
          </label>
          <div className="flex items-end">
            <Button onClick={saveImport}>Lưu & in QR</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh mục hàng hóa</CardTitle>
          <Badge variant="brand">{list.length} SKU</Badge>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/70 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">SKU / Barcode</th>
                <th className="px-3 py-2.5 font-semibold">Tên</th>
                <th className="px-3 py-2.5 font-semibold">ĐVT</th>
                <th className="px-3 py-2.5 text-right font-semibold">Giá vốn</th>
                <th className="px-3 py-2.5 text-right font-semibold">Giá bán</th>
                <th className="px-3 py-2.5 text-right font-semibold">Tồn</th>
                <th className="px-3 py-2.5 font-semibold">ABC</th>
                <th className="px-3 py-2.5 font-semibold">QR</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const catName =
                  categories.find((c) => c.id === p.categoryId)?.name || "";
                return (
                  <tr key={p.id} className="border-b border-border-soft">
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs font-semibold">
                        {p.sku}
                      </div>
                      <div className="font-mono text-[10px] text-muted">
                        {p.barcode}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted">{catName}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      Base: <strong>{p.baseUom}</strong>
                      <br />
                      Mua: {p.purchaseUom}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatVnd(p.costMap)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatVnd(p.price)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          p.stock <= p.minStock
                            ? "font-semibold text-danger"
                            : "tabular-nums"
                        }
                      >
                        {formatQty(p.stock)}
                      </span>
                      <div className="text-[10px] text-muted">{p.baseUom}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={
                          p.abc === "A"
                            ? "brand"
                            : p.abc === "B"
                              ? "info"
                              : "warn"
                        }
                      >
                        {p.abc}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPrintProduct(p)}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        In QR
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <BarcodeScanner
        open={scanOpen}
        title={
          scanMode === "import"
            ? "Quét mã khi nhập sản phẩm"
            : "Quét SKU / barcode / QR"
        }
        hint="Dùng camera điện thoại hoặc nhập tay. QR nhãn AnKhang chứa SKU + barcode."
        onClose={() => setScanOpen(false)}
        onScan={onScan}
      />
      <ProductQrPrint
        product={printProduct}
        open={!!printProduct}
        onClose={() => setPrintProduct(null)}
      />
    </div>
  );
}
