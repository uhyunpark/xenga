import { useState, useEffect } from "react";

let cached: string | null = null;

export function useOperatorAddress(): string | null {
  const [address, setAddress] = useState<string | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        cached = data.operatorAddress ?? null;
        setAddress(cached);
      })
      .catch(() => {});
  }, []);

  return address;
}
