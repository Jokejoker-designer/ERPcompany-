export type RoleId =
  | "admin"
  | "giamdoc"
  | "ketoan"
  | "kinhdoanh"
  | "ktt"
  | "ktv"
  | "thukho";

export type User = {
  id: string;
  username: string;
  name: string;
  role: RoleId;
  roleLabel: string;
  initials: string;
};

export type DocStatus = "enough" | "missing" | "pending" | "draft";

export type ProjectStage = "bao_gia" | "thi_cong" | "nghiem_thu" | "hoan_thanh";

export type WorkflowStepId =
  | "profile"
  | "quote"
  | "contract"
  | "docs01"
  | "docs02"
  | "docs03"
  | "docs04"
  | "docs05"
  | "docs06"
  | "docs07"
  | "docs08"
  | "docs09"
  | "ar"
  | "bank";

export type WorkflowFlags = Record<WorkflowStepId, boolean>;

export type Project = {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customer: string;
  stage: ProjectStage;
  progress: number;
  value: number;
  address?: string;
  overdue?: boolean;
  note?: string;
  contractCode?: string;
  docStatuses: Record<string, DocStatus>;
  workflow: WorkflowFlags;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  taxId: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
};

export type MaterialItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  stock: number;
  supplier: string;
  source: "manual" | "import_hd" | "scan";
};

export type QuotationLine = {
  id: string;
  name: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  notes: string;
};

export type Quotation = {
  id: string;
  code: string;
  revision: number;
  customer: string;
  projectCode: string;
  projectName: string;
  vat: number;
  note: string;
  status: "draft" | "pending" | "approved" | "sent" | "won" | "lost";
  lines: QuotationLine[];
  createdAt: string;
};

export type Receivable = {
  id: string;
  customer: string;
  contract: string;
  projectCode: string;
  projectId?: string;
  value: number;
  collected: number;
  status: "paid" | "pending" | "overdue";
  dueDate: string;
};

export type BankLine = {
  id: string;
  date: string;
  desc: string;
  amount: number;
  matchHint: string;
  status: "matched" | "pending" | "ignored";
  projectCode?: string;
};

export type Approval = {
  id: string;
  type: "UNC" | "BG" | "HS" | "PO";
  title: string;
  deadline: string;
  urgent?: boolean;
};

export type CompanyConfig = {
  productName: string;
  companyName: string;
  taxId: string;
  address: string;
  phone: string;
  website: string;
  hotline: string;
  scanRoots: string;
  brandColor: string;
  logoDataUrl: string;
};

/** One hit from enterprise folder scan */
export type ScanHit = {
  id: string;
  root: string;
  path: string;
  fileName: string;
  ext: "pdf" | "docx" | "xlsx" | "jpg" | "png" | "other";
  sizeKb: number;
  customerHint: string;
  projectHint: string;
  ctCode: string;
  phase: string;
  mapped: boolean;
  imported: boolean;
};

export type ScanState = {
  lastRunAt: string | null;
  running: boolean;
  hits: ScanHit[];
  rootsUsed: string;
  stats: {
    files: number;
    customers: number;
    projects: number;
    mapped: number;
    imported: number;
  };
};

export type SetupFlags = {
  company: boolean;
  roles: boolean;
  customers: boolean;
  projects: boolean;
  materials: boolean;
  templates: boolean;
  scan: boolean;
  ops: boolean;
};

export type OnboardingState = {
  completed: boolean;
  dismissed: boolean;
  wizardOpen: boolean;
  step: number;
  flags: SetupFlags;
  /** true after first A→Z finish triggered empty-slate wipe */
  wipedAfterSetup: boolean;
};

export const EMPTY_SETUP_FLAGS: SetupFlags = {
  company: false,
  roles: false,
  customers: false,
  projects: false,
  materials: false,
  templates: false,
  scan: false,
  ops: false,
};

export const EMPTY_WORKFLOW: WorkflowFlags = {
  profile: false,
  quote: false,
  contract: false,
  docs01: false,
  docs02: false,
  docs03: false,
  docs04: false,
  docs05: false,
  docs06: false,
  docs07: false,
  docs08: false,
  docs09: false,
  ar: false,
  bank: false,
};

export const EMPTY_SCAN: ScanState = {
  lastRunAt: null,
  running: false,
  hits: [],
  rootsUsed: "",
  stats: { files: 0, customers: 0, projects: 0, mapped: 0, imported: 0 },
};

export const WORKFLOW_STEPS: {
  id: WorkflowStepId;
  label: string;
  short: string;
  phase?: string;
  desc: string;
}[] = [
  { id: "profile", label: "Hồ sơ công trình", short: "CT", desc: "Mã CT, khách, địa điểm đã nạp" },
  { id: "quote", label: "Báo giá / BOQ", short: "BG", desc: "Báo giá nhiều hạng mục bám CT" },
  { id: "contract", label: "Hợp đồng", short: "HĐ", desc: "Ký HĐ từ BG trúng thầu" },
  { id: "docs01", label: "Pháp lý & HĐ", short: "01", phase: "01", desc: "Hồ sơ phase 01" },
  { id: "docs02", label: "Thiết kế / bản vẽ", short: "02", phase: "02", desc: "Hồ sơ phase 02" },
  { id: "docs03", label: "Vật tư đề trình", short: "03", phase: "03", desc: "Hồ sơ phase 03" },
  { id: "docs04", label: "BOQ / PO", short: "04", phase: "04", desc: "Hồ sơ phase 04" },
  { id: "docs05", label: "Thi công / QLCL", short: "05", phase: "05", desc: "Hồ sơ phase 05" },
  { id: "docs06", label: "Nghiệm thu", short: "06", phase: "06", desc: "Hồ sơ phase 06" },
  { id: "docs07", label: "Hoàn công", short: "07", phase: "07", desc: "Hồ sơ phase 07" },
  { id: "docs08", label: "Thanh quyết toán", short: "08", phase: "08", desc: "Hồ sơ phase 08" },
  { id: "docs09", label: "Bảo hành", short: "09", phase: "09", desc: "Hồ sơ phase 09" },
  { id: "ar", label: "Công nợ", short: "CN", desc: "Phải thu theo HĐ / CT" },
  { id: "bank", label: "Sao kê NH", short: "SK", desc: "Khớp dòng tiền với CT" },
];

export const BOQ_UNITS = [
  "m", "m2", "m3", "bộ", "cái", "kg", "tấn", "gói", "hệ", "lượt", "ngày", "công",
] as const;

export const TAX_RATES = [0, 5, 8, 10] as const;

export const ROLES: { id: RoleId; label: string; desc: string }[] = [
  { id: "admin", label: "Quản trị hệ thống", desc: "Cấu hình, tài khoản, phân quyền" },
  { id: "giamdoc", label: "Giám đốc", desc: "Duyệt chi, báo giá, tổng quan" },
  { id: "ketoan", label: "Kế toán", desc: "Công nợ, sao kê, quyết toán" },
  { id: "kinhdoanh", label: "Kinh doanh", desc: "Báo giá, hợp đồng, khách hàng" },
  { id: "ktt", label: "Kỹ thuật trưởng", desc: "Hồ sơ CT, BBNT, tiến độ" },
  { id: "ktv", label: "Kỹ thuật viên", desc: "Nhật ký thi công, checklist" },
  { id: "thukho", label: "Thủ kho", desc: "PXK, tồn kho, giao nhận" },
];

export const DEMO_USERS: User[] = [
  { id: "u1", username: "giamdoc", name: "Nguyễn Văn A", role: "giamdoc", roleLabel: "Giám đốc", initials: "GD" },
  { id: "u2", username: "ketoan", name: "Trần Thị B", role: "ketoan", roleLabel: "Kế toán", initials: "KT" },
  { id: "u3", username: "kinhdoanh", name: "Lê Minh C", role: "kinhdoanh", roleLabel: "Kinh doanh", initials: "KD" },
  { id: "u4", username: "ktt", name: "Phạm Đức D", role: "ktt", roleLabel: "Kỹ thuật trưởng", initials: "TT" },
  { id: "u5", username: "admin", name: "Admin Hệ thống", role: "admin", roleLabel: "Quản trị", initials: "AD" },
  { id: "u6", username: "ktv", name: "Hoàng Văn E", role: "ktv", roleLabel: "Kỹ thuật viên", initials: "TV" },
  { id: "u7", username: "thukho", name: "Võ Thị F", role: "thukho", roleLabel: "Thủ kho", initials: "TK" },
];

export const SEED_CUSTOMERS: Customer[] = [
  {
    id: "c1",
    code: "KH-001",
    name: "Công ty Alpha Refrigeration",
    taxId: "0312345678",
    contact: "Nguyễn Minh",
    phone: "0901 111 222",
    email: "muahang@alpha.example",
    address: "KCN Long Thành, Đồng Nai",
    notes: "Khách MEP / lạnh công nghiệp",
    createdAt: "2026-03-01",
  },
  {
    id: "c2",
    code: "KH-002",
    name: "Beta Building Solutions",
    taxId: "0309876543",
    contact: "Trần Hạnh",
    phone: "0902 333 444",
    email: "duan@beta.example",
    address: "Quận 7, TP.HCM",
    notes: "Văn phòng & fit-out",
    createdAt: "2026-03-12",
  },
  {
    id: "c3",
    code: "KH-003",
    name: "Gamma Facility Services",
    taxId: "3602333444",
    contact: "Mr. Kim",
    phone: "0251 3555 222",
    email: "kim@gamma.example",
    address: "KCN Bàu Xéo, Trảng Bom, Đồng Nai",
    notes: "AHU / HVAC tầng kỹ thuật",
    createdAt: "2026-02-20",
  },
  {
    id: "c4",
    code: "KH-004",
    name: "Delta Cool Systems",
    taxId: "3602777888",
    contact: "Anh Tuấn",
    phone: "0251 3222 444",
    email: "tuan@delta.example",
    address: "KCN Long Thành, Đồng Nai",
    notes: "Kho lạnh & chiller",
    createdAt: "2026-01-18",
  },
];

function line(
  id: string,
  name: string,
  qty: number,
  unit: string,
  unitPrice: number,
  extra?: Partial<QuotationLine>,
): QuotationLine {
  return {
    id,
    name,
    description: extra?.description ?? "",
    qty,
    unit,
    unitPrice,
    taxRate: extra?.taxRate ?? 8,
    notes: extra?.notes ?? "",
  };
}

export function defaultWorkflow(stage: ProjectStage): WorkflowFlags {
  const w = { ...EMPTY_WORKFLOW, profile: true };
  if (stage === "bao_gia") {
    w.quote = true;
    w.docs04 = true;
  } else if (stage === "thi_cong") {
    w.quote = true;
    w.contract = true;
    w.docs01 = true;
    w.docs02 = true;
    w.docs03 = true;
    w.docs04 = true;
    w.docs05 = true;
    w.ar = true;
  } else if (stage === "nghiem_thu") {
    Object.assign(w, defaultWorkflow("thi_cong"), {
      docs06: true,
      docs07: true,
    });
  } else {
    Object.assign(w, defaultWorkflow("nghiem_thu"), {
      docs08: true,
      docs09: true,
      bank: true,
    });
  }
  return w;
}

export function makeProject(
  partial: Omit<Project, "docStatuses" | "workflow"> & {
    docStatuses?: Record<string, DocStatus>;
    workflow?: Partial<WorkflowFlags>;
  },
): Project {
  return {
    ...partial,
    docStatuses: partial.docStatuses ?? {},
    workflow: { ...defaultWorkflow(partial.stage), ...partial.workflow },
  };
}

export const SEED_PROJECTS: Project[] = [
  makeProject({
    id: "p1",
    code: "CT-1012",
    name: "Kho lạnh nhà máy A",
    customerId: "c1",
    customer: "Công ty Alpha Refrigeration",
    stage: "bao_gia",
    progress: 15,
    value: 1_100_000_000,
    address: "Long Thành",
  }),
  makeProject({
    id: "p2",
    code: "CT-1015",
    name: "Văn phòng tòa B",
    customerId: "c2",
    customer: "Beta Building Solutions",
    stage: "bao_gia",
    progress: 20,
    value: 620_000_000,
    address: "Q7",
    contractCode: "HĐ-2026-009",
    workflow: { quote: true, contract: true, ar: true },
  }),
  makeProject({
    id: "p3",
    code: "CT-1007",
    name: "MEP tòa văn phòng",
    customerId: "c1",
    customer: "Công ty Alpha Refrigeration",
    stage: "thi_cong",
    progress: 62,
    value: 1_100_000_000,
    overdue: true,
    contractCode: "HĐ-2026-014",
  }),
  makeProject({
    id: "p4",
    code: "CT-1009",
    name: "Hệ AHU tầng kỹ thuật",
    customerId: "c3",
    customer: "Gamma Facility Services",
    stage: "thi_cong",
    progress: 48,
    value: 1_900_000_000,
    contractCode: "HĐ-2025-088",
  }),
  makeProject({
    id: "p5",
    code: "CT-1003",
    name: "Bảo trì định kỳ Q2",
    customerId: "c2",
    customer: "Beta Building Solutions",
    stage: "nghiem_thu",
    progress: 90,
    value: 180_000_000,
  }),
  makeProject({
    id: "p6",
    code: "CT-0998",
    name: "Lắp đặt chiller 2",
    customerId: "c4",
    customer: "Delta Cool Systems",
    stage: "hoan_thanh",
    progress: 100,
    value: 780_000_000,
    contractCode: "HĐ-2026-021",
  }),
];

export const SEED_MATERIALS: MaterialItem[] = [
  { id: "m1", sku: "VT-ONG-19", name: "Ống đồng Ø19", unit: "m", unitCost: 165_000, stock: 420, supplier: "NCC Đồng Á", source: "import_hd" },
  { id: "m2", sku: "TB-AHU-12", name: "AHU 12k CMH", unit: "bộ", unitCost: 72_000_000, stock: 2, supplier: "HVAC Pro", source: "import_hd" },
  { id: "m3", sku: "VT-ONG-22", name: "Ống đồng Ø22 + bảo ôn", unit: "m", unitCost: 184_000, stock: 280, supplier: "NCC Đồng Á", source: "import_hd" },
  { id: "m4", sku: "VT-GAS-R32", name: "Gas R32", unit: "kg", unitCost: 118_000, stock: 45, supplier: "Gas Việt", source: "import_hd" },
  { id: "m5", sku: "TB-CHILLER-80", name: "Chiller nước 80RT", unit: "bộ", unitCost: 420_000_000, stock: 1, supplier: "CoolTech VN", source: "manual" },
];

export const SEED_QUOTATIONS: Quotation[] = [
  {
    id: "q1",
    code: "BG-2026-061",
    revision: 2,
    customer: "Công ty Alpha Refrigeration",
    projectCode: "CT-1007",
    projectName: "MEP tòa văn phòng",
    vat: 8,
    note: "Báo giá theo BOQ khảo sát hiện trường. Hiệu lực 30 ngày.",
    status: "pending",
    createdAt: "2026-06-12",
    lines: [
      line("l1", "Ống đồng Ø19", 100, "m", 180_000, {
        description: "Ống đồng C12200, độ dày 1.0mm, cách nhiệt PE 19mm",
      }),
      line("l2", "Ống đồng Ø12.7", 80, "m", 95_000),
      line("l3", "AHU 12k CMH", 2, "bộ", 88_000_000, {
        description: "AHU 2 chiều, lọc G4+F7, motor IE3",
      }),
      line("l4", "Van chặn gas 1/2\"", 24, "cái", 450_000),
      line("l5", "Cáp điều khiển 2x1.5", 350, "m", 28_000),
      line("l6", "Nhân công lắp đặt MEP", 1, "gói", 42_000_000),
      line("l7", "Vận chuyển & cẩu lắp", 1, "lượt", 8_500_000),
    ],
  },
  {
    id: "q2",
    code: "BG-2026-055",
    revision: 1,
    customer: "Beta Building Solutions",
    projectCode: "CT-1015",
    projectName: "Văn phòng tòa B",
    vat: 8,
    note: "",
    status: "approved",
    createdAt: "2026-05-28",
    lines: [
      line("l8", "Cáp điện CV 4x10", 500, "m", 95_000),
      line("l9", "Ống luồn dây PVC D32", 200, "m", 18_000),
      line("l10", "Tủ MSB 400A", 1, "bộ", 120_000_000),
      line("l11", "Nhân công điện nhẹ", 45, "công", 550_000),
    ],
  },
  {
    id: "q3",
    code: "BG-2026-048",
    revision: 3,
    customer: "Gamma Facility Services",
    projectCode: "CT-1009",
    projectName: "Hệ AHU tầng kỹ thuật",
    vat: 8,
    note: "Rev #3 — bổ sung ống gió và van gió cháy.",
    status: "sent",
    createdAt: "2026-05-10",
    lines: [
      line("l12", "AHU 18k CMH", 3, "bộ", 112_000_000),
      line("l13", "Ống gió tôn mạ kẽm", 800, "m2", 285_000),
      line("l14", "Van gió tay gạt", 36, "cái", 1_200_000),
      line("l15", "Cách nhiệt ống gió", 800, "m2", 95_000),
      line("l16", "Lắp đặt & cân chỉnh", 1, "gói", 65_000_000),
    ],
  },
];

export const SEED_RECEIVABLES: Receivable[] = [
  {
    id: "r1",
    customer: "Công ty Alpha Refrigeration",
    contract: "HĐ-2026-014",
    projectCode: "CT-1007",
    projectId: "p3",
    value: 1_100_000_000,
    collected: 700_000_000,
    status: "pending",
    dueDate: "2026-07-15",
  },
  {
    id: "r2",
    customer: "Beta Building Solutions",
    contract: "HĐ-2026-009",
    projectCode: "CT-1015",
    projectId: "p2",
    value: 620_000_000,
    collected: 620_000_000,
    status: "paid",
    dueDate: "2026-05-30",
  },
  {
    id: "r3",
    customer: "Gamma Facility Services",
    contract: "HĐ-2025-088",
    projectCode: "CT-1009",
    projectId: "p4",
    value: 1_900_000_000,
    collected: 1_050_000_000,
    status: "overdue",
    dueDate: "2026-04-20",
  },
  {
    id: "r4",
    customer: "Delta Cool Systems",
    contract: "HĐ-2026-021",
    projectCode: "CT-0998",
    projectId: "p6",
    value: 780_000_000,
    collected: 390_000_000,
    status: "pending",
    dueDate: "2026-08-01",
  },
];

export const SEED_BANK: BankLine[] = [
  {
    id: "b1",
    date: "01/06/2026",
    desc: "CK Alpha Refrigeration — đợt 2",
    amount: 400_000_000,
    matchHint: "HĐ-2026-014",
    status: "matched",
    projectCode: "CT-1007",
  },
  {
    id: "b2",
    date: "02/06/2026",
    desc: "UNC vật tư nhà cung cấp",
    amount: -52_100_000,
    matchHint: "Phiếu chi #882",
    status: "pending",
  },
  {
    id: "b3",
    date: "03/06/2026",
    desc: "Phí chuyển khoản",
    amount: -11_000,
    matchHint: "—",
    status: "ignored",
  },
  {
    id: "b4",
    date: "05/06/2026",
    desc: "CK Beta Building — quyết toán",
    amount: 180_000_000,
    matchHint: "HĐ-2026-009",
    status: "matched",
    projectCode: "CT-1015",
  },
  {
    id: "b5",
    date: "08/06/2026",
    desc: "Thanh toán NCC ống đồng",
    amount: -28_500_000,
    matchHint: "PO-441",
    status: "pending",
    projectCode: "CT-1007",
  },
];

export const SEED_APPROVALS: Approval[] = [
  { id: "a1", type: "UNC", title: "Chi vật tư NCC — 52,1 triệu", deadline: "Hôm nay", urgent: true },
  { id: "a2", type: "BG", title: "Duyệt báo giá revision CT-1007", deadline: "2 ngày" },
  { id: "a3", type: "HS", title: "BBNT đợt 2 — chờ ký", deadline: "Tuần này" },
  { id: "a4", type: "PO", title: "Đơn đặt hàng AHU — 3 bộ", deadline: "3 ngày" },
];

export const SEED_COMPANY: CompanyConfig = {
  productName: "Thanh Hoai ERP",
  companyName: "CÔNG TY TNHH MTV CƠ ĐIỆN LẠNH THÀNH HOÀI",
  taxId: "3602504881",
  address: "Đồng Nai, Việt Nam",
  phone: "0962 811 166",
  website: "ctydienlanhthanhhoai.com",
  hotline: "0918 177 391",
  scanRoots: "D:\\2025; D:\\2026",
  brandColor: "#0B7285",
  logoDataUrl: "",
};

export const EMPTY_COMPANY: CompanyConfig = {
  productName: "Thanh Hoai ERP",
  companyName: "",
  taxId: "",
  address: "",
  phone: "",
  website: "",
  hotline: "",
  scanRoots: "",
  brandColor: "#0B7285",
  logoDataUrl: "",
};

export const DEFAULT_ONBOARDING: OnboardingState = {
  completed: false,
  dismissed: false,
  wizardOpen: false,
  step: 0,
  flags: { ...EMPTY_SETUP_FLAGS },
  wipedAfterSetup: false,
};

export const CHUNG_TU = [
  { type: "Báo giá", code: "THANH_HOAI_TEMPLATE_BAO_GIA_*", format: "xlsx", role: "Kinh doanh", when: "Gửi khách / lập BOQ", bind: "quote" as const },
  { type: "BBNT", code: "03_TEMPLATE_BIEN_BAN_NGHIEM_THU_*", format: "docx / xlsx", role: "KTT / GĐ", when: "Sau thi công / nghiệm thu", bind: "project" as const },
  { type: "BQT", code: "04_TEMPLATE_BANG_QUYET_TOAN_*", format: "docx / xlsx", role: "Kế toán", when: "Quyết toán công trình", bind: "project" as const },
  { type: "ĐCCN", code: "06_TEMPLATE_BIEN_BAN_DOI_CHIEU_*", format: "docx / xlsx", role: "Kế toán", when: "Đối chiếu công nợ cuối kỳ", bind: "ar" as const },
  { type: "Thư ĐNTT", code: "05_TEMPLATE_THU_DE_NGHI_THANH_TOAN_*", format: "docx / xlsx", role: "Kế toán / GĐ", when: "Đề nghị thanh toán theo đợt", bind: "ar" as const },
  { type: "Hợp đồng", code: "01–05_TEMPLATE_HOP_DONG_*", format: "docx", role: "Kinh doanh / GĐ", when: "Ký kết với khách", bind: "contract" as const },
  { type: "PXK", code: "07_TEMPLATE_PHIEU_GIAO_HANG_XUAT_KHO_*", format: "docx / xlsx", role: "Thủ kho", when: "Xuất vật tư ra công trình", bind: "project" as const },
  { type: "Checklist KTV", code: "08_TEMPLATE_CHECKLIST_*", format: "docx / xlsx", role: "KTV", when: "Bảo trì / hiện trường", bind: "project" as const },
];

export const SETUP_STEPS = [
  { id: "welcome", title: "Tổng quan A → Z", short: "Lộ trình" },
  { id: "company", title: "Hồ sơ công ty", short: "Công ty" },
  { id: "roles", title: "Tài khoản & vai trò", short: "Vai trò" },
  { id: "customers", title: "Profile khách hàng", short: "Khách" },
  { id: "projects", title: "Công trình / hồ sơ CT", short: "Công trình" },
  { id: "materials", title: "Vật tư & HĐ mua vào", short: "Vật tư" },
  { id: "templates", title: "Mẫu chứng từ hệ thống", short: "Chứng từ" },
  { id: "scan", title: "Quét dữ liệu DN", short: "Quét DN" },
  { id: "ops", title: "Vận hành hằng ngày", short: "Vận hành" },
  { id: "done", title: "Hoàn tất & làm sạch", short: "Xong" },
] as const;

/** Sample enterprise folder tree used to simulate scan */
export const SCAN_DEMO_TREE: {
  customer: string;
  project: string;
  files: { name: string; ct: string; phase: string; ext: ScanHit["ext"]; sizeKb: number }[];
}[] = [
  {
    customer: "Công ty Alpha Refrigeration",
    project: "CT-SCAN-01 Kho lạnh NM A",
    files: [
      { name: "Hop_dong_thi_cong_2026.pdf", ct: "HD-03", phase: "01", ext: "pdf", sizeKb: 420 },
      { name: "Bien_ban_hop_khoi_dong.docx", ct: "CT-01-BBHKD", phase: "01", ext: "docx", sizeKb: 88 },
      { name: "BOQ_MEP_rev2.xlsx", ct: "CT-04-BOQ", phase: "04", ext: "xlsx", sizeKb: 256 },
      { name: "Bao_gia_BG_2026_061.xlsx", ct: "BG-01", phase: "04", ext: "xlsx", sizeKb: 190 },
      { name: "Ban_ve_AHU_tang_KT.pdf", ct: "CT-02-DMBV", phase: "02", ext: "pdf", sizeKb: 2100 },
      { name: "MIR_vat_tu_ong_dong.pdf", ct: "CT-03-MIR", phase: "03", ext: "pdf", sizeKb: 140 },
      { name: "Nhat_ky_thi_cong_T6.docx", ct: "CT-05-NKTC", phase: "05", ext: "docx", sizeKb: 310 },
      { name: "BBNT_dot_1.pdf", ct: "CT-06-BBNTGD", phase: "06", ext: "pdf", sizeKb: 175 },
      { name: "Anh_hien_truong_01.jpg", ct: "CT-05-BCHA", phase: "05", ext: "jpg", sizeKb: 890 },
    ],
  },
  {
    customer: "Beta Building Solutions",
    project: "CT-SCAN-02 Van phong toa B",
    files: [
      { name: "HD_kinh_te_Beta.pdf", ct: "HD-04", phase: "01", ext: "pdf", sizeKb: 380 },
      { name: "Phu_luc_BOQ.xlsx", ct: "HD-07", phase: "01", ext: "xlsx", sizeKb: 120 },
      { name: "Bang_so_sanh_BG_NCC.xlsx", ct: "CT-04-SSBG", phase: "04", ext: "xlsx", sizeKb: 95 },
      { name: "PXK_vat_tu_dien.xlsx", ct: "CT-03-PGNVT", phase: "03", ext: "xlsx", sizeKb: 64 },
      { name: "Thu_de_nghi_thanh_toan.docx", ct: "CT-08-TDNTT", phase: "08", ext: "docx", sizeKb: 72 },
      { name: "Doi_chieu_cong_no.xlsx", ct: "CT-08-DCCN", phase: "08", ext: "xlsx", sizeKb: 55 },
    ],
  },
  {
    customer: "Gamma Facility Services",
    project: "CT-SCAN-03 He AHU tang KT",
    files: [
      { name: "Catalogue_AHU.pdf", ct: "CT-03-CAT", phase: "03", ext: "pdf", sizeKb: 1500 },
      { name: "WIR_lap_dat.pdf", ct: "CT-06-WIR", phase: "06", ext: "pdf", sizeKb: 210 },
      { name: "Bien_ban_ban_giao.pdf", ct: "CT-07-BBBG", phase: "07", ext: "pdf", sizeKb: 160 },
      { name: "Cam_ket_bao_hanh.docx", ct: "CT-09-CKBH", phase: "09", ext: "docx", sizeKb: 48 },
      { name: "As_built_register.xlsx", ct: "CT-07-DMBVHC", phase: "07", ext: "xlsx", sizeKb: 110 },
    ],
  },
];

export const REVENUE_SERIES = [
  { month: "T1", value: 820 },
  { month: "T2", value: 940 },
  { month: "T3", value: 1100 },
  { month: "T4", value: 980 },
  { month: "T5", value: 1250 },
  { month: "T6", value: 1380 },
];

export function normalizeLine(
  l: Partial<QuotationLine> & Pick<QuotationLine, "name" | "qty" | "unit" | "unitPrice">,
  fallbackTax = 8,
): QuotationLine {
  return {
    id: l.id ?? `tmp-${Math.random().toString(36).slice(2, 8)}`,
    name: l.name,
    description: l.description ?? "",
    qty: Number(l.qty) || 0,
    unit: l.unit || "cái",
    unitPrice: Number(l.unitPrice) || 0,
    taxRate: typeof l.taxRate === "number" ? l.taxRate : fallbackTax,
    notes: l.notes ?? "",
  };
}

export function lineAmount(l: QuotationLine): number {
  return (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
}

export function lineVatAmount(l: QuotationLine): number {
  return Math.round(lineAmount(l) * ((Number(l.taxRate) || 0) / 100));
}

export function lineTotal(l: QuotationLine): number {
  return lineAmount(l) + lineVatAmount(l);
}

export function quoteSubtotal(q: Quotation): number {
  return q.lines.reduce((s, l) => s + lineAmount(normalizeLine(l, q.vat)), 0);
}

export function quoteVat(q: Quotation): number {
  return q.lines.reduce((s, l) => s + lineVatAmount(normalizeLine(l, q.vat)), 0);
}

export function quoteTotal(q: Quotation): number {
  return quoteSubtotal(q) + quoteVat(q);
}

export function emptyBoqLine(taxRate = 8): Omit<QuotationLine, "id"> {
  return {
    name: "",
    description: "",
    qty: 1,
    unit: "cái",
    unitPrice: 0,
    taxRate,
    notes: "",
  };
}

export function demoDocStatus(code: string): DocStatus {
  let n = 0;
  for (let i = 0; i < code.length; i++) n = (n + code.charCodeAt(i) * (i + 3)) % 97;
  if (n % 7 === 0) return "missing";
  if (n % 5 === 0) return "pending";
  if (n % 4 === 0) return "draft";
  return "enough";
}

export function setupCompletion(flags: SetupFlags): number {
  const keys = Object.keys(flags) as (keyof SetupFlags)[];
  const done = keys.filter((k) => flags[k]).length;
  return Math.round((done / keys.length) * 100);
}

export function workflowCompletion(w: WorkflowFlags): number {
  const keys = Object.keys(w) as WorkflowStepId[];
  const done = keys.filter((k) => w[k]).length;
  return Math.round((done / keys.length) * 100);
}

export function normalizeProject(p: Project): Project {
  return {
    ...p,
    customer: p.customer,
    docStatuses: p.docStatuses ?? {},
    workflow: { ...EMPTY_WORKFLOW, ...defaultWorkflow(p.stage), ...p.workflow },
  };
}

export const STAGE_LABEL: Record<ProjectStage, string> = {
  bao_gia: "Báo giá",
  thi_cong: "Thi công",
  nghiem_thu: "Nghiệm thu",
  hoan_thanh: "Hoàn thành",
};

/** Build simulated scan hits from configured roots */
export function buildScanHits(scanRoots: string): ScanHit[] {
  const roots = scanRoots
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rootList = roots.length ? roots : ["D:\\HoSoDoanhNghiep"];
  const hits: ScanHit[] = [];
  let i = 0;
  for (const folder of SCAN_DEMO_TREE) {
    const root = rootList[i % rootList.length];
    for (const f of folder.files) {
      hits.push({
        id: `scan-${i}-${f.name}`,
        root,
        path: `${root}\\${folder.customer}\\${folder.project}\\${f.name}`,
        fileName: f.name,
        ext: f.ext,
        sizeKb: f.sizeKb,
        customerHint: folder.customer,
        projectHint: folder.project,
        ctCode: f.ct,
        phase: f.phase,
        mapped: true,
        imported: false,
      });
      i++;
    }
  }
  return hits;
}
