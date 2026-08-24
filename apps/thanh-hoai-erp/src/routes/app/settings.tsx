import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderSearch,
  Rocket,
  RotateCcw,
  Save,
  Trash2,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CT_TEMPLATES } from "@/data/ct-registry";
import { CHUNG_TU, ROLES, setupCompletion } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { OauthDocumentCard } from "@/components/erp/oauth-document-card";
import { brandDerivatives } from "@/lib/ui-prefs";
import type { Density } from "@/lib/ui-prefs";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const company = useErpStore((s) => s.company);
  const updateCompany = useErpStore((s) => s.updateCompany);
  const resetDemo = useErpStore((s) => s.resetDemo);
  const wipeOperationalData = useErpStore((s) => s.wipeOperationalData);
  const openWizard = useErpStore((s) => s.openWizard);
  const onboarding = useErpStore((s) => s.onboarding);
  const quotations = useErpStore((s) => s.quotations);
  const receivables = useErpStore((s) => s.receivables);
  const customers = useErpStore((s) => s.customers);
  const materials = useErpStore((s) => s.materials);
  const scan = useErpStore((s) => s.scan);
  const beginTotpSetup = useErpStore((s) => s.beginTotpSetup);
  const confirmTotpSetup = useErpStore((s) => s.confirmTotpSetup);
  const disableTotp = useErpStore((s) => s.disableTotp);
  const isTotpEnabled = useErpStore((s) => s.isTotpEnabled);
  const session = useErpStore((s) => s.session);
  const uiPrefs = useErpStore((s) => s.uiPrefs);
  const setDensity = useErpStore((s) => s.setDensity);
  const setReducedMotion = useErpStore((s) => s.setReducedMotion);
  const setHighContrast = useErpStore((s) => s.setHighContrast);
  const pct = setupCompletion(onboarding.flags);
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("th-erp-theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);


  const [totpPw, setTotpPw] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrUrl: string;
  } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  function save() {
    toast.success("Đã lưu cấu hình công ty", {
      description: "Letterhead báo giá / chứng từ đã cập nhật.",
    });
    useErpStore.getState().markSetup("company");
  }

  return (
    <div className="space-y-4">
      <OauthDocumentCard />

      <Card className="border-brand/30 bg-brand-soft/30">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-brand-ink">
              Hướng dẫn setup A→Z ({pct}%)
            </div>
            <p className="text-xs text-muted sm:text-sm">
              Wizard nạp hồ sơ công ty, khách, CT, vật tư, chứng từ và{" "}
              <strong>quét dữ liệu DN</strong>. Khi hoàn tất → tự xóa demo về 0.
            </p>
          </div>
          <Button size="sm" onClick={() => openWizard()}>
            <Rocket className="h-4 w-4" />
            {onboarding.completed ? "Mở lại wizard" : "Tiếp tục setup"}
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Tổng vai trò" value={String(ROLES.length)} foot="vai trò hệ thống" />
        <Metric label="Khách hàng" value={String(customers.length)} foot="profile đã tạo" tone="info" />
        <Metric
          label="Mẫu biểu chuẩn"
          value={String(CT_TEMPLATES.length)}
          foot="mã tài liệu công trình"
          tone="warn"
        />
        <Metric
          label="Vật tư / SKU"
          value={String(materials.length)}
          foot="sau import HĐ mua"
        />
        <Metric
          label="Hợp đồng công nợ"
          value={String(receivables.length)}
          foot="theo dõi phải thu"
        />
        <Metric
          label="File quét DN"
          value={String(scan.stats.files)}
          foot={`${scan.stats.imported} đã nạp`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ công ty</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["companyName", "Tên công ty"],
              ["productName", "Tên phần mềm"],
              ["taxId", "MST"],
              ["phone", "Điện thoại"],
              ["hotline", "Hotline"],
              ["address", "Địa chỉ"],
              ["website", "Website"],
              ["scanRoots", "Thư mục quét DN"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs text-muted">
              {label}
              <Input
                className="mt-1"
                value={company[key] ?? ""}
                onChange={(e) => updateCompany({ [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={save}>
              <Save className="h-4 w-4" />
              Lưu cấu hình
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-brand" />
            Bảo mật 2FA · Google Authenticator
          </CardTitle>
          <Badge variant={isTotpEnabled() ? "ok" : "default"}>
            {isTotpEnabled() ? "Đang bật" : "Chưa bật"}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            Quét QR bằng app <strong>Google Authenticator</strong> (hoặc
            Microsoft / Authy). Mỗi lần đăng nhập nhập mã 6 số. Chuẩn TOTP —
            không cần Google OAuth server.
          </p>
          <label className="block max-w-sm text-xs text-muted">
            Mật khẩu tài khoản
            <Input
              type="password"
              className="mt-1"
              value={totpPw}
              onChange={(e) => setTotpPw(e.target.value)}
            />
          </label>
          {!isTotpEnabled() ? (
            <>
              <Button
                size="sm"
                onClick={async () => {
                  const r = await beginTotpSetup(totpPw);
                  if (!r.ok) return toast.error(r.message);
                  setTotpSetup({ secret: r.secret!, qrUrl: r.qrUrl! });
                  toast.message(r.message);
                }}
              >
                Bật Google Authenticator
              </Button>
              {totpSetup ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={totpSetup.qrUrl}
                      alt="QR 2FA"
                      className="h-40 w-40 rounded bg-white p-1"
                    />
                    <code className="text-[11px]">{totpSetup.secret}</code>
                  </div>
                  <div className="space-y-2">
                    <Input
                      className="font-mono tracking-widest"
                      placeholder="Mã 6 số"
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
                2FA bật cho {session?.username}
              </p>
              <Input
                className="max-w-xs font-mono"
                placeholder="Mã để tắt 2FA"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const r = await disableTotp(totpPw, totpCode);
                  if (!r.ok) return toast.error(r.message);
                  toast.success(r.message);
                  setTotpCode("");
                  setTotpPw("");
                }}
              >
                Tắt 2FA
              </Button>
            </div>
          )}
          {backupCodes ? (
            <div className="rounded-md border border-warn/40 bg-warn-soft/30 p-3 text-xs">
              <strong>Mã dự phòng (lưu ngay):</strong>
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
          <CardTitle>Giao diện & mật độ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dark}
                onChange={(e) => setDark(e.target.checked)}
              />
              Chế độ tối
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={uiPrefs.reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
              Giảm chuyển động
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={uiPrefs.highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
              />
              Tăng độ tương phản
            </label>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">
              Mật độ bảng (kế toán hay dùng Gọn)
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["compact", "Gọn"],
                  ["comfortable", "Thoáng"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={uiPrefs.density === id ? "default" : "secondary"}
                  onClick={() => setDensity(id as Density)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.dispatchEvent(new Event("erp-restart-tour"))}
          >
            Chạy lại tour hướng dẫn (theo vai)
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thương hiệu / letterhead (live)</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs text-muted">
              Màu brand (letterhead)
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded border border-border bg-surface"
                  value={company.brandColor || "#0B7285"}
                  onChange={(e) => updateCompany({ brandColor: e.target.value })}
                />
                <Input
                  value={company.brandColor || "#0B7285"}
                  onChange={(e) => updateCompany({ brandColor: e.target.value })}
                  className="font-mono"
                />
              </div>
            </label>
            <label className="block text-xs text-muted">
              Logo công ty
              <Input
                type="file"
                accept="image/*"
                className="mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 400_000) {
                    toast.error("Logo tối đa ~400KB");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    updateCompany({ logoDataUrl: String(reader.result || "") });
                    toast.success("Đã nạp logo");
                  };
                  reader.readAsDataURL(f);
                }}
              />
            </label>
            {company.logoDataUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateCompany({ logoDataUrl: "" })}
              >
                Xóa logo
              </Button>
            ) : null}
            <Button size="sm" onClick={save}>
              <Save className="h-4 w-4" />
              Lưu letterhead
            </Button>
          </div>
          {/* Live preview */}
          <div
            className="rounded-[var(--radius-lg)] border border-border bg-white p-4 text-fg shadow-sm"
            style={{
              borderTopWidth: 4,
              borderTopColor: company.brandColor || "#0B7285",
            }}
          >
            <div className="flex items-start gap-3 border-b border-border pb-3">
              <div
                className="grid h-12 w-12 place-items-center overflow-hidden rounded-md text-xs font-bold text-white"
                style={{ background: company.brandColor || "#0B7285" }}
              >
                {company.logoDataUrl ? (
                  <img
                    src={company.logoDataUrl}
                    alt="Logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "LOGO"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">
                  {company.companyName || "Tên công ty"}
                </div>
                <div className="text-[11px] text-muted">
                  MST {company.taxId || "—"} · {company.phone || "—"}
                </div>
                <div className="text-[11px] text-muted">
                  {company.address || "Địa chỉ letterhead"}
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm font-semibold">BÁO GIÁ / CHỨNG TỪ</div>
            <div className="mt-1 text-xs text-muted">
              Màu chữ phụ:{" "}
              <span style={{ color: brandDerivatives(company.brandColor || "#0B7285").ink }}>
                brand-ink
              </span>
            </div>
            <div
              className="mt-3 rounded-md px-3 py-2 text-center text-xs font-semibold text-white"
              style={{ background: company.brandColor || "#0B7285" }}
            >
              Nút hành động mẫu
            </div>
          </div>
        </CardBody>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Tiếp cận (WCAG 2.1 AA)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-muted">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-fg">Bàn phím:</strong> Tab / Shift+Tab · Esc đóng
              modal · Ctrl/⌘K tìm nhanh · Skip link tới nội dung chính
            </li>
            <li>
              <strong className="text-fg">Tương phản:</strong> chữ & UI ≥ 4.5:1 · focus
              ring 2px brand · dark mode đã chỉnh AA · tùy chọn Tăng độ tương phản
            </li>
            <li>
              <strong className="text-fg">Form:</strong> label gắn input · lỗi{" "}
              <code className="text-fg">role="alert"</code> · required công bố
            </li>
            <li>
              <strong className="text-fg">Landmarks:</strong> banner · nav · main#main-content ·
              dialog aria-modal
            </li>
            <li>
              <strong className="text-fg">Chuyển động:</strong> tôn trọng prefers-reduced-motion
              · tùy chọn Giảm chuyển động ở trên
            </li>
          </ul>
          <p className="text-xs">
            Mục tiêu: WCAG 2.1 mức <strong className="text-fg">AA</strong> cho app demo
            (không thay audit bên thứ ba).
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dữ liệu demo</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              wipeOperationalData({ keepCompany: true });
              toast.message("Đã xóa dữ liệu nghiệp vụ");
            }}
          >
            <Trash2 className="h-4 w-4" />
            Xóa data về 0
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              resetDemo();
              toast.message("Đã nạp lại demo");
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Nạp lại demo
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/app/scan">
              <FolderSearch className="h-4 w-4" />
              Quét dữ liệu DN
            </Link>
          </Button>
        </CardBody>
      </Card>

      <p className="text-xs text-muted">
        Mẫu chứng từ: {CHUNG_TU.length} loại · Báo giá: {quotations.length}
      </p>
    </div>
  );
}
