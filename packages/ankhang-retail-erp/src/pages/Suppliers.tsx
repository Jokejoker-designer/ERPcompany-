import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input } from "@retail/components/ui";
import { useRetailStore } from "@retail/store/retail-store";

export function SuppliersPage() {
  const suppliers = useRetailStore((s) => s.suppliers);
  const addSupplier = useRetailStore((s) => s.addSupplier);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function add() {
    if (!name.trim()) return toast.error("Nhập tên NCC");
    addSupplier({
      code: `NCC-${String(suppliers.length + 1).padStart(2, "0")}`,
      name: name.trim(),
      contact: "—",
      phone: phone.trim() || "—",
      taxId: "—",
      leadDays: 3,
      onTimeRate: 90,
    });
    setName("");
    setPhone("");
    toast.success("Đã thêm nhà cung cấp");
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>Vendor Master</strong> — nền cho PO / GRN / RTV. Lead time &
          on-time rate phục vụ đánh giá chuỗi cung ứng (GĐ 5).
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thêm NCC nhanh</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Tên nhà cung cấp"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="SĐT"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="sm:w-40"
          />
          <Button onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            Thêm
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((s) => (
          <Card key={s.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted">{s.code}</div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="mt-1 text-xs text-muted">
                    {s.contact} · {s.phone}
                  </div>
                </div>
                <Badge variant={s.onTimeRate >= 90 ? "ok" : "warn"}>
                  {s.onTimeRate}% đúng hạn
                </Badge>
              </div>
              <div className="mt-3 flex gap-3 text-xs text-muted">
                <span>Lead {s.leadDays} ngày</span>
                <span>MST {s.taxId}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
