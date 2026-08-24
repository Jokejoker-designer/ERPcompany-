import type { Quotation, Receivable } from "@/data/seed";
import {
  CATEGORY_LABEL,
  type ProductCategory,
  categoryMatches,
  dateInRange,
  inferProductCategory,
} from "@/lib/product-categories";
import { quoteTotal } from "@/data/seed";

export type DashboardFilterState = {
  from: string;
  to: string;
  category: ProductCategory | "all";
};

export function filterQuotations(
  quotations: Quotation[],
  filters: DashboardFilterState,
): Quotation[] {
  return quotations.filter((q) => {
    if (!dateInRange(q.createdAt, filters.from, filters.to)) return false;
    if (filters.category === "all") return true;
    return q.lines.some((l) =>
      categoryMatches(l.category ?? inferProductCategory(l.name), filters.category),
    );
  });
}

export function filterReceivables(
  receivables: Receivable[],
  filters: DashboardFilterState,
): Receivable[] {
  return receivables.filter((r) =>
    dateInRange(r.dueDate, filters.from, filters.to),
  );
}

export function salesByCategoryChart(
  quotations: Quotation[],
  filters: DashboardFilterState,
): { label: string; value: number }[] {
  const buckets: Record<string, number> = {};
  for (const q of filterQuotations(quotations, filters)) {
    for (const line of q.lines) {
      const cat = line.category ?? inferProductCategory(line.name);
      if (!categoryMatches(cat, filters.category)) continue;
      const label = CATEGORY_LABEL[cat as ProductCategory] ?? cat;
      const amt =
        line.qty * line.unitPrice * (1 + (line.taxRate ?? 0) / 100);
      buckets[label] = (buckets[label] ?? 0) + amt;
    }
  }
  return Object.entries(buckets)
    .map(([label, value]) => ({ label, value: Math.round(value) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function quotationStatusChart(
  quotations: Quotation[],
  filters: DashboardFilterState,
): { label: string; value: number }[] {
  const labels: Record<string, string> = {
    draft: "Nháp",
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    sent: "Đã gửi",
    won: "Trúng",
    lost: "Trượt",
  };
  const buckets: Record<string, number> = {};
  for (const q of filterQuotations(quotations, filters)) {
    const label = labels[q.status] ?? q.status;
    buckets[label] = (buckets[label] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

export function filteredSignedValue(quotations: Quotation[], filters: DashboardFilterState): number {
  return filterQuotations(quotations, filters)
    .filter((q) => q.status === "won" || q.status === "approved")
    .reduce((s, q) => s + quoteTotal(q), 0);
}
