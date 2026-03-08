import type { Hash } from "viem";
import { config } from "../config.js";
import { getScheme } from "../../shared/schemes.js";

/**
 * Dispatches verification to internal scheme or external facilitator URL.
 */
export async function verifyViaFacilitator(
  payload: { scheme?: string; [key: string]: any },
  paymentRequirement: { scheme?: string; [key: string]: any }
): Promise<{ valid: boolean; error?: string }> {
  if (config.facilitatorUrl) {
    try {
      const res = await fetch(`${config.facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, paymentRequirements: paymentRequirement }),
      });
      const data = await res.json() as { isValid: boolean; invalidReason?: string };
      return { valid: data.isValid, error: data.invalidReason };
    } catch (err) {
      return { valid: false, error: `Facilitator error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const schemeName = (payload as { scheme?: string }).scheme;
  if (!schemeName) return { valid: false, error: "Missing scheme in payload" };

  const scheme = getScheme(schemeName);
  if (!scheme) return { valid: false, error: `Unknown scheme: ${schemeName}` };

  return scheme.verify(payload);
}

/**
 * Dispatches settlement to internal scheme or external facilitator URL.
 */
export async function settleViaFacilitator(
  payload: { scheme?: string; [key: string]: any },
  paymentRequirement: { scheme?: string; [key: string]: any },
  contentHash?: Hash
): Promise<{ success: boolean; txHash?: string; escrowId?: unknown; network?: string; [key: string]: unknown }> {
  if (config.facilitatorUrl) {
    const res = await fetch(`${config.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, paymentRequirements: paymentRequirement, contentHash }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Settlement failed" })) as { error?: string };
      throw new Error(err.error || `Facilitator returned ${res.status}`);
    }
    return res.json() as Promise<{ success: boolean; txHash?: string; escrowId?: unknown; network?: string }>;
  }

  const schemeName = (payload as { scheme?: string }).scheme;
  if (!schemeName) throw new Error("Missing scheme in payload");

  const scheme = getScheme(schemeName);
  if (!scheme) throw new Error(`Unknown scheme: ${schemeName}`);

  return scheme.settle(payload, contentHash);
}
