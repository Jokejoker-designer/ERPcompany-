import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " đ";
}

export function formatVndShort(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " tỷ";
  }
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(0) + " tr";
  }
  return formatVnd(n);
}
