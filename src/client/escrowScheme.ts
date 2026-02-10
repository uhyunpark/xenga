import {
  type WalletClient,
  type Address,
  type Hash,
  keccak256,
  toHex,
} from "viem";
import {
  getUsdcEip712Domain,
  receiveWithAuthorizationTypes,
} from "../shared/eip712.js";
import type { EscrowPaymentPayload, EscrowPaymentRequired } from "../shared/types.js";

/**
 * Sign an ERC-3009 receiveWithAuthorization for the escrow payment
 *
 * @param walletClient - viem WalletClient with the buyer's account
 * @param paymentRequired - Payment details from the 402 response
 * @param usdcAddress - USDC contract address (for EIP-712 domain)
 * @returns Signed EscrowPaymentPayload ready for X-PAYMENT header
 */
export async function signEscrowPayment(
  walletClient: WalletClient,
  paymentRequired: EscrowPaymentRequired,
  usdcAddress?: Address
): Promise<EscrowPaymentPayload> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient must have an account");

  const nonce = keccak256(
    toHex(`${account.address}-${paymentRequired.orderId}-${crypto.randomUUID()}`)
  ) as Hash;

  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24 hour validity

  const domain = getUsdcEip712Domain(
    usdcAddress ?? (paymentRequired.asset as Address)
  );

  const message = {
    from: account.address,
    to: paymentRequired.escrowContract,
    value: BigInt(paymentRequired.amount),
    validAfter,
    validBefore,
    nonce,
  };

  // Sign EIP-712 typed data
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: receiveWithAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization",
    message,
  });

  // Parse signature into v, r, s
  const r = `0x${signature.slice(2, 66)}` as Hash;
  const s = `0x${signature.slice(66, 130)}` as Hash;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    scheme: "escrow",
    network: paymentRequired.network,
    from: account.address,
    to: paymentRequired.escrowContract,
    value: paymentRequired.amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature: { v, r, s },
    orderId: paymentRequired.orderId,
    sellerAddress: paymentRequired.sellerAddress,
    releaseWindow: paymentRequired.releaseWindow,
    serviceType: paymentRequired.serviceType,
  };
}
