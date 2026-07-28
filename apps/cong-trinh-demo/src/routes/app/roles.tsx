import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_USERS, ROLES } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/roles")({
  component: RolesPage,
});

function RolesPage() {
  const user = useErpStore((s) => s.user);
  const login = useErpStore((s) => s.login);
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cấp tài khoản cho từng thành viên — mật khẩu khởi tạo an toàn, bắt đổi
        khi đăng nhập lần đầu (trong bản cài Windows). Demo này cho phép chuyển
        vai trò ngay để xem giao diện.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ROLES.map((r) => {
          const u = DEMO_USERS.find((x) => x.role === r.id);
          const active = user?.role === r.id;
          return (
            <Card
              key={r.id}
              className={cn(active && "border-brand ring-2 ring-brand/20")}
            >
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-fg">{r.id}</div>
                    <div className="text-xs font-semibold text-brand-ink">
                      {r.label}
                    </div>
                  </div>
                  {active ? <Badge variant="brand">Đang dùng</Badge> : null}
                </div>
                <p className="text-xs text-muted">{r.desc}</p>
                {u ? (
                  <div className="rounded-[var(--radius-sm)] bg-surface-2 px-2.5 py-2 text-xs">
                    <div className="font-medium text-fg">{u.name}</div>
                    <div className="text-muted">user: {u.username}</div>
                  </div>
                ) : null}
                {u && !active ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      login(u.username);
                      void navigate({ to: "/app/dashboard" });
                    }}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Chuyển sang vai này
                  </Button>
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
            Nguyên tắc phân quyền
          </CardTitle>
        </CardHeader>
        <CardBody className="grid gap-2 text-sm text-muted sm:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-border p-3">
            Quyền kiểm soát ở API — không chỉ ẩn nút trên giao diện.
          </div>
          <div className="rounded-[var(--radius-md)] border border-border p-3">
            Kỹ thuật hiện trường không mặc định thấy biên lợi nhuận / giá vốn.
          </div>
          <div className="rounded-[var(--radius-md)] border border-border p-3">
            Kế toán: công nợ, sao kê, BQT, thư đề nghị thanh toán.
          </div>
          <div className="rounded-[var(--radius-md)] border border-border p-3">
            Giám đốc: duyệt UNC, báo giá, tổng quan điều hành.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
