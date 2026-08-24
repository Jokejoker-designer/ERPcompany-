/**
 * Same-origin API client for thanh-hoai-runtime (:8777 via Vite proxy).
 * Cookie session only — no Authorization header (SameSite=Strict).
 */

export type ApiError = Error & {
  status?: number;
  payload?: Record<string, unknown>;
};

export type DataSource = "demo" | "runtime";

const STORAGE_KEY = "th-erp-data-source";

export function getConfiguredDataSource(): DataSource | "auto" {
  const env = (import.meta.env.VITE_ERP_DATA_SOURCE as string | undefined)?.trim();
  if (env === "runtime" || env === "demo") return env;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "runtime" || saved === "demo") return saved;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setPreferredDataSource(source: DataSource | "auto") {
  try {
    if (source === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, source);
  } catch {
    /* ignore */
  }
}

/** Absolute or same-origin base. Empty = Vite proxy /api → runtime. */
export function apiBaseUrl(): string {
  const raw = (import.meta.env.VITE_ERP_API_BASE as string | undefined)?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (e) {
    const err = new Error(
      e instanceof Error ? e.message : "Không kết nối được runtime API",
    ) as ApiError;
    err.status = 0;
    throw err;
  }

  const type = res.headers.get("content-type") || "";
  const data = type.includes("json")
    ? ((await res.json()) as Record<string, unknown>)
    : { raw: await res.text() };

  if (!res.ok) {
    const err = new Error(
      String(data.error || data.message || `HTTP ${res.status}`),
    ) as ApiError;
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export async function apiGet<T = unknown>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  let url = path;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&");
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  return apiFetch<T>(url);
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
}

/** Probe whether runtime answers on /api/me (proxy up). */
export async function probeRuntimeAvailable(
  timeoutMs = 2500,
): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${apiBaseUrl()}/api/me`;
    const res = await fetch(url, {
      credentials: "include",
      signal: ctrl.signal,
    });
    return res.ok || res.status === 401 || res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function resolveDataSource(): Promise<DataSource> {
  const cfg = getConfiguredDataSource();
  if (cfg === "demo" || cfg === "runtime") return cfg;
  const up = await probeRuntimeAvailable();
  return up ? "runtime" : "demo";
}
