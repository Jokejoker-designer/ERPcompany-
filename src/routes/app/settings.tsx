import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderSearch, Rocket, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CT_TEMPLATES } from "@/data/ct-registry";
import { CHUNG_TU, ROLES, setupCompletion } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";

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
  const pct = setupCompletion(onboarding.flags);

  function save() {
    toast.success("Đã lưu cấu hình công ty", {
      description: "Letterhead báo giá / chứng từ đã cập nhật.",
    });
    useErpStore.getState().markSetup("company");
  }

  return (
    <div className="space-y-4">
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
          tone="ok"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ công ty (letterhead)</CardTitle>
          {onboarding.wipedAfterSetup ? (
            <Badge variant="ok">Đã setup · dữ liệu ops = 0</Badge>
          ) : null}
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["companyName", "Tên công ty"],
              ["taxId", "MST"],
              ["address", "Địa chỉ"],
              ["phone", "Điện thoại"],
              ["hotline", "Hotline"],
              ["website", "Website"],
              ["scanRoots", "Thư mục quét DN (scan_roots)"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className={key === "scanRoots" ? "sm:col-span-2" : ""}
            >
              <label className="mb-1 block text-xs font-semibold text-muted">
                {label}
              </label>
              <Input
                value={company[key]}
                onChange={(e) => updateCompany({ [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button size="sm" onClick={save}>
              <Save className="h-3.5 w-3.5" />
              Lưu
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/app/scan">
                <FolderSearch className="h-3.5 w-3.5" />
                Mở quét dữ liệu DN
              </Link>
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dữ liệu hệ thống</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              wipeOperationalData({ keepCompany: true });
              toast.success("Đã xóa về 0 — giữ letterhead công ty");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa dữ liệu về 0 (giữ công ty)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              resetDemo();
              toast.message("Khôi phục dữ liệu demo + mở wizard");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục demo
          </Button>
          <span className="w-full text-xs text-muted">
            Báo giá hiện có: {quotations.length}. Sau setup A→Z hoàn tất, ops
            data tự về 0.
          </span>
        </CardBody>
      </Card>
    </div>
  );
}
