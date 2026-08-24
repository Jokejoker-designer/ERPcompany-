/** Per-user keys for persisted UI / workflow state (browser-local). */

import type { Session } from "@/lib/erp-auth";

export function resolveUserKey(
  session: Session | null,
  username?: string | null,
): string {
  const u = username ?? session?.username;
  if (!u) return "guest";
  return u.trim().toLowerCase().replace(/\s+/g, "_");
}

export function scopedStorageKey(base: string, userKey: string): string {
  return `${base}::${userKey}`;
}
