import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  HardHat,
  ShoppingCart,
  ShieldCheck,
  Smartphone,
  KeyRound,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, SkipLink, SrOnly } from "@/components/ui/a11y";
import { DEMO_USERS } from "@/data/seed";
import {
  DEMO_PLAIN_PASSWORDS,
  SECURITY_QUESTIONS,
  validateNewPassword,
} from "@/lib/erp-auth";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  ssr: false,
});

function LoginPage() {
  const user = useErpStore((s) => s.user);
  const session = useErpStore((s) => s.session);
  const pendingTotp = useErpStore((s) => s.pendingTotpUser);
  const credentials = useErpStore((s) => s.credentials);
  const needsPasswordChange = useErpStore((s) => s.needsPasswordChange);
  const refreshSession = useErpStore((s) => s.refreshSession);
  const company = useErpStore((s) => s.company);
  const navigate = useNavigate();
  const [booting, setBooting] = useState(true);

  // Recompute when credentials/session change (must not depend on function identity only)
  const mustChange = Boolean(user && needsPasswordChange());

  useEffect(() => {
    void (async () => {
      if (session) await refreshSession();
      setBooting(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (booting) return;
    if (user && !mustChange && !pendingTotp) {
      void navigate({ to: "/app/dashboard" });
    }
  }, [user, booting, mustChange, pendingTotp, navigate, credentials]);

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted">
        Đang xác thực…
      </div>
    );
  }

  if (pendingTotp) return <TotpStep />;
  if (user && mustChange) return <ForceChangeStep />;
  if (user) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted">
        Đang vào hệ thống…
      </div>
    );
  }

  return <LoginForm companyName={company.productName} />;
}

function LoginForm({ companyName }: { companyName?: string }) {
  const login = useErpStore((s) => s.login);
  const [username, setUsername] = useState("giamdoc");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  async function doLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await login(username, password);
      if (!r.ok) toast.error(r.message);
      else if (r.needsTotp) toast.message("Nhập mã Google Authenticator");
      else if (r.mustChangePassword)
        toast.message("Bắt buộc đổi mật khẩu + câu hỏi bảo mật");
      else toast.success(r.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "forgot") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <ForgotStep
          initial={username}
          onBack={() => setMode("login")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      <SkipLink href="#login-form" />
      <div className="relative flex flex-1 flex-col justify-between bg-nav px-6 py-10 text-nav-ink sm:px-10">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-brand text-sm font-bold text-on-brand">
              TH
            </div>
            <div>
              <div className="text-lg font-bold">
                {companyName || "Thanh Hoai ERP"}
              </div>
              <div className="text-sm text-nav-muted">
                SME xây dựng · Bảo mật mật khẩu + Google Authenticator
              </div>
            </div>
          </div>
          <h1 className="max-w-lg text-2xl font-bold leading-tight sm:text-3xl">
            ERP công trình — đăng nhập an toàn như POS
          </h1>
          <p className="mt-3 max-w-md text-sm text-nav-muted">
            Mật khẩu · đổi MK lần đầu · quên MK · 2FA Google Authenticator.
            Setup A→Z · báo giá BOQ · chứng từ · công nợ.
          </p>
        </div>
        <div className="mt-10 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "MK + 2FA Authenticator",
              "Quên MK · câu hỏi BM",
              "Phân quyền theo vai",
              "Setup A→Z · wipe data",
            ].map((t) => (
              <div
                key={t}
                className="rounded-[var(--radius-md)] border border-nav-line bg-white/5 px-3 py-2.5 text-sm"
              >
                {t}
              </div>
            ))}
          </div>
          <Link
            to="/pos"
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-brand/40 bg-brand/20 px-4 py-3 transition hover:bg-brand/30"
          >
            <ShoppingCart className="h-5 w-5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                AnKhang POS (bán lẻ)
              </span>
              <span className="block text-xs text-nav-muted">
                /pos — cùng chuẩn bảo mật 2FA
              </span>
            </span>
          </Link>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md shadow-[var(--shadow-panel)]">
          <CardBody className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-brand-ink">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <span className="text-sm font-bold uppercase tracking-wide">
                Đăng nhập ERP công trình
              </span>
            </div>
            <form
              id="login-form"
              className="space-y-3"
              onSubmit={(e) => void doLogin(e)}
              aria-labelledby="login-heading"
            >
              <SrOnly as="h2" id="login-heading">
                Form đăng nhập
              </SrOnly>
              <Field id="login-user" label="Tài khoản" required>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field id="login-pass" label="Mật khẩu" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-ink underline-offset-2 hover:underline"
                  onClick={() => setMode("forgot")}
                >
                  Quên mật khẩu?
                </button>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Đang đăng nhập…" : "Đăng nhập"}
              </Button>
            </form>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase text-muted">
                Chọn nhanh (điền MK mặc định)
              </div>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand-soft/30"
                  onClick={() => {
                    setUsername(u.username);
                    setPassword(DEMO_PLAIN_PASSWORDS[u.username] || "");
                  }}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                    {u.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">
                      {u.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {u.username} · {u.roleLabel}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              <HardHat className="mr-1 inline h-3.5 w-3.5" />
              Demo: <code>giamdoc / Giamdoc@2026</code> ·{" "}
              <code>admin / Admin@2026</code>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function TotpStep() {
  const pending = useErpStore((s) => s.pendingTotpUser);
  const verifyLoginTotp = useErpStore((s) => s.verifyLoginTotp);
  const cancelPendingTotp = useErpStore((s) => s.cancelPendingTotp);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <Smartphone className="h-6 w-6 text-brand" />
            <div>
              <h1 className="text-lg font-bold">Google Authenticator</h1>
              <p className="text-sm text-muted">
                Tài khoản <strong>{pending}</strong> — nhập mã 6 số từ app.
              </p>
            </div>
          </div>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await verifyLoginTotp(code);
                if (r.ok) toast.success(r.message);
                else toast.error(r.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              className="text-center font-mono text-xl tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={12}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={busy}>
              Xác nhận
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => cancelPendingTotp()}
            >
              Hủy
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function ForceChangeStep() {
  const user = useErpStore((s) => s.user);
  const changePassword = useErpStore((s) => s.changePassword);
  const logout = useErpStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState<string>(SECURITY_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const policy = validateNewPassword(next, {
    currentPassword: current || undefined,
    username: user?.username,
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <KeyRound className="h-6 w-6 text-warn" />
            <div>
              <h1 className="text-lg font-bold">Bắt buộc đổi mật khẩu</h1>
              <p className="text-sm text-muted">
                Xin chào {user?.name}. Đặt MK mới + câu hỏi bảo mật trước khi
                vào ERP.
              </p>
            </div>
          </div>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await changePassword(current, next, confirm, {
                  question,
                  answer,
                });
                if (r.ok) toast.success(r.message);
                else toast.error(r.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-xs text-muted">
              MK hiện tại
              <Input
                type="password"
                className="mt-1"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              MK mới
              <Input
                type="password"
                className="mt-1"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              Nhập lại MK mới
              <Input
                type="password"
                className="mt-1"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              Câu hỏi bảo mật
              <select
                className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted">
              Câu trả lời
              <Input
                className="mt-1"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
              />
            </label>
            {next ? (
              <p className={`text-xs ${policy.ok ? "text-ok" : "text-warn"}`}>
                {policy.ok ? "MK đạt yêu cầu" : policy.message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !policy.ok || next !== confirm}
            >
              Đổi mật khẩu & vào hệ thống
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => logout()}>
              Đăng xuất
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function ForgotStep({
  initial,
  onBack,
}: {
  initial: string;
  onBack: () => void;
}) {
  const peek = useErpStore((s) => s.peekRecoveryQuestion);
  const reset = useErpStore((s) => s.resetPasswordWithRecovery);
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState(initial);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const policy = validateNewPassword(next, { username });

  return (
    <Card className="w-full max-w-md">
      <CardBody className="space-y-4 p-6">
        <div className="flex items-center gap-2 font-bold text-brand-ink">
          <KeyRound className="h-4 w-4" />
          Quên mật khẩu ERP
        </div>
        {step === 1 ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const r = peek(username);
              if (!r.ok || !r.question) return toast.error(r.message);
              setQuestion(r.question);
              setStep(2);
            }}
          >
            <label className="block text-xs text-muted">
              Tên đăng nhập
              <Input
                className="mt-1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <Button type="submit" className="w-full">
              Tiếp tục
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Về đăng nhập
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await reset(username, answer, next, confirm);
                if (r.ok) {
                  toast.success(r.message);
                  onBack();
                } else toast.error(r.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
              <div className="text-[11px] text-muted">Câu hỏi</div>
              {question}
            </div>
            <Input
              placeholder="Câu trả lời"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="MK mới"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Nhập lại MK mới"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !policy.ok || next !== confirm}
            >
              Đặt lại mật khẩu
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
