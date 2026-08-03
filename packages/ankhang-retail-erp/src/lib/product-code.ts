import type { Product } from "@retail/data/retail";

/** Payload in printed QR — identifies SKU + barcode for stock control */
export type ProductCodePayload = {
  v: 1;
  kind: "ankhang-product";
  sku: string;
  barcode: string;
  name?: string;
};

export function buildProductQrPayload(p: Pick<Product, "sku" | "barcode" | "name">): string {
  const payload: ProductCodePayload = {
    v: 1,
    kind: "ankhang-product",
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
  };
  return JSON.stringify(payload);
}

/** Compact text form for simple QR readers */
export function buildProductQrText(p: Pick<Product, "sku" | "barcode">): string {
  return `AK|${p.sku}|${p.barcode}`;
}

export function parseProductCode(raw: string): {
  sku?: string;
  barcode?: string;
  free?: string;
} {
  const code = raw.trim();
  if (!code) return {};

  // JSON QR
  if (code.startsWith("{")) {
    try {
      const j = JSON.parse(code) as Partial<ProductCodePayload>;
      if (j.kind === "ankhang-product" || j.sku || j.barcode) {
        return { sku: j.sku, barcode: j.barcode };
      }
    } catch {
      /* fall through */
    }
  }

  // AK|SKU|BARCODE
  if (code.startsWith("AK|") || code.startsWith("ak|")) {
    const parts = code.split("|");
    return { sku: parts[1]?.trim(), barcode: parts[2]?.trim() };
  }

  // SKU:xxx or BAR:xxx
  if (/^sku\s*[:=]/i.test(code)) {
    return { sku: code.replace(/^sku\s*[:=]\s*/i, "").trim() };
  }
  if (/^bar(code)?\s*[:=]/i.test(code)) {
    return { barcode: code.replace(/^bar(code)?\s*[:=]\s*/i, "").trim() };
  }

  return { free: code };
}

export function findProductByScan(
  products: Product[],
  raw: string,
): Product | undefined {
  const parsed = parseProductCode(raw);
  if (parsed.sku) {
    const bySku = products.find(
      (p) => p.sku.toLowerCase() === parsed.sku!.toLowerCase(),
    );
    if (bySku) return bySku;
  }
  if (parsed.barcode) {
    const byBar = products.find(
      (p) =>
        p.barcode === parsed.barcode ||
        p.barcode.endsWith(parsed.barcode!) ||
        parsed.barcode!.endsWith(p.barcode),
    );
    if (byBar) return byBar;
  }
  if (parsed.free) {
    const c = parsed.free;
    return products.find(
      (p) =>
        p.barcode === c ||
        p.sku.toLowerCase() === c.toLowerCase() ||
        p.barcode.endsWith(c) ||
        p.sku.toLowerCase().includes(c.toLowerCase()),
    );
  }
  return undefined;
}
