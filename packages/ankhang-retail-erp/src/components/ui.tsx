import React, { forwardRef, isValidElement, cloneElement, useState, type ReactElement } from "react";
import { cn } from "@retail/lib/utils";

export function Button({
  className,
  variant = "default",
  size = "md",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "danger" | "ok";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  return (
    <button
      type={type}
      className={cn(
        "pressable inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-55",
        size === "sm" && "h-9 min-h-9 px-3 text-xs",
        size === "md" && "h-11 min-h-[var(--tap)] px-4 text-sm",
        size === "lg" && "h-12 min-h-12 px-5 text-sm",
        size === "icon" && "h-11 w-11 min-h-[var(--tap)] min-w-[var(--tap)]",
        variant === "default" &&
          "bg-brand text-on-brand shadow-sm hover:bg-brand-ink",
        variant === "secondary" &&
          "border border-border bg-surface text-fg hover:bg-surface-2",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        variant === "ok" && "bg-ok text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-panel)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-fg", className)} {...props} />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "brand" | "ok" | "warn" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        variant === "default" && "bg-surface-2 text-fg border border-border",
        variant === "brand" && "bg-brand-soft text-brand-ink border border-brand/25",
        variant === "ok" && "bg-ok-soft text-ok border border-ok/25",
        variant === "warn" && "bg-warn-soft text-warn border border-warn/30",
        variant === "danger" && "bg-danger-soft text-danger border border-danger/25",
        variant === "info" && "bg-info-soft text-info border border-info/25",
        className,
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-fg shadow-sm outline-none transition-shadow placeholder:text-muted focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
});

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-55",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ─── WCAG helpers ─── */

export function SrOnly({
  children,
  as: Comp = "span",
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "span" | "div" | "h2" | "p" | "label";
  children: React.ReactNode;
}) {
  return (
    <Comp className="sr-only" {...props}>
      {children}
    </Comp>
  );
}

export function SkipLink({
  href = "#main-content",
  children = "Bỏ qua điều hướng — tới nội dung chính",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <a href={href} className="skip-link">
      {children}
    </a>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-semibold text-fg">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {required ? <SrOnly>(bắt buộc)</SrOnly> : null}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
            "aria-required": required || undefined,
          })
        : children}
      {hint && !error ? (
        <p id={hintId} className="text-[11px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="text-[11px] font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  foot,
  tone = "brand",
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  tone?: "brand" | "ok" | "warn" | "danger" | "info";
}) {
  const bar = {
    brand: "border-t-brand",
    ok: "border-t-ok",
    warn: "border-t-warn",
    danger: "border-t-danger",
    info: "border-t-info",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border border-t-[3px] bg-surface p-4 shadow-[var(--shadow-panel)]",
        bar,
      )}
    >
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-fg sm:text-2xl">
        {value}
      </div>
      {foot ? <div className="mt-1.5">{foot}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center",
        className,
      )}
      role="status"
    >
      <div className="text-sm font-semibold text-fg">{title}</div>
      {description ? (
        <p className="max-w-xs text-xs text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function TipBanner({
  title,
  children,
  defaultOpen = true,
  className,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-brand/25 bg-brand-soft/35 text-sm",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left font-semibold text-brand-ink"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="text-xs font-medium text-muted" aria-hidden>
          {open ? "Thu gọn" : "Mở"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-brand/15 px-3 py-2.5 text-xs leading-relaxed text-muted">
          {children}
        </div>
      ) : null}
    </div>
  );
}
