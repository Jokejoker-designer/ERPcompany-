import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Select } from "@retail/components/ui";
import { formatVnd, type Customer } from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

const tierLabel: Record<Customer["tier"], string> = {
  bronze: "Đồng",
  silver: "Bạc",
  gold: "Vàng",
};

export function CustomersPage() {
  const customers = useRetailStore((s) => s.customers);
  const addCustomer = useRetailStore((s) => s.addCustomer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<Customer["tier"]>("bronze");

  function add() {
    if (!name.trim() || !phone.trim())
      return toast.error("Nhập tên và SĐT");
    addCustomer({
      name: name.trim(),
      phone: phone.trim(),
      tier,
      points: 0,
      visits: 0,
      totalSpend: 0,
      lastItems: [],
    });
    setName("");
    setPhone("");
    toast.success("Đã thêm khách hàng");
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>CRM realtime</strong> — POS lấy hạng/điểm khi quét SĐT. Vàng
          −5%, Bạc −2%. Cross-sell dựa trên lastItems.
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thêm khách</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Họ tên" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="SĐT" value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:w-40" />
          <Select
            value={tier}
            onChange={(e) => setTier(e.target.value as Customer["tier"])}
            className="sm:w-32"
          >
            <option value="bronze">Đồng</option>
            <option value="silver">Bạc</option>
            <option value="gold">Vàng</option>
          </Select>
          <Button onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            Thêm
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => (
          <Card key={c.id}>
            <CardBody>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-muted">{c.code}</div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted">{c.phone}</div>
                </div>
                <Badge
                  variant={
                    c.tier === "gold"
                      ? "brand"
                      : c.tier === "silver"
                        ? "info"
                        : "default"
                  }
                >
                  {tierLabel[c.tier]}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-surface-2 py-1.5">
                  <div className="font-semibold tabular-nums">{c.points}</div>
                  <div className="text-muted">điểm</div>
                </div>
                <div className="rounded-md bg-surface-2 py-1.5">
                  <div className="font-semibold tabular-nums">{c.visits}</div>
                  <div className="text-muted">lượt</div>
                </div>
                <div className="rounded-md bg-surface-2 py-1.5">
                  <div className="font-semibold tabular-nums text-[10px]">
                    {formatVnd(c.totalSpend)}
                  </div>
                  <div className="text-muted">chi tiêu</div>
                </div>
              </div>
              {c.lastItems.length ? (
                <p className="mt-2 text-[11px] text-muted">
                  Cross-sell: {c.lastItems.join(" · ")}
                </p>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
