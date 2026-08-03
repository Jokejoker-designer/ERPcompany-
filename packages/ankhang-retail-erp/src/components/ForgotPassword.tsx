import { useState } from "react";
import { KeyRound, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardBody, Field, Input } from "@retail/components/ui";
import { validateNewPassword } from "@retail/lib/auth";
import { useRetailStore } from "@retail/store/retail-store";

type Props = {
  onBack: () => void;
  initialUsername?: string;
};

/**
 * Self-service forgot password via security question (set at first password change).
 */
export function ForgotPassword({ onBack, initialUsername = "" }: Props) {
  const peekRecoveryQuestion = useRetailStore((s) => s.peekRecoveryQuestion);
  const resetPasswordWithRecovery = useRetailStore(
    (s) => s.resetPasswordWithRecovery,
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState(initialUsername);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const policy = validateNewPassword(next, { username: username || undefined });

  async function loadQuestion(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = peekRecoveryQuestion(username);
      if (!r.ok || !r.question) {
        toast.error(r.message);
        return;
      }
      setQuestion(r.question);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await resetPasswordWithRecovery(
        username,
        answer,
        next,
        confirm,
      );
      if (r.ok) {
        toast.success(r.message);
        onBack();
      } else toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardBody className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-ink">
          <KeyRound className="h-4 w-4" />
          Quên mật khẩu
        </div>
        <p className="text-sm text-muted">
          Khôi phục bằng <strong className="text-fg">câu hỏi bảo mật</strong>{" "}
          đã thiết lập khi đổi mật khẩu lần đầu. Nếu chưa thiết lập — nhờ Chủ
          cửa hàng reset tại mục Phân quyền.
        </p>

        {step === 1 ? (
          <form className="space-y-3" onSubmit={(e) => void loadQuestion(e)}>
            <Field id="fp-user" label="Tên đăng nhập" required>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="owner / cashier / …"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Đang kiểm tra…" : "Tiếp tục"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Về đăng nhập
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => void reset(e)}>
            <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm">
              <div className="text-[11px] text-muted">Câu hỏi bảo mật</div>
              <div className="font-medium text-fg">{question}</div>
            </div>
            <label className="block text-xs text-muted">
              Câu trả lời
              <Input
                className="mt-1"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
                autoFocus
                autoComplete="off"
              />
            </label>
            <label className="block text-xs text-muted">
              Mật khẩu mới
              <Input
                className="mt-1"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
            <label className="block text-xs text-muted">
              Nhập lại mật khẩu mới
              <Input
                className="mt-1"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
            {next ? (
              <p className={`text-xs ${policy.ok ? "text-ok" : "text-warn"}`}>
                {policy.ok ? "Mật khẩu đạt yêu cầu." : policy.message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !policy.ok || next !== confirm}
            >
              {busy ? "Đang đặt lại…" : "Đặt lại mật khẩu"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep(1);
                setAnswer("");
                setNext("");
                setConfirm("");
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Đổi tài khoản
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
