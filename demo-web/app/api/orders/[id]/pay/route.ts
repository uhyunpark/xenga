import { NextResponse } from "next/server";
import type { EscrowPaymentPayload, EscrowPaymentRequired } from "@shared/types.js";
import { USDC_DECIMALS } from "@shared/constants.js";
import { config } from "@server/config.js";
import { getOrderById, updateOrderStatus } from "@server/services/orderService.js";
import { getDb } from "@server/db/index.js";
import { getServiceType } from "@server/service-types/index.js";
import { verifyViaFacilitator } from "@server/facilitator/dispatch.js";
import { getChainAdapter } from "@/lib/chain";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  const order = getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Idempotency: if already escrowed, return existing details
  if (
    order.status === "escrowed" ||
    order.status === "delivery_confirmed" ||
    order.status === "completed"
  ) {
    const paymentResponse = {
      success: true,
      txHash: order.txHash!,
      escrowId: order.escrowId!,
    };
    const encoded = Buffer.from(JSON.stringify(paymentResponse)).toString("base64");
    return NextResponse.json(
      {
        message: "Payment successful — funds are now in escrow",
        order: {
          ...order,
          price: order.price.toString(),
          priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
        },
        payment: paymentResponse,
      },
      {
        status: 200,
        headers: {
          "PAYMENT-RESPONSE": encoded,
          "X-PAYMENT-RESPONSE": encoded,
        },
      }
    );
  }

  // If in a non-payable state
  if (order.status !== "created" && order.status !== "pending_payment") {
    return NextResponse.json(
      { error: `Order is not in a payable state (current: ${order.status})` },
      { status: 400 }
    );
  }

  // Read payment header: prefer standard, fallback to legacy
  const paymentHeader =
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment");

  if (!paymentHeader) {
    // Return 402 Payment Required
    const serviceType = getServiceType(order.serviceType);
    if (!serviceType) {
      return NextResponse.json(
        { error: `Unknown service type: ${order.serviceType}` },
        { status: 400 }
      );
    }

    const paymentRequired: EscrowPaymentRequired = {
      scheme: "escrow",
      network: "base-sepolia",
      escrowContract: config.escrowVaultAddress,
      asset: config.usdcAddress,
      amount: order.price.toString(),
      orderId: order.orderId,
      sellerAddress: order.sellerAddress,
      releaseWindow: serviceType.releaseWindow,
      serviceType: order.serviceType,
    };

    // x402 standard: array format
    const paymentRequirements = [paymentRequired];
    const encodedArray = Buffer.from(JSON.stringify(paymentRequirements)).toString("base64");
    const encodedSingle = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");

    return NextResponse.json(
      { error: "Payment required", paymentRequired, paymentRequirements },
      {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodedArray,
          "X-PAYMENT-REQUIRED": encodedSingle,
        },
      }
    );
  }

  // Parse and verify payment
  let payload: EscrowPaymentPayload;
  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    payload = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid payment header" }, { status: 400 });
  }

  if (payload.scheme !== "escrow") {
    return NextResponse.json(
      { error: `Unsupported scheme: ${payload.scheme}` },
      { status: 400 }
    );
  }

  // Verify signature via facilitator
  const paymentRequired: EscrowPaymentRequired = {
    scheme: "escrow",
    network: "base-sepolia",
    escrowContract: config.escrowVaultAddress,
    asset: config.usdcAddress,
    amount: payload.value,
    orderId: payload.orderId,
    sellerAddress: payload.sellerAddress,
    releaseWindow: payload.releaseWindow,
    serviceType: payload.serviceType,
  };

  const verification = await verifyViaFacilitator(payload, paymentRequired);
  if (!verification.valid) {
    return NextResponse.json(
      { error: "Payment verification failed", details: verification.error },
      { status: 400 }
    );
  }

  // Atomically claim this payment to prevent races
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE orders SET status = 'pending_payment', updated_at = ? WHERE id = ? AND status = 'created'"
    )
    .run(Math.floor(Date.now() / 1000), order.id);

  if (result.changes === 0 && order.status !== "pending_payment") {
    return NextResponse.json(
      { error: "Payment already in progress or completed" },
      { status: 409 }
    );
  }

  // Submit on-chain
  try {
    const { txHash, escrowId } = await getChainAdapter().settleEscrow(payload);

    // Update order status
    updateOrderStatus(order.id, {
      status: "escrowed",
      buyerAddress: payload.from,
      escrowId,
      txHash,
    });

    const paymentResponse = {
      success: true,
      txHash,
      escrowId,
    };

    const updatedOrder = getOrderById(order.id);
    const encoded = Buffer.from(JSON.stringify(paymentResponse)).toString("base64");

    return NextResponse.json(
      {
        message: "Payment successful — funds are now in escrow",
        order: updatedOrder
          ? {
              ...updatedOrder,
              price: updatedOrder.price.toString(),
              priceUsdc: Number(updatedOrder.price) / 10 ** USDC_DECIMALS,
            }
          : undefined,
        payment: paymentResponse,
      },
      {
        status: 200,
        headers: {
          "PAYMENT-RESPONSE": encoded,
          "X-PAYMENT-RESPONSE": encoded,
        },
      }
    );
  } catch (err) {
    console.error("[EscrowPayment] Settlement failed:", err);
    // Revert status on failure
    db.prepare("UPDATE orders SET status = 'created', updated_at = ? WHERE id = ?").run(
      Math.floor(Date.now() / 1000),
      order.id
    );
    return NextResponse.json(
      { error: "Payment settlement failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
