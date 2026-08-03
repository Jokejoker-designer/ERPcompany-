import { useEffect, useRef, useState } from "react";
import {
  CreditCard,
  QrCode,
  Trash2,
  Banknote,
  UserRound,
  Camera,
  CheckCircle2,
  Loader2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Select,
  TipBanner,
} from "@retail/components/ui";
import { BarcodeScanner } from "@retail/components/BarcodeScanner";
import {
  buildPaymentQr,
  formatVnd,
  tierLabel,
  type PayMethod,
} from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, 80);
  } catch {
    /* ignore */
  }
}

export function PosPage() {
  const store = useRetailStore((s) => s.store);
  const products = useRetailStore((s) => s.products);
  const customers = useRetailStore((s) => s.customers);
  const cart = useRetailStore((s) => s.cart);
  const cartCustomerId = useRetailStore((s) => s.cartCustomerId);
  const promos = useRetailStore((s) => s.promos);
  const activeShiftId = useRetailStore((s) => s.activeShiftId);
  const pendingPayment = useRetailStore((s) => s.pendingPayment);
  const openShift = useRetailStore((s) => s.openShift);
  const addToCartByCode = useRetailStore((s) => s.addToCartByCode);
  const addToCart = useRetailStore((s) => s.addToCart);
  const updateCartQty = useRetailStore((s) => s.updateCartQty);
  const removeCartLine = useRetailStore((s) => s.removeCartLine);
  const setCartCustomer = useRetailStore((s) => s.setCartCustomer);
  const cartTotals = useRetailStore((s) => s.cartTotals);
  const checkout = useRetailStore((s) => s.checkout);
  const clearCart = useRetailStore((s) => s.clearCart);
  const createPendingPayment = useRetailStore((s) => s.createPendingPayment);
  const confirmPendingPayment = useRetailStore((s) => s.confirmPendingPayment);
  const cancelPendingPayment = useRetailStore((s) => s.cancelPendingPayment);
  const receiveExternalPayment = useRetailStore((s) => s.receiveExternalPayment);

  const [scan, setScan] = useState("");
  const [cash, setCash] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>(
    store.defaultPayMethod || "cash",
  );
  const [camOpen, setCamOpen] = useState(false);
  const [lastPrice, setLastPrice] = useState<string | null>(null);
  const [qrMeta, setQrMeta] = useState<ReturnType<typeof buildPaymentQr> | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const totals = cartTotals();
  const cust = customers.find((c) => c.id === cartCustomerId);
  const change = Math.max(0, cash - totals.total);
  const waitingQr =
    pendingPayment?.status === "waiting" && pendingPayment.method === "qr";

  // Listen external payment speaker / app
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || d.type !== "ankhang-payment") return;
      const r = receiveExternalPayment({
        amount: Number(d.amount),
        content: d.content,
        externalId: d.externalId,
        provider: d.provider,
        secret: d.secret,
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    }
    function onCustom(ev: Event) {
      const detail = (ev as CustomEvent).detail as {
        amount?: number;
        content?: string;
      };
      // speaker push is outbound; ignore
      void detail;
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("ankhang-speaker-push", onCustom);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("ankhang-speaker-push", onCustom);
    };
  }, [receiveExternalPayment]);

  // When external marks paid → finish checkout
  useEffect(() => {
    if (pendingPayment?.status === "paid" && cart.length > 0) {
      const amount = pendingPayment.amount;
      const method = pendingPayment.method === "card" ? "card" : "qr";
      const r = checkout([
        {
          method,
          amount,
          ref: pendingPayment.content,
          provider: pendingPayment.provider,
        },
      ]);
      if (r.ok) {
        toast.success(`Thanh toán thành công · ${r.message}`, {
          description: `Nguồn: ${pendingPayment.provider || method} · ${formatVnd(amount)}`,
        });
        setQrMeta(null);
        setCash(0);
        setLastPrice(null);
      }
    }
  }, [pendingPayment?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function ensureShift() {
    if (!activeShiftId) {
      const cashOpen = store.openShiftDefaultCash || 2_000_000;
      openShift(cashOpen);
      toast.message(
        `Đã mở ca · quỹ đầu ca ${formatVnd(cashOpen)}`,
      );
    }
  }

  function handleCode(code: string) {
    ensureShift();
    const r = addToCartByCode(code);
    if (r.ok) {
      if (store.soundOnScan) beep();
      toast.success(r.message);
      if (r.product) {
        setLastPrice(
          `${r.product.name} · ${formatVnd(r.product.price)}/${r.product.baseUom} · SKU ${r.product.sku}`,
        );
      }
      setScan("");
      if (store.autoFocusScan) inputRef.current?.focus();
      const t = useRetailStore.getState().cartTotals();
      if (payMethod === "cash") setCash(t.total);
      // refresh QR amount if showing
      if (payMethod === "qr" && t.total > 0) {
        prepareQr(t.total);
      }
    } else toast.error(r.message);
  }

  function onScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scan.trim()) return;
    handleCode(scan.trim());
  }

  function prepareQr(amount: number) {
    if (!store.bankAccount) {
      toast.error("Chưa cấu hình STK nhận QR — vào Cấu hình cửa hàng");
      return null;
    }
    const pending = createPendingPayment(amount, "qr");
    const meta = buildPaymentQr({
      store,
      amount,
      content: pending.content,
    });
    setQrMeta(meta);
    if (store.speakerEnabled) {
      toast.message("Đã đẩy số tiền sang loa / thiết bị thanh toán", {
        description: store.speakerDeviceId || store.speakerProvider,
      });
    }
    return meta;
  }

  function selectPay(m: PayMethod) {
    setPayMethod(m);
    cancelPendingPayment();
    setQrMeta(null);
    if (m === "cash") setCash(totals.total);
    if (m === "qr" && totals.total > 0) {
      prepareQr(totals.total);
    }
  }

  function doCheckout() {
    ensureShift();
    if (!cart.length) return toast.error("Giỏ hàng trống");

    if (payMethod === "qr") {
      if (!qrMeta || !waitingQr) {
        prepareQr(totals.total);
        toast.message("Hiện QR cho khách quét — chờ xác nhận thanh toán");
        return;
      }
      if (waitingQr && !store.allowManualConfirmQr) {
        toast.message("Đang chờ loa / ngân hàng xác nhận…");
        return;
      }
      // manual confirm
      const conf = confirmPendingPayment({ provider: "manual-cashier" });
      if (!conf.ok) return toast.error(conf.message);
      // effect will checkout when status paid
      return;
    }

    if (payMethod === "card") {
      if (store.edcEnabled) {
        createPendingPayment(totals.total, "card");
        toast.message(
          `Đẩy ${formatVnd(totals.total)} sang EDC ${store.edcTerminalId || ""}…`,
        );
        // demo: auto confirm after short delay handled by manual button below
      }
      const r = checkout([
        {
          method: "card",
          amount: totals.total,
          provider: "edc",
          ref: store.edcTerminalId,
        },
      ]);
      if (r.ok) {
        toast.success(`Thanh toán thẻ thành công · ${r.message}`);
        setCash(0);
        setLastPrice(null);
        cancelPendingPayment();
      } else toast.error(r.message);
      return;
    }

    // cash
    const amount = cash || totals.total;
    if (amount < totals.total) {
      return toast.error("Số tiền khách đưa chưa đủ");
    }
    const r = checkout([{ method: "cash", amount }]);
    if (r.ok) {
      toast.success(`Thanh toán thành công · ${r.message}`, {
        description: `Tiền thừa: ${formatVnd(amount - totals.total)}`,
      });
      setCash(0);
      setLastPrice(null);
    } else toast.error(r.message);
  }

  function manualConfirmQr() {
    const conf = confirmPendingPayment({ provider: "manual-cashier" });
    if (!conf.ok) toast.error(conf.message);
    else toast.success("Đã xác nhận nhận tiền chuyển khoản");
  }


  // Phím tắt quầy: F2 thanh toán · F3 focus quét · F4 xóa giỏ
  const checkoutRef = useRef(doCheckout);
  checkoutRef.current = doCheckout;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F3") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        useRetailStore.getState().clearCart();
        useRetailStore.getState().cancelPendingPayment();
        setQrMeta(null);
        toast.message("Đã xóa giỏ (F4)");
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        checkoutRef.current();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <TipBanner title="Hướng dẫn bán hàng nhanh" defaultOpen={false}>
        <p>
          Quét barcode / QR nhãn (camera hoặc súng quét) → lấy giá → tính tiền.
          QR thanh toán lấy STK từ Cấu hình (VietQR). Phím tắt: F2 thanh toán · F3 quét · F4 xóa giỏ. Thử{" "}
          <code className="rounded bg-surface px-1">8934804022011</code> hoặc
          SKU <code className="rounded bg-surface px-1">FMCG-1004</code>.
        </p>
      </TipBanner>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Card className="border-brand/20">
            <CardBody className="space-y-3">
              <form
                onSubmit={onScan}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  ref={inputRef}
                  aria-label="Quét mã vạch hoặc SKU"
                  autoFocus={store.autoFocusScan}
                  placeholder="Quét / gõ barcode · SKU · QR…"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  className="h-12 font-mono text-base"
                  inputMode="text"
                  enterKeyHint="done"
                />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 sm:flex-none">
                    Thêm
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 sm:flex-none"
                    onClick={() => setCamOpen(true)}
                  >
                    <Camera className="h-4 w-4" />
                    Camera
                  </Button>
                </div>
              </form>
              {lastPrice ? (
                <div className="animate-[page-in_0.25s_ease] rounded-[var(--radius-md)] border border-ok/30 bg-ok-soft/40 px-3 py-2.5 text-sm font-medium text-ok">
                  {lastPrice}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {products
                  .filter((p) => p.active)
                  .slice(0, 8)
                  .map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="secondary"
                      className="max-w-[46%] truncate sm:max-w-none"
                      onClick={() => {
                        ensureShift();
                        addToCart(p.id, 1, p.baseUom);
                        if (store.soundOnScan) beep();
                        setLastPrice(
                          `${p.name} · ${formatVnd(p.price)}/${p.baseUom}`,
                        );
                        if (payMethod === "cash") {
                          const t = useRetailStore.getState().cartTotals();
                          setCash(t.total);
                        }
                      }}
                    >
                      {p.name.split(" ").slice(0, 2).join(" ")}
                    </Button>
                  ))}
                {!products.length ? (
                  <EmptyState
                    title="Chưa có hàng hóa"
                    description="Vào Danh mục hàng để nạp SKU / in QR trước khi bán."
                  />
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Giỏ hàng{" "}
                {cart.length ? (
                  <Badge variant="brand" className="ml-1">
                    {cart.length}
                  </Badge>
                ) : null}
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearCart();
                  cancelPendingPayment();
                  setQrMeta(null);
                }}
                disabled={!cart.length}
              >
                Xóa giỏ
              </Button>
            </CardHeader>
            <CardBody className="space-y-2 p-0">
              {!cart.length ? (
                <EmptyState
                  title="Giỏ trống"
                  description="Quét mã hoặc chạm hàng nhanh phía trên để bắt đầu."
                />
              ) : (
                cart.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 border-b border-border-soft px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {l.name}
                        </div>
                        <div className="text-xs text-muted">
                          {formatVnd(l.unitPrice)} / {l.uom}
                          {p ? (
                            <span className="ml-1 font-mono">· {p.sku}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9"
                          onClick={() =>
                            updateCartQty(l.id, Math.max(0, l.qty - 1))
                          }
                          aria-label="Giảm"
                        >
                          −
                        </Button>
                        <Input
                          type="number"
                          className="h-9 w-14 text-center"
                          value={l.qty}
                          min={0}
                          step={l.uom === "Kg" ? 0.1 : 1}
                          onChange={(e) =>
                            updateCartQty(l.id, Number(e.target.value))
                          }
                        />
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9"
                          onClick={() => updateCartQty(l.id, l.qty + 1)}
                          aria-label="Tăng"
                        >
                          +
                        </Button>
                      </div>
                      <div className="w-20 text-right text-sm font-semibold tabular">
                        {formatVnd(l.qty * l.unitPrice)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-danger"
                        onClick={() => removeCartLine(l.id)}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4" />
                Khách hàng
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              <Select
                value={cartCustomerId || ""}
                onChange={(e) => setCartCustomer(e.target.value || null)}
              >
                <option value="">Khách lẻ</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone} · {tierLabel(c.tier)}
                  </option>
                ))}
              </Select>
              {cust ? (
                <div className="rounded-[var(--radius-md)] bg-surface-2 p-2 text-xs">
                  <Badge
                    variant={
                      cust.tier === "gold"
                        ? "brand"
                        : cust.tier === "silver"
                          ? "info"
                          : "default"
                    }
                  >
                    Hạng {tierLabel(cust.tier)}
                  </Badge>
                  <span className="ml-2">{cust.points} điểm</span>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Khuyến mãi</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1.5">
              {promos
                .filter((p) => p.active)
                .map((p) => (
                  <div key={p.id} className="text-xs text-muted">
                    · {p.description}
                  </div>
                ))}
              {totals.appliedPromos.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {totals.appliedPromos.map((p) => (
                    <Badge key={p} variant="ok">
                      {p}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Tạm tính</span>
                <span className="tabular-nums">{formatVnd(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Giảm giá</span>
                <span className="tabular-nums text-ok">
                  −{formatVnd(totals.discount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Thuế GTGT (ước tính)</span>
                <span className="tabular-nums">{formatVnd(totals.vat)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>Khách cần trả</span>
                <span className="tabular-nums text-brand-ink">
                  {formatVnd(totals.total)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["cash", Banknote, "Tiền mặt"],
                    ["qr", QrCode, "QR"],
                    ["card", CreditCard, "Thẻ"],
                  ] as const
                ).map(([m, Icon, label]) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={payMethod === m ? "default" : "secondary"}
                    onClick={() => selectPay(m)}
                    disabled={m === "card" && !store.edcEnabled && false}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Button>
                ))}
              </div>

              {payMethod === "cash" ? (
                <div className="space-y-2">
                  <label className="text-xs text-muted">Tiền khách đưa</label>
                  <Input
                    type="number"
                    className="mt-1 h-12 text-base tabular"
                    value={cash || ""}
                    onChange={(e) => setCash(Number(e.target.value))}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      totals.total,
                      Math.ceil(totals.total / 10000) * 10000,
                      Math.ceil(totals.total / 50000) * 50000 || 50000,
                      100000,
                      200000,
                      500000,
                    ]
                      .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
                      .slice(0, 5)
                      .map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant={cash === v ? "default" : "secondary"}
                          onClick={() => setCash(v)}
                        >
                          {formatVnd(v)}
                        </Button>
                      ))}
                  </div>
                  <p className="text-sm">
                    Tiền thừa:{" "}
                    <strong className="text-brand-ink tabular">
                      {formatVnd(change)}
                    </strong>
                  </p>
                </div>
              ) : null}

              {payMethod === "qr" ? (
                <div className="space-y-2 rounded-[var(--radius-md)] border border-brand/30 bg-brand-soft/30 p-3">
                  {!store.bankAccount ? (
                    <p className="text-sm text-danger">
                      Chưa nạp STK QR — vào menu{" "}
                      <strong>10 · Cấu hình</strong> để thêm tài khoản.
                    </p>
                  ) : qrMeta ? (
                    <>
                      <div className="flex flex-col items-center">
                        <img
                          src={qrMeta.imageUrl}
                          alt="QR thanh toán"
                          className="max-h-52 w-auto rounded bg-white p-2 shadow-sm"
                        />
                        <div className="mt-2 text-center text-xs">
                          <div className="font-semibold text-fg">
                            {store.accountName || store.storeName}
                          </div>
                          <div className="text-muted">
                            {store.bankName} · {store.bankAccount}
                          </div>
                          <div className="mt-1 text-base font-bold text-brand-ink">
                            {formatVnd(qrMeta.amount)}
                          </div>
                          <div className="font-mono text-[11px] text-muted">
                            ND: {qrMeta.content}
                          </div>
                          <div className="mt-1 max-w-xs text-[10px] leading-snug text-muted">
                            {qrMeta.authenticityNote}
                            {qrMeta.mode === "upload" ? (
                              <span className="mt-0.5 block font-semibold text-warn">
                                QR tĩnh (upload) — kiểm tra số tiền {formatVnd(qrMeta.amount)} trước khi xác nhận.
                              </span>
                            ) : (
                              <span className="mt-0.5 block font-semibold text-ok">
                                VietQR động — số tiền đã gắn trong mã.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {waitingQr ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-warn">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Đang chờ khách chuyển khoản
                          {store.speakerEnabled ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Volume2 className="h-3.5 w-3.5" />
                              loa
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {pendingPayment?.status === "paid" ? (
                        <div className="flex items-center justify-center gap-1 text-sm text-ok">
                          <CheckCircle2 className="h-4 w-4" />
                          Đã nhận tiền — đang chốt hóa đơn…
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => prepareQr(totals.total)}
                          disabled={!cart.length}
                        >
                          Tạo lại QR
                        </Button>
                        {store.allowManualConfirmQr ? (
                          <Button
                            size="sm"
                            variant="ok"
                            onClick={manualConfirmQr}
                            disabled={!waitingQr}
                          >
                            Đã nhận tiền
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={!cart.length}
                      onClick={() => prepareQr(totals.total)}
                    >
                      <QrCode className="h-4 w-4" />
                      Hiện QR thanh toán
                    </Button>
                  )}
                </div>
              ) : null}

              {payMethod === "card" ? (
                <div className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-center text-sm text-muted">
                  {store.edcEnabled
                    ? `EDC ${store.edcTerminalId || "—"} · ${formatVnd(totals.total)}`
                    : "Bật EDC trong Cấu hình để gắn terminal. Demo: bấm thanh toán để ghi nhận thẻ."}
                </div>
              ) : null}

              <Button
                className="w-full"
                size="lg"
                disabled={!cart.length}
                onClick={doCheckout}
              >
                {payMethod === "qr" && waitingQr
                  ? store.allowManualConfirmQr
                    ? "Xác nhận & xuất hóa đơn"
                    : "Chờ xác nhận tự động…"
                  : "Thanh toán & xuất hóa đơn"}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <BarcodeScanner
        open={camOpen}
        title="Quét barcode / QR sản phẩm"
        hint="Camera điện thoại hoặc chọn ảnh mã. Hỗ trợ EAN, Code128, QR nhãn SKU."
        onClose={() => setCamOpen(false)}
        onScan={(code) => handleCode(code)}
      />

      {/* Sticky pay bar on phone — always reachable with thumb */}
      {cart.length > 0 ? (
        <div className="safe-pb fixed inset-x-0 bottom-[56px] z-30 border-t border-border bg-surface/95 px-3 py-2 shadow-[var(--shadow-float)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted">Khách cần trả</div>
              <div className="text-lg font-bold tabular text-brand-ink">
                {formatVnd(totals.total)}
              </div>
            </div>
            <Button
              size="lg"
              className="min-w-[140px]"
              onClick={doCheckout}
            >
              Thanh toán
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
