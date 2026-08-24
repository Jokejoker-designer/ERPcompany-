import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  FileOutput,
  PenLine,
  RefreshCw,
  RotateCcw,
  Send,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/erp/data-table";
import { FormApprovalBadge } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { runtimeTrangThaiToApproval } from "@/data/form-workflow";
import {
  approveDocument,
  createDocumentRevision,
  fetchCtDossier,
  fetchDocumentSignatures,
  fetchFillPreview,
  fetchOauthStatus,
  generateCtDocument,
  reviewDocument,
  signDocument,
  submitDocument,
  type CtDossier,
  type DocumentSignature,
  type DossierRow,
  type FillPreview,
  type OauthStatus,
} from "@/lib/runtime-documents";
import { canWriteResource } from "@/lib/server-permissions";
import { resolveUserKey } from "@/lib/user-scope";
import { useErpStore } from "@/store/erp-store";

type IssueRow = DossierRow & { approval: ReturnType<typeof runtimeTrangThaiToApproval> };

export function DocumentIssuePanel({
  projectId,
  projectCode,
}: {
  projectId: string;
  projectCode: string;
}) {
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const userKey = resolveUserKey(session, user?.username);
  const permissions = useErpStore((s) => s.serverPermissions);
  const dataSource = useErpStore((s) => s.dataSource);

  const [loading, setLoading] = useState(false);
  const [dossier, setDossier] = useState<CtDossier | null>(null);
  const [oauth, setOauth] = useState<OauthStatus | null>(null);
  const [signatures, setSignatures] = useState<DocumentSignature[]>([]);
  const [fill, setFill] = useState<FillPreview | null>(null);
  const [fillCode, setFillCode] = useState<string | null>(null);

  const canSign = canWriteResource(permissions, "document_sign");
  const canDossier = canWriteResource(permissions, "ct_dossier");
  const canGenerate = canWriteResource(permissions, "ct_sinh_ho_so");

  const reload = useCallback(async () => {
    if (dataSource !== "runtime" || !projectId) return;
    setLoading(true);
    try {
      const [d, o, s] = await Promise.all([
        fetchCtDossier(projectId),
        fetchOauthStatus().catch(() => null),
        fetchDocumentSignatures(projectId).catch(() => ({ rows: [] })),
      ]);
      setDossier(d);
      setOauth(o);
      setSignatures(s.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải hồ sơ phát hành");
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [dataSource, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows: IssueRow[] = useMemo(
    () =>
      (dossier?.rows ?? [])
        .filter((r) => r.applicable !== false)
        .map((r) => ({
          ...r,
          approval: runtimeTrangThaiToApproval(r.trang_thai),
        })),
    [dossier],
  );

  const counts = useMemo(() => {
    return {
      cho: rows.filter((r) => r.approval === "cho_duyet").length,
      duyet: rows.filter((r) => r.approval === "da_duyet").length,
      ky: rows.filter((r) => r.approval === "da_ky").length,
    };
  }, [rows]);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : label);
    }
  }

  async function onFill(maMau: string) {
    setFillCode(maMau);
    try {
      setFill(await fetchFillPreview(projectId, maMau));
    } catch (e) {
      setFill(null);
      toast.error(e instanceof Error ? e.message : "Không xem được dữ liệu điền mẫu");
    }
  }

  if (dataSource !== "runtime") return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Tải luồng phát hành
        </Button>
        <Badge variant="info">{projectCode}</Badge>
        <Badge variant="warn">Chờ duyệt {counts.cho}</Badge>
        <Badge variant="ok">Đã duyệt {counts.duyet}</Badge>
        <Badge variant="brand">Đã ký {counts.ky}</Badge>
        {oauth?.linked ? (
          <Badge variant="ok">OAuth đã gắn</Badge>
        ) : (
          <Badge variant="danger">OAuth chưa gắn</Badge>
        )}
      </div>

      <p className="text-sm text-muted">
        Luồng server: sinh từ DB công trình → gửi duyệt → phê duyệt → ký số →
        phát hành. Nút theo <code>next_action</code> và RBAC runtime.
      </p>

      {fill && fillCode ? (
        <Card className="border-brand/30">
          <CardHeader>
            <CardTitle className="text-sm">
              Điền mẫu từ DB · {fill.ma_mau} · {fill.title}
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setFill(null)}>
              Đóng
            </Button>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div>
              {fill.project_code} — {fill.project_name}
              {fill.customer_name ? ` · ${fill.customer_name}` : ""}
              {" · "}đã điền {fill.filled_count}/{fill.filled_count + fill.missing_count}
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.entries(fill.fields)
                .filter(([, v]) => v)
                .slice(0, 16)
                .map(([k, v]) => (
                  <div key={k} className="rounded border border-border-soft px-2 py-1">
                    <span className="font-mono text-muted">{k}</span>
                    {": "}
                    <span>{v}</span>
                  </div>
                ))}
            </div>
            {fill.missing_count ? (
              <p className="text-muted">
                Trường trống: {fill.missing.slice(0, 8).join(", ")}
                {fill.missing_count > 8 ? "…" : ""}
              </p>
            ) : null}
            {fill.auto_generate ? (
              <Button
                size="sm"
                disabled={!canGenerate}
                onClick={() =>
                  void run("Đã sinh Word/Excel từ DB", () =>
                    generateCtDocument(projectId, fill.ma_mau),
                  )
                }
              >
                <Wand2 className="h-3.5 w-3.5" />
                Sinh file và điền
              </Button>
            ) : (
              <p className="text-muted">{fill.auto_generate_reason}</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <DataTable<IssueRow>
        rows={rows}
        rowKey={(r) => r.ma_mau}
        tableId="document-issue"
        userKey={userKey}
        searchKeys={[
          (r) => r.ma_mau,
          (r) => r.title ?? "",
          (r) => r.trang_thai ?? "",
          (r) => r.next_action ?? "",
        ]}
        searchPlaceholder="Tìm mẫu, trạng thái, hành động…"
        emptyTitle="Không có mẫu áp dụng"
        columns={[
          {
            id: "code",
            header: "Mã",
            sortValue: (r) => r.ma_mau,
            cell: (r) => (
              <code className="text-xs font-bold text-brand-ink">{r.ma_mau}</code>
            ),
          },
          {
            id: "title",
            header: "Mẫu",
            sortValue: (r) => r.title ?? "",
            cell: (r) => (
              <div>
                <div className="max-w-[220px] text-sm">{r.title}</div>
                <div className="text-xs text-muted">
                  {r.format} · {r.next_action ?? "—"}
                </div>
              </div>
            ),
          },
          {
            id: "status",
            header: "Trạng thái",
            sortValue: (r) => r.trang_thai ?? "",
            cell: (r) => <FormApprovalBadge status={r.approval} />,
          },
          {
            id: "file",
            header: "File",
            cell: (r) =>
              r.evidence_file_name ? (
                <span className="max-w-[140px] truncate text-xs">
                  {r.evidence_file_name}
                </span>
              ) : (
                <span className="text-xs text-muted">Chưa có</span>
              ),
          },
          {
            id: "actions",
            header: "Phát hành",
            cell: (r) => {
              const next = r.next_action;
              return (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onFill(r.ma_mau);
                    }}
                    title="Xem dữ liệu điền từ DB công trình"
                  >
                    DB
                  </Button>
                  {r.auto_generate && next !== "complete" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      disabled={!canGenerate}
                      onClick={(e) => {
                        e.stopPropagation();
                        void run(`Đã sinh ${r.ma_mau}`, () =>
                          generateCtDocument(projectId, r.ma_mau),
                        );
                      }}
                    >
                      <Wand2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {next === "submit_review" ? (
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      disabled={!canDossier}
                      onClick={(e) => {
                        e.stopPropagation();
                        void run("Đã gửi duyệt", () =>
                          submitDocument(projectId, r.ma_mau),
                        );
                      }}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {next === "approve_or_return" ? (
                    <>
                      <Button
                        size="sm"
                        className="h-7 px-2"
                        disabled={!canDossier}
                        onClick={(e) => {
                          e.stopPropagation();
                          void run("Đã phê duyệt", () =>
                            approveDocument(projectId, r.ma_mau),
                          );
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2"
                        disabled={!canDossier}
                        onClick={(e) => {
                          e.stopPropagation();
                          void run("Đã trả về soạn", () =>
                            reviewDocument(projectId, r.ma_mau, "return"),
                          );
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </>
                  ) : null}
                  {next === "sign_or_close" ? (
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      disabled={!canSign}
                      onClick={(e) => {
                        e.stopPropagation();
                        const provider = oauth?.linked ? "oauth" : "internal";
                        void run("Đã ký số", () =>
                          signDocument({
                            projectId,
                            maMau: r.ma_mau,
                            provider,
                          }),
                        );
                      }}
                      title={
                        oauth?.linked
                          ? "Ký bằng danh tính OAuth"
                          : "Ký nội bộ theo vai trò"
                      }
                    >
                      <PenLine className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {r.approval === "da_ky" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      disabled={!canDossier}
                      onClick={(e) => {
                        e.stopPropagation();
                        void run("Đã tạo revision", () =>
                          createDocumentRevision(projectId, r.ma_mau),
                        );
                      }}
                    >
                      Rev
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                    <Link
                      to="/app/editor"
                      search={{
                        ma_mau: r.ma_mau,
                        sd: r.evidence_source_document_id
                          ? String(r.evidence_source_document_id)
                          : undefined,
                      }}
                    >
                      <FileOutput className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              );
            },
          },
        ]}
      />

      {signatures.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sổ ký số</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-xs">
            {signatures.slice(0, 12).map((s) => (
              <div key={s.id} className="rounded border border-border-soft px-2 py-1">
                <strong>{s.ma_mau}</strong>
                {" · "}
                {s.signer_name} ({s.signer_role})
                {" · "}
                {s.provider}
                {" · "}
                <span className="font-mono">{s.signed_document_sha256.slice(0, 12)}</span>
                {" · "}
                {s.signed_at}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
