import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type FacetOption = { value: string; label: string };

type Props = {
  facets: Record<string, FacetOption[]>;
  value: Record<string, string>;
  onChange: (facetId: string, value: string) => void;
  onClear?: () => void;
  className?: string;
};

export function TableFacetFilters({
  facets,
  value,
  onChange,
  onClear,
  className,
}: Props) {
  const hasFilter = Object.values(value).some((v) => v && v !== "all");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {Object.entries(facets).map(([id, options]) => (
        <select
          key={id}
          className="h-9 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-xs"
          value={value[id] ?? "all"}
          onChange={(e) => onChange(id, e.target.value)}
          aria-label={id}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {hasFilter && onClear ? (
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Xóa lọc
        </Button>
      ) : null}
    </div>
  );
}
