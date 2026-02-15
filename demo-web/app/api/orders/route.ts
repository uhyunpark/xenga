import { NextResponse } from "next/server";
import type { Address } from "viem";
import type { OrderStatus, CreateOrderRequest } from "@shared/types.js";
import { USDC_DECIMALS } from "@shared/constants.js";
import { createOrder, listOrders } from "@server/services/orderService.js";

const VALID_STATUSES: OrderStatus[] = [
  "created",
  "pending_payment",
  "escrowed",
  "delivery_confirmed",
  "completed",
  "disputed",
  "resolved",
  "refunded",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const seller = searchParams.get("seller");

  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  const filters: { status?: OrderStatus; sellerAddress?: Address; limit?: number; offset?: number } = {};

  if (status) {
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    filters.status = status as OrderStatus;
  }
  if (seller) {
    filters.sellerAddress = seller as Address;
  }
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  const result = listOrders(filters);
  return NextResponse.json({
    orders: result.orders.map((o) => ({
      ...o,
      price: o.price.toString(),
      priceUsdc: Number(o.price) / 10 ** USDC_DECIMALS,
    })),
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateOrderRequest;

  if (!body.title || !body.price || !body.serviceType || !body.sellerAddress) {
    return NextResponse.json(
      { error: "Missing required fields: title, price, serviceType, sellerAddress" },
      { status: 400 }
    );
  }

  const order = createOrder(body);
  return NextResponse.json(
    {
      ...order,
      price: order.price.toString(),
      priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
    },
    { status: 201 }
  );
}
