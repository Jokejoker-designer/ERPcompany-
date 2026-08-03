import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type AuditItem,
  type DocKind,
  type ErpDocument,
  confidenceOfValue,
  csvTemplateBoq,
  csvTemplateCustomers,
  csvTemplateMaterials,
  csvTemplateProjects,
  defaultExcelFromBoq,
  defaultWordHtml,
  kindFromExt,
  mapHeaderToField,
  parseCsv,
} from "@/data/documents";

type DocsState = {
  documents: ErpDocument[];
  activeDocId: string | null;
  auditQueue: AuditItem[];

  setActiveDoc: (id: string | null) => void;
  openOrCreateFromScan: (input: {
    fileName: string;
    path: string;
    ext: string;
    customer?: string;
    project?: string;
    ctCode?: string;
    companyName?: string;
  }) => string;
  createBlank: (kind: "word" | "excel", title?: string) => string;
  createFromTemplate: (type: "bbnt" | "bao_gia" | "hop_dong", meta?: {
    company?: string;
    customer?: string;
    project?: string;
  }) => string;
  saveDocContent: (id: string, content: string, note?: string) => void;
  saveAsNewVersion: (id: string, content: string, label?: string) => void;
  restoreVersion: (id: string, versionId: string) => void;
  renameDoc: (id: string, title: string) => void;
  removeDoc: (id: string) => void;

  /** Parse CSV text against standard schema; enqueue low-confidence fields */
  analyzeImport: (
    sheet: "customers" | "projects" | "materials" | "quotation_lines",
    csvText: string,
  ) => {
    mappedHeaders: { header: string; field: string | null; confidence: string }[];
    rowCount: number;
    auditCreated: number;
    preview: Record<string, string>[];
  };
  resolveAudit: (id: string, value: string) => void;
  ignoreAudit: (id: string) => void;
  clearAudit: () => void;
  wipeDocs: () => void;
  getTemplateCsv: (sheet: "customers" | "projects" | "materials" | "quotation_lines") => string;
};

function now() {
  return new Date().toISOString();
}

function newDoc(partial: Omit<ErpDocument, "versions" | "currentVersion" | "createdAt" | "updatedAt"> & {
  content: string;
  versionLabel?: string;
}): ErpDocument {
  const ts = now();
  const v1 = {
    id: `v-${Date.now()}`,
    version: 1,
    label: partial.versionLabel || "v1 · ban đầu",
    createdAt: ts,
    note: "Tạo mới",
    content: partial.content,
  };
  return {
    id: partial.id,
    title: partial.title,
    kind: partial.kind,
    ext: partial.ext,
    source: partial.source,
    sourcePath: partial.sourcePath,
    customer: partial.customer,
    projectCode: partial.projectCode,
    ctCode: partial.ctCode,
    createdAt: ts,
    updatedAt: ts,
    currentVersion: 1,
    versions: [v1],
  };
}

export const useDocsStore = create<DocsState>()(
  persist(
    (set, get) => ({
      documents: [],
      activeDocId: null,
      auditQueue: [],

      setActiveDoc: (id) => set({ activeDocId: id }),

      openOrCreateFromScan: (input) => {
        const existing = get().documents.find(
          (d) => d.sourcePath === input.path || d.title === input.fileName,
        );
        if (existing) {
          set({ activeDocId: existing.id });
          return existing.id;
        }
        const kind = kindFromExt(input.ext);
        const editorKind: DocKind =
          kind === "excel" ? "excel" : kind === "word" || kind === "pdf" || kind === "other" ? "word" : kind;
        let content: string;
        if (editorKind === "excel") {
          content = defaultExcelFromBoq([
            { name: input.fileName.replace(/\.[^.]+$/, ""), qty: 1, unit: "gói", unitPrice: 0 },
          ]);
        } else {
          content = defaultWordHtml(input.fileName, {
            company: input.companyName,
            customer: input.customer,
            project: input.project,
            body: `Tài liệu quét từ:\n${input.path}\n\nMã hồ sơ gợi ý: ${input.ctCode || "—"}\n\nBạn có thể chỉnh sửa nội dung tại đây. Lưu phiên bản mới khi cần.`,
          });
        }
        const id = `doc-${Date.now()}`;
        const doc = newDoc({
          id,
          title: input.fileName,
          kind: editorKind === "excel" ? "excel" : "word",
          ext: input.ext,
          source: "scan",
          sourcePath: input.path,
          customer: input.customer,
          projectCode: input.project,
          ctCode: input.ctCode,
          content,
          versionLabel: "v1 · từ quét folder",
        });
        set((s) => ({
          documents: [doc, ...s.documents],
          activeDocId: id,
        }));
        return id;
      },

      createBlank: (kind, title) => {
        const id = `doc-${Date.now()}`;
        const content =
          kind === "excel"
            ? defaultExcelFromBoq([])
            : defaultWordHtml(title || "Văn bản mới");
        const doc = newDoc({
          id,
          title: title || (kind === "excel" ? "Bang_tinh_moi.xlsx" : "Van_ban_moi.docx"),
          kind,
          ext: kind === "excel" ? "xlsx" : "docx",
          source: "manual",
          content,
        });
        set((s) => ({ documents: [doc, ...s.documents], activeDocId: id }));
        return id;
      },

      createFromTemplate: (type, meta) => {
        const id = `doc-${Date.now()}`;
        const titles = {
          bbnt: "Bien_ban_nghiem_thu.docx",
          bao_gia: "Bao_gia_BOQ.xlsx",
          hop_dong: "Hop_dong_thi_cong.docx",
        };
        if (type === "bao_gia") {
          const doc = newDoc({
            id,
            title: titles.bao_gia,
            kind: "excel",
            ext: "xlsx",
            source: "template",
            customer: meta?.customer,
            projectCode: meta?.project,
            content: defaultExcelFromBoq([
              { name: "Hạng mục 1", qty: 1, unit: "gói", unitPrice: 0 },
              { name: "Hạng mục 2", qty: 1, unit: "gói", unitPrice: 0 },
            ]),
            versionLabel: "v1 · mẫu BG",
          });
          set((s) => ({ documents: [doc, ...s.documents], activeDocId: id }));
          return id;
        }
        const body =
          type === "bbnt"
            ? "Biên bản nghiệm thu giai đoạn / bộ phận công trình.\n\n1. Thành phần tham dự: …\n2. Nội dung nghiệm thu: …\n3. Kết luận: Đạt / Không đạt\n"
            : "Hợp đồng thi công lắp đặt.\n\nĐiều 1. Đối tượng hợp đồng\nĐiều 2. Giá trị và thanh toán\nĐiều 3. Tiến độ\n";
        const doc = newDoc({
          id,
          title: titles[type],
          kind: "word",
          ext: "docx",
          source: "template",
          customer: meta?.customer,
          projectCode: meta?.project,
          content: defaultWordHtml(titles[type], { ...meta, body }),
          versionLabel: "v1 · mẫu hệ thống",
        });
        set((s) => ({ documents: [doc, ...s.documents], activeDocId: id }));
        return id;
      },

      saveDocContent: (id, content, note) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== id) return d;
            const versions = d.versions.map((v) =>
              v.version === d.currentVersion
                ? { ...v, content, note: note || v.note, createdAt: now() }
                : v,
            );
            return { ...d, versions, updatedAt: now() };
          }),
        })),

      saveAsNewVersion: (id, content, label) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== id) return d;
            const ver = d.currentVersion + 1;
            const nv = {
              id: `v-${Date.now()}`,
              version: ver,
              label: label || `v${ver} · bản sao`,
              createdAt: now(),
              note: "Phiên bản mới (hệ thống đọc được)",
              content,
            };
            return {
              ...d,
              currentVersion: ver,
              versions: [...d.versions, nv],
              updatedAt: now(),
            };
          }),
        })),

      restoreVersion: (id, versionId) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== id) return d;
            const v = d.versions.find((x) => x.id === versionId);
            if (!v) return d;
            return { ...d, currentVersion: v.version, updatedAt: now() };
          }),
        })),

      renameDoc: (id, title) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, title, updatedAt: now() } : d,
          ),
        })),

      removeDoc: (id) =>
        set((s) => ({
          documents: s.documents.filter((d) => d.id !== id),
          activeDocId: s.activeDocId === id ? null : s.activeDocId,
        })),

      analyzeImport: (sheet, csvText) => {
        const { headers, rows } = parseCsv(csvText);
        const mappedHeaders = headers.map((h) => {
          const m = mapHeaderToField(h);
          return {
            header: h,
            field: m.field,
            confidence: m.confidence,
          };
        });

        const fieldIndex: Record<string, number> = {};
        mappedHeaders.forEach((m, i) => {
          if (m.field) fieldIndex[m.field] = i;
        });

        const preview: Record<string, string>[] = [];
        const audits: AuditItem[] = [];
        const ts = now();

        rows.slice(0, 50).forEach((row, ri) => {
          const obj: Record<string, string> = {};
          for (const [field, idx] of Object.entries(fieldIndex)) {
            obj[field] = row[idx] ?? "";
          }
          // also keep unmapped raw
          headers.forEach((h, i) => {
            if (!mappedHeaders[i].field) {
              obj[`_raw_${h}`] = row[i] ?? "";
              audits.push({
                id: `aud-${Date.now()}-${ri}-${i}`,
                entity:
                  sheet === "customers"
                    ? "customer"
                    : sheet === "projects"
                      ? "project"
                      : sheet === "materials"
                        ? "material"
                        : "quotation",
                field: h,
                rawValue: row[i] ?? "",
                suggestedValue: "",
                confidence: "unknown",
                reason: "Cột không map được sang schema chuẩn — chỉ rõ đây là trường gì",
                status: "open",
                createdAt: ts,
              });
            }
          });
          for (const [field, val] of Object.entries(obj)) {
            if (field.startsWith("_raw_")) continue;
            const c = confidenceOfValue(field, val);
            if (c.confidence === "low" || c.confidence === "unknown" || c.confidence === "medium") {
                audits.push({
                  id: `aud-v-${Date.now()}-${ri}-${field}`,
                  entity:
                    sheet === "customers"
                      ? "customer"
                      : sheet === "projects"
                        ? "project"
                        : sheet === "materials"
                          ? "material"
                          : "quotation",
                  field,
                  rawValue: val,
                  suggestedValue: val,
                  confidence: c.confidence,
                  reason: `Dòng ${ri + 1}: ${c.reason}`,
                  status: "open",
                  createdAt: ts,
                });
            }
          }
          preview.push(obj);
        });

        // header confidence medium/unknown also audit once
        mappedHeaders.forEach((m) => {
          if (m.confidence === "medium" || m.confidence === "unknown") {
            audits.push({
              id: `aud-h-${Date.now()}-${m.header}`,
              entity: "other",
              field: m.header,
              rawValue: m.header,
              suggestedValue: m.field || "",
              confidence: m.confidence as AuditItem["confidence"],
              reason:
                m.confidence === "unknown"
                  ? "Header không khớp schema chuẩn — hãy chỉ định trường hệ thống"
                  : "Header map gần đúng — xác nhận lại",
              status: "open",
              createdAt: ts,
            });
          }
        });

        set((s) => ({
          auditQueue: [...audits, ...s.auditQueue].slice(0, 200),
        }));

        return {
          mappedHeaders,
          rowCount: rows.length,
          auditCreated: audits.length,
          preview,
        };
      },

      resolveAudit: (id, value) =>
        set((s) => ({
          auditQueue: s.auditQueue.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: "resolved",
                  resolvedValue: value,
                  suggestedValue: value,
                  confidence: "high",
                }
              : a,
          ),
        })),

      ignoreAudit: (id) =>
        set((s) => ({
          auditQueue: s.auditQueue.map((a) =>
            a.id === id ? { ...a, status: "ignored" } : a,
          ),
        })),

      clearAudit: () => set({ auditQueue: [] }),

      wipeDocs: () => set({ documents: [], activeDocId: null, auditQueue: [] }),

      getTemplateCsv: (sheet) => {
        if (sheet === "customers") return csvTemplateCustomers();
        if (sheet === "projects") return csvTemplateProjects();
        if (sheet === "materials") return csvTemplateMaterials();
        return csvTemplateBoq();
      },
    }),
    {
      name: "thanh-hoai-docs-v1",
      partialize: (s) => ({
        documents: s.documents,
        activeDocId: s.activeDocId,
        auditQueue: s.auditQueue,
      }),
    },
  ),
);

export function getCurrentContent(doc: ErpDocument): string {
  return (
    doc.versions.find((v) => v.version === doc.currentVersion)?.content ??
    doc.versions[doc.versions.length - 1]?.content ??
    ""
  );
}
