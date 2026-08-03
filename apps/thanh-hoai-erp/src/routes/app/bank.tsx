import { createFileRoute } from "@tanstack/react-router";
import { BankStatusBadge, Metric } from "@/components/erp/status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVnd } from "@/lib/utils";
import { useErpStore } from "@/store/erp-store";

export const Route = createFileRoute("/app/bank")({
  component: BankPage,
});

function BankPage() {
  const lines = useErpStore((s) => s.bankLines);
  const setStatus = useErpStore((s) => s.setBankStatus);

  const inflow = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const outflow = lines
    .filter((l) => l.amount < 0)
    .reduce((s, l) => s + Math.abs(l.amount), 0);
  const pending = lines.filter((l) => l.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Tiền vào (mẫu)" value={formatVnd(inflow)} tone="ok" />
        <Metric label="Tiền ra (mẫu)" value={formatVnd(outflow)} tone="danger" />
        <Metric
          label="Chờ đối soát"
          value={`${pending} dòng`}
          tone={pending ? "warn" : "ok"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dòng sao kê mẫu</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">Ngày</th>
                <th className="px-4 py-3 font-semibold">Diễn giải</th>
                <th className="px-4 py-3 text-right font-semibold">Số tiền</th>
                <th className="px-4 py-3 font-semibold">Gợi ý khớp</th>
                <th className="px-4 py-3 font-semibold">TT</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {lines.map((b) => (
                <tr key={b.id} className="border-b border-border-soft">
                  <td className="px-4 py-3 tabular-nums text-muted">{b.date}</td>
                  <td className="px-4 py-3 font-medium">{b.desc}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      b.amount >= 0 ? "text-ok" : "text-danger"
                    }`}
                  >
                    {b.amount >= 0 ? "+" : ""}
                    {formatVnd(b.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.matchHint}</td>
                  <td className="px-4 py-3">
                    <BankStatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {b.status !== "matched" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setStatus(b.id, "matched")}
                        >
                          Khớp
                        </Button>
                      ) : null}
                      {b.status !== "ignored" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(b.id, "ignored")}
                        >
                          Bỏ qua
                        </Button>
                      ) : null}
                      {b.status !== "pending" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(b.id, "pending")}
                        >
                          Chờ
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
