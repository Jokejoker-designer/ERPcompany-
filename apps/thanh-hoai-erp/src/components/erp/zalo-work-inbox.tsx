import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dispatchZaloWork,
  fetchZaloWorkInbox,
  type ZaloWorkItem,
} from "@/lib/runtime-documents";
import { useErpStore } from "@/store/erp-store";

export function ZaloWorkInbox() {
  const dataSource = useErpStore((s) => s.dataSource);
  const [rows, setRows] = useState<ZaloWorkItem[]>([]);
  const [openCount, setOpenCount] = useState(0);

  const reload = useCallback(async () => {
    if (dataSource !== "runtime") return;
    try {
      const data = await fetchZaloWorkInbox();
      setRows(data.rows ?? []);
      setOpenCount(data.open_count ?? 0);
    } catch {
      setRows([]);
    }
  }, [dataSource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (dataSource !== "runtime") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4" />
            Hộp thư Grok Zalo
          </CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-muted">
          Bật Runtime để thu thập việc từ Grok Zalo → TH-ADMIN điều phối.
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Inbox className="h-4 w-4" />
          Hộp thư Grok Zalo
        </CardTitle>
        <Badge variant={openCount ? "warn" : "ok"}>Mới {openCount}</Badge>
      </CardHeader>
      <CardBody className="space-y-2 text-sm">
        <p className="text-xs text-muted">
          Bot TH-ZALO gom chat Zalo thành phiếu. Dán phiếu cho TH-ADMIN — không
          soạn/duyệt/ký tại đây.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void reload()}>
          Tải hộp thư
        </Button>
        {!rows.length ? (
          <p className="text-xs text-muted">Chưa có việc từ Zalo.</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 12).map((r) => (
              <li
                key={r.id}
                className="rounded border border-border-soft px-2 py-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={r.status === "Moi" ? "warn" : "default"}>
                    {r.status}
                  </Badge>
                  {r.priority === "gap" ? <Badge variant="danger">Gấp</Badge> : null}
                  <span className="font-mono">{r.suggested_bot}</span>
                  {r.project_code ? <span>{r.project_code}</span> : null}
                  {r.ma_mau ? <span>{r.ma_mau}</span> : null}
                </div>
                <div className="mt-1 line-clamp-3 text-muted">{r.raw_text}</div>
                {r.sender_name || r.thread_name ? (
                  <div className="text-muted">
                    {r.thread_name ?? ""} {r.sender_name ? `· ${r.sender_name}` : ""}
                  </div>
                ) : null}
                {r.status === "Moi" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      onClick={() =>
                        void (async () => {
                          try {
                            await dispatchZaloWork(
                              r.id,
                              r.suggested_bot || "TH-ADMIN",
                            );
                            toast.success("Đã chuyển TH-ADMIN / bot gợi ý");
                            await reload();
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Điều phối thất bại",
                            );
                          }
                        })()
                      }
                    >
                      Đưa điều phối
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() =>
                        void (async () => {
                          await dispatchZaloWork(r.id, "TH-ADMIN", "Bo_qua");
                          await reload();
                        })()
                      }
                    >
                      Bỏ qua
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
