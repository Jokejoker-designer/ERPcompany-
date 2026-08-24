import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  FilePlus,
  FileText,
  History,
  Save,
  Copy,
  Trash2,
  Table2,
  FolderOpen,
  ExternalLink,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseGrid, serializeGrid } from "@/data/documents";
import { CT_TEMPLATES } from "@/data/ct-registry";
import {
  openRuntimeDocument,
  runtimeDocumentDownloadUrl,
} from "@/lib/runtime-documents";
import { cn } from "@/lib/utils";
import { getCurrentContent, useDocsStore } from "@/store/docs-store";
import { useErpStore } from "@/store/erp-store";

const editorSearchSchema = z.object({
  ma_mau: z.string().optional(),
  sd: z.string().optional(),
});

export const Route = createFileRoute("/app/editor")({
  validateSearch: editorSearchSchema,
  component: EditorPage,
});

function EditorPage() {
  const documents = useDocsStore((s) => s.documents);
  const activeDocId = useDocsStore((s) => s.activeDocId);
  const setActiveDoc = useDocsStore((s) => s.setActiveDoc);
  const createBlank = useDocsStore((s) => s.createBlank);
  const createFromTemplate = useDocsStore((s) => s.createFromTemplate);
  const saveDocContent = useDocsStore((s) => s.saveDocContent);
  const saveAsNewVersion = useDocsStore((s) => s.saveAsNewVersion);
  const restoreVersion = useDocsStore((s) => s.restoreVersion);
  const renameDoc = useDocsStore((s) => s.renameDoc);
  const removeDoc = useDocsStore((s) => s.removeDoc);
  const linkCtTemplate = useDocsStore((s) => s.linkCtTemplate);
  const company = useErpStore((s) => s.company);
  const dataSource = useErpStore((s) => s.dataSource);
  const activeProject = useErpStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );

  const { ma_mau: linkedMaMau, sd: linkedSdStr } = Route.useSearch();
  const linkedSd = linkedSdStr ? Number(linkedSdStr) : undefined;

  useEffect(() => {
    if (!linkedMaMau) return;
    const tpl = CT_TEMPLATES.find((t) => t.code === linkedMaMau);
    linkCtTemplate({
      maMau: linkedMaMau,
      title: tpl?.title,
      format: tpl?.file_type,
      projectCode: activeProject?.code,
      sourceDocumentId: linkedSd ? String(linkedSd) : undefined,
    });
  }, [linkedMaMau, linkedSd, linkCtTemplate, activeProject?.code]);

  const active =
    documents.find((d) => d.id === activeDocId) ?? documents[0] ?? null;

  const [draft, setDraft] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [title, setTitle] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (!active) {
      setDraft("");
      setGrid([]);
      setTitle("");
      return;
    }
    const content = getCurrentContent(active);
    setTitle(active.title);
    if (active.kind === "excel") {
      setGrid(parseGrid(content));
      setDraft("");
    } else {
      setDraft(content);
      setGrid([]);
    }
    setEditorKey((k) => k + 1);
  }, [active?.id, active?.currentVersion]);

  const versions = active?.versions.slice().reverse() ?? [];

  function save() {
    if (!active) return;
    const content = active.kind === "excel" ? serializeGrid(grid) : draft;
    if (title !== active.title) renameDoc(active.id, title);
    saveDocContent(active.id, content, "Lưu bản hiện tại");
    toast.success("Đã lưu — hệ thống đọc được phiên bản này");
  }

  function saveVersion() {
    if (!active) return;
    const content = active.kind === "excel" ? serializeGrid(grid) : draft;
    if (title !== active.title) renameDoc(active.id, title);
    saveAsNewVersion(active.id, content);
    toast.success("Đã tạo bản sao phiên bản mới (version++)");
  }

  return (
    <div className="space-y-4">
      {linkedMaMau ? (
        <Card className="border-brand/30 bg-brand-soft/20">
          <CardBody className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <span>
              Liên kết mẫu <strong>{linkedMaMau}</strong>
              {linkedSd ? ` · file SD#${linkedSd}` : ""}
            </span>
            {dataSource === "runtime" && linkedSd ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openRuntimeDocument(linkedSd)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Mở Word/Excel
                </Button>
                <a
                  href={runtimeDocumentDownloadUrl(linkedSd)}
                  className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-surface-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải file
                </a>
              </>
            ) : null}
            <Button size="sm" variant="ghost" asChild>
              <Link to="/app/documents">← Hồ sơ CT</Link>
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => setActiveDoc(createBlank("word"))}
        >
          <FilePlus className="h-3.5 w-3.5" />
          Văn bản mới
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setActiveDoc(createBlank("excel"))}
        >
          <Table2 className="h-3.5 w-3.5" />
          Bảng tính mới
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            createFromTemplate("bbnt", { company: company.companyName })
          }
        >
          Mẫu BBNT
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            createFromTemplate("bao_gia", { company: company.companyName })
          }
        >
          Mẫu BG (Excel)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            createFromTemplate("hop_dong", { company: company.companyName })
          }
        >
          Mẫu HĐ
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/app/scan">
            <FolderOpen className="h-3.5 w-3.5" />
            Mở từ quét DN
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/app/import">Import chuẩn hóa</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Thư viện tài liệu</CardTitle>
            <Badge variant="brand">{documents.length}</Badge>
          </CardHeader>
          <CardBody className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2">
            {!documents.length ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                Chưa có tài liệu. Tạo mới hoặc mở từ quét folder.
              </p>
            ) : (
              documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveDoc(d.id)}
                  className={cn(
                    "w-full rounded-[var(--radius-md)] border px-2.5 py-2 text-left text-sm",
                    active?.id === d.id
                      ? "border-brand bg-brand-soft"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {d.kind === "excel" ? (
                      <Table2 className="h-3.5 w-3.5 text-brand" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-brand" />
                    )}
                    <span className="truncate font-semibold">{d.title}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted">
                    v{d.currentVersion} · {d.source}
                    {d.ctCode ? ` · ${d.ctCode}` : ""}
                  </div>
                </button>
              ))
            )}
          </CardBody>
        </Card>

        <div className="space-y-3 xl:col-span-6">
          {active ? (
            <>
              <Card>
                <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="font-semibold"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={save}>
                      <Save className="h-3.5 w-3.5" />
                      Lưu
                    </Button>
                    <Button size="sm" variant="secondary" onClick={saveVersion}>
                      <Copy className="h-3.5 w-3.5" />
                      Bản sao / version
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => {
                        removeDoc(active.id);
                        toast.message("Đã xóa tài liệu");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {active.kind === "excel"
                      ? "Bảng tính (Excel cơ bản)"
                      : "Soạn thảo (Word cơ bản)"}
                  </CardTitle>
                  <Badge variant="info">hệ thống đọc được</Badge>
                </CardHeader>
                <CardBody>
                  {active.kind === "excel" ? (
                    <ExcelGrid grid={grid} onChange={setGrid} />
                  ) : (
                    <WordEditor
                      key={editorKey}
                      value={draft}
                      onChange={setDraft}
                    />
                  )}
                  {active.sourcePath ? (
                    <p className="mt-2 text-[11px] text-muted">
                      Nguồn quét: {active.sourcePath}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody className="py-16 text-center text-sm text-muted">
                Chọn tài liệu hoặc tạo mới.
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <History className="h-4 w-4" />
              Phiên bản
            </CardTitle>
          </CardHeader>
          <CardBody className="max-h-[70vh] space-y-2 overflow-y-auto">
            {!active ? (
              <p className="text-xs text-muted">—</p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-2.5 py-2 text-xs",
                    v.version === active.currentVersion
                      ? "border-brand bg-brand-soft"
                      : "border-border",
                  )}
                >
                  <div className="font-semibold">{v.label}</div>
                  <div className="text-muted">
                    {new Date(v.createdAt).toLocaleString("vi-VN")}
                  </div>
                  {v.version !== active.currentVersion ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2"
                      onClick={() => {
                        restoreVersion(active.id, v.id);
                        toast.message(`Mở ${v.label}`);
                      }}
                    >
                      Mở phiên bản
                    </Button>
                  ) : (
                    <Badge variant="ok" className="mt-1">
                      Đang mở
                    </Badge>
                  )}
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function WordEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 border-b border-border-soft pb-2">
        {(
          [
            ["bold", "Đậm"],
            ["italic", "Nghiêng"],
            ["underline", "Gạch chân"],
            ["insertUnorderedList", "• List"],
          ] as const
        ).map(([cmd, label]) => (
          <Button
            key={cmd}
            type="button"
            size="sm"
            variant="secondary"
            className="h-7"
            onMouseDown={(e) => {
              e.preventDefault();
              document.execCommand(cmd);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        className="min-h-[360px] rounded-[var(--radius-md)] border border-border bg-white px-4 py-3 text-sm leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand/30"
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: value }}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}

function ExcelGrid({
  grid,
  onChange,
}: {
  grid: string[][];
  onChange: (g: string[][]) => void;
}) {
  const cols = useMemo(
    () => Math.max(6, ...grid.map((r) => r.length), 1),
    [grid],
  );

  function setCell(r: number, c: number, val: string) {
    const next = grid.map((row, ri) => {
      const copy = [...row];
      while (copy.length < cols) copy.push("");
      if (ri === r) copy[c] = val;
      return copy;
    });
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([...grid, Array.from({ length: cols }, () => "")])
          }
        >
          + Dòng
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange(grid.map((r) => [...r, ""]))}
        >
          + Cột
        </Button>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                <td className="w-8 border border-border-soft bg-surface-2 px-1 text-center text-[10px] text-muted">
                  {ri + 1}
                </td>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className="border border-border-soft p-0">
                    <input
                      className="h-8 w-full min-w-[88px] bg-transparent px-1.5 text-xs focus:bg-brand-soft/40 focus:outline-none"
                      value={row[ci] ?? ""}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
