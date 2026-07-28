import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted border border-border",
        brand: "bg-brand-soft text-brand-ink border border-brand/20",
        ok: "bg-ok-soft text-ok border border-ok/20",
        warn: "bg-warn-soft text-warn border border-warn/25",
        danger: "bg-danger-soft text-danger border border-danger/20",
        info: "bg-info-soft text-info border border-info/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
