import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "@server/config.js";
import { getOrderById } from "@server/services/orderService.js";
import { escrowVaultAbi } from "@shared/abi.js";
import { CHAIN } from "@shared/constants.js";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const order = getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "escrowed" || order.escrowId === undefined) {
    return NextResponse.json(
      { error: "Order is not in escrowed state or missing escrowId" },
      { status: 400 }
    );
  }

  const account = privateKeyToAccount(config.privateKey);

  // Verify the operator is the seller (demo only)
  if (order.sellerAddress.toLowerCase() !== account.address.toLowerCase()) {
    return NextResponse.json(
      { error: "Only the seller can confirm delivery (demo: operator must be seller)" },
      { status: 403 }
    );
  }

  try {
    const walletClient = createWalletClient({
      chain: CHAIN,
      transport: http(config.rpcUrl),
      account,
    });

    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(config.rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: config.escrowVaultAddress,
      abi: escrowVaultAbi,
      functionName: "confirmDelivery",
      args: [BigInt(order.escrowId)],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      message: "Delivery confirmed on-chain",
      txHash,
    });
  } catch (err) {
    console.error("[ConfirmDelivery] Failed:", err);
    return NextResponse.json(
      { error: "Failed to confirm delivery on-chain", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
