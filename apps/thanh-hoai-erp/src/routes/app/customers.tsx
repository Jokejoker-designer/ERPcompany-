import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Metric } from "@/components/erp/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useErpStore } from "@/store/erp-store";
import { DataTable, type Column } from "@/components/erp/data-table";
import { EmptyState } from "@/components/erp/empty-state";
import { toastWithUndo } from "@/lib/undo-toast";
import type { Customer } from "@/data/seed";

export const Route = createFileRoute("/app/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const customers = useErpStore((s) => s.customers);
  const projects = useErpStore((s) => s.projects);
  const addCustomer = useErpStore((s) => s.addCustomer);
  const removeCustomer = useErpStore((s) => s.removeCustomer);
  const openWizard = useErpStore((s) => s.openWizard);

  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    name: "",
    taxId: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");

  const selected =
    customers.find((c) => c.id === selectedId) ?? customers[0] ?? null;
  const related = selected
    ? projects.filter((p) => p.customerId === selected.id)
    : [];

  function submit() {
    if (!form.name.trim()) {
      toast.error("Nhập tên khách hàng");
      return;
    }
    const c = addCustomer(form);
    setSelectedId(c.id);
    setForm({
      name: "",
      taxId: "",
      contact: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setShow(false);
    toast.success(`Đã tạo ${c.code}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <Metric label="Tổng khách hàng" value={String(customers.length)} />
          <Metric
            label="Có công trình"
            value={String(
              new Set(projects.map((p) => p.customerId)).size,
            )}
            tone="info"
          />
          <Metric
            label="Công trình gắn KH"
            value={String(projects.length)}
            tone="ok"
          />
        </div>
      </div>


      <DataTable<Customer>
        rows={customers}
        rowKey={(c) => c.id}
        selectedKey={selectedId}
        onRowClick={(c) => setSelectedId(c.id)}
        searchKeys={[(c) => c.name, (c) => c.code, (c) => c.taxId, (c) => c.phone, (c) => c.contact]}
        searchPlaceholder="Lọc theo tên, mã, MST, SĐT…"
        density="compact"
        emptyTitle="Chưa có khách hàng"
        emptyDescription="Tạo profile khách trước khi lập công trình / báo giá."
        emptyAction={
          <Button size="sm" onClick={() => setShow(true)}>
            Tạo profile
          </Button>
        }
        columns={[
          {
            id: "code",
            header: "Mã",
            sortValue: (c) => c.code,
            cell: (c) => (
              <span className="font-mono text-xs font-bold text-brand-ink">{c.code}</span>
            ),
          },
          {
            id: "name",
            header: "Tên khách",
            sortValue: (c) => c.name,
            cell: (c) => <span className="font-semibold">{c.name}</span>,
          },
          {
            id: "tax",
            header: "MST",
            sortValue: (c) => c.taxId,
            cell: (c) => c.taxId || "—",
            hideOnMobile: true,
          },
          {
            id: "contact",
            header: "Liên hệ",
            cell: (c) => (
              <span className="text-muted">
                {c.contact || "—"} · {c.phone || "—"}
              </span>
            ),
          },
          {
            id: "ct",
            header: "CT",
            sortValue: (c) => projects.filter((p) => p.customerId === c.id).length,
            cell: (c) => (
              <Badge variant="default">
                {projects.filter((p) => p.customerId === c.id).length}
              </Badge>
            ),
            className: "w-16",
          },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setShow((v) => !v)}>
          <Plus className="h-4 w-4" />
          Tạo profile khách
        </Button>
        <Button size="sm" variant="secondary" onClick={() => openWizard(3)}>
          <UserPlus className="h-4 w-4" />
          Mở wizard bước Khách
        </Button>
      </div>

      {show ? (
        <Card>
          <CardHeader>
            <CardTitle>Profile khách hàng mới</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Tên công ty *"],
                ["taxId", "MST"],
                ["contact", "Người liên hệ"],
                ["phone", "SĐT"],
                ["email", "Email"],
                ["address", "Địa chỉ"],
                ["notes", "Ghi chú"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className={
                  key === "name" || key === "address" || key === "notes"
                    ? "sm:col-span-2"
                    : ""
                }
              >
                <label className="mb-1 block text-xs font-semibold text-muted">
                  {label}
                </label>
                <Input
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={submit}>Lưu profile</Button>
              <Button variant="secondary" onClick={() => setShow(false)}>
                Hủy
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Danh sách khách</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 p-3">
            {!customers.length ? (
              <p className="px-2 py-6 text-center text-sm text-muted">
                Chưa có khách. Tạo profile hoặc chạy Setup A→Z.
              </p>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors ${
                    selected?.id === c.id
                      ? "border-brand bg-brand-soft"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-brand-ink">
                      {c.code}
                    </span>
                    <Badge variant="default">
                      {projects.filter((p) => p.customerId === c.id).length} CT
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-fg">
                    {c.name}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {c.contact || "—"} · {c.phone || "chưa có SĐT"}
                  </div>
                </button>
              ))
            )}
          </CardBody>
        </Card>

        {selected ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>
                {selected.code} · {selected.name}
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  const snap = { ...selected };
                  removeCustomer(selected.id);
                  setSelectedId("");
                  toastWithUndo({
                    message: `Đã xóa ${snap.code}`,
                    description: snap.name,
                    onUndo: () => {
                      useErpStore.setState((s) => ({
                        customers: [snap, ...s.customers.filter((c) => c.id !== snap.id)],
                      }));
                      setSelectedId(snap.id);
                    },
                  });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Xóa
              </Button>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["MST", selected.taxId],
                  ["Người liên hệ", selected.contact],
                  ["SĐT", selected.phone],
                  ["Email", selected.email],
                  ["Địa chỉ", selected.address],
                  ["Ngày tạo", selected.createdAt],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div className="text-xs text-muted">{l}</div>
                    <div className="text-sm font-medium text-fg">{v || "—"}</div>
                  </div>
                ))}
              </div>
              {selected.notes ? (
                <p className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-muted">
                  {selected.notes}
                </p>
              ) : null}

              <div>
                <h4 className="mb-2 text-sm font-semibold text-fg">
                  Công trình gắn khách
                </h4>
                {!related.length ? (
                  <p className="text-sm text-muted">
                    Chưa có công trình. Mở wizard bước Công trình để tạo.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {related.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-[var(--radius-md)] border border-border-soft px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{p.code}</span> — {p.name}
                        <div className="text-xs text-muted">
                          Giai đoạn: {p.stage} · {p.progress}%
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
