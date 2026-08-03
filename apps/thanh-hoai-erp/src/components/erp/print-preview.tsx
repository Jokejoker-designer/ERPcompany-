import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import { trapFocus } from "@/lib/focus-trap";
import { Button } from "@/components/ui/button";

export function PrintPreviewModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [open]);

  if (!open) return null;

  function print() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-fg/50 p-3 print:static print:bg-transparent print:p-0" role="presentation">
      <button
        type="button"
        className="absolute inset-0 print:hidden"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 print:hidden">
          <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
          <Button size="sm" variant="secondary" onClick={print}>
            <Printer className="h-3.5 w-3.5" />
            In / PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          id="print-preview-body"
          className="min-h-0 flex-1 overflow-y-auto bg-white p-6 text-fg print:overflow-visible print:p-8"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
