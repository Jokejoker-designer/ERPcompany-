import { useEffect, useMemo, useRef } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { Search, Building2, ContactRound, FileSpreadsheet } from "lucide-react";
import { useErpStore } from "@/store/erp-store";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { canAccessRoute, resolveEffectiveUser } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { trapFocus } from "@/lib/focus-trap";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const storeUser = useErpStore((s) => s.user);
  const session = useErpStore((s) => s.session);
  const customers = useErpStore((s) => s.customers);
  const projects = useErpStore((s) => s.projects);
  const quotations = useErpStore((s) => s.quotations);
  const setActiveProject = useErpStore((s) => s.setActiveProject);

  const user = useMemo(
    () => resolveEffectiveUser(session, storeUser),
    [session, storeUser],
  );
  const role = user?.role;

  const navItems = useMemo(() => {
    if (!role) return [];
    return ALL_NAV_ITEMS.filter((i) => i.roles.includes(role));
  }, [role]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [open]);

  if (!open) return null;

  function go(to: string) {
    onOpenChange(false);
    void navigate({ to });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-fg/40 px-3 pt-[12vh] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Đóng"
        onClick={() => onOpenChange(false)}
      />
      <div ref={panelRef} className="relative z-10 w-full max-w-xl">
      <Command
        className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl"
        label="Tìm nhanh"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <Command.Input
            placeholder="Tìm menu, khách, công trình, báo giá… (Ctrl/⌘K)"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            autoFocus
          />
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">
            Esc
          </kbd>
        </div>
        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
            Không có kết quả
          </Command.Empty>

          <Command.Group
            heading="Menu"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.to}
                  value={`${item.no} ${item.label} ${item.sub}`}
                  onSelect={() => go(item.to)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm aria-selected:bg-brand-soft aria-selected:text-brand-ink",
                  )}
                >
                  <span className="grid h-6 w-6 place-items-center rounded bg-surface-2 text-[11px] font-bold text-muted">
                    {item.no}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.label}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>

          {customers.length ? (
            <Command.Group
              heading="Khách hàng"
              className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted"
            >
              {customers.slice(0, 12).map((c) => (
                <Command.Item
                  key={c.id}
                  value={`kh ${c.code} ${c.name} ${c.taxId}`}
                  onSelect={() => {
                    if (role && canAccessRoute(role, "/app/customers")) {
                      go("/app/customers");
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm aria-selected:bg-brand-soft"
                >
                  <ContactRound className="h-4 w-4 text-muted" />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted">{c.code}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {projects.length ? (
            <Command.Group
              heading="Công trình"
              className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted"
            >
              {projects.slice(0, 12).map((p) => (
                <Command.Item
                  key={p.id}
                  value={`ct ${p.code} ${p.name} ${p.customer}`}
                  onSelect={() => {
                    setActiveProject(p.id);
                    go("/app/projects");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm aria-selected:bg-brand-soft"
                >
                  <Building2 className="h-4 w-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.code} · {p.name}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {quotations.length ? (
            <Command.Group
              heading="Báo giá"
              className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted"
            >
              {quotations.slice(0, 10).map((q) => (
                <Command.Item
                  key={q.id}
                  value={`bg ${q.code} ${q.customer} ${q.projectName}`}
                  onSelect={() => go("/app/quotations")}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm aria-selected:bg-brand-soft"
                >
                  <FileSpreadsheet className="h-4 w-4 text-muted" />
                  <span className="font-medium">{q.code}</span>
                  <span className="truncate text-xs text-muted">
                    {q.projectName}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
        <div className="border-t border-border-soft px-3 py-2 text-[11px] text-muted">
          ↑↓ di chuyển · Enter mở · Esc đóng · Ctrl/⌘K bật/tắt
        </div>
      </Command>
      </div>
    </div>
  );
}
