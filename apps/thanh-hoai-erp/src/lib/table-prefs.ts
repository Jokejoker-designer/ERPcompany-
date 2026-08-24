export type SortDir = "asc" | "desc";

export type TablePrefs = {
  q: string;
  sortId: string | null;
  sortDir: SortDir;
  facets: Record<string, string>;
};

export const DEFAULT_TABLE_PREFS: TablePrefs = {
  q: "",
  sortId: null,
  sortDir: "asc",
  facets: {},
};
