import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@retail/components/ui";
import { REASON_CODES, formatQty } from "@retail/data/retail";
import { useRetailStore } from "@retail/store/retail-store";

export function InventoryPage() {
  const products = useRetailStore((s) => s.products);
  const lots = useRetailStore((s) => s.lots);
  const counts = useRetailStore((s) => s.counts);
  const createCount = useRetailStore((s) => s.createCount);
  const submitCount = useRetailStore((s) => s.submitCount);
  const approveCount = useRetailStore((s) => s.approveCount);

  const nearExpiry = useMemo(() => {
    const now = Date.now();
    return lots
      .map((l) => {
        const days = Math.ceil(
          (new Date(l.expiryDate + "T00:00:00").getTime() - now) /
            (1000 * 60 * 60 * 24),
        );
        return {
          ...l,
          product: products.find((p) => p.id === l.productId),
          days,
        };
      })
      .filter((l) => l.qty > 0 && l.days <= 60)
      .sort((a, b) => a.days - b.days);
  }, [lots, products]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const active = counts.find((c) => c.id === activeId);

  function startCount() {
    const ids = [...products]
      .sort((a, b) => a.abc.localeCompare(b.abc))
      .slice(0, 5)
      .map((p) => p.id);
    const id = createCount("Kệ demo · Cycle count ABC", ids);
    setActiveId(id);
    const c = useRetailStore.getState().counts.find((x) => x.id === id);
    if (c) {
      const map: Record<string, number> = {};
      c.lines.forEach((l) => {
        map[l.productId] = l.systemQty;
      });
      setCounted(map);
    }
    toast.success("Đã tạo phiếu kiểm kho luân phiên (5 SKU ưu tiên A)");
  }

  function submit() {
    if (!activeId) return;
    submitCount(activeId, counted, reasons);
    toast.message("Đã gửi quản lý duyệt variance");
  }

  function approve() {
    if (!activeId) return;
    approveCount(activeId);
    toast.success("Cân bằng kho — stock đã cập nhật theo lý do thất thoát");
  }

  return (
    <div className="space-y-4">
      <Card className="border-brand/25 bg-brand-soft/30">
        <CardBody className="text-sm">
          <strong>Giai đoạn 4 — Kiểm kho:</strong> Cycle count (ABC) · freeze
          tồn lúc đếm · variance + reason code (01–04) · FEFO cận date · RTV.
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cycle count</CardTitle>
            <Button size="sm" onClick={startCount}>
              Bắt đầu kiểm
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {!active ? (
              <p className="text-sm text-muted">
                Chưa có phiếu — bấm «Bắt đầu kiểm» (ưu tiên hàng nhóm A).
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="brand">{active.code}</Badge>
                  <span className="text-muted">{active.location}</span>
                  <Badge
                    variant={
                      active.status === "approved"
                        ? "ok"
                        : active.status === "submitted"
                          ? "warn"
                          : "info"
                    }
                  >
                    {active.status}
                  </Badge>
                </div>
                {active.lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  const c = counted[l.productId] ?? l.countedQty;
                  const variance = c - l.systemQty;
                  return (
                    <div
                      key={l.productId}
                      className={`rounded-[var(--radius-md)] border p-3 ${
                        variance !== 0
                          ? "border-warn/40 bg-warn-soft/30"
                          : "border-border"
                      }`}
                    >
                      <div className="mb-2 text-sm font-semibold">
                        {p?.name}{" "}
                        <span className="text-xs font-normal text-muted">
                          sổ sách: {formatQty(l.systemQty)} {p?.baseUom}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs">
                          Đếm thực tế
                          <Input
                            type="number"
                            className="mt-1"
                            disabled={active.status !== "open"}
                            value={c}
                            onChange={(e) =>
                              setCounted((s) => ({
                                ...s,
                                [l.productId]: Number(e.target.value),
                              }))
                            }
                          />
                        </label>
                        {variance !== 0 ? (
                          <label className="text-xs">
                            Lý do thất thoát
                            <Select
                              className="mt-1"
                              disabled={active.status !== "open"}
                              value={reasons[l.productId] || "01"}
                              onChange={(e) =>
                                setReasons((s) => ({
                                  ...s,
                                  [l.productId]: e.target.value,
                                }))
                              }
                            >
                              {REASON_CODES.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.code} · {r.label}
                                </option>
                              ))}
                            </Select>
                          </label>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Variance:{" "}
                        <strong
                          className={
                            variance < 0
                              ? "text-danger"
                              : variance > 0
                                ? "text-ok"
                                : ""
                          }
                        >
                          {variance > 0 ? "+" : ""}
                          {formatQty(variance)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  {active.status === "open" ? (
                    <Button onClick={submit}>Gửi duyệt</Button>
                  ) : null}
                  {active.status === "submitted" ? (
                    <Button variant="ok" onClick={approve}>
                      Quản lý: Cân bằng kho
                    </Button>
                  ) : null}
                </div>
              </>
            )}

            {counts.length > 1 ? (
              <div className="border-t border-border pt-2">
                <div className="mb-1 text-xs font-semibold text-muted">
                  Phiếu trước
                </div>
                {counts.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
                    onClick={() => {
                      setActiveId(c.id);
                      const map: Record<string, number> = {};
                      c.lines.forEach((l) => {
                        map[l.productId] = l.countedQty;
                      });
                      setCounted(map);
                    }}
                  >
                    {c.code} · {c.status}
                  </button>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hàng cận date (FEFO · ≤ 60 ngày)</CardTitle>
            <Badge variant="danger">{nearExpiry.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {!nearExpiry.length ? (
              <p className="text-sm text-muted">Không có lô cận date.</p>
            ) : (
              nearExpiry.map((l) => (
                <div
                  key={l.id}
                  className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft/20 px-3 py-2 text-sm"
                >
                  <div className="font-semibold">
                    {l.product?.name} · lô {l.batchNo}
                  </div>
                  <div className="text-xs text-muted">
                    HSD {l.expiryDate} · còn{" "}
                    <strong className="text-danger">{l.days} ngày</strong> · SL{" "}
                    {formatQty(l.qty)} {l.product?.baseUom}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Badge variant="warn">Markdown −30%</Badge>
                    <Badge variant="info">RTV</Badge>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
