import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_TABLE_PREFS,
  type TablePrefs,
} from "@/lib/table-prefs";

type TablePrefsState = {
  byUser: Record<string, Record<string, TablePrefs>>;
  getPrefs: (userKey: string, tableId: string) => TablePrefs;
  setPrefs: (
    userKey: string,
    tableId: string,
    patch: Partial<TablePrefs>,
  ) => void;
  resetPrefs: (userKey: string, tableId: string) => void;
};

export const useTablePrefsStore = create<TablePrefsState>()(
  persist(
    (set, get) => ({
      byUser: {},
      getPrefs: (userKey, tableId) => {
        const u = get().byUser[userKey]?.[tableId];
        return u
          ? { ...DEFAULT_TABLE_PREFS, ...u, facets: { ...u.facets } }
          : { ...DEFAULT_TABLE_PREFS, facets: {} };
      },
      setPrefs: (userKey, tableId, patch) =>
        set((s) => {
          const prev = s.byUser[userKey]?.[tableId] ?? DEFAULT_TABLE_PREFS;
          const next: TablePrefs = {
            ...prev,
            ...patch,
            facets: patch.facets
              ? { ...prev.facets, ...patch.facets }
              : { ...prev.facets },
          };
          return {
            byUser: {
              ...s.byUser,
              [userKey]: { ...(s.byUser[userKey] ?? {}), [tableId]: next },
            },
          };
        }),
      resetPrefs: (userKey, tableId) =>
        set((s) => {
          const tables = { ...(s.byUser[userKey] ?? {}) };
          delete tables[tableId];
          return {
            byUser: { ...s.byUser, [userKey]: tables },
          };
        }),
    }),
    { name: "thanh-hoai-table-prefs-v1" },
  ),
);
