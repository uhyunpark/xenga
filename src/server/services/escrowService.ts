import { createPublicClient, http, type Address, type Hash } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import { CHAIN } from "../../shared/constants.js";
import type { EscrowState, OnChainEscrow } from "../../shared/types.js";
import { config } from "../config.js";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  return _publicClient;
};

export async function getEscrow(escrowId: number): Promise<OnChainEscrow> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getEscrow",
    args: [BigInt(escrowId)],
  });

  // Viem may return a named struct or a positional tuple depending on ABI encoding.
  // Use a record type to safely index both named and positional fields.
  const r = result as Record<string | number, unknown>;
  return {
    orderId: (r["orderId"] ?? r[0] ?? "0x") as Hash,
    buyer: (r["buyer"] ?? r[1] ?? "0x") as Address,
    seller: (r["seller"] ?? r[2] ?? "0x") as Address,
    amount: BigInt((r["amount"] ?? r[3] ?? 0) as string | number | bigint),
    serviceType: (r["serviceType"] ?? r[4] ?? "") as string,
    state: Number((r["state"] ?? r[5] ?? 0) as string | number) as EscrowState,
    createdAt: BigInt((r["createdAt"] ?? r[6] ?? 0) as string | number | bigint),
    releaseWindow: BigInt((r["releaseWindow"] ?? r[7] ?? 0) as string | number | bigint),
    deliveryConfirmedAt: BigInt((r["deliveryConfirmedAt"] ?? r[8] ?? 0) as string | number | bigint),
    disputeWindow: BigInt((r["disputeWindow"] ?? r[9] ?? 0) as string | number | bigint),
    facilitatorFee: BigInt((r["facilitatorFee"] ?? r[10] ?? 0) as string | number | bigint),
  };
}

export async function getDisputeWindow(): Promise<number> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "disputeWindow",
  });
  return Number(result);
}

export async function isReleasable(escrowId: number): Promise<boolean> {
  return getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "isReleasable",
    args: [BigInt(escrowId)],
  }) as Promise<boolean>;
}

export async function batchIsReleasable(escrowIds: number[]): Promise<boolean[]> {
  return getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "batchIsReleasable",
    args: [escrowIds.map((id) => BigInt(id))],
  }) as Promise<boolean[]>;
}
