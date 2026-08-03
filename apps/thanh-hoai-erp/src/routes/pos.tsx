import { createFileRoute } from "@tanstack/react-router";
import RetailApp from "@retail/App";
import "@retail/styles.css";

/**
 * AnKhang POS / Retail ERP — separate product surface from construction ERP (/app).
 * Live link: /pos
 */
export const Route = createFileRoute("/pos")({
  ssr: false,
  component: PosRetailRoute,
  head: () => ({
    meta: [
      { title: "AnKhang POS — Bán hàng · Kho · ERP thu nhỏ" },
      {
        name: "description",
        content:
          "POS bán hàng, quét barcode/QR, in nhãn QR, nhập kho, kiểm tồn cho tạp hóa / siêu thị.",
      },
    ],
  }),
});

function PosRetailRoute() {
  return (
    <div className="min-h-dvh">
      <RetailApp />
    </div>
  );
}
