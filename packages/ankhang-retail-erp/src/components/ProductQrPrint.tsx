import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, X } from "lucide-react";
import { Button } from "@retail/components/ui";
import { formatVnd, type Product } from "@retail/data/retail";
import {
  buildProductQrPayload,
  buildProductQrText,
} from "@retail/lib/product-code";

type Props = {
  product: Product | null;
  open: boolean;
  onClose: () => void;
};

export function ProductQrPrint({ product, open, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [compactUrl, setCompactUrl] = useState<string>("");

  useEffect(() => {
    if (!open || !product) {
      setDataUrl("");
      setCompactUrl("");
      return;
    }
    const full = buildProductQrPayload(product);
    const compact = buildProductQrText(product);
    void QRCode.toDataURL(full, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f2a22", light: "#ffffff" },
    }).then(setDataUrl);
    void QRCode.toDataURL(compact, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setCompactUrl);
  }, [open, product]);

  if (!open || !product) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-fg/50 p-4 print:static print:bg-white print:p-0">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl print:max-w-none print:border-0 print:shadow-none">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 print:hidden">
          <div className="text-sm font-semibold">In mã QR sản phẩm</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              In nhãn
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          id="product-qr-label"
          className="space-y-3 p-5 text-center print:p-6"
        >
          <div className="text-xs font-bold uppercase tracking-wide text-brand">
            AnKhang POS · Nhãn hàng
          </div>
          <div className="text-lg font-bold leading-snug">{product.name}</div>
          <div className="flex justify-center gap-4">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt={`QR ${product.sku}`}
                className="h-44 w-44 rounded border border-border bg-white p-1"
              />
            ) : (
              <div className="grid h-44 w-44 place-items-center text-xs text-muted">
                Đang tạo QR…
              </div>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-muted">SKU: </span>
              <span className="font-mono font-semibold">{product.sku}</span>
            </div>
            <div>
              <span className="text-muted">Mã vạch: </span>
              <span className="font-mono font-semibold">{product.barcode}</span>
            </div>
            <div className="text-base font-bold text-brand-ink">
              {formatVnd(product.price)}
              <span className="text-xs font-normal text-muted">
                {" "}
                / {product.baseUom}
              </span>
            </div>
            <div className="text-xs text-muted">
              Tồn: {product.stock} {product.baseUom} · Nhóm {product.abc}
            </div>
          </div>
          {compactUrl ? (
            <div className="flex items-center justify-center gap-2 border-t border-border-soft pt-3 text-[10px] text-muted">
              <img src={compactUrl} alt="" className="h-12 w-12" />
              <span className="font-mono text-left">
                {buildProductQrText(product)}
                <br />
                Quét để bán / nhập / kiểm tồn
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
