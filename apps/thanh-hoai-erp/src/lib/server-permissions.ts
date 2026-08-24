/**
 * Server-authoritative RBAC from thanh-hoai-runtime (/api/me permissions).
 * When present, overrides client ROUTE_ROLES for route/nav enforcement.
 */

import type { AppRoute } from "@/lib/rbac";

export type ServerPermissions = {
  read_pages: string[];
  write_resources: string[];
  erp_routes: AppRoute[];
  can_see_money: boolean;
  can_see_finance: boolean;
  can_see_sales_values: boolean;
};

export function parseServerPermissions(
  raw: unknown,
): ServerPermissions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const routes = Array.isArray(o.erp_routes)
    ? o.erp_routes.filter((r): r is AppRoute => typeof r === "string")
    : [];
  return {
    read_pages: Array.isArray(o.read_pages)
      ? o.read_pages.map(String)
      : [],
    write_resources: Array.isArray(o.write_resources)
      ? o.write_resources.map(String)
      : [],
    erp_routes: routes,
    can_see_money: Boolean(o.can_see_money),
    can_see_finance: Boolean(o.can_see_finance),
    can_see_sales_values: Boolean(o.can_see_sales_values),
  };
}

export function canAccessRouteServer(
  perms: ServerPermissions | null | undefined,
  path: string,
): boolean {
  if (!perms?.erp_routes?.length) return true;
  const key = (path.split("?")[0].replace(/\/$/, "") || path) as AppRoute;
  return perms.erp_routes.includes(key);
}

export function canWriteResource(
  perms: ServerPermissions | null | undefined,
  resource: string,
): boolean {
  if (!perms?.write_resources?.length) return true;
  return perms.write_resources.includes(resource);
}

export function firstAllowedRouteServer(
  perms: ServerPermissions,
): AppRoute {
  const order: AppRoute[] = [
    "/app/dashboard",
    "/app/customers",
    "/app/projects",
    "/app/quotations",
    "/app/documents",
    "/app/chungtu",
    "/app/materials",
    "/app/receivables",
    "/app/bank",
    "/app/import",
    "/app/scan",
    "/app/editor",
    "/app/settings",
    "/app/roles",
  ];
  for (const r of order) {
    if (perms.erp_routes.includes(r)) return r;
  }
  return perms.erp_routes[0] ?? "/app/dashboard";
}

export function assertWritePermission(
  perms: ServerPermissions | null | undefined,
  resource: string,
): void {
  if (!perms) return;
  if (!canWriteResource(perms, resource)) {
    throw new Error(
      `Vai trò hiện tại không có quyền ghi «${resource}» trên server.`,
    );
  }
}

export function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; payload?: Record<string, unknown> };
  return (
    e.status === 403 ||
    Boolean(e.payload?.permission_denied) ||
    Boolean(e.payload?.must_change)
  );
}
