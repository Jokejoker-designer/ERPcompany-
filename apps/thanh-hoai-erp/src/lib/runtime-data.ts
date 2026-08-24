/**
 * Load operational lists from thanh-hoai-runtime (API_MAPPING).
 */

import { apiGet, apiPost } from "@/lib/api-client";
import {
  mapRuntimeCustomer,
  mapRuntimeProject,
  mapRuntimeQuotation,
  mapRuntimeReceivable,
  mapRuntimeUser,
  rowsOf,
  type RuntimeDashboard,
  type RuntimeMeUser,
} from "@/lib/api-mappers";
import type {
  Customer,
  Project,
  Quotation,
  Receivable,
  User,
} from "@/data/seed";

export type RuntimeBundle = {
  customers: Customer[];
  projects: Project[];
  quotations: Quotation[];
  receivables: Receivable[];
  dashboard: RuntimeDashboard | null;
};

export type MeResult =
  | { authenticated: false }
  | { authenticated: true; user: User; mustChange: boolean };

export async function runtimeLogin(
  username: string,
  password: string,
): Promise<{ user: User; mustChange: boolean }> {
  const data = await apiPost<{
    ok?: boolean;
    user?: RuntimeMeUser;
    full_name?: string;
    role?: string;
    must_change?: boolean | number;
  }>("/api/login", { username, password });
  const raw = data.user || {
    username,
    full_name: data.full_name,
    role: data.role,
    must_change: data.must_change,
  };
  const user = mapRuntimeUser(raw);
  const mustChange = Boolean(raw.must_change ?? data.must_change);
  return { user, mustChange };
}

export async function runtimeLogout(): Promise<void> {
  try {
    await apiPost("/api/logout", {});
  } catch {
    /* clear client anyway */
  }
}

export async function runtimeMe(): Promise<MeResult> {
  const data = await apiGet<{
    authenticated?: boolean;
    user?: RuntimeMeUser;
  }>("/api/me");
  if (!data.authenticated || !data.user) return { authenticated: false };
  return {
    authenticated: true,
    user: mapRuntimeUser(data.user),
    mustChange: Boolean(data.user.must_change),
  };
}

export async function fetchRuntimeBundle(): Promise<RuntimeBundle> {
  const settled = await Promise.allSettled([
    apiGet("/api/customers"),
    apiGet("/api/ct_projects"),
    apiGet("/api/quotations"),
    apiGet("/api/receivable"),
    apiGet("/api/dashboard"),
  ]);

  const customersRaw =
    settled[0].status === "fulfilled" ? settled[0].value : [];
  const projectsRaw =
    settled[1].status === "fulfilled" ? settled[1].value : { rows: [] };
  const quotationsRaw =
    settled[2].status === "fulfilled" ? settled[2].value : [];
  const receivableRaw =
    settled[3].status === "fulfilled" ? settled[3].value : { invoices: [] };
  const dashboardRaw =
    settled[4].status === "fulfilled" ? settled[4].value : null;

  const customers = rowsOf(customersRaw).map(mapRuntimeCustomer);

  const projects = rowsOf(projectsRaw).map(mapRuntimeProject);

  const quoteRows = rowsOf(quotationsRaw);
  const quotations: Quotation[] = [];
  // Enrich first N quotations with detail (BOQ lines) — avoid stampeding API
  const detailLimit = Math.min(quoteRows.length, 8);
  for (let i = 0; i < quoteRows.length; i++) {
    const row = quoteRows[i];
    if (i < detailLimit && row.id != null) {
      try {
        const detail = await apiGet<Record<string, unknown>>(
          "/api/quotation",
          { id: String(row.id) },
        );
        quotations.push(mapRuntimeQuotation(row, detail));
        continue;
      } catch {
        /* list-only fallback */
      }
    }
    quotations.push(mapRuntimeQuotation(row));
  }

  const invoices =
    receivableRaw &&
    typeof receivableRaw === "object" &&
    Array.isArray((receivableRaw as { invoices?: unknown }).invoices)
      ? ((receivableRaw as { invoices: Record<string, unknown>[] }).invoices)
      : rowsOf(receivableRaw);
  const receivables = invoices.map(mapRuntimeReceivable);

  let dashboard: RuntimeDashboard | null = null;
  if (dashboardRaw && typeof dashboardRaw === "object") {
    const d = dashboardRaw as Record<string, unknown>;
    dashboard = {
      kpi: (d.kpi as Record<string, number | string>) || {},
      alerts: Array.isArray(d.alerts)
        ? (d.alerts as [string, string, string?][])
        : [],
      weeks: Array.isArray(d.weeks) ? (d.weeks as number[]) : [],
      projects: rowsOf(d.projects ? { rows: d.projects } : d),
    };
  }

  return { customers, projects, quotations, receivables, dashboard };
}

export async function createRuntimeCustomer(input: {
  name: string;
  taxId?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const data = await apiPost<{ id?: number | string; customer_id?: number }>(
    "/api/write/customer",
    {
      customer_name: input.name,
      tax_id: input.taxId || "",
      phan_loai: "Công ty",
      khu_vuc: "",
      dia_chi: input.address || "",
      nguoi_lien_he: input.contact || "",
      dien_thoai: input.phone || "",
      email: input.email || "",
      ghi_chu: input.notes || "",
    },
  );
  return { id: String(data.id ?? data.customer_id ?? "") };
}
