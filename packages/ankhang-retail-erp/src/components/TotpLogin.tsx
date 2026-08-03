import { useState } from "react";
import { Smartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardBody, Field, Input } from "@retail/components/ui";
import { useRetailStore } from "@retail/store/retail-store";

export function TotpLogin() {
  const pending = useRetailStore((s) => s.pendingTotpUser);
  const verifyLoginTotp = useRetailStore((s) => s.verifyLoginTotp);
  const cancelPendingTotp = useRetailStore((s) => s.cancelPendingTotp);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await verifyLoginTotp(code);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardBody className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-brand-ink">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h1 id="totp-title" className="text-lg font-bold">Xác thực 2 lớp (2FA)</h1>
              <p className="mt-1 text-sm text-muted">
                Tài khoản <strong className="text-fg">{pending}</strong> đã bật
                Google Authenticator. Mở app Authenticator và nhập mã 6 số.
              </p>
            </div>
          </div>
          <form className="space-y-3" onSubmit={(e) => void submit(e)} aria-labelledby="totp-title">
            <Field id="totp-code" label="Mã Authenticator / mã dự phòng" required>
              <Input
                className="text-center font-mono text-xl tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                placeholder="000000"
                autoFocus
                required
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
              {busy ? "Đang xác thực…" : "Xác nhận"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => cancelPendingTotp()}
            >
              Hủy / đăng nhập lại
            </Button>
          </form>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
            Tương thích Google Authenticator, Microsoft Authenticator, Authy.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
