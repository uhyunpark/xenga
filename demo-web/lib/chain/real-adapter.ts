import type { Address, Hash } from "viem";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainAdapter } from "./types";
import type { EscrowPaymentPayload, OnChainEscrow } from "@shared/types.js";
import { CHAIN, USDC_DECIMALS } from "@shared/constants.js";
import { config } from "@server/config.js";
import {
  settleEscrow as realSettleEscrow,
  resolveDisputeOnChain,
} from "@server/facilitator/settler.js";
import {
  getEscrow as realGetEscrow,
  isReleasable as realIsReleasable,
} from "@server/services/escrowService.js";
import { startEventListener as realStartEventListener } from "@server/services/eventListener.js";
import { escrowVaultAbi } from "@shared/abi.js";

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

// Lazy singleton viem clients (IIFE preserves narrowed types for chain+account)
let _account: ReturnType<typeof privateKeyToAccount> | undefined;
const getAccount = () => {
  if (!_account) _account = privateKeyToAccount(config.privateKey);
  return _account;
};

const getWalletClient = (() => {
  let client: ReturnType<typeof create> | undefined;
  function create() {
    return createWalletClient({
      chain: CHAIN,
      transport: http(config.rpcUrl),
      account: getAccount(),
    });
  }
  return () => {
    if (!client) client = create();
    return client;
  };
})();

const getPublicClient = (() => {
  let client: ReturnType<typeof create> | undefined;
  function create() {
    return createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  }
  return () => {
    if (!client) client = create();
    return client;
  };
})();

export class RealChainAdapter implements ChainAdapter {
  readonly isMock = false;

  async settleEscrow(
    payload: EscrowPaymentPayload
  ): Promise<{ txHash: Hash; escrowId: number }> {
    return realSettleEscrow(payload);
  }

  async confirmDelivery(escrowId: number): Promise<Hash> {
    const txHash = await getWalletClient().writeContract({
      address: config.escrowVaultAddress,
      abi: escrowVaultAbi,
      functionName: "confirmDelivery",
      args: [BigInt(escrowId)],
    });
    await getPublicClient().waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async fileDispute(_escrowId: number): Promise<Hash> {
    throw new Error("Buyer must call dispute() directly from their wallet");
  }

  async resolveDispute(escrowId: number, buyerPct: number): Promise<Hash> {
    return resolveDisputeOnChain(escrowId, buyerPct);
  }

  async getEscrow(escrowId: number): Promise<OnChainEscrow> {
    return realGetEscrow(escrowId);
  }

  async isReleasable(escrowId: number): Promise<boolean> {
    return realIsReleasable(escrowId);
  }

  async fundWallet(
    address: Address
  ): Promise<{ usdcTx: Hash; ethTx: Hash }> {
    const fundAmount = parseUnits("10", USDC_DECIMALS);

    const usdcTx = await getWalletClient().writeContract({
      address: config.usdcAddress,
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [address, fundAmount],
    });

    const ethTx = await getWalletClient().sendTransaction({
      to: address,
      value: parseEther("0.005"),
    });

    await Promise.all([
      getPublicClient().waitForTransactionReceipt({ hash: usdcTx }),
      getPublicClient().waitForTransactionReceipt({ hash: ethTx }),
    ]);

    return { usdcTx, ethTx };
  }

  startEventListener(): void {
    realStartEventListener();
  }
}
