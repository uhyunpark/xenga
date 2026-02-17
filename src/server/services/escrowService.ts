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

  // Foundry returns a tuple, viem returns an object
  const r = result as any;
  return {
    orderId: r.orderId ?? r[0],
    buyer: r.buyer ?? r[1],
    seller: r.seller ?? r[2],
    amount: BigInt(r.amount ?? r[3]),
    serviceType: r.serviceType ?? r[4],
    state: Number(r.state ?? r[5]) as EscrowState,
    createdAt: BigInt(r.createdAt ?? r[6]),
    releaseWindow: BigInt(r.releaseWindow ?? r[7]),
    deliveryConfirmedAt: BigInt(r.deliveryConfirmedAt ?? r[8]),
    disputeWindow: BigInt(r.disputeWindow ?? r[9]),
    facilitatorFee: BigInt(r.facilitatorFee ?? r[10]),
  };
}

export async function isReleasable(escrowId: number): Promise<boolean> {
  return getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "isReleasable",
    args: [BigInt(escrowId)],
  }) as Promise<boolean>;
}
