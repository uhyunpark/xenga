import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  parseEther,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowVaultAbi } from "../../shared/abi.js";
import { CHAIN, USDC_DECIMALS } from "../../shared/constants.js";
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

export async function confirmDeliveryOnChain(escrowId: number): Promise<Hash> {
  const txHash = await getWalletClient().writeContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "confirmDelivery",
    args: [BigInt(escrowId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function autoReleaseOnChain(escrowId: number): Promise<Hash> {
  const txHash = await getWalletClient().writeContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "autoRelease",
    args: [BigInt(escrowId)],
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return txHash;
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

  const usdcTx = await getWalletClient().writeContract({
    address: config.usdcAddress,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [address, fundAmount],
  });

  const ethTx = await getWalletClient().sendTransaction({
    to: address,
    value: parseEther("0.001"),
  });

  await Promise.all([
    getPublicClient().waitForTransactionReceipt({ hash: usdcTx }),
    getPublicClient().waitForTransactionReceipt({ hash: ethTx }),
  ]);

  return { usdcTx, ethTx };
}
