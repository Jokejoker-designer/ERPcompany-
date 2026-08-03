import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/erp/empty-state";

export type Column<T> = {
  id: string;
  header: string;
  /** Sort key — omit to disable sort */
  sortValue?: (row: T) => string | number;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide on small screens */
  hideOnMobile?: boolean;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Client filter across these string extractors */
  searchKeys?: ((row: T) => string)[];
  searchPlaceholder?: string;
  density?: "comfortable" | "compact";
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  className?: string;
  toolbar?: React.ReactNode;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchKeys,
  searchPlaceholder = "Lọc…",
  density = "compact",
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription,
  emptyAction,
  onRowClick,
  selectedKey,
  className,
  toolbar,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim() && searchKeys?.length) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) =>
        searchKeys.some((fn) => fn(r).toLowerCase().includes(needle)),
      );
    }
    if (sortId) {
      const col = columns.find((c) => c.id === sortId);
      if (col?.sortValue) {
        const dir = sortDir === "asc" ? 1 : -1;
        list = [...list].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (typeof va === "number" && typeof vb === "number") {
            return (va - vb) * dir;
          }
          return String(va).localeCompare(String(vb), "vi") * dir;
        });
      }
    }
    return list;
  }, [rows, q, searchKeys, sortId, sortDir, columns]);

  function toggleSort(id: string) {
    if (sortId === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortId(id);
      setSortDir("asc");
    }
  }

  const pad = density === "compact" ? "px-3 py-2" : "px-3 py-3";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-3 py-2">
        {searchKeys?.length ? (
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              className="h-9 pl-8 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {toolbar}
        <span className="text-[11px] tabular-nums text-muted">
          {filtered.length}/{rows.length}
        </span>
      </div>

      {!filtered.length ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          className="border-0 shadow-none"
        />
      ) : (
        <div className="max-h-[min(70vh,640px)] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur">
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                {columns.map((c) => {
                  const sortable = Boolean(c.sortValue);
                  const active = sortId === c.id;
                  return (
                    <th
                      key={c.id}
                      className={cn(
                        pad,
                        "whitespace-nowrap",
                        c.hideOnMobile && "hidden sm:table-cell",
                        c.className,
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-fg"
                          onClick={() => toggleSort(c.id)}
                        >
                          {c.header}
                          {active ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const key = rowKey(row);
                const selected = selectedKey === key;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-border-soft transition-colors",
                      onRowClick && "cursor-pointer hover:bg-brand-soft/30",
                      selected && "bg-brand-soft/50",
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          pad,
                          "align-middle",
                          c.hideOnMobile && "hidden sm:table-cell",
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
