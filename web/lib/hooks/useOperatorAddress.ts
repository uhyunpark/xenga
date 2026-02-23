import { useState, useEffect } from "react";
import { facilitatorFetch } from "@/lib/api/client";

let cached: string | null = null;

export function useOperatorAddress(): string | null {
  const [address, setAddress] = useState<string | null>(cached);

  useEffect(() => {
    if (cached) return;
    facilitatorFetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        cached = data.operatorAddress ?? null;
        setAddress(cached);
      })
      .catch(() => {});
  }, []);

  return address;
}
