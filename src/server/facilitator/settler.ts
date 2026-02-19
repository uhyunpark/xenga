import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowVaultAbi } from "../../shared/abi.js";
import { CHAIN } from "../../shared/constants.js";
import type { EscrowPaymentPayload } from "../../shared/types.js";
import { config } from "../config.js";

let _account: ReturnType<typeof privateKeyToAccount> | undefined;
const getAccount = () => {
  if (!_account) _account = privateKeyToAccount(config.privateKey);
  return _account;
};

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  return _publicClient;
};

const getWalletClient = (() => {
  let client: ReturnType<typeof create> | undefined;
  function create() {
    return createWalletClient({ chain: CHAIN, transport: http(config.rpcUrl), account: getAccount() });
  }
  return () => {
    if (!client) client = create();
    return client;
  };
})();

/**
 * Submit createEscrowWithAuth transaction on-chain
 * The operator (server) pays gas; the buyer's USDC is transferred via ERC-3009
 */
export async function settleEscrow(
  payload: EscrowPaymentPayload
): Promise<{ txHash: Hash; escrowId: number }> {
  const { v, r, s } = payload.signature;

  const txHash = await getWalletClient().writeContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "createEscrowWithAuth",
    args: [
      payload.orderId as `0x${string}`,
      payload.sellerAddress,
      BigInt(payload.value),
      payload.serviceType,
      BigInt(payload.releaseWindow),
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
  const txHash = await getWalletClient().writeContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "resolveDispute",
    args: [BigInt(escrowId), BigInt(buyerPct)],
  });

  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function refundOnChain(escrowId: number): Promise<Hash> {
  const txHash = await getWalletClient().writeContract({
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
