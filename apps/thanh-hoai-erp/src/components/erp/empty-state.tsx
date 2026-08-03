import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-4 py-12 text-center",
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
        {icon ?? <span className="text-lg font-semibold">—</span>}
      </div>
      <div className="text-sm font-semibold text-fg">{title}</div>
      {description ? (
        <p className="max-w-sm text-xs text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Có lỗi xảy ra",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-soft/40 px-4 py-10 text-center">
      <div className="text-sm font-semibold text-danger">{title}</div>
      {description ? <p className="max-w-md text-xs text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-md)] bg-surface-2",
        className,
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 page-enter">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
