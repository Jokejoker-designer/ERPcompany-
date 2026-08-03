import { Toaster as Sonner } from "sonner";

/** Toasts use role=status via sonner — ensure readable contrast */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            "border border-border bg-surface text-fg shadow-[var(--shadow-panel)]",
          title: "text-sm font-semibold text-fg",
          description: "text-xs text-muted",
          closeButton: "border border-border bg-surface text-fg",
          actionButton: "bg-brand text-on-brand",
          cancelButton: "bg-surface-2 text-fg",
        },
      }}
    />
  );
}
