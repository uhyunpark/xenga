"use client";

import { useState, useCallback, useEffect } from "react";
import { SiweMessage } from "siwe";
import type { WalletClient, Address } from "viem";
import { facilitatorFetch } from "@/lib/api/client";

const SESSION_KEY_PREFIX = "xenga-session-";

function getSessionKey(address: Address): string {
  return `${SESSION_KEY_PREFIX}${address.toLowerCase()}`;
}

/**
 * Parse JWT payload without verification (just to check expiry client-side).
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now() + 60_000; // 60s buffer to avoid edge-case 401s
  } catch {
    return true;
  }
}

export function useSession(
  walletClient: WalletClient | null,
  address: Address | null
) {
  const [token, setToken] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing token from sessionStorage on mount / address change
  useEffect(() => {
    if (!address) {
      setToken(null);
      return;
    }
    const stored = sessionStorage.getItem(getSessionKey(address));
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
    } else {
      if (stored) sessionStorage.removeItem(getSessionKey(address));
      setToken(null);
    }
  }, [address]);

  const signIn = useCallback(async () => {
    if (!walletClient || !address) return;
    setSigning(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const nonceRes = await facilitatorFetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce } = await nonceRes.json();

      // 2. Build SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const now = new Date();
      const expiry = new Date(now.getTime() + 5 * 60 * 1000); // 5 min to match nonce TTL
      const siweMessage = new SiweMessage({
        domain,
        address,
        statement: "Sign in to the Xenga Seller Dashboard.",
        uri: origin,
        version: "1",
        chainId: 84532,
        nonce,
        issuedAt: now.toISOString(),
        expirationTime: expiry.toISOString(),
      });
      const messageStr = siweMessage.prepareMessage();

      // 3. Sign with wallet
      const signature = await walletClient.signMessage({
        account: address,
        message: messageStr,
      });

      // 4. Verify on server and get JWT
      const verifyRes = await facilitatorFetch("/api/auth/siwe", {
        method: "POST",
        body: JSON.stringify({ message: messageStr, signature }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error || "SIWE verification failed");
      }

      const { token: jwt } = await verifyRes.json();
      sessionStorage.setItem(getSessionKey(address), jwt);
      setToken(jwt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setToken(null);
    } finally {
      setSigning(false);
    }
  }, [walletClient, address]);

  const signOut = useCallback(() => {
    if (address) {
      sessionStorage.removeItem(getSessionKey(address));
    }
    setToken(null);
  }, [address]);

  return { token, signing, error, signIn, signOut };
}
