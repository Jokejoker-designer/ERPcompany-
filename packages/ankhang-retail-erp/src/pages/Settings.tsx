import { useEffect, useState } from "react";
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
import {
  VN_BANKS,
  buildPaymentQr,
  formatVnd,
  type PayMethod,
  type QrTemplate,
  type SpeakerProvider,
} from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

export function SettingsPage() {
  const store = useRetailStore((s) => s.store);
  const updateStore = useRetailStore((s) => s.updateStore);
  const uploadPaymentQr = useRetailStore((s) => s.uploadPaymentQr);
  const clearPaymentQrUpload = useRetailStore((s) => s.clearPaymentQrUpload);
  const resetDemo = useRetailStore((s) => s.resetDemo);
  const wipeOperationalData = useRetailStore((s) => s.wipeOperationalData);
  const openWizard = useRetailStore((s) => s.openWizard);
  const receiveExternalPayment = useRetailStore((s) => s.receiveExternalPayment);
  const pendingPayment = useRetailStore((s) => s.pendingPayment);
  const requireOwner = useRetailStore((s) => s.requireOwner);
  const refreshSession = useRetailStore((s) => s.refreshSession);
  const beginTotpSetup = useRetailStore((s) => s.beginTotpSetup);
  const confirmTotpSetup = useRetailStore((s) => s.confirmTotpSetup);
  const disableTotp = useRetailStore((s) => s.disableTotp);
  const isTotpEnabled = useRetailStore((s) => s.isTotpEnabled);
  const session = useRetailStore((s) => s.session);

  const [testAmount, setTestAmount] = useState(50000);
  const [ownerPw, setOwnerPw] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [totpPw, setTotpPw] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrUrl: string;
  } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    void refreshSession();
    const g = requireOwner();
    if (!g.ok) toast.error(g.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = buildPaymentQr({
    store,
    amount: testAmount,
    content: `${store.qrAddInfoPrefix || "AK"}TEST`,
  });

  async function saveField(patch: Parameters<typeof updateStore>[0]) {
    const r = await updateStore(patch);
    if (!r.ok) toast.error(r.message);
  }

  async function saveAll() {
    const r = await updateStore({}, { requirePassword: false });
    if (r.ok) toast.success("Đã lưu cấu hình (phiên Chủ cửa hàng hợp lệ)");
    else toast.error(r.message);
  }

  async function onUploadFile(file: File | null) {
    if (!file) return;
    if (!ownerPw) {
      toast.error("Nhập mật khẩu Chủ cửa hàng trước khi upload QR");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ nhận file ảnh");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      const r = await uploadPaymentQr(
        dataUrl,
        uploadNote || file.name,
        ownerPw,
      );
      if (r.ok) {
        toast.success(r.message);
        setOwnerPw("");
      } else toast.error(r.message);
    };
    reader.readAsDataURL(file);
  }

  async function clearUpload() {
    if (!ownerPw) {
      toast.error("Nhập mật khẩu Chủ cửa hàng");
      return;
    }
    const r = await clearPaymentQrUpload(ownerPw);
    if (r.ok) {
      toast.success(r.message);
      setOwnerPw("");
    } else toast.error(r.message);
  }

  function simulateSpeaker() {
    const r = receiveExternalPayment({
      amount: pendingPayment?.amount ?? testAmount,
      content: pendingPayment?.content,
      provider: store.speakerProvider,
      externalId: `SIM-${Date.now()}`,
      secret: store.speakerWebhookSecret || undefined,
    });
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="space-y-2 text-sm">
          <p>
            <strong>Bảo mật:</strong> trang này chỉ mở với phiên{" "}
            <strong>Chủ cửa hàng</strong>. Quyền lấy từ bảng user trong mã
            nguồn + token phiên — sửa <code>user.role</code> trên F12{" "}
            <strong>không</strong> nâng quyền.
          </p>
          <p className="text-xs text-muted">
            Lưu ý: app pure browser không thể chặn 100% DevTools (cần server
            JWT cho production). Bản local đã khóa tối đa phía client.
          </p>
        </CardBody>
      </Card>

      {/* 1 Store */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Hồ sơ cửa hàng</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["storeName", "Tên cửa hàng"],
              ["productName", "Tên phần mềm / thương hiệu"],
              ["taxId", "Mã số thuế"],
              ["phone", "Điện thoại"],
              ["address", "Địa chỉ"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs text-muted">
              {label}
              <Input
                className="mt-1"
                value={store[key]}
                onChange={(e) => void saveField({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-xs text-muted">
            Thuế GTGT mặc định (%)
            <Input
              type="number"
              className="mt-1"
              value={store.vatDefault}
              onChange={(e) =>
                void saveField({ vatDefault: Number(e.target.value) })
              }
            />
          </label>
        </CardBody>
      </Card>

      {/* 2 Payment QR */}
      <Card>
        <CardHeader>
          <CardTitle>2 · QR thanh toán (nạp vào hệ thống)</CardTitle>
          <Badge variant="brand">
            {store.paymentQrMode === "upload" ? "QR Upload" : "VietQR động"}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2/60 p-3 text-xs leading-relaxed">
            <strong className="text-fg">Mã QR có «thật» không?</strong>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
              <li>
                <strong className="text-fg">VietQR động:</strong> đúng chuẩn
                NAPAS/VietQR — app ngân hàng quét được. «Thật» khi STK + BIN +
                tên TK là tài khoản ngân hàng thật của bạn (như ảnh bạn vừa
                cấu hình).
              </li>
              <li>
                <strong className="text-fg">QR Upload:</strong> ảnh QR tĩnh bạn
                xuất từ app bank — cũng là mã thật, nhưng{" "}
                <em>không gắn động số tiền hóa đơn</em>; thu ngân/loa TT phải
                đối chiếu số tiền.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={store.paymentQrMode === "vietqr" ? "default" : "secondary"}
              onClick={() => void saveField({ paymentQrMode: "vietqr" })}
            >
              Dùng VietQR động
            </Button>
            <Button
              size="sm"
              variant={store.paymentQrMode === "upload" ? "default" : "secondary"}
              onClick={() => {
                if (!store.customPaymentQrDataUrl) {
                  toast.message("Hãy upload ảnh QR bên dưới (cần mật khẩu Chủ CH)");
                }
                void saveField({ paymentQrMode: "upload" });
              }}
            >
              Dùng QR đã upload
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted sm:col-span-2">
                Ngân hàng
                <Select
                  className="mt-1"
                  value={store.bankBin}
                  onChange={(e) => {
                    const b = VN_BANKS.find((x) => x.bin === e.target.value);
                    void saveField({
                      bankBin: e.target.value,
                      bankName: b?.name || store.bankName,
                    });
                  }}
                >
                  {VN_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.short} — {b.name} ({b.bin})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs text-muted">
                Số tài khoản nhận tiền
                <Input
                  className="mt-1 font-mono"
                  value={store.bankAccount}
                  onChange={(e) =>
                    void saveField({ bankAccount: e.target.value })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Tên chủ tài khoản (in QR)
                <Input
                  className="mt-1"
                  value={store.accountName}
                  onChange={(e) =>
                    void saveField({ accountName: e.target.value })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Kiểu QR VietQR
                <Select
                  className="mt-1"
                  value={store.qrTemplate}
                  onChange={(e) =>
                    void saveField({
                      qrTemplate: e.target.value as QrTemplate,
                    })
                  }
                >
                  <option value="vietqr">VietQR (khuyến nghị)</option>
                  <option value="text">VietQR tối giản</option>
                  <option value="custom_url">URL tùy chỉnh</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                Mẫu ảnh
                <Select
                  className="mt-1"
                  value={store.vietQrStyle}
                  onChange={(e) =>
                    void saveField({
                      vietQrStyle: e.target
                        .value as typeof store.vietQrStyle,
                    })
                  }
                >
                  <option value="compact2">Compact</option>
                  <option value="print">Print</option>
                  <option value="qr_only">Chỉ mã QR</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                Tiền tố nội dung CK
                <Input
                  className="mt-1 font-mono"
                  value={store.qrAddInfoPrefix}
                  onChange={(e) =>
                    void saveField({ qrAddInfoPrefix: e.target.value })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Xem thử số tiền (₫)
                <Input
                  type="number"
                  className="mt-1"
                  value={testAmount}
                  onChange={(e) => setTestAmount(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="flex flex-col items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-2/50 p-4">
              {preview.imageUrl ? (
                <img
                  src={preview.imageUrl}
                  alt="QR thanh toán"
                  className="max-h-56 w-auto rounded bg-white p-2 shadow-sm"
                />
              ) : (
                <p className="text-sm text-muted">Chưa có QR</p>
              )}
              <div className="mt-2 text-center text-xs text-muted">
                {store.bankName} · {store.bankAccount}
                <br />
                {formatVnd(testAmount)} · ND: {preview.content}
                <br />
                <span className="text-[10px]">{preview.authenticityNote}</span>
              </div>
            </div>
          </div>

          {/* Upload section */}
          <div className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/20 p-4">
            <div className="mb-2 text-sm font-semibold">
              Upload QR code tĩnh (chỉ Chủ cửa hàng + mật khẩu)
            </div>
            <p className="mb-3 text-xs text-muted">
              Xuất ảnh QR từ app ngân hàng / sổ tài khoản → tải lên. Bắt buộc
              nhập đúng mật khẩu <code>owner</code>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Mật khẩu Chủ cửa hàng *
                <Input
                  type="password"
                  className="mt-1"
                  value={ownerPw}
                  onChange={(e) => setOwnerPw(e.target.value)}
                  placeholder="Owner@2026"
                  autoComplete="off"
                />
              </label>
              <label className="text-xs text-muted">
                Ghi chú (tuỳ chọn)
                <Input
                  className="mt-1"
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  placeholder="QR Vietcombank quầy 1"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-brand px-3 text-sm font-semibold text-on-brand">
                Chọn ảnh QR…
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    void onUploadFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <Button size="sm" variant="secondary" onClick={() => void clearUpload()}>
                Xóa QR upload → về VietQR
              </Button>
            </div>
            {store.customPaymentQrDataUrl ? (
              <div className="mt-3 flex items-center gap-3 text-xs">
                <img
                  src={store.customPaymentQrDataUrl}
                  alt="QR đã upload"
                  className="h-16 w-16 rounded border bg-white object-contain"
                />
                <div>
                  <Badge variant="ok">Đã nạp</Badge>
                  <div className="mt-1 text-muted">
                    {store.customPaymentQrNote || "—"} ·{" "}
                    {store.customPaymentQrUpdatedAt
                      ? new Date(store.customPaymentQrUpdatedAt).toLocaleString(
                          "vi-VN",
                        )
                      : ""}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* 3 Speaker */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Loa thanh toán & ứng dụng ngoài</CardTitle>
          <Badge variant={store.speakerEnabled ? "ok" : "default"}>
            {store.speakerEnabled ? "Bật" : "Tắt"}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={store.speakerEnabled}
              onChange={(e) =>
                void saveField({ speakerEnabled: e.target.checked })
              }
            />
            Bật tích hợp loa / thiết bị thanh toán
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              Nhà cung cấp
              <Select
                className="mt-1"
                value={store.speakerProvider}
                onChange={(e) =>
                  void saveField({
                    speakerProvider: e.target.value as SpeakerProvider,
                  })
                }
              >
                <option value="generic">Generic</option>
                <option value="momo">MoMo</option>
                <option value="vnpay">VNPay</option>
                <option value="zalopay">ZaloPay</option>
                <option value="custom">Custom</option>
              </Select>
            </label>
            <label className="text-xs text-muted">
              Device ID
              <Input
                className="mt-1 font-mono"
                value={store.speakerDeviceId}
                onChange={(e) =>
                  void saveField({ speakerDeviceId: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              API URL đẩy số tiền
              <Input
                className="mt-1 font-mono text-xs"
                value={store.speakerApiUrl}
                onChange={(e) =>
                  void saveField({ speakerApiUrl: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-muted">
              Webhook secret
              <Input
                className="mt-1 font-mono"
                value={store.speakerWebhookSecret}
                onChange={(e) =>
                  void saveField({ speakerWebhookSecret: e.target.value })
                }
              />
            </label>
          </div>
          <Button size="sm" variant="secondary" onClick={simulateSpeaker}>
            Giả lập callback loa / app
          </Button>
        </CardBody>
      </Card>

      {/* 4 POS behavior */}
      <Card>
        <CardHeader>
          <CardTitle>4 · Hành vi quầy & EDC</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Phương thức TT mặc định
            <Select
              className="mt-1"
              value={store.defaultPayMethod}
              onChange={(e) =>
                void saveField({
                  defaultPayMethod: e.target.value as PayMethod,
                })
              }
            >
              <option value="cash">Tiền mặt</option>
              <option value="qr">QR</option>
              <option value="card">Thẻ</option>
            </Select>
          </label>
          <label className="text-xs text-muted">
            Quỹ mở ca mặc định (₫)
            <Input
              type="number"
              className="mt-1"
              value={store.openShiftDefaultCash}
              onChange={(e) =>
                void saveField({
                  openShiftDefaultCash: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={store.allowManualConfirmQr}
              onChange={(e) =>
                void saveField({ allowManualConfirmQr: e.target.checked })
              }
            />
            Cho phép «Đã nhận tiền» trên POS
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={store.edcEnabled}
              onChange={(e) =>
                void saveField({ edcEnabled: e.target.checked })
              }
            />
            Bật EDC thẻ
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5 · Bảo mật 2FA (Google Authenticator)</CardTitle>
          <Badge variant={isTotpEnabled() ? "ok" : "default"}>
            {isTotpEnabled() ? "Đang bật" : "Chưa bật"}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            Dùng app <strong className="text-fg">Google Authenticator</strong>{" "}
            (hoặc Microsoft Authenticator / Authy) — mã 6 số đổi mỗi 30 giây.
            Đây là chuẩn bảo mật tương đương ngân hàng, không cần server Google
            OAuth.
          </p>
          <label className="block max-w-sm text-xs text-muted">
            Mật khẩu tài khoản hiện tại
            <Input
              type="password"
              className="mt-1"
              value={totpPw}
              onChange={(e) => setTotpPw(e.target.value)}
              autoComplete="off"
            />
          </label>
          {!isTotpEnabled() ? (
            <>
              <Button
                size="sm"
                onClick={async () => {
                  const r = await beginTotpSetup(totpPw);
                  if (!r.ok) return toast.error(r.message);
                  setTotpSetup({
                    secret: r.secret!,
                    qrUrl: r.qrUrl!,
                  });
                  toast.message(r.message);
                }}
              >
                Bật Google Authenticator
              </Button>
              {totpSetup ? (
                <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2/50 p-3 sm:grid-cols-2">
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={totpSetup.qrUrl}
                      alt="QR Authenticator"
                      className="h-40 w-40 rounded bg-white p-1"
                    />
                    <p className="text-center font-mono text-[11px] text-muted">
                      {totpSetup.secret}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      1. Mở Google Authenticator → Thêm → Quét QR
                      <br />
                      2. Nhập mã 6 số hiện trên app
                    </p>
                    <Input
                      className="font-mono tracking-widest"
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      maxLength={6}
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        const r = await confirmTotpSetup(totpCode);
                        if (!r.ok) return toast.error(r.message);
                        toast.success(r.message);
                        setBackupCodes(r.backupCodes || null);
                        setTotpSetup(null);
                        setTotpCode("");
                        setTotpPw("");
                      }}
                    >
                      Xác nhận & bật 2FA
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ok">
                2FA đang bật cho {session?.username}. Mỗi lần đăng nhập cần mã
                app.
              </p>
              <label className="block max-w-xs text-xs text-muted">
                Mã Authenticator để tắt 2FA
                <Input
                  className="mt-1 font-mono"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  maxLength={6}
                />
              </label>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const r = await disableTotp(totpPw, totpCode);
                  if (!r.ok) return toast.error(r.message);
                  toast.success(r.message);
                  setTotpCode("");
                  setTotpPw("");
                  setBackupCodes(null);
                }}
              >
                Tắt 2FA
              </Button>
            </div>
          )}
          {backupCodes ? (
            <div className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/30 p-3 text-xs">
              <strong>Mã dự phòng (lưu ngay, chỉ hiện 1 lần):</strong>
              <ul className="mt-1 grid grid-cols-2 gap-1 font-mono">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6 · Dữ liệu</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <Button onClick={() => void saveAll()}>Lưu cấu hình</Button>
          <Button variant="secondary" onClick={() => openWizard()}>
            Hướng dẫn A→Z
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              wipeOperationalData({ keepStore: true });
              toast.message("Đã xóa dữ liệu nghiệp vụ (giữ cấu hình)");
            }}
          >
            Xóa data về 0
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetDemo();
              toast.message("Đã nạp lại demo");
            }}
          >
            Nạp lại demo
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tiếp cận (WCAG 2.1 AA)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-muted">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-fg">Bàn phím:</strong> Tab · Esc · F2 thanh
              toán · F3 quét · F4 xóa giỏ · Skip link tới nội dung
            </li>
            <li>
              <strong className="text-fg">Tương phản:</strong> chữ / badge ≥ 4.5:1 ·
              focus ring 2px brand
            </li>
            <li>
              <strong className="text-fg">Form:</strong> label gắn input · lỗi role=alert
            </li>
            <li>
              <strong className="text-fg">Landmarks:</strong> nav · main#main-content ·
              dialog wizard
            </li>
            <li>
              <strong className="text-fg">Chuyển động:</strong> tôn trọng
              prefers-reduced-motion
            </li>
          </ul>
          <p className="text-xs">
            Mục tiêu WCAG 2.1 mức <strong className="text-fg">AA</strong> cho POS demo.
          </p>
        </CardBody>
      </Card>

    </div>
  );
}
