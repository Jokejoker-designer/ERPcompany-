import { useState } from "react";
import { KeyRound, ShieldAlert, Eye, EyeOff, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardBody, Field, Input, Select } from "@retail/components/ui";
import {
  SECURITY_QUESTIONS,
  validateNewPassword,
} from "@retail/lib/auth";
import { useRetailStore } from "@retail/store/retail-store";

/**
 * Full-screen gate after first login — password change + recovery Q&A.
 */
export function ForceChangePassword() {
  const user = useRetailStore((s) => s.user);
  const changePassword = useRetailStore((s) => s.changePassword);
  const credentials = useRetailStore((s) => s.credentials);
  const logout = useRetailStore((s) => s.logout);

  const uname = user?.username?.toLowerCase() || "";
  const hasRecovery = Boolean(
    credentials[uname]?.recoveryQuestion &&
      credentials[uname]?.recoveryAnswerHash,
  );

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState<string>(SECURITY_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const policy = validateNewPassword(next, {
    currentPassword: current || undefined,
    username: user?.username,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await changePassword(
        current,
        next,
        confirm,
        hasRecovery
          ? undefined
          : { question, answer },
      );
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    policy.ok &&
    next === confirm &&
    current.length > 0 &&
    (hasRecovery || answer.trim().length >= 2);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardBody className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-warn-soft text-warn">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-fg">
                Bắt buộc đổi mật khẩu
              </h1>
              <p className="mt-1 text-sm text-muted">
                Xin chào <strong className="text-fg">{user?.name}</strong> (
                {user?.username}). Đặt mật khẩu mới
                {!hasRecovery
                  ? " và câu hỏi bảo mật (dùng khi quên mật khẩu)"
                  : ""}{" "}
                trước khi vào hệ thống.
              </p>
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <KeyRound className="mr-1 inline h-3.5 w-3.5 text-brand" />
            MK: ≥8 ký tự, hoa + thường + số. Câu trả lời bảo mật hãy chọn thứ
            chỉ bạn biết.
          </div>

          <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <Field id="fc-current" label="Mật khẩu hiện tại" required>
              <Input
                type={show ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus
              />
            </Field>
            <label className="block text-xs text-muted">
              Mật khẩu mới
              <div className="relative mt-1">
                <Input
                  type={show ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <Field id="fc-confirm" label="Nhập lại mật khẩu mới" required>
              <Input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>

            {!hasRecovery ? (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-brand/30 bg-brand-soft/20 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink">
                  <HelpCircle className="h-3.5 w-3.5" />
                  Câu hỏi bảo mật (quên mật khẩu)
                </div>
                <label className="block text-xs text-muted">
                  Câu hỏi
                  <Select
                    className="mt-1"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  >
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-xs text-muted">
                  Câu trả lời (bí mật)
                  <Input
                    className="mt-1"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    required
                    placeholder="Chỉ bạn biết — không phân biệt hoa/thường"
                    autoComplete="off"
                  />
                </label>
              </div>
            ) : null}

            {next ? (
              <p
                className={`text-xs ${policy.ok ? "text-ok" : "text-warn"}`}
                role="status"
                aria-live="polite"
              >
                {policy.ok ? "Mật khẩu mới đạt yêu cầu." : policy.message}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !canSubmit}
            >
              {busy ? "Đang lưu…" : "Đổi mật khẩu & vào hệ thống"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => logout()}
            >
              Đăng xuất
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
