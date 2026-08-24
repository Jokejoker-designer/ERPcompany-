import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FileOutput,
  Link2,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/erp/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AUDIT_ISSUE_LABEL,
  acceptDocumentEdit,
  fetchDocumentAuditQueue,
  generateCtDocument,
  openRuntimeDocument,
  runRuntimeScan,
  runtimeDocumentDownloadUrl,
  type DossierRow,
} from "@/lib/runtime-documents";
import { resolveUserKey } from "@/lib/user-scope";
import { useErpStore } from "@/store/erp-store";

type AuditRow = DossierRow & { issues?: string[] };

export function DocumentAuditPanel({
  projectId,
  projectCode,
}: {
  projectId: string;
  projectCode: string;
}) {
  const session = useErpStore((s) => s.session);
  const user = useErpStore((s) => s.user);
  const userKey = resolveUserKey(session, user?.username);
  const dataSource = useErpStore((s) => s.dataSource);

  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<Awaited<
    ReturnType<typeof fetchDocumentAuditQueue>
  > | null>(null);
  const [view, setView] = useState<"audit" | "all">("audit");

  const reload = useCallback(async () => {
    if (dataSource !== "runtime" || !projectId) return;
    setLoading(true);
    try {
      const data = await fetchDocumentAuditQueue(projectId);
      setAudit(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải audit hồ sơ");
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }, [dataSource, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows: AuditRow[] = useMemo(() => {
    if (!audit) return [];
    if (view === "all") return audit.rows ?? [];
    const auditMap = new Map(
      (audit.items ?? []).map((i) => [i.ma_mau, i.issues]),
    );
    return (audit.rows ?? []).filter((r) => auditMap.has(r.ma_mau));
  }, [audit, view]);

  async function onGenerate(maMau: string) {
    try {
      const res = await generateCtDocument(projectId, maMau);
      toast.success(`Đã sinh ${maMau} → ${res.file_name}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sinh mẫu thất bại");
    }
  }

  async function onOpen(sdId: number) {
    try {
      await openRuntimeDocument(sdId);
      toast.message("Đã mở file bằng Word/Excel trên máy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không mở được file");
    }
  }

  async function onAcceptEdit(maMau: string) {
    try {
      const res = await acceptDocumentEdit(projectId, maMau);
      toast.success(
        res.changed
          ? `Đã chấp nhận bản sửa · SHA cập nhật`
          : "File không thay đổi so với SHA đã lưu",
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chấp nhận sửa thất bại");
    }
  }

  async function onRescan() {
    try {
      await runRuntimeScan();
      toast.success("Đã quét lại thư mục — kiểm tra audit");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quét thất bại");
    }
  }

  if (dataSource !== "runtime") {
    return (
      <Card>
        <CardBody className="space-y-3 text-sm text-muted">
          <p>
            Audit file Word/Excel thật và liên kết SHA cần chế độ{" "}
            <strong className="text-fg">Runtime</strong> (kết nối server
            localhost:8777).
          </p>
          <p>
            Ở demo: dùng tab <strong>Phê duyệt</strong> + đính kèm +{" "}
            <Link to="/app/editor" className="text-brand-ink hover:underline">
              Mở / sửa tài liệu
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Tải lại hồ sơ
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void onRescan()}>
          Quét lại file trên đĩa
        </Button>
        <Button
          size="sm"
          variant={view === "audit" ? "default" : "secondary"}
          onClick={() => setView("audit")}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Cần audit ({audit?.audit_count ?? 0})
        </Button>
        <Button
          size="sm"
          variant={view === "all" ? "default" : "secondary"}
          onClick={() => setView("all")}
        >
          Tất cả mẫu ({audit?.rows?.length ?? 0})
        </Button>
        {audit?.completion_ready ? (
          <Badge variant="ok">Hồ sơ đủ điều kiện đóng</Badge>
        ) : (
          <Badge variant="warn">Chưa đủ hồ sơ</Badge>
        )}
        <Badge variant="info">{projectCode}</Badge>
      </div>

      {audit?.duplicate_evidence &&
      Object.keys(audit.duplicate_evidence).length > 0 ? (
        <Card className="border-warn/40 bg-warn-soft/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4" />
              File trùng liên kết (một file — nhiều mẫu)
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            {Object.entries(audit.duplicate_evidence).map(([docId, codes]) => (
              <div key={docId} className="rounded border border-border-soft bg-surface px-3 py-2">
                <span className="font-mono text-muted">SD#{docId}</span>
                {" → "}
                {codes.join(", ")}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <DataTable<AuditRow>
        rows={rows}
        rowKey={(r) => r.ma_mau}
        tableId="document-audit"
        userKey={userKey}
        searchKeys={[
          (r) => r.ma_mau,
          (r) => r.title ?? "",
          (r) => r.evidence_file_name ?? "",
          (r) => r.trang_thai ?? "",
        ]}
        searchPlaceholder="Tìm mã mẫu, tên, file…"
        emptyTitle="Không có mục audit"
        emptyDescription={
          view === "audit"
            ? "Tất cả mẫu áp dụng đã liên kết file và SHA khớp."
            : "Chưa có dữ liệu hồ sơ."
        }
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
                  {r.format} · phase {r.phase_code}
                </div>
              </div>
            ),
          },
          {
            id: "status",
            header: "Trạng thái",
            sortValue: (r) => r.trang_thai ?? "",
            cell: (r) => (
              <Badge variant="default">{r.trang_thai ?? "—"}</Badge>
            ),
          },
          {
            id: "file",
            header: "File liên kết",
            cell: (r) =>
              r.evidence_file_name ? (
                <span className="max-w-[160px] truncate text-xs">
                  {r.evidence_file_name}
                </span>
              ) : (
                <span className="text-xs text-muted">Chưa có</span>
              ),
          },
          {
            id: "issues",
            header: "Audit",
            cell: (r) => {
              const issues =
                r.issues ??
                (audit?.items?.find((i) => i.ma_mau === r.ma_mau)?.issues ?? []);
              if (!issues.length) return <Badge variant="ok">OK</Badge>;
              return (
                <div className="flex flex-wrap gap-1">
                  {issues.map((iss) => (
                    <Badge key={iss} variant="danger" className="text-[10px]">
                      {AUDIT_ISSUE_LABEL[iss] ?? iss}
                    </Badge>
                  ))}
                </div>
              );
            },
          },
          {
            id: "actions",
            header: "Thao tác",
            cell: (r) => {
              const sd = r.evidence_source_document_id;
              return (
                <div className="flex flex-wrap gap-1">
                  {r.auto_generate ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onGenerate(r.ma_mau);
                      }}
                    >
                      <Wand2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                  {sd ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onOpen(sd);
                        }}
                        title="Mở Word/Excel"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <a
                        href={runtimeDocumentDownloadUrl(sd)}
                        className="inline-flex h-7 items-center rounded border border-border px-2 text-xs hover:bg-surface-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                      </a>
                      <Button
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onAcceptEdit(r.ma_mau);
                        }}
                        title="Chấp nhận bản sửa (cập nhật SHA)"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                    <Link
                      to="/app/editor"
                      search={{ ma_mau: r.ma_mau, sd: sd ? String(sd) : undefined }}
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
    </div>
  );
}
