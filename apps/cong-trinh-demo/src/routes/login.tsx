import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, HardHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { DEMO_USERS } from "@/data/seed";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  ssr: false,
});

function LoginPage() {
  const login = useErpStore((s) => s.login);
  const user = useErpStore((s) => s.user);
  const company = useErpStore((s) => s.company);
  const navigate = useNavigate();

  if (user) {
    void navigate({ to: "/app/dashboard" });
  }

  function doLogin(username: string) {
    if (login(username)) {
      toast.success("Đăng nhập thành công");
      void navigate({ to: "/app/dashboard" });
    } else {
      toast.error("Tài khoản không hợp lệ");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-between bg-nav px-6 py-10 text-nav-ink sm:px-10">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-brand text-sm font-bold text-on-brand">
              TH
            </div>
            <div>
              <div className="text-lg font-bold">
                {company.productName || "Thanh Hoai ERP"}
              </div>
              <div className="text-sm text-nav-muted">
                SME xây dựng · Hồ sơ CT · Local demo
              </div>
            </div>
          </div>
          <h1 className="max-w-lg text-2xl font-bold leading-tight sm:text-3xl">
            ERP công trình — từ profile khách đến chứng từ & công nợ
          </h1>
          <p className="mt-3 max-w-md text-sm text-nav-muted">
            Setup A→Z · báo giá BOQ nhiều hạng mục · quét folder DN · import
            chuẩn · xuất chứng từ bám đúng công trình.
          </p>
        </div>
        <div className="mt-10 grid gap-2 sm:grid-cols-2">
          {[
            "1–3 · Dashboard · KH · Công trình",
            "4–7 · BG · Quét · Import · Sửa TL",
            "8–9 · Hồ sơ CT · Chứng từ xuất",
            "10–13 · Công nợ · NH · Cấu hình",
          ].map((t) => (
            <div
              key={t}
              className="rounded-[var(--radius-md)] border border-nav-line bg-white/5 px-3 py-2.5 text-sm"
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md shadow-[var(--shadow-panel)]">
          <CardBody className="space-y-5 p-6">
            <div className="flex items-center gap-2 text-brand-ink">
              <HardHat className="h-5 w-5" />
              <span className="text-sm font-bold uppercase tracking-wide">
                Đăng nhập demo
              </span>
            </div>
            <p className="text-sm text-muted">
              Chọn vai trò — dữ liệu lưu local trên trình duyệt.
            </p>
            <div className="space-y-2">
              {DEMO_USERS.map((u) => (
                <Button
                  key={u.id}
                  variant="secondary"
                  className="h-auto w-full justify-start gap-3 py-3"
                  onClick={() => doLogin(u.username)}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                    {u.initials}
                  </span>
                  <span className="text-left">
                    <span className="block font-semibold text-fg">{u.name}</span>
                    <span className="block text-xs text-muted">
                      {u.roleLabel} · {u.username}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-xs text-muted">
              <Building2 className="h-4 w-4 shrink-0 text-brand" />
              Menu chuẩn 1→13 · Setup A→Z sau khi đăng nhập.
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
