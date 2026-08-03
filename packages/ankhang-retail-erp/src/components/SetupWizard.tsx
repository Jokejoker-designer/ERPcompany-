import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Package,
  Rocket,
  ShoppingCart,
  Store,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Input,
  Select,
} from "@retail/components/ui";
import {
  PHASES,
  SETUP_STEPS,
  computeMap,
  formatVnd,
  setupCompletion,
  toBaseQty,
  type GrnLine,
} from "@retail/data/retail";
import { cn } from "@retail/lib/utils";
import { useRetailStore } from "@retail/store/retail-store";
import { trapFocus } from "@retail/lib/focus-trap";

const STEP_ICONS = [
  Rocket,
  Store,
  Package,
  Warehouse,
  UserPlus,
  Truck,
  ShoppingCart,
  ClipboardList,
  Sparkles,
];

export function SetupWizard() {
  const panelRef = useRef<HTMLDivElement>(null);
  const onboarding = useRetailStore((s) => s.onboarding);
  const store = useRetailStore((s) => s.store);
  const products = useRetailStore((s) => s.products);
  const suppliers = useRetailStore((s) => s.suppliers);
  const customers = useRetailStore((s) => s.customers);
  const purchaseOrders = useRetailStore((s) => s.purchaseOrders);
  const grns = useRetailStore((s) => s.grns);
  const sales = useRetailStore((s) => s.sales);
  const counts = useRetailStore((s) => s.counts);
  const shifts = useRetailStore((s) => s.shifts);

  const updateStore = useRetailStore((s) => s.updateStore);
  const addProduct = useRetailStore((s) => s.addProduct);
  const addSupplier = useRetailStore((s) => s.addSupplier);
  const addCustomer = useRetailStore((s) => s.addCustomer);
  const postGrn = useRetailStore((s) => s.postGrn);
  const openShift = useRetailStore((s) => s.openShift);
  const addToCartByCode = useRetailStore((s) => s.addToCartByCode);
  const checkout = useRetailStore((s) => s.checkout);
  const createCount = useRetailStore((s) => s.createCount);
  const submitCount = useRetailStore((s) => s.submitCount);
  const approveCount = useRetailStore((s) => s.approveCount);
  const markSetup = useRetailStore((s) => s.markSetup);
  const setWizardStep = useRetailStore((s) => s.setWizardStep);
  const closeWizard = useRetailStore((s) => s.closeWizard);
  const completeOnboarding = useRetailStore((s) => s.completeOnboarding);

  const step = onboarding.step;
  const open = onboarding.wizardOpen;
  const pct = setupCompletion(onboarding.flags);

  const [storeForm, setStoreForm] = useState(store);
  const [prodForm, setProdForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    price: "",
    cost: "",
  });
  const [supForm, setSupForm] = useState({ name: "", phone: "", contact: "" });
  const [custForm, setCustForm] = useState({
    name: "",
    phone: "",
    tier: "bronze" as "bronze" | "silver" | "gold",
  });

  useEffect(() => {
    if (open) setStoreForm(store);
  }, [open, store]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [open, onboarding.step]);

  if (!open) return null;

  const Icon = STEP_ICONS[step] || Rocket;
  const meta = SETUP_STEPS[step];

  function go(next: number) {
    setWizardStep(Math.max(0, Math.min(SETUP_STEPS.length - 1, next)));
  }

  function saveStore() {
    if (!storeForm.storeName.trim()) {
      toast.error("Vui lòng nhập tên cửa hàng");
      return false;
    }
    void updateStore(storeForm).then((r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      markSetup("store");
      toast.success("Đã lưu hồ sơ cửa hàng");
    });
    return true;
  }

  function saveProduct() {
    if (!prodForm.name.trim()) {
      toast.error("Vui lòng nhập tên hàng hóa");
      return false;
    }
    const n = products.length + 1;
    addProduct({
      sku: prodForm.sku.trim() || `MH-${1000 + n}`,
      name: prodForm.name.trim(),
      categoryId: "cat-fmcg",
      barcode: prodForm.barcode.trim() || `890${String(n).padStart(10, "0")}`,
      baseUom: "Cái",
      purchaseUom: "Thùng",
      salesUoms: ["Cái", "Thùng"],
      conversion: { Cái: 1, Thùng: 12 },
      costMap: Number(prodForm.cost) || 10000,
      price: Number(prodForm.price) || 15000,
      stock: 0,
      minStock: 10,
      abc: "C",
      trackLot: false,
      trackExpiry: false,
      active: true,
    });
    setProdForm({ name: "", sku: "", barcode: "", price: "", cost: "" });
    toast.success("Đã thêm mặt hàng vào danh mục");
    return true;
  }

  function saveSupplier() {
    if (!supForm.name.trim()) {
      toast.error("Vui lòng nhập tên nhà cung cấp");
      return false;
    }
    addSupplier({
      code: `NCC-${String(suppliers.length + 1).padStart(2, "0")}`,
      name: supForm.name.trim(),
      contact: supForm.contact.trim() || "—",
      phone: supForm.phone.trim() || "—",
      taxId: "—",
      leadDays: 3,
      onTimeRate: 90,
    });
    setSupForm({ name: "", phone: "", contact: "" });
    toast.success("Đã thêm nhà cung cấp");
    return true;
  }

  function saveCustomer() {
    if (!custForm.name.trim() || !custForm.phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return false;
    }
    addCustomer({
      name: custForm.name.trim(),
      phone: custForm.phone.trim(),
      tier: custForm.tier,
      points: 0,
      visits: 0,
      totalSpend: 0,
      lastItems: [],
    });
    setCustForm({ name: "", phone: "", tier: "bronze" });
    toast.success("Đã tạo thẻ khách hàng thân thiết");
    return true;
  }

  function doInboundDemo() {
    const po = purchaseOrders.find(
      (p) => p.status === "ordered" || p.status === "partial",
    );
    if (!po || !products.length) {
      // create ad-hoc grn from first product if exists
      if (!products[0] || !suppliers[0]) {
        toast.error(
          "Cần có ít nhất 1 mặt hàng và 1 nhà cung cấp (hoặc dùng dữ liệu demo)",
        );
        return false;
      }
      const p = products[0];
      const lines: GrnLine[] = [
        {
          productId: p.id,
          qtyPurchase: 2,
          uom: p.purchaseUom,
          qtyBase: toBaseQty(p, 2, p.purchaseUom),
          unitCost: p.costMap,
          batchNo: `L-SETUP-${Date.now().toString(36).toUpperCase()}`,
          expiryDate: "2027-12-31",
          qcOk: true,
        },
      ];
      postGrn({ supplierId: suppliers[0].id, lines });
      toast.success("Đã ghi nhận phiếu nhập kho luyện tập");
      return true;
    }
    const lines: GrnLine[] = po.lines.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      const qtyBase = toBaseQty(p, l.qty, l.uom);
      return {
        productId: l.productId,
        qtyPurchase: l.qty,
        uom: l.uom,
        qtyBase,
        unitCost: l.unitCost / (p.conversion[l.uom] || 1),
        batchNo: `L-SETUP-${l.productId}`,
        expiryDate: "2027-06-30",
        qcOk: true,
      };
    });
    postGrn({ supplierId: po.supplierId, poId: po.id, lines });
    toast.success(
      "Đã nhập kho theo đơn đặt hàng — giá vốn bình quân đã cập nhật",
    );
    return true;
  }

  function doPosDemo() {
    if (!products.length) {
      toast.error("Chưa có hàng hóa để bán");
      return false;
    }
    if (!useRetailStore.getState().activeShiftId) {
      openShift(2_000_000);
    }
    const p = products.find((x) => x.stock > 0) || products[0];
    const r = addToCartByCode(p.barcode || p.sku);
    if (!r.ok) {
      useRetailStore.getState().addToCart(p.id, 1, p.baseUom);
    }
    const totals = useRetailStore.getState().cartTotals();
    const pay = checkout([{ method: "cash", amount: totals.total }]);
    if (!pay.ok) {
      toast.error(pay.message);
      return false;
    }
    markSetup("pos");
    toast.success(`Đã lập hóa đơn ${pay.message}`);
    return true;
  }

  function doInventoryDemo() {
    if (!products.length) {
      toast.error("Chưa có hàng hóa để kiểm kê");
      return false;
    }
    const ids = products.slice(0, 3).map((p) => p.id);
    const id = createCount("Kệ setup · Kiểm kê lần đầu", ids);
    const c = useRetailStore.getState().counts.find((x) => x.id === id);
    if (!c) return false;
    const map: Record<string, number> = {};
    c.lines.forEach((l) => {
      map[l.productId] = l.systemQty;
    });
    submitCount(id, map, {});
    approveCount(id);
    // close shift if open as "chốt ca"
    const active = useRetailStore.getState().activeShiftId;
    if (active) {
      const sh = useRetailStore
        .getState()
        .shifts.find((x) => x.id === active);
      if (sh) {
        useRetailStore
          .getState()
          .closeShift(sh.openingCash + sh.systemCash);
      }
    }
    markSetup("inventory");
    toast.success("Đã hoàn tất kiểm kê & đối soát ca demo");
    return true;
  }

  function next() {
    // validate per step
    if (step === 1 && !saveStore()) return;
    if (step === 2) {
      if (!onboarding.flags.products && products.length === 0) {
        if (!prodForm.name.trim() && products.length === 0) {
          // allow skip if seed products exist
          if (!products.length) {
            toast.error("Thêm ít nhất một mặt hàng hoặc dùng dữ liệu demo");
            return;
          }
        } else if (prodForm.name.trim()) {
          if (!saveProduct()) return;
        } else {
          markSetup("products");
        }
      } else {
        markSetup("products");
      }
    }
    if (step === 3) {
      if (supForm.name.trim()) {
        if (!saveSupplier()) return;
      } else if (suppliers.length) {
        markSetup("suppliers");
      } else {
        toast.error("Thêm ít nhất một nhà cung cấp");
        return;
      }
    }
    if (step === 4) {
      if (custForm.name.trim()) {
        if (!saveCustomer()) return;
      } else if (customers.length) {
        markSetup("customers");
      } else {
        toast.error("Thêm ít nhất một khách hàng");
        return;
      }
    }
    if (step === 5) {
      if (!onboarding.flags.inbound && !grns.length) {
        if (!doInboundDemo()) return;
      } else markSetup("inbound");
    }
    if (step === 6) {
      if (!onboarding.flags.pos && !sales.length) {
        if (!doPosDemo()) return;
      } else markSetup("pos");
    }
    if (step === 7) {
      if (!onboarding.flags.inventory) {
        if (!doInventoryDemo()) return;
      } else markSetup("inventory");
      markSetup("roles");
    }
    if (step === 8) {
      // finish
      completeOnboarding();
      toast.success(
        "Đã hoàn tất hướng dẫn — dữ liệu luyện tập đã về 0. Bắt đầu vận hành thật!",
      );
      return;
    }
    if (step === 0) {
      markSetup("roles"); // soft
    }
    go(step + 1);
  }

  function back() {
    go(step - 1);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-fg/45 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        className="flex max-h-[min(920px,100dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-border bg-surface shadow-2xl sm:rounded-[var(--radius-lg)]"
      >
        {/* header */}
        <div className="flex items-start gap-3 border-b border-border bg-nav px-4 py-3 text-nav-ink sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-nav-muted">
              Hướng dẫn thiết lập A → Z · Bước {step + 1}/{SETUP_STEPS.length}
            </div>
            <h2 id="setup-title" className="text-base font-bold sm:text-lg">
              {meta.title}
            </h2>
            <p className="text-xs text-nav-muted">{meta.hint}</p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-nav-muted hover:bg-nav-hover hover:text-nav-ink"
            onClick={() => closeWizard({ dismiss: true })}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* progress */}
        <div className="border-b border-border-soft px-4 py-2 sm:px-5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
            <span>Tiến độ thiết lập</span>
            <span className="font-semibold text-brand-ink">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            {SETUP_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  i === step
                    ? "bg-brand text-on-brand"
                    : i < step
                      ? "bg-ok-soft text-ok"
                      : "bg-surface-2 text-muted",
                )}
              >
                {i + 1}. {s.short}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-fg">
                <strong>AnKhang POS</strong> chuẩn hóa cửa hàng tạp hóa, siêu
                thị mini hoặc quán ăn thành nền tảng ERP thu nhỏ theo 5 giai
                đoạn vận hành. Wizard này hướng dẫn bạn cấu hình đủ dữ liệu
                gốc, luyện một vòng nhập–bán–kiểm, rồi{" "}
                <strong>xóa sạch dữ liệu luyện tập về 0</strong> để bắt đầu
                kinh doanh thật.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PHASES.map((ph) => (
                  <div
                    key={ph.id}
                    className="rounded-[var(--radius-md)] border border-border bg-surface-2/60 px-3 py-2.5"
                  >
                    <div className="text-[10px] font-bold uppercase text-brand">
                      Giai đoạn {ph.id}
                    </div>
                    <div className="text-sm font-semibold">{ph.title}</div>
                    <div className="text-[11px] text-muted">{ph.desc}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft/40 px-3 py-2 text-xs text-fg">
                <strong>Lưu ý:</strong> Sau bước cuối, hệ thống chỉ giữ{" "}
                <em>hồ sơ cửa hàng</em> đã nhập — toàn bộ hàng hóa, NCC, khách,
                hóa đơn, tồn kho luyện tập sẽ về 0.
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["storeName", "Tên cửa hàng *"],
                  ["taxId", "Mã số thuế"],
                  ["phone", "Điện thoại"],
                  ["address", "Địa chỉ"],
                  ["bankName", "Ngân hàng"],
                  ["bankAccount", "Số tài khoản nhận QR"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs text-muted sm:col-span-1">
                  {label}
                  <Input
                    className="mt-1"
                    value={storeForm[key]}
                    onChange={(e) =>
                      setStoreForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="text-xs text-muted">
                Thuế GTGT mặc định (%)
                <Input
                  type="number"
                  className="mt-1"
                  value={storeForm.vatDefault}
                  onChange={(e) =>
                    setStoreForm((f) => ({
                      ...f,
                      vatDefault: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Thêm mặt hàng mới, hoặc dùng danh mục demo hiện có (
                {products.length} SKU). Mỗi mặt hàng cần mã vạch và đơn vị tính
                rõ ràng để quét tại quầy.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted sm:col-span-2">
                  Tên hàng hóa
                  <Input
                    className="mt-1"
                    value={prodForm.name}
                    onChange={(e) =>
                      setProdForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Ví dụ: Nước ngọt lon 330ml"
                  />
                </label>
                <label className="text-xs text-muted">
                  Mã hàng (SKU)
                  <Input
                    className="mt-1"
                    value={prodForm.sku}
                    onChange={(e) =>
                      setProdForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    placeholder="Tự sinh nếu bỏ trống"
                  />
                </label>
                <label className="text-xs text-muted">
                  Mã vạch
                  <Input
                    className="mt-1 font-mono"
                    value={prodForm.barcode}
                    onChange={(e) =>
                      setProdForm((f) => ({ ...f, barcode: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Giá bán (₫)
                  <Input
                    type="number"
                    className="mt-1"
                    value={prodForm.price}
                    onChange={(e) =>
                      setProdForm((f) => ({ ...f, price: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Giá vốn (₫)
                  <Input
                    type="number"
                    className="mt-1"
                    value={prodForm.cost}
                    onChange={(e) =>
                      setProdForm((f) => ({ ...f, cost: e.target.value }))
                    }
                  />
                </label>
              </div>
              <Button size="sm" variant="secondary" onClick={saveProduct}>
                Thêm mặt hàng
              </Button>
              {products.length > 0 && (
                <div className="rounded-[var(--radius-md)] bg-ok-soft/40 px-3 py-2 text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  Đang có {products.length} mặt hàng trong danh mục
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Nhà cung cấp phục vụ đặt hàng, nhập kho và trả hàng (RTV).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted sm:col-span-2">
                  Tên nhà cung cấp
                  <Input
                    className="mt-1"
                    value={supForm.name}
                    onChange={(e) =>
                      setSupForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Người liên hệ
                  <Input
                    className="mt-1"
                    value={supForm.contact}
                    onChange={(e) =>
                      setSupForm((f) => ({ ...f, contact: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Điện thoại
                  <Input
                    className="mt-1"
                    value={supForm.phone}
                    onChange={(e) =>
                      setSupForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </label>
              </div>
              <Button size="sm" variant="secondary" onClick={saveSupplier}>
                Thêm nhà cung cấp
              </Button>
              {suppliers.length > 0 && (
                <div className="text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {suppliers.length} nhà cung cấp đã ghi nhận
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Thẻ thành viên: quét SĐT tại quầy để áp chiết khấu theo hạng
                (Đồng / Bạc / Vàng) và tích điểm.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Họ và tên
                  <Input
                    className="mt-1"
                    value={custForm.name}
                    onChange={(e) =>
                      setCustForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Số điện thoại
                  <Input
                    className="mt-1"
                    value={custForm.phone}
                    onChange={(e) =>
                      setCustForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  Hạng thẻ
                  <Select
                    className="mt-1"
                    value={custForm.tier}
                    onChange={(e) =>
                      setCustForm((f) => ({
                        ...f,
                        tier: e.target.value as typeof custForm.tier,
                      }))
                    }
                  >
                    <option value="bronze">Đồng</option>
                    <option value="silver">Bạc</option>
                    <option value="gold">Vàng (−5% hóa đơn)</option>
                  </Select>
                </label>
              </div>
              <Button size="sm" variant="secondary" onClick={saveCustomer}>
                Tạo thẻ thành viên
              </Button>
              {customers.length > 0 && (
                <div className="text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {customers.length} khách hàng trong hệ thống
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Nhập kho lần đầu: đối chiếu đơn đặt hàng, kiểm chất lượng, ghi
                số lô / hạn dùng, cập nhật{" "}
                <strong>giá vốn bình quân (MAP)</strong>.
              </p>
              <ul className="list-inside list-disc text-sm text-muted">
                <li>Đơn đặt hàng đang mở: {purchaseOrders.filter((p) => p.status === "ordered").length}</li>
                <li>Phiếu nhập đã ghi: {grns.length}</li>
                <li>Mặt hàng theo dõi lô: {products.filter((p) => p.trackLot).length}</li>
              </ul>
              {products[0] ? (
                <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-xs">
                  Ví dụ MAP: tồn {products[0].stock} · giá vốn{" "}
                  {formatVnd(products[0].costMap)} → sau nhập 10 đơn vị giá{" "}
                  {formatVnd(products[0].costMap + 1000)} ≈{" "}
                  {formatVnd(
                    computeMap(
                      products[0].stock,
                      products[0].costMap,
                      10,
                      products[0].costMap + 1000,
                    ),
                  )}
                </div>
              ) : null}
              <Button onClick={doInboundDemo}>
                Thực hiện nhập kho luyện tập
              </Button>
              {(onboarding.flags.inbound || grns.length > 0) && (
                <div className="text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  Đã có phiếu nhập — có thể sang bước bán hàng
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Bán hàng tại quầy: mở ca → quét mã → áp khuyến mãi / thẻ thành
                viên → thu tiền (tiền mặt / QR / thẻ) → trừ tồn tức thời.
              </p>
              <Button onClick={doPosDemo}>Lập 1 hóa đơn luyện tập</Button>
              <div className="text-xs text-muted">
                Hóa đơn đã lập: {sales.length} · Ca đang mở:{" "}
                {shifts.some((s) => s.status === "open") ? "Có" : "Không"}
              </div>
              {(onboarding.flags.pos || sales.length > 0) && (
                <div className="text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  Đã luyện bán hàng thành công
                </div>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Kiểm kê luân phiên (ưu tiên hàng nhóm A), gán lý do chênh lệch,
                duyệt cân bằng kho. Chốt ca: đối soát tiền mặt két với hệ
                thống (blind close).
              </p>
              <Button onClick={doInventoryDemo}>
                Chạy kiểm kê + chốt ca demo
              </Button>
              <div className="text-xs text-muted">
                Phiếu kiểm: {counts.length} · Ca đã đóng:{" "}
                {shifts.filter((s) => s.status === "closed").length}
              </div>
              {onboarding.flags.inventory && (
                <div className="text-xs text-ok">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  Đã hoàn tất bước kiểm soát
                </div>
              )}
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-brand/30 bg-brand-soft/40 px-4 py-3">
                <div className="text-sm font-semibold text-brand-ink">
                  Sẵn sàng vận hành thật
                </div>
                <p className="mt-1 text-sm text-fg">
                  Khi bấm <strong>«Hoàn tất & xóa dữ liệu luyện tập»</strong>,
                  hệ thống sẽ:
                </p>
                <ul className="mt-2 list-inside list-disc text-sm text-muted">
                  <li>
                    <strong className="text-ok">Giữ lại</strong> hồ sơ cửa
                    hàng (tên, MST, NH, VAT)
                  </li>
                  <li>
                    <strong className="text-danger">Xóa về 0</strong>: hàng
                    hóa, NCC, khách, tồn/lô, đơn hàng, phiếu nhập, hóa đơn,
                    kiểm kê, ca làm việc
                  </li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                {(
                  [
                    ["Hàng hóa", products.length],
                    ["Nhà cung cấp", suppliers.length],
                    ["Khách hàng", customers.length],
                    ["Hóa đơn", sales.length],
                  ] as const
                ).map(([label, n]) => (
                  <div
                    key={label}
                    className="rounded-[var(--radius-md)] border border-border bg-surface-2 py-2"
                  >
                    <div className="text-lg font-bold tabular-nums">{n}</div>
                    <div className="text-muted">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                Sau khi xóa, vào từng mục menu để nạp dữ liệu kinh doanh thật
                của cửa hàng bạn.
              </p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-4 py-3 sm:px-5">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={back}
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => closeWizard({ dismiss: true })}
            >
              Để sau
            </Button>
            <Button size="sm" onClick={next}>
              {step === 8 ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Hoàn tất & xóa dữ liệu luyện tập
                </>
              ) : (
                <>
                  Tiếp tục
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetupProgressBanner() {
  const onboarding = useRetailStore((s) => s.onboarding);
  const openWizard = useRetailStore((s) => s.openWizard);
  const pct = setupCompletion(onboarding.flags);

  if (onboarding.completed && onboarding.wipedAfterSetup) {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-ok/30 bg-ok-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <strong className="text-ok">Thiết lập đã hoàn tất</strong>
          <span className="text-muted">
            {" "}
            — dữ liệu luyện tập đã về 0. Hãy nạp danh mục hàng hóa, nhà cung
            cấp và bắt đầu bán hàng.
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => openWizard()}>
          Xem lại hướng dẫn
        </Button>
      </div>
    );
  }

  if (onboarding.completed) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-brand/30 bg-brand-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-brand-ink">
          Hướng dẫn thiết lập cửa hàng · {pct}%
        </div>
        <p className="text-xs text-muted">
          Làm theo wizard A→Z (dữ liệu gốc → nhập → bán → kiểm → chốt). Hoàn
          tất sẽ xóa dữ liệu luyện tập về 0.
        </p>
      </div>
      <Button size="sm" onClick={() => openWizard()}>
        <Rocket className="h-3.5 w-3.5" />
        {onboarding.dismissed ? "Tiếp tục thiết lập" : "Bắt đầu thiết lập"}
      </Button>
    </div>
  );
}
