import type { Request, Response, NextFunction } from "express";
import type { EscrowPaymentResponse, Order } from "../../shared/types.js";
import { config } from "../config.js";
import { getOrderById, updateOrderStatus } from "../services/orderService.js";
import { getDb } from "../db/index.js";
import { getServiceType } from "../service-types/index.js";
import { verifyViaFacilitator, settleViaFacilitator } from "../facilitator/dispatch.js";
import { computeReputation } from "../services/reputationService.js";
import { logger } from "../services/logger.js";
import { processEscrowPayment } from "./paymentCore.js";
import type { PaymentDeps } from "./types.js";

export interface EscrowPaymentRequest extends Request {
  escrowPayment?: EscrowPaymentResponse;
  order?: Order;
}

/**
 * Build the PaymentDeps wired to the Express server's services.
 */
function buildExpressDeps(): PaymentDeps {
  const db = getDb();
  return {
    getOrderById,
    updateOrderStatus: (id, update) => updateOrderStatus(id, update),
    claimOrder(id: string): boolean {
      const result = db
        .prepare(
          "UPDATE orders SET status = 'pending_payment', updated_at = ? WHERE id = ? AND status = 'created'"
        )
        .run(Math.floor(Date.now() / 1000), id);
      return result.changes > 0;
    },
    revertOrderClaim(id: string): void {
      db.prepare(
        "UPDATE orders SET status = 'created', updated_at = ? WHERE id = ?"
      ).run(Math.floor(Date.now() / 1000), id);
    },
    getServiceType,
    verify: verifyViaFacilitator,
    settle: async (payload, requirement) => {
      const result = await settleViaFacilitator(payload, requirement);
      return {
        txHash: result.txHash!,
        escrowId: result.escrowId as number,
      };
    },
    computeReputation,
    config: {
      escrowVaultAddress: config.escrowVaultAddress,
      usdcAddress: config.usdcAddress,
      feeBps: config.feeBps,
      flatFee: config.flatFee,
      network: config.chainConfig.network,
      disputeWindow: config.disputeWindow,
    },
    logger,
  };
}

/**
 * Express middleware adapter for xenga escrow payment.
 *
 * Delegates to the framework-independent `processEscrowPayment()` core,
 * then translates the result into Express `res` calls.
 */
export function escrowPaymentMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const deps = buildExpressDeps();

    const result = await processEscrowPayment(
      {
        getHeader: (name) => req.headers[name.toLowerCase()] as string | undefined,
        params: req.params as Record<string, string>,
      },
      deps
    );

    // Set response headers
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    if (result.handled) {
      // Core fully handled the response (402, 400, 409, 500, etc.)
      return res.status(result.status).json(result.body);
    }

    // Payment accepted — attach info to request for downstream handlers, then call next()
    (req as EscrowPaymentRequest).escrowPayment = result.payment;
    (req as EscrowPaymentRequest).order = result.order;
    next();
  };
}
