/** Mini Retail ERP — master data, inventory, POS, BI */

export type Role =
  | "owner"
  | "manager"
  | "cashier"
  | "warehouse"
  | "accountant";

export type User = {
  id: string;
  username: string;
  name: string;
  role: Role;
  roleLabel: string;
  initials: string;
};

export type StoreConfig = {
  storeName: string;
  productName: string;
  taxId: string;
  address: string;
  phone: string;
  bankAccount: string;
  bankName: string;
  currency: string;
  vatDefault: number;
};

export type Category = {
  id: string;
  code: string;
  name: string;
  parent?: string;
  rules?: string; // e.g. cold-chain
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  barcode: string; // EAN/UPC or internal
  baseUom: string;
  purchaseUom: string;
  salesUoms: string[]; // e.g. Lon, Lốc, Thùng
  /** conversion to base UOM: key = uom, value = qty of base */
  conversion: Record<string, number>;
  costMap: number; // moving average cost (base)
  price: number; // retail price per base
  stock: number; // in base UOM
  minStock: number;
  abc: "A" | "B" | "C";
  trackLot: boolean;
  trackExpiry: boolean;
  active: boolean;
};

export type Lot = {
  id: string;
  productId: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD
  qty: number; // base UOM
  cost: number;
  receivedAt: string;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact: string;
  phone: string;
  taxId: string;
  leadDays: number;
  onTimeRate: number; // %
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string;
  tier: "bronze" | "silver" | "gold";
  points: number;
  visits: number;
  totalSpend: number;
  lastItems: string[];
};

export type PurchaseOrder = {
  id: string;
  code: string;
  supplierId: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  createdAt: string;
  lines: {
    productId: string;
    qty: number; // purchase UOM
    uom: string;
    unitCost: number;
  }[];
};

export type GrnLine = {
  productId: string;
  qtyPurchase: number;
  uom: string;
  qtyBase: number;
  unitCost: number;
  batchNo: string;
  expiryDate: string;
  qcOk: boolean;
  varianceNote?: string;
};

export type GoodsReceipt = {
  id: string;
  code: string;
  poId?: string;
  supplierId: string;
  status: "draft" | "posted";
  createdAt: string;
  lines: GrnLine[];
};

export type CartLine = {
  id: string;
  productId: string;
  name: string;
  qty: number;
  uom: string;
  unitPrice: number;
  discount: number; // amount
  lotId?: string;
};

export type SalePayment = {
  method: "cash" | "qr" | "card" | "points";
  amount: number;
};

export type Sale = {
  id: string;
  code: string;
  createdAt: string;
  cashierId: string;
  customerId?: string;
  lines: CartLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  payments: SalePayment[];
  status: "paid" | "void";
  shiftId: string;
};

export type PromoRule = {
  id: string;
  name: string;
  type: "bundle" | "time" | "tier" | "near_expiry";
  active: boolean;
  /** product SKUs involved */
  skus?: string[];
  percent?: number;
  giftSku?: string;
  startHour?: number;
  endHour?: number;
  tier?: Customer["tier"];
  description: string;
};

export type StockCount = {
  id: string;
  code: string;
  location: string;
  status: "open" | "submitted" | "approved";
  createdAt: string;
  lines: {
    productId: string;
    systemQty: number;
    countedQty: number;
    reasonCode?: string;
  }[];
};

export type Shift = {
  id: string;
  code: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  systemCash: number;
  countedCash?: number;
  status: "open" | "closed";
  variance?: number;
};

export type ReasonCode = {
  code: string;
  label: string;
};

export const REASON_CODES: ReasonCode[] = [
  { code: "01", label: "Đổ vỡ / Hư hỏng" },
  { code: "02", label: "Hết hạn sử dụng" },
  { code: "03", label: "Mất cắp không rõ" },
  { code: "04", label: "Lỗi kiểm đếm lần trước" },
  { code: "05", label: "Trả NCC (RTV)" },
];

export const DEMO_USERS: User[] = [
  {
    id: "u1",
    username: "owner",
    name: "Chủ cửa hàng",
    role: "owner",
    roleLabel: "Chủ DN / Owner",
    initials: "CH",
  },
  {
    id: "u2",
    username: "manager",
    name: "Quản lý cửa hàng",
    role: "manager",
    roleLabel: "Store Manager",
    initials: "QL",
  },
  {
    id: "u3",
    username: "cashier",
    name: "Thu ngân ca 1",
    role: "cashier",
    roleLabel: "Thu ngân",
    initials: "TN",
  },
  {
    id: "u4",
    username: "kho",
    name: "Nhân viên kho",
    role: "warehouse",
    roleLabel: "Kho / WMS",
    initials: "KH",
  },
];

export const SEED_STORE: StoreConfig = {
  storeName: "Siêu thị Mini An Khang",
  productName: "AnKhang Retail ERP",
  taxId: "0312345678",
  address: "12 Nguyễn Trãi, Q.1, TP.HCM",
  phone: "028 1234 5678",
  bankAccount: "0123456789",
  bankName: "Vietcombank",
  currency: "VND",
  vatDefault: 8,
};

export const SEED_CATEGORIES: Category[] = [
  { id: "cat-fmcg", code: "FMCG", name: "Đồ uống & FMCG" },
  { id: "cat-dry", code: "DRY", name: "Thực phẩm khô" },
  { id: "cat-cold", code: "COLD", name: "Đồ đông lạnh", rules: "Nhiệt độ ≤ -18°C · HSD ngắn" },
  { id: "cat-fresh", code: "FRESH", name: "Rau củ / Cân ký", rules: "FEFO · mã vạch cân" },
  { id: "cat-hpc", code: "HPC", name: "Hóa mỹ phẩm" },
];

export const SEED_PRODUCTS: Product[] = [
  {
    id: "p1",
    sku: "FMCG-1004",
    name: "Bia Lager Tiêu Chuẩn",
    categoryId: "cat-fmcg",
    barcode: "8934804022011",
    baseUom: "Lon",
    purchaseUom: "Thùng",
    salesUoms: ["Lon", "Lốc", "Thùng"],
    conversion: { Lon: 1, Lốc: 6, Thùng: 24 },
    costMap: 9800,
    price: 15000,
    stock: 240,
    minStock: 48,
    abc: "A",
    trackLot: true,
    trackExpiry: true,
    active: true,
  },
  {
    id: "p2",
    sku: "DRY-2099",
    name: "Gạo thơm lài",
    categoryId: "cat-dry",
    barcode: "8934567890123",
    baseUom: "Kg",
    purchaseUom: "Bao",
    salesUoms: ["Kg", "Túi5"],
    conversion: { Kg: 1, Túi5: 5, Bao: 50 },
    costMap: 18000,
    price: 25000,
    stock: 180,
    minStock: 50,
    abc: "A",
    trackLot: true,
    trackExpiry: false,
    active: true,
  },
  {
    id: "p3",
    sku: "COLD-301",
    name: "Cá basa fillet",
    categoryId: "cat-cold",
    barcode: "INT-COLD-301",
    baseUom: "Kg",
    purchaseUom: "Kg",
    salesUoms: ["Kg"],
    conversion: { Kg: 1 },
    costMap: 65000,
    price: 89000,
    stock: 22,
    minStock: 10,
    abc: "B",
    trackLot: true,
    trackExpiry: true,
    active: true,
  },
  {
    id: "p4",
    sku: "FRESH-110",
    name: "Cà chua bi",
    categoryId: "cat-fresh",
    barcode: "2001101000005",
    baseUom: "Kg",
    purchaseUom: "Kg",
    salesUoms: ["Kg"],
    conversion: { Kg: 1 },
    costMap: 22000,
    price: 35000,
    stock: 15.5,
    minStock: 5,
    abc: "B",
    trackLot: true,
    trackExpiry: true,
    active: true,
  },
  {
    id: "p5",
    sku: "HPC-550",
    name: "Dầu gội thảo mộc 650ml",
    categoryId: "cat-hpc",
    barcode: "8850006330123",
    baseUom: "Chai",
    purchaseUom: "Thùng",
    salesUoms: ["Chai", "Thùng"],
    conversion: { Chai: 1, Thùng: 12 },
    costMap: 48000,
    price: 79000,
    stock: 36,
    minStock: 12,
    abc: "C",
    trackLot: true,
    trackExpiry: true,
    active: true,
  },
  {
    id: "p6",
    sku: "FMCG-2201",
    name: "Nước suối 500ml",
    categoryId: "cat-fmcg",
    barcode: "8935049501234",
    baseUom: "Chai",
    purchaseUom: "Thùng",
    salesUoms: ["Chai", "Lốc", "Thùng"],
    conversion: { Chai: 1, Lốc: 6, Thùng: 24 },
    costMap: 3200,
    price: 6000,
    stock: 480,
    minStock: 96,
    abc: "A",
    trackLot: false,
    trackExpiry: false,
    active: true,
  },
  {
    id: "p7",
    sku: "DRY-310",
    name: "Mì gói tôm chua cay",
    categoryId: "cat-dry",
    barcode: "8934567000999",
    baseUom: "Gói",
    purchaseUom: "Thùng",
    salesUoms: ["Gói", "Thùng"],
    conversion: { Gói: 1, Thùng: 30 },
    costMap: 3500,
    price: 5500,
    stock: 8,
    minStock: 30,
    abc: "A",
    trackLot: true,
    trackExpiry: true,
    active: true,
  },
  {
    id: "p8",
    sku: "HPC-099",
    name: "Khăn ướt em bé",
    categoryId: "cat-hpc",
    barcode: "8850123456789",
    baseUom: "Bịch",
    purchaseUom: "Thùng",
    salesUoms: ["Bịch", "Thùng"],
    conversion: { Bịch: 1, Thùng: 24 },
    costMap: 28000,
    price: 45000,
    stock: 12,
    minStock: 6,
    abc: "C",
    trackLot: false,
    trackExpiry: true,
    active: true,
  },
];

export const SEED_LOTS: Lot[] = [
  {
    id: "lot1",
    productId: "p1",
    batchNo: "BL-2026-A01",
    expiryDate: "2027-03-15",
    qty: 192,
    cost: 9800,
    receivedAt: "2026-06-01",
  },
  {
    id: "lot2",
    productId: "p1",
    batchNo: "BL-2026-A02",
    expiryDate: "2026-08-20",
    qty: 48,
    cost: 10000,
    receivedAt: "2026-07-10",
  },
  {
    id: "lot3",
    productId: "p3",
    batchNo: "CB-0626",
    expiryDate: "2026-08-05",
    qty: 12,
    cost: 65000,
    receivedAt: "2026-07-20",
  },
  {
    id: "lot4",
    productId: "p3",
    batchNo: "CB-0726",
    expiryDate: "2026-09-15",
    qty: 10,
    cost: 67000,
    receivedAt: "2026-07-25",
  },
  {
    id: "lot5",
    productId: "p5",
    batchNo: "DG-2025-X",
    expiryDate: "2026-08-10",
    qty: 12,
    cost: 48000,
    receivedAt: "2026-01-15",
  },
  {
    id: "lot6",
    productId: "p7",
    batchNo: "MI-2025-Z",
    expiryDate: "2026-08-01",
    qty: 8,
    cost: 3500,
    receivedAt: "2026-05-01",
  },
];

export const SEED_SUPPLIERS: Supplier[] = [
  {
    id: "s1",
    code: "NCC-01",
    name: "CTCP Đồ uống Miền Nam",
    contact: "Anh Tuấn",
    phone: "0901112233",
    taxId: "0301112222",
    leadDays: 2,
    onTimeRate: 96,
  },
  {
    id: "s2",
    code: "NCC-02",
    name: "Gạo Việt Organic",
    contact: "Chị Lan",
    phone: "0912223344",
    taxId: "0303334444",
    leadDays: 5,
    onTimeRate: 88,
  },
  {
    id: "s3",
    code: "NCC-03",
    name: "ColdChain Foods",
    contact: "Anh Hùng",
    phone: "0987654321",
    taxId: "0315556666",
    leadDays: 1,
    onTimeRate: 92,
  },
];

export const SEED_CUSTOMERS: Customer[] = [
  {
    id: "c1",
    code: "KH-001",
    name: "Nguyễn Thị Mai",
    phone: "0909123456",
    tier: "gold",
    points: 1250,
    visits: 48,
    totalSpend: 18_500_000,
    lastItems: ["Gạo thơm lài", "Sữa", "Bỉm"],
  },
  {
    id: "c2",
    code: "KH-002",
    name: "Trần Văn Bình",
    phone: "0918123456",
    tier: "silver",
    points: 420,
    visits: 15,
    totalSpend: 4_200_000,
    lastItems: ["Bia Lager", "Nước suối"],
  },
  {
    id: "c3",
    code: "KH-003",
    name: "Lê Hoàng",
    phone: "0933123456",
    tier: "bronze",
    points: 80,
    visits: 3,
    totalSpend: 650_000,
    lastItems: ["Mì gói"],
  },
];

export const SEED_PROMOS: PromoRule[] = [
  {
    id: "pr1",
    name: "Combo Bia + Nước suối −10%",
    type: "bundle",
    active: true,
    skus: ["FMCG-1004", "FMCG-2201"],
    percent: 10,
    description: "Mua Bia Lager + Nước suối → giảm 10% tổng 2 dòng",
  },
  {
    id: "pr2",
    name: "Giờ vàng 10–12h Nước suối",
    type: "time",
    active: true,
    skus: ["FMCG-2201"],
    percent: 15,
    startHour: 10,
    endHour: 12,
    description: "Giảm 15% nước suối trong khung 10:00–12:00",
  },
  {
    id: "pr3",
    name: "Hạng Vàng −5% bill",
    type: "tier",
    active: true,
    tier: "gold",
    percent: 5,
    description: "Khách hạng Vàng giảm thêm 5% tổng bill",
  },
];

export const SEED_POS: PurchaseOrder[] = [
  {
    id: "po1",
    code: "PO-2026-018",
    supplierId: "s1",
    status: "ordered",
    createdAt: "2026-07-20",
    lines: [
      { productId: "p1", qty: 10, uom: "Thùng", unitCost: 235000 },
      { productId: "p6", qty: 5, uom: "Thùng", unitCost: 72000 },
    ],
  },
  {
    id: "po2",
    code: "PO-2026-019",
    supplierId: "s3",
    status: "ordered",
    createdAt: "2026-07-25",
    lines: [{ productId: "p3", qty: 20, uom: "Kg", unitCost: 66000 }],
  },
];

export const SEED_GRNS: GoodsReceipt[] = [];

export function toBaseQty(
  product: Product,
  qty: number,
  uom: string,
): number {
  const factor = product.conversion[uom] ?? 1;
  return qty * factor;
}

export function computeMap(
  oldQty: number,
  oldMap: number,
  newQty: number,
  newCost: number,
): number {
  const total = oldQty + newQty;
  if (total <= 0) return newCost;
  return Math.round(((oldQty * oldMap + newQty * newCost) / total) * 100) / 100;
}

export function daysUntil(dateStr: string, from = new Date()): number {
  const d = new Date(dateStr + "T00:00:00");
  const ms = d.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function tierDiscount(tier: Customer["tier"]): number {
  if (tier === "gold") return 0.05;
  if (tier === "silver") return 0.02;
  return 0;
}

export function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function formatQty(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function grossMargin(revenue: number, cogs: number): number {
  if (revenue <= 0) return 0;
  return ((revenue - cogs) / revenue) * 100;
}

export function inventoryTurnover(cogs: number, avgInventoryValue: number): number {
  if (avgInventoryValue <= 0) return 0;
  return cogs / avgInventoryValue;
}

export function productByBarcode(
  products: Product[],
  code: string,
): Product | undefined {
  const c = code.trim();
  return products.find(
    (p) => p.barcode === c || p.sku === c || p.barcode.endsWith(c),
  );
}

/** Parse weighted barcode: 2 + 5sku + 5weight(g) + check (simplified demo) */
export function parseWeightedBarcode(
  products: Product[],
  code: string,
): { product: Product; qtyKg: number } | null {
  if (!/^\d{12,13}$/.test(code)) return null;
  if (!code.startsWith("2")) return null;
  const skuPart = code.slice(1, 6);
  const weightG = Number(code.slice(6, 11));
  const product = products.find(
    (p) => p.barcode.includes(skuPart) || p.sku.includes(skuPart),
  );
  // demo: match FRESH-110 prefix 00110
  const fresh = products.find((p) => p.sku === "FRESH-110");
  if (code.startsWith("200110") && fresh) {
    return { product: fresh, qtyKg: weightG / 1000 || 0.5 };
  }
  if (product && weightG > 0) {
    return { product, qtyKg: weightG / 1000 };
  }
  return null;
}

export const PHASES = [
  {
    id: 1,
    title: "Master Data",
    desc: "Danh mục · UOM · barcode · NCC · KH · RBAC",
    path: "/app/products",
  },
  {
    id: 2,
    title: "Nhập kho",
    desc: "PO · GRN · QC · lô/HSD · MAP",
    path: "/app/inbound",
  },
  {
    id: 3,
    title: "POS bán hàng",
    desc: "Quét mã · promo · CRM · QR/cash",
    path: "/app/pos",
  },
  {
    id: 4,
    title: "Kiểm kho",
    desc: "Cycle count · variance · cận date",
    path: "/app/inventory",
  },
  {
    id: 5,
    title: "BI & chốt ca",
    desc: "Z-read · margin · ABC · ROI",
    path: "/app/reports",
  },
] as const;
