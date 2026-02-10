import type { Address } from "viem";
import { USDC_ADDRESS, CHAIN_ID } from "./constants.js";

/**
 * EIP-712 domain for USDC on Base Sepolia
 * Used for signing receiveWithAuthorization
 */
export function getUsdcEip712Domain(usdcAddress: Address = USDC_ADDRESS) {
  return {
    name: "USD Coin",
    version: "2",
    chainId: BigInt(CHAIN_ID),
    verifyingContract: usdcAddress,
  } as const;
}

/**
 * EIP-712 type definition for ReceiveWithAuthorization (ERC-3009)
 */
export const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Build the EIP-712 message for receiveWithAuthorization
 */
export function buildReceiveAuthMessage(params: {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}) {
  return {
    from: params.from,
    to: params.to,
    value: params.value,
    validAfter: params.validAfter,
    validBefore: params.validBefore,
    nonce: params.nonce,
  };
}
