import type { Address } from "viem";
import { USDC_ADDRESS, CHAIN_ID, getChainConfig } from "./constants.js";

/**
 * EIP-712 domain for USDC.
 * Accepts optional chainId and usdcAddress overrides for multi-chain support.
 * The domain name varies by chain (Base Sepolia = "USDC", Base mainnet = "USD Coin").
 */
export function getUsdcEip712Domain(usdcAddress?: Address, chainId?: number) {
  const resolvedChainId = chainId ?? CHAIN_ID;
  return {
    name: getChainConfig(resolvedChainId).usdcDomainName,
    version: "2",
    chainId: BigInt(resolvedChainId),
    verifyingContract: usdcAddress ?? (USDC_ADDRESS as Address),
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

/**
 * Build all parameters needed for signTypedData for a ReceiveWithAuthorization.
 * Shared between the client SDK and demo-web to avoid duplicating domain/types/message logic.
 */
export function buildReceiveAuthSigningParams(params: {
  from: Address;
  to: Address;
  amount: bigint;
  nonce: `0x${string}`;
  validAfter?: bigint;
  validBefore?: bigint;
  usdcAddress?: Address;
  chainId?: number;
}) {
  const validAfter = params.validAfter ?? 0n;
  const validBefore =
    params.validBefore ?? BigInt(Math.floor(Date.now() / 1000) + 86400);

  return {
    domain: getUsdcEip712Domain(params.usdcAddress, params.chainId),
    types: receiveWithAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization" as const,
    message: {
      from: params.from,
      to: params.to,
      value: params.amount,
      validAfter,
      validBefore,
      nonce: params.nonce,
    },
    validAfter,
    validBefore,
  };
}
