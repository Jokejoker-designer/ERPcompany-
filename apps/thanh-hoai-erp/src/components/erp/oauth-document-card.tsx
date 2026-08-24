import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bindOauthIdentity,
  fetchOauthStatus,
  oauthStartUrl,
  type OauthStatus,
} from "@/lib/runtime-documents";
import { useErpStore } from "@/store/erp-store";

export function OauthDocumentCard() {
  const dataSource = useErpStore((s) => s.dataSource);
  const { user, isPending } = useCurrentUserState();
  const [status, setStatus] = useState<OauthStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (dataSource !== "runtime") return;
    try {
      setStatus(await fetchOauthStatus());
    } catch {
      setStatus(null);
    }
  }, [dataSource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function bindFromErp() {
    if (!user?.id) {
      toast.error("Chưa đăng nhập OAuth ERP (Google/X)");
      return;
    }
    setBusy(true);
    try {
      await bindOauthIdentity({
        provider: "grok_google",
        subject: user.id,
        email: user.primaryEmail ?? undefined,
        display_name: user.displayName ?? undefined,
      });
      toast.success("Đã liên kết danh tính OAuth với tài khoản runtime");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Liên kết OAuth thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (dataSource !== "runtime") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4" />
            OAuth tài liệu liên kết
          </CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-muted">
          Bật chế độ Runtime để liên kết Google/Microsoft/ERP OAuth với hồ sơ
          đã ký và token tải file.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" />
          OAuth — bảo mật tài liệu liên kết
        </CardTitle>
        {status?.linked ? (
          <Badge variant="ok">Đã liên kết</Badge>
        ) : (
          <Badge variant="warn">Chưa liên kết</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <p className="text-muted">
          Danh tính OAuth được gắn vào tài khoản runtime để ký số và cấp token
          tải Word/Excel đã liên kết. Không lưu refresh token trên trình duyệt.
        </p>
        {status?.require_for_sign ? (
          <Badge variant="danger">Hệ thống bắt buộc OAuth khi ký</Badge>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || isPending || !user}
            onClick={() => void bindFromErp()}
          >
            Liên kết OAuth ERP
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <a href={oauthStartUrl("google")}>Google (runtime)</a>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <a href={oauthStartUrl("microsoft")}>Microsoft</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void reload()}>
            Tải lại
          </Button>
        </div>
        {status?.identities?.length ? (
          <ul className="space-y-1 text-xs">
            {status.identities.map((id) => (
              <li key={id.id} className="rounded border border-border-soft px-2 py-1">
                <strong>{id.provider}</strong>
                {id.email ? ` · ${id.email}` : ""}
                {id.display_name ? ` · ${id.display_name}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">
            Chưa có danh tính. Đăng nhập Google trên ERP rồi bấm Liên kết, hoặc
            cấu hình TH_OAUTH_GOOGLE_CLIENT_ID trên runtime.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
