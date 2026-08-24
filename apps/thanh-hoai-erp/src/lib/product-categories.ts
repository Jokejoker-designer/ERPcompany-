/** Product / BOQ line categories for dashboard filters and materials. */

export type ProductCategory =
  | "thiet_bi"
  | "ong_dong"
  | "vat_tu"
  | "nhan_cong"
  | "dich_vu"
  | "khac";

export const PRODUCT_CATEGORIES: {
  id: ProductCategory;
  label: string;
}[] = [
  { id: "thiet_bi", label: "Thiết bị (AHU, Chiller…)" },
  { id: "ong_dong", label: "Ống đồng / ống gió" },
  { id: "vat_tu", label: "Vật tư phụ" },
  { id: "nhan_cong", label: "Nhân công" },
  { id: "dich_vu", label: "Dịch vụ / vận chuyển" },
  { id: "khac", label: "Khác" },
];

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  thiet_bi: "Thiết bị",
  ong_dong: "Ống đồng / ống gió",
  vat_tu: "Vật tư",
  nhan_cong: "Nhân công",
  dich_vu: "Dịch vụ",
  khac: "Khác",
};

/** Infer category from Vietnamese BOQ / material name (demo + fallback). */
export function inferProductCategory(text: string): ProductCategory {
  const t = text.toLowerCase();
  if (
    /ahu|chiller|máy lạnh|may lanh|thiết bị|thiet bi|bộ|bo\b|fan|quạt/.test(t)
  ) {
    return "thiet_bi";
  }
  if (/ống|ong|đồng|dong|gió|gio|van\b|van chặn/.test(t)) {
    return "ong_dong";
  }
  if (/nhân công|nhan cong|lắp đặt|lap dat|thi công|thi cong/.test(t)) {
    return "nhan_cong";
  }
  if (/vận chuyển|van chuyen|cẩu|cau|dịch vụ|dich vu|vận hành/.test(t)) {
    return "dich_vu";
  }
  if (/gas|cáp|cap|ốc|vit|keo|bảo ôn/.test(t)) {
    return "vat_tu";
  }
  return "khac";
}

export function categoryMatches(
  itemCategory: ProductCategory | string | undefined,
  filter: ProductCategory | "all",
): boolean {
  if (filter === "all") return true;
  if (!itemCategory) return filter === "khac";
  return itemCategory === filter;
}

export function dateInRange(
  dateStr: string | undefined,
  from: string,
  to: string,
): boolean {
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function defaultDashboardRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
