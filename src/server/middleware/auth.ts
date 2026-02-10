import type { Request, Response, NextFunction } from "express";
import { verifyMessage, type Address } from "viem";

export interface AuthenticatedRequest extends Request {
  callerAddress?: Address;
}

export function walletAuth(getExpectedAddress?: (req: Request) => Address | undefined) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const walletAddress = req.headers["x-wallet-address"] as string | undefined;
    const signature = req.headers["x-wallet-signature"] as string | undefined;
    const timestamp = req.headers["x-wallet-timestamp"] as string | undefined;

    if (!walletAddress || !signature || !timestamp) {
      return res.status(401).json({ error: "Missing authentication headers: X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP" });
    }

    // Replay protection: reject if timestamp older than 5 minutes
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return res.status(401).json({ error: "Authentication timestamp expired or invalid" });
    }

    // Reconstruct the message that was signed
    const orderId = req.params.orderId || req.params.disputeId || "";
    const message = `x402-auth:${orderId}:${timestamp}`;

    try {
      const valid = await verifyMessage({
        address: walletAddress as Address,
        message,
        signature: signature as `0x${string}`,
      });

      if (!valid) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      req.callerAddress = walletAddress as Address;

      // Optional: verify caller matches expected address
      if (getExpectedAddress) {
        const expected = getExpectedAddress(req);
        if (expected && req.callerAddress.toLowerCase() !== expected.toLowerCase()) {
          return res.status(403).json({ error: "Unauthorized: address mismatch" });
        }
      }

      next();
    } catch {
      return res.status(401).json({ error: "Signature verification failed" });
    }
  };
}
