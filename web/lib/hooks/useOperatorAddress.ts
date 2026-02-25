import { useState, useEffect, useCallback } from "react";
import { facilitatorFetch } from "@/lib/api/client";

let cached: string | null = null;

interface UseOperatorAddressResult {
  address: string | null;
  error: boolean;
  isLoading: boolean;
  retry: () => void;
}

export function useOperatorAddress(): UseOperatorAddressResult {
  const [address, setAddress] = useState<string | null>(cached);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(!cached);

  const fetchAddress = useCallback(() => {
    if (cached) {
      setAddress(cached);
      setIsLoading(false);
      setError(false);
      return;
    }

    setIsLoading(true);
    setError(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    facilitatorFetch("/api/health", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        cached = data.operator?.address ?? data.operatorAddress ?? null;
        setAddress(cached);
        setIsLoading(false);
        if (!cached) setError(true);
      })
      .catch(() => {
        setError(true);
        setIsLoading(false);
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  const retry = useCallback(() => {
    cached = null;
    fetchAddress();
  }, [fetchAddress]);

  return { address, error, isLoading, retry };
}
