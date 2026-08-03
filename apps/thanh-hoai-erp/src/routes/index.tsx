import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomeChooser,
});

function HomeChooser() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#f4f6f7] p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#172026]">Chọn hệ thống</h1>
        <p className="mt-1 text-sm text-[#66727d]">
          Hai sản phẩm độc lập trên cùng nền tảng demo
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <Link
          to="/login"
          className="flex flex-col gap-2 rounded-xl border border-[#d8dee4] bg-white p-6 shadow-sm transition hover:border-[#0b7285]"
        >
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#0f2a22] text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="text-lg font-bold">Thanh Hoài ERP</div>
          <p className="text-sm text-[#66727d]">
            Công trình · báo giá BOQ · chứng từ · công nợ
          </p>
          <span className="mt-2 text-sm font-semibold text-[#0b7285]">
            Mở /login → /app →
          </span>
        </Link>
        <Link
          to="/pos"
          className="flex flex-col gap-2 rounded-xl border border-[#d8dee4] bg-white p-6 shadow-sm transition hover:border-[#0b7285]"
        >
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#0b7285] text-white">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div className="text-lg font-bold">AnKhang POS</div>
          <p className="text-sm text-[#66727d]">
            Bán hàng · quét barcode/QR · nhập kho · chốt ca
          </p>
          <span className="mt-2 text-sm font-semibold text-[#0b7285]">
            Mở /pos →
          </span>
        </Link>
      </div>
    </div>
  );
}
