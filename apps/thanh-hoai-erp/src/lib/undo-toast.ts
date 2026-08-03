import { toast } from "sonner";

/** Toast with undo action — keeps snapshot restore simple for demo */
export function toastWithUndo(opts: {
  message: string;
  description?: string;
  onUndo: () => void;
  duration?: number;
}) {
  toast.success(opts.message, {
    description: opts.description ?? "Hoàn tác trong vài giây nếu thao tác nhầm.",
    duration: opts.duration ?? 6000,
    action: {
      label: "Hoàn tác",
      onClick: () => {
        opts.onUndo();
        toast.message("Đã hoàn tác");
      },
    },
  });
}
