import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Keyboard, X, Flashlight } from "lucide-react";
import { Button, Input } from "@retail/components/ui";
import { cn } from "@retail/lib/utils";

type Props = {
  open: boolean;
  title?: string;
  hint?: string;
  onClose: () => void;
  onScan: (code: string) => void;
};

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<{ rawValue: string; format: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  }
}

/**
 * Camera barcode / QR scanner for phone & desktop.
 * Uses BarcodeDetector when available; otherwise manual entry + file capture.
 */
export function BarcodeScanner({
  open,
  title = "Quét mã vạch / QR",
  hint = "Hướng camera vào mã vạch, mã QR sản phẩm (SKU) hoặc nhập tay.",
  onClose,
  onScan,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastHit = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [torch, setTorch] = useState(false);
  const [supported, setSupported] = useState(true);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const emit = useCallback(
    (code: string) => {
      const c = code.trim();
      if (!c) return;
      if (c === lastHit.current) return;
      lastHit.current = c;
      stop();
      onScan(c);
      onClose();
    },
    [onClose, onScan, stop],
  );

  useEffect(() => {
    if (!open) {
      stop();
      lastHit.current = "";
      setError(null);
      setManual("");
      return;
    }

    if (mode !== "camera") {
      stop();
      return;
    }

    let cancelled = false;

    async function start() {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setSupported(false);
        setMode("manual");
        setError("Thiết bị không hỗ trợ camera — vui lòng nhập mã tay.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const Detector = window.BarcodeDetector;
        if (!Detector) {
          setSupported(false);
          setError(
            "Trình duyệt chưa hỗ trợ quét tự động — chụp ảnh hoặc nhập mã tay. Trên Chrome Android quét QR/barcode ổn định hơn.",
          );
          return;
        }

        const detector = new Detector({
          formats: [
            "qr_code",
            "ean_13",
            "ean_8",
            "code_128",
            "code_39",
            "upc_a",
            "upc_e",
            "itf",
          ],
        });

        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) {
                emit(codes[0].rawValue);
                return;
              }
            }
          } catch {
            /* ignore frame errors */
          }
          rafRef.current = requestAnimationFrame(() => {
            void loop();
          });
        };
        void loop();
      } catch (e) {
        setSupported(false);
        setMode("manual");
        setError(
          e instanceof Error
            ? `Không mở được camera: ${e.message}`
            : "Không mở được camera — nhập mã tay.",
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, mode, emit, stop]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error torch constraint
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch((t) => !t);
    } catch {
      setError("Đèn flash không khả dụng trên thiết bị này.");
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      setError("Trình duyệt không đọc được mã từ ảnh — nhập tay mã vạch/SKU.");
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const detector = new Detector({
        formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a"],
      });
      const codes = await detector.detect(bmp);
      bmp.close();
      if (codes[0]?.rawValue) emit(codes[0].rawValue);
      else setError("Không nhận diện được mã trong ảnh. Thử lại hoặc nhập tay.");
    } catch {
      setError("Không đọc được ảnh. Vui lòng nhập mã tay.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-fg/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[min(920px,100dvh)] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-border bg-surface shadow-2xl sm:rounded-[var(--radius-lg)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Camera className="h-5 w-5 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted">{hint}</div>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface-2"
            onClick={() => {
              stop();
              onClose();
            }}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border-soft px-3 py-2">
          <Button
            size="sm"
            variant={mode === "camera" ? "default" : "secondary"}
            onClick={() => setMode("camera")}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </Button>
          <Button
            size="sm"
            variant={mode === "manual" ? "default" : "secondary"}
            onClick={() => setMode("manual")}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Nhập tay
          </Button>
        </div>

        <div className="space-y-3 p-4">
          {mode === "camera" ? (
            <>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-black">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-36 w-[70%] rounded-lg border-2 border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void toggleTorch()}>
                  <Flashlight className={cn("h-3.5 w-3.5", torch && "text-warn")} />
                  Đèn flash
                </Button>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-xs font-semibold">
                  Chụp / chọn ảnh
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                emit(manual);
              }}
            >
              <label className="text-xs text-muted">
                Mã vạch · SKU · nội dung QR
                <Input
                  autoFocus
                  className="mt-1 font-mono"
                  placeholder="Ví dụ: 8934804022011 hoặc FMCG-1004"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </label>
              <Button type="submit" className="w-full">
                Xác nhận mã
              </Button>
            </form>
          )}

          {error ? (
            <p className="rounded-[var(--radius-md)] bg-warn-soft/50 px-3 py-2 text-xs text-warn">
              {error}
            </p>
          ) : null}
          {!supported && mode === "camera" ? (
            <p className="text-xs text-muted">
              Gợi ý: dùng Chrome trên điện thoại, cấp quyền camera, hoặc chuyển
              sang «Nhập tay».
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
