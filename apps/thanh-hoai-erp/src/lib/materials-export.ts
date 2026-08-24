/** Vật tư / kho — xuất CSV và nhập từ Excel (tab-separated). */

import type { MaterialItem } from "@/data/seed";

export function exportMaterialsCsv(materials: MaterialItem[]): void {
  const header = "sku;ten;don_vi;don_gia_von;ton_kho;ncc;nguon";
  const rows = materials.map((m) =>
    [
      m.sku,
      m.name,
      m.unit,
      m.unitCost,
      m.stock,
      m.supplier,
      m.source,
    ]
      .map((c) => `"${String(c).replace(/"/g, "'")}"`)
      .join(";"),
  );
  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vat-tu-kho_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseMaterialsText(
  text: string,
  defaultSource: MaterialItem["source"] = "import_hd",
): Omit<MaterialItem, "id">[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  const out: Omit<MaterialItem, "id">[] = [];
  for (const row of lines) {
    const cols = row.includes("\t")
      ? row.split("\t")
      : row.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 2) continue;
    const sku = cols[0]?.trim();
    const name = cols[1]?.trim();
    if (!sku || !name || sku.toLowerCase().includes("sku")) continue;
    out.push({
      sku,
      name,
      unit: cols[2]?.trim() || "cái",
      unitCost: Number(cols[3]) || 0,
      stock: Number(cols[4]) || 0,
      supplier: cols[5]?.trim() || "—",
      source: (cols[6]?.trim() as MaterialItem["source"]) || defaultSource,
    });
  }
  return out;
}

export async function readMaterialsFile(
  file: File,
): Promise<Omit<MaterialItem, "id">[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".xlsx")) {
    const text = await file.text();
    return parseMaterialsText(text);
  }
  return [];
}
