import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "border border-border bg-surface text-fg shadow-[var(--shadow-panel)]",
          title: "text-sm font-semibold",
          description: "text-xs text-muted",
        },
      }}
    />
  );
}
