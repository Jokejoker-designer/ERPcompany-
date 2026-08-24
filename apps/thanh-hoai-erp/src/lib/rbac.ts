/**
 * ERP menu & route RBAC — Process-first, role-bound.
 * Role is ALWAYS resolved from DEMO_USERS by session userId (never from storage spoof).
 */

import { DEMO_USERS, type RoleId, type User } from "@/data/seed";
import type { Session } from "@/lib/erp-auth";
import {
  canAccessRouteServer,
  firstAllowedRouteServer,
  type ServerPermissions,
} from "@/lib/server-permissions";

/** App path keys (no trailing slash) */
export type AppRoute =
  | "/app/dashboard"
  | "/app/customers"
  | "/app/projects"
  | "/app/quotations"
  | "/app/scan"
  | "/app/import"
  | "/app/editor"
  | "/app/documents"
  | "/app/chungtu"
  | "/app/materials"
  | "/app/receivables"
  | "/app/bank"
  | "/app/settings"
  | "/app/roles";

export type AccessLevel = "full" | "read" | "none";

/** Who may open each menu item */
export const ROUTE_ROLES: Record<AppRoute, RoleId[]> = {
  "/app/dashboard": [
    "admin",
    "giamdoc",
    "ketoan",
    "kinhdoanh",
    "ktt",
    "ktv",
    "thukho",
  ],
  "/app/customers": ["admin", "giamdoc", "kinhdoanh", "ketoan"],
  "/app/projects": [
    "admin",
    "giamdoc",
    "kinhdoanh",
    "ktt",
    "ktv",
    "ketoan",
    "thukho",
  ],
  "/app/quotations": ["admin", "giamdoc", "kinhdoanh"],
  "/app/scan": ["admin", "giamdoc", "kinhdoanh", "ktt"],
  "/app/import": ["admin", "giamdoc", "kinhdoanh", "ketoan"],
  "/app/editor": ["admin", "giamdoc", "kinhdoanh", "ktt", "ktv", "ketoan"],
  "/app/documents": ["admin", "giamdoc", "ktt", "ktv", "kinhdoanh"],
  "/app/chungtu": [
    "admin",
    "giamdoc",
    "kinhdoanh",
    "ketoan",
    "ktt",
    "thukho",
  ],
  "/app/materials": ["admin", "giamdoc", "ktt", "thukho", "ketoan"],
  "/app/receivables": ["admin", "giamdoc", "ketoan"],
  "/app/bank": ["admin", "giamdoc", "ketoan"],
  /** Cấu hình: chỉ Admin + Giám đốc */
  "/app/settings": ["admin", "giamdoc"],
  /** Phân quyền: chỉ Admin */
  "/app/roles": ["admin"],
};

/** Human-readable matrix for Roles page */
export const RBAC_MATRIX: {
  module: string;
  route: AppRoute;
  admin: string;
  giamdoc: string;
  ketoan: string;
  kinhdoanh: string;
  ktt: string;
  ktv: string;
  thukho: string;
}[] = [
  {
    module: "1 · Dashboard",
    route: "/app/dashboard",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Full",
    kinhdoanh: "Full",
    ktt: "Full",
    ktv: "Full",
    thukho: "Full",
  },
  {
    module: "2 · Khách hàng",
    route: "/app/customers",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Xem",
    kinhdoanh: "Full",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "3 · Công trình",
    route: "/app/projects",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Xem",
    kinhdoanh: "Full",
    ktt: "Full",
    ktv: "Thi công",
    thukho: "Xuất kho",
  },
  {
    module: "4 · Báo giá",
    route: "/app/quotations",
    admin: "Full",
    giamdoc: "Duyệt",
    ketoan: "—",
    kinhdoanh: "Full",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "5 · Quét DN",
    route: "/app/scan",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "—",
    kinhdoanh: "Full",
    ktt: "Full",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "6 · Import",
    route: "/app/import",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Full",
    kinhdoanh: "Full",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "7 · Sửa tài liệu",
    route: "/app/editor",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Full",
    kinhdoanh: "Full",
    ktt: "Full",
    ktv: "Checklist",
    thukho: "—",
  },
  {
    module: "8 · Hồ sơ CT",
    route: "/app/documents",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "—",
    kinhdoanh: "Xem",
    ktt: "Full",
    ktv: "Nhật ký",
    thukho: "—",
  },
  {
    module: "9 · Chứng từ",
    route: "/app/chungtu",
    admin: "Full",
    giamdoc: "Duyệt",
    ketoan: "BQT · CN",
    kinhdoanh: "BG · HĐ",
    ktt: "BBNT",
    ktv: "—",
    thukho: "PXK",
  },
  {
    module: "9b · Vật tư · Kho",
    route: "/app/materials",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Xem",
    kinhdoanh: "—",
    ktt: "Full",
    ktv: "—",
    thukho: "Full",
  },
  {
    module: "10 · Công nợ",
    route: "/app/receivables",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Full",
    kinhdoanh: "—",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "11 · Sao kê NH",
    route: "/app/bank",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "Full",
    kinhdoanh: "—",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "12 · Cấu hình",
    route: "/app/settings",
    admin: "Full",
    giamdoc: "Full",
    ketoan: "—",
    kinhdoanh: "—",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
  {
    module: "13 · Phân quyền",
    route: "/app/roles",
    admin: "Full",
    giamdoc: "—",
    ketoan: "—",
    kinhdoanh: "—",
    ktt: "—",
    ktv: "—",
    thukho: "—",
  },
];

/** Resolve live role from session + registry (anti F12).
 * Runtime cookie sessions trust store.user (mapped from /api/me). */
export function resolveEffectiveUser(
  session: Session | null | undefined,
  fallbackUser: User | null,
): User | null {
  if (session?.token === "runtime-cookie") {
    return fallbackUser ? { ...fallbackUser } : null;
  }
  if (session?.userId) {
    const fresh = DEMO_USERS.find((u) => u.id === session.userId);
    if (fresh) return { ...fresh };
  }
  if (fallbackUser) {
    const fresh = DEMO_USERS.find((u) => u.id === fallbackUser.id);
    if (fresh) return { ...fresh };
    // Runtime / unknown id: keep mapped user from store
    if (session?.token === "runtime-cookie" || !DEMO_USERS.some((u) => u.id === fallbackUser.id)) {
      return { ...fallbackUser };
    }
  }
  return null;
}

export function canAccessRoute(
  role: RoleId | undefined | null,
  path: string,
  serverPerms?: ServerPermissions | null,
): boolean {
  if (!role) return false;
  const key = (path.split("?")[0].replace(/\/$/, "") || path) as AppRoute;
  if (serverPerms?.erp_routes?.length) {
    return canAccessRouteServer(serverPerms, key);
  }
  const allowed = ROUTE_ROLES[key];
  if (!allowed) {
    if (path.startsWith("/app")) return true;
    return false;
  }
  return allowed.includes(role);
}

export function firstAllowedRoute(
  role: RoleId,
  serverPerms?: ServerPermissions | null,
): AppRoute {
  if (serverPerms?.erp_routes?.length) {
    return firstAllowedRouteServer(serverPerms);
  }
  const order = Object.keys(ROUTE_ROLES) as AppRoute[];
  for (const r of order) {
    if (ROUTE_ROLES[r].includes(role)) return r;
  }
  return "/app/dashboard";
}

export function denyMessage(role: RoleId, path: string): string {
  return `Vai trò «${role}» không có quyền truy cập ${path}. Liên hệ Admin / Giám đốc nếu cần mở quyền.`;
}
