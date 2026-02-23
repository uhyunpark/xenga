import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatUsdc(amount: bigint | string | number): string {
  const value =
    typeof amount === "bigint"
      ? Number(amount) / 1e6
      : typeof amount === "string"
        ? Number(amount) / 1e6
        : amount;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function encodeBase64(data: string): string {
  return btoa(data);
}

export function decodeBase64(data: string): string {
  return atob(data);
}
