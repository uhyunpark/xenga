import {
  verifyTypedData,
  type Address,
  type Hash,
} from "viem";
import {
  getUsdcEip712Domain,
  receiveWithAuthorizationTypes,
} from "../../shared/eip712.js";
import type { EscrowPaymentPayload } from "../../shared/types.js";
import { config } from "../config.js";

/**
 * Off-chain verification of the ERC-3009 receiveWithAuthorization signature
 * Recovers the signer and validates it matches the `from` field
 */
export async function verifyEscrowPayment(
  payload: EscrowPaymentPayload
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Reconstruct the EIP-712 message
    const message = {
      from: payload.from,
      to: payload.to,
      value: BigInt(payload.value),
      validAfter: BigInt(payload.validAfter),
      validBefore: BigInt(payload.validBefore),
      nonce: payload.nonce,
    };

    // Verify the to address is the escrow contract
    if (
      payload.to.toLowerCase() !== config.escrowVaultAddress.toLowerCase()
    ) {
      return { valid: false, error: "Invalid escrow contract address" };
    }

    // Verify the signature recovers to the `from` address
    const valid = await verifyTypedData({
      address: payload.from,
      domain: getUsdcEip712Domain(config.usdcAddress),
      types: receiveWithAuthorizationTypes,
      primaryType: "ReceiveWithAuthorization",
      message,
      signature: {
        v: BigInt(payload.signature.v),
        r: payload.signature.r,
        s: payload.signature.s,
      },
    });

    if (!valid) {
      return { valid: false, error: "Invalid signature" };
    }

    // Verify timing
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now <= BigInt(payload.validAfter)) {
      return { valid: false, error: "Authorization not yet valid" };
    }
    if (now >= BigInt(payload.validBefore)) {
      return { valid: false, error: "Authorization expired" };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
