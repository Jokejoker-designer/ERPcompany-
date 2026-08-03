import * as React from "react";
import { cn } from "@/lib/utils";

/** Screen-reader only — visible to AT, not layout (WCAG 2.4.1 / 1.3.1) */
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

/** Skip to main content — first focusable in document (WCAG 2.4.1) */
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

/** Live region for polite status updates (WCAG 4.1.3 Status Messages) */
export function LiveRegion({
  message,
  politeness = "polite",
}: {
  message: string;
  politeness?: "polite" | "assertive";
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

/** Form field with visible label + error (WCAG 1.3.1, 3.3.1, 3.3.2) */
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
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            {
              id,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": describedBy,
              "aria-required": required || undefined,
            },
          )
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

/** Icon-only button helper props */
export function iconButtonA11y(label: string) {
  return { "aria-label": label, title: label } as const;
}
