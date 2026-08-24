import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Wallet,
  FolderOpen,
  FileOutput,
  Landmark,
  Settings2,
  Users,
  ContactRound,
  HardHat,
  FolderSearch,
  FileText,
  Upload,
  Package,
} from "lucide-react";
import type { RoleId } from "@/data/seed";
import type { AppRoute } from "@/lib/rbac";

export type NavItem = {
  to: AppRoute;
  label: string;
  sub: string;
  icon: LucideIcon;
  no: string;
  roles: RoleId[];
  /** Short label for mobile bottom bar */
  short: string;
};

export const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Bắt đầu",
    items: [
      {
        to: "/app/dashboard",
        label: "Dashboard điều hành",
        short: "Tổng quan",
        sub: "Tổng quan vận hành",
        icon: LayoutDashboard,
        no: "1",
        roles: [
          "admin",
          "giamdoc",
          "ketoan",
          "kinhdoanh",
          "ktt",
          "ktv",
          "thukho",
        ],
      },
    ],
  },
  {
    group: "Nạp dữ liệu",
    items: [
      {
        to: "/app/customers",
        label: "Khách hàng",
        short: "Khách",
        sub: "Profile · liên hệ · MST",
        icon: ContactRound,
        no: "2",
        roles: ["admin", "giamdoc", "kinhdoanh", "ketoan"],
      },
      {
        to: "/app/projects",
        label: "Công trình / vòng đời",
        short: "Công trình",
        sub: "CT → BG → HĐ → HS → CN",
        icon: HardHat,
        no: "3",
        roles: [
          "admin",
          "giamdoc",
          "kinhdoanh",
          "ktt",
          "ktv",
          "ketoan",
          "thukho",
        ],
      },
      {
        to: "/app/quotations",
        label: "Báo giá",
        short: "Báo giá",
        sub: "BOQ · VAT · revision",
        icon: FileSpreadsheet,
        no: "4",
        roles: ["admin", "giamdoc", "kinhdoanh"],
      },
      {
        to: "/app/scan",
        label: "Quét dữ liệu DN",
        short: "Quét DN",
        sub: "Folder khách · map hồ sơ",
        icon: FolderSearch,
        no: "5",
        roles: ["admin", "giamdoc", "kinhdoanh", "ktt"],
      },
      {
        to: "/app/import",
        label: "Import chuẩn hóa",
        short: "Import",
        sub: "CSV 1 mẫu · audit ô lạ",
        icon: Upload,
        no: "6",
        roles: ["admin", "giamdoc", "kinhdoanh", "ketoan"],
      },
      {
        to: "/app/editor",
        label: "Mở / sửa tài liệu",
        short: "Tài liệu",
        sub: "Word · Excel · version",
        icon: FileText,
        no: "7",
        roles: ["admin", "giamdoc", "kinhdoanh", "ktt", "ktv", "ketoan"],
      },
    ],
  },
  {
    group: "Hồ sơ & chứng từ",
    items: [
      {
        to: "/app/documents",
        label: "Hồ sơ công trình",
        short: "Hồ sơ",
        sub: "Checklist theo giai đoạn",
        icon: FolderOpen,
        no: "8",
        roles: ["admin", "giamdoc", "ktt", "ktv", "kinhdoanh"],
      },
      {
        to: "/app/chungtu",
        label: "Chứng từ xuất file",
        short: "Chứng từ",
        sub: "BG · BBNT · BQT · HĐ · PXK",
        icon: FileOutput,
        no: "9",
        roles: ["admin", "giamdoc", "kinhdoanh", "ketoan", "ktt", "thukho"],
      },
      {
        to: "/app/materials",
        label: "Vật tư · Kho",
        short: "Kho",
        sub: "Nhập/xuất Excel · tồn MAP",
        icon: Package,
        no: "9b",
        roles: ["admin", "giamdoc", "ktt", "thukho", "ketoan"],
      },
    ],
  },
  {
    group: "Công nợ & tiền",
    items: [
      {
        to: "/app/receivables",
        label: "Theo dõi công nợ",
        short: "Công nợ",
        sub: "Phải thu / phải trả",
        icon: Wallet,
        no: "10",
        roles: ["admin", "giamdoc", "ketoan"],
      },
      {
        to: "/app/bank",
        label: "Sao kê ngân hàng",
        short: "Sao kê",
        sub: "Đối soát dòng tiền",
        icon: Landmark,
        no: "11",
        roles: ["admin", "giamdoc", "ketoan"],
      },
    ],
  },
  {
    group: "Cấu hình",
    items: [
      {
        to: "/app/settings",
        label: "Cấu hình & Danh mục",
        short: "Cấu hình",
        sub: "Chỉ Admin / Giám đốc",
        icon: Settings2,
        no: "12",
        roles: ["admin", "giamdoc"],
      },
      {
        to: "/app/roles",
        label: "Tài khoản & phân quyền",
        short: "Quyền",
        sub: "Chỉ Admin",
        icon: Users,
        no: "13",
        roles: ["admin"],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Field tech bottom bar priority */
export const MOBILE_PRIMARY: AppRoute[] = [
  "/app/dashboard",
  "/app/projects",
  "/app/documents",
  "/app/chungtu",
  "/app/receivables",
];

export const PAGE_META: Record<string, { title: string; note: string }> = {
  "/app/dashboard": {
    title: "1 · Dashboard điều hành",
    note: "Số liệu từ dữ liệu thật trong hệ thống.",
  },
  "/app/customers": {
    title: "2 · Khách hàng",
    note: "Tạo profile khách trước — nền cho công trình, báo giá, công nợ.",
  },
  "/app/projects": {
    title: "3 · Công trình & vòng đời",
    note: "Tạo / chọn CT tại đây — mọi hồ sơ & chứng từ bám CT đã chọn.",
  },
  "/app/quotations": {
    title: "4 · Báo giá",
    note: "BOQ nhiều hạng mục · VAT · revision — gắn đúng công trình đang chọn.",
  },
  "/app/scan": {
    title: "5 · Quét dữ liệu doanh nghiệp",
    note: "Index folder · mở file · chỉnh sửa · nạp ERP.",
  },
  "/app/import": {
    title: "6 · Import chuẩn hóa",
    note: "Một schema CSV · map cột · audit ô không chắc.",
  },
  "/app/editor": {
    title: "7 · Mở / sửa tài liệu",
    note: "Soạn thảo Word & Excel cơ bản · lưu version.",
  },
  "/app/documents": {
    title: "8 · Hồ sơ công trình",
    note: "84 mẫu theo giai đoạn — chọn CT ở thanh phía trên trang.",
  },
  "/app/chungtu": {
    title: "9 · Chứng từ vận hành",
    note: "Bước 1: chọn công trình · Bước 2: bấm Xuất (dữ liệu CT + BOQ).",
  },
  "/app/materials": {
    title: "9b · Vật tư · Kho",
    note: "Danh mục SKU · nhập/xuất CSV/Excel · giá trị tồn theo MAP.",
  },
  "/app/receivables": {
    title: "10 · Theo dõi công nợ",
    note: "Phải thu / phải trả theo hợp đồng đã ký từ CT.",
  },
  "/app/bank": {
    title: "11 · Sao kê ngân hàng",
    note: "Đối soát dòng tiền, khớp công nợ và phiếu chi.",
  },
  "/app/settings": {
    title: "12 · Cấu hình & Danh mục",
    note: "Chỉ Admin / Giám đốc — công ty, 2FA, danh mục.",
  },
  "/app/roles": {
    title: "13 · Tài khoản & phân quyền",
    note: "Chỉ Admin — ma trận quyền theo vai trò.",
  },
};
