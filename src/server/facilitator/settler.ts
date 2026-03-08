import {
  decodeEventLog,
  parseEther,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import { USDC_DECIMALS } from "../../shared/constants.js";
import type { EscrowPaymentPayload } from "../../shared/types.js";
import { config } from "../config.js";
import { logger } from "../services/logger.js";
import { txQueue, getPublicClient } from "./txQueue.js";

const ZERO_HASH: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Submit createEscrowWithAuth transaction on-chain
 * The operator (server) pays gas; the buyer's USDC is transferred via ERC-3009
 */
export async function settleEscrow(
  payload: EscrowPaymentPayload,
  contentHash?: Hash
): Promise<{ txHash: Hash; escrowId: number }> {
  const { v, r, s } = payload.signature;

  const txHash = await txQueue.writeContract("createEscrowWithAuth", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "createEscrowWithAuth",
    args: [
      payload.orderId as `0x${string}`,
      payload.sellerAddress,
      BigInt(payload.value),
      payload.serviceType,
      BigInt(payload.releaseWindow),
      contentHash ?? ZERO_HASH,
      payload.from,
      BigInt(payload.validAfter),
      BigInt(payload.validBefore),
      payload.nonce,
      v,
      r as `0x${string}`,
      s as `0x${string}`,
    ],
  });

  // Wait for transaction receipt
  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash: txHash,
  });

  // Parse the EscrowCreated event to get the escrowId
  let escrowId = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.escrowVaultAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: escrowVaultAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "EscrowCreated") {
        const args = decoded.args as { escrowId?: bigint };
        escrowId = Number(args.escrowId ?? 0n);
        break;
      }
    } catch {
      // Not an EscrowCreated event, skip
    }
  }

  return { txHash, escrowId };
}

export async function resolveDisputeOnChain(escrowId: number, buyerPct: number): Promise<Hash> {
  const txHash = await txQueue.writeContract("resolveDispute", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "resolveDispute",
    args: [BigInt(escrowId), BigInt(buyerPct)],
  });

  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function refundOnChain(escrowId: number): Promise<Hash> {
  const txHash = await txQueue.writeContract("refund", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "refund",
    args: [BigInt(escrowId)],
  });

  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function getEscrowOnChain(escrowId: number) {
  return getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getEscrow",
    args: [BigInt(escrowId)],
  });
}

export async function confirmDeliveryOnChain(escrowId: number): Promise<Hash | null> {
  // Check on-chain state first — avoid reverts from duplicate calls
  const escrow = await getEscrowOnChain(escrowId);
  const state = Number((escrow as any).state);
  if (state !== 1) { // 1 = Active — the only valid state for confirmDelivery
    logger.info("settler", `Skipping confirmDelivery for escrow ${escrowId}: on-chain state is ${state}, not Active`);
    return null;
  }

  const txHash = await txQueue.writeContract("confirmDelivery", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "confirmDelivery",
    args: [BigInt(escrowId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function autoReleaseOnChain(escrowId: number): Promise<Hash> {
  const txHash = await txQueue.writeContract("autoRelease", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "autoRelease",
    args: [BigInt(escrowId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function batchAutoReleaseOnChain(escrowIds: number[]): Promise<{ txHash: Hash; released: number }> {
  const txHash = await txQueue.writeContract("batchAutoRelease", {
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "batchAutoRelease",
    args: [escrowIds.map((id) => BigInt(id))],
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  // Count only EscrowAutoReleased events (not USDC Transfer events)
  let released = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.escrowVaultAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: escrowVaultAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "EscrowAutoReleased") released++;
    } catch {
      // Not a vault event, skip
    }
  }
  return { txHash, released };
}

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export async function fundWallet(
  address: Address
): Promise<{ usdcTx: Hash; ethTx: Hash }> {
  const fundAmount = parseUnits("1", USDC_DECIMALS);

  // Submit both transactions through the queue — nonces are serialized,
  // so no collision. Each submission is ~200ms, then receipts wait in parallel.
  const usdcTx = await txQueue.writeContract("transfer USDC", {
    address: config.usdcAddress,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [address, fundAmount],
  });

  const ethTx = await txQueue.sendTransaction("send ETH", {
    to: address,
    value: parseEther("0.001"),
  });

  // Wait for both receipts in parallel (~10s instead of ~20s)
  await Promise.all([
    getPublicClient().waitForTransactionReceipt({ hash: usdcTx }),
    getPublicClient().waitForTransactionReceipt({ hash: ethTx }),
  ]);

  return { usdcTx, ethTx };
}
