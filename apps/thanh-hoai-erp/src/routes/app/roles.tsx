import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_USERS, ROLES } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { cn } from "@/lib/utils";
import { RBAC_MATRIX, ROUTE_ROLES } from "@/lib/rbac";

export const Route = createFileRoute("/app/roles")({
  component: RolesPage,
});

function RolesPage() {
  const user = useErpStore((s) => s.user);
  const credentials = useErpStore((s) => s.credentials);

  if (user?.role !== "admin") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3 p-6 text-sm text-danger">
          <Lock className="h-5 w-5 shrink-0" />
          Chỉ <strong>Admin</strong> được xem / quản lý phân quyền.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Menu ERP được lọc theo vai trò. Truy cập trực tiếp URL trang không được
        phép sẽ bị chặn và chuyển về trang đầu tiên user có quyền. Role lấy từ
        session registry — không tin chỉnh F12.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ROLES.map((r) => {
          const u = DEMO_USERS.find((x) => x.role === r.id);
          const active = user?.role === r.id;
          const cred = u ? credentials[u.username] : null;
          const menuCount = Object.values(ROUTE_ROLES).filter((roles) =>
            roles.includes(r.id),
          ).length;
          return (
            <Card
              key={r.id}
              className={cn(active && "border-brand ring-2 ring-brand/20")}
            >
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-fg">{r.label}</div>
                    <div className="text-xs text-muted">{r.id}</div>
                  </div>
                  {active ? <Badge variant="brand">Bạn</Badge> : null}
                </div>
                <p className="text-xs text-muted">{r.desc}</p>
                <Badge variant="info">{menuCount}/13 mục menu</Badge>
                {u ? (
                  <div className="space-y-1 rounded-[var(--radius-sm)] bg-surface-2 px-2.5 py-2 text-xs">
                    <div className="font-medium text-fg">{u.name}</div>
                    <div className="text-muted">user: {u.username}</div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {cred?.mustChangePassword ? (
                        <Badge variant="warn">Phải đổi MK</Badge>
                      ) : (
                        <Badge variant="ok">MK đã đổi</Badge>
                      )}
                      {cred?.totpEnabled ? (
                        <Badge variant="brand">2FA</Badge>
                      ) : (
                        <Badge variant="default">Chưa 2FA</Badge>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand" />
            Ma trận quyền menu 1→13
          </CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/70 text-[11px] text-muted">
                <th className="px-3 py-2 font-semibold">Module</th>
                <th className="px-3 py-2 font-semibold">Admin</th>
                <th className="px-3 py-2 font-semibold">GĐ</th>
                <th className="px-3 py-2 font-semibold">Kế toán</th>
                <th className="px-3 py-2 font-semibold">KD</th>
                <th className="px-3 py-2 font-semibold">KTT</th>
                <th className="px-3 py-2 font-semibold">KTV</th>
                <th className="px-3 py-2 font-semibold">Thủ kho</th>
              </tr>
            </thead>
            <tbody>
              {RBAC_MATRIX.map((row) => (
                <tr key={row.route} className="border-b border-border-soft">
                  <td className="px-3 py-2 font-medium">{row.module}</td>
                  <td className="px-3 py-2">{row.admin}</td>
                  <td className="px-3 py-2">{row.giamdoc}</td>
                  <td className="px-3 py-2">{row.ketoan}</td>
                  <td className="px-3 py-2">{row.kinhdoanh}</td>
                  <td className="px-3 py-2">{row.ktt}</td>
                  <td className="px-3 py-2">{row.ktv}</td>
                  <td className="px-3 py-2">{row.thukho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Nguyên tắc
          </CardTitle>
        </CardHeader>
        <CardBody className="grid gap-2 text-sm text-muted sm:grid-cols-2">
          <div>• Menu ẩn = không có quyền (không chỉ ẩn UI)</div>
          <div>• Gõ URL trực tiếp cũng bị chặn + redirect</div>
          <div>• 12 Cấu hình: Admin + Giám đốc</div>
          <div>• 13 Phân quyền: chỉ Admin</div>
          <div>• 10–11 Công nợ / NH: Admin · GĐ · Kế toán</div>
          <div>• 4 Báo giá: Admin · GĐ · Kinh doanh</div>
        </CardBody>
      </Card>
    </div>
  );
}
