import { useState } from "react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
} from "@retail/components/ui";
import { DEMO_USERS } from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

const MATRIX: {
  module: string;
  owner: string;
  manager: string;
  cashier: string;
  warehouse: string;
}[] = [
  {
    module: "POS bán hàng",
    owner: "Full",
    manager: "Full",
    cashier: "Execute",
    warehouse: "—",
  },
  {
    module: "Sửa giá / chiết khấu sâu",
    owner: "Full",
    manager: "Override",
    cashier: "Khóa",
    warehouse: "—",
  },
  {
    module: "Nhập kho / GRN",
    owner: "Full",
    manager: "Duyệt",
    cashier: "—",
    warehouse: "Execute",
  },
  {
    module: "Kiểm kho / cân bằng",
    owner: "Full",
    manager: "Approve",
    cashier: "—",
    warehouse: "Count",
  },
  {
    module: "Báo cáo / Z-read",
    owner: "Full",
    manager: "Full",
    cashier: "Ca mình",
    warehouse: "—",
  },
  {
    module: "Master data SKU",
    owner: "Full",
    manager: "Edit",
    cashier: "Read giá",
    warehouse: "Read",
  },
  {
    module: "Cấu hình / QR TT",
    owner: "Full",
    manager: "—",
    cashier: "—",
    warehouse: "—",
  },
  {
    module: "Reset mật khẩu NV",
    owner: "Full",
    manager: "—",
    cashier: "—",
    warehouse: "—",
  },
];

export function RolesPage() {
  const user = useRetailStore((s) => s.user);
  const credentials = useRetailStore((s) => s.credentials);
  const ownerResetUserPassword = useRetailStore((s) => s.ownerResetUserPassword);
  const isOwner = user?.role === "owner";

  const [ownerPw, setOwnerPw] = useState("");
  const [lastTemp, setLastTemp] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function resetUser(username: string) {
    if (!ownerPw) {
      toast.error("Nhập mật khẩu Chủ cửa hàng để reset");
      return;
    }
    setBusy(username);
    try {
      const r = await ownerResetUserPassword(username, ownerPw);
      if (r.ok) {
        toast.success(r.message, {
          description: r.temporaryPassword
            ? `Mật khẩu tạm: ${r.temporaryPassword}`
            : undefined,
        });
        if (r.temporaryPassword) {
          setLastTemp((s) => ({ ...s, [username]: r.temporaryPassword! }));
        }
      } else toast.error(r.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>RBAC</strong> — thu ngân chỉ POS; quản lý duyệt kho/báo cáo;
          Chủ CH cấu hình + <strong>reset mật khẩu</strong> khi nhân viên quên
          và chưa có câu hỏi bảo mật.
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_USERS.map((u) => {
          const cred = credentials[u.username];
          const hasRec = Boolean(
            cred?.recoveryQuestion && cred?.recoveryAnswerHash,
          );
          return (
            <Card key={u.id}>
              <CardBody className="space-y-2">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
                  {u.initials}
                </div>
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-muted">{u.roleLabel}</div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="brand">{u.username}</Badge>
                  {cred?.mustChangePassword ? (
                    <Badge variant="warn">Phải đổi MK</Badge>
                  ) : (
                    <Badge variant="ok">MK đã đổi</Badge>
                  )}
                  {hasRec ? (
                    <Badge variant="info">Có câu hỏi BM</Badge>
                  ) : (
                    <Badge variant="default">Chưa BM</Badge>
                  )}
                </div>
                {lastTemp[u.username] ? (
                  <p className="rounded bg-surface-2 px-2 py-1 font-mono text-[11px]">
                    Tạm: {lastTemp[u.username]}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Reset mật khẩu nhân viên (Chủ cửa hàng)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              Tạo mật khẩu tạm + bắt buộc đổi MK khi đăng nhập lại. Dùng khi
              nhân viên quên MK và không nhớ câu trả lời bảo mật.
            </p>
            <label className="block max-w-sm text-xs text-muted">
              Mật khẩu Chủ cửa hàng *
              <Input
                type="password"
                className="mt-1"
                value={ownerPw}
                onChange={(e) => setOwnerPw(e.target.value)}
                placeholder="Xác thực owner"
                autoComplete="off"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {DEMO_USERS.filter((u) => u.username !== "owner").map((u) => (
                <Button
                  key={u.id}
                  size="sm"
                  variant="secondary"
                  disabled={busy === u.username}
                  onClick={() => void resetUser(u.username)}
                >
                  {busy === u.username
                    ? "Đang reset…"
                    : `Reset · ${u.username}`}
                </Button>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="text-sm text-muted">
            Chỉ Chủ cửa hàng được reset mật khẩu nhân viên. Nhân viên tự khôi
            phục qua «Quên mật khẩu?» trên màn đăng nhập (nếu đã có câu hỏi
            bảo mật).
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ma trận quyền</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/70 text-xs text-muted">
                <th className="px-3 py-2 font-semibold">Module</th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold">Manager</th>
                <th className="px-3 py-2 font-semibold">Cashier</th>
                <th className="px-3 py-2 font-semibold">Kho</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.module} className="border-b border-border-soft">
                  <td className="px-3 py-2 font-medium">{row.module}</td>
                  <td className="px-3 py-2">{row.owner}</td>
                  <td className="px-3 py-2">{row.manager}</td>
                  <td className="px-3 py-2">{row.cashier}</td>
                  <td className="px-3 py-2">{row.warehouse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
