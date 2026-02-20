import { config } from "@server/config.js";
import { getOrderById, updateOrderStatus } from "@server/services/orderService.js";
import { getDb } from "@server/db/index.js";
import { getServiceType } from "@server/service-types/index.js";
import { verifyViaFacilitator } from "@server/facilitator/dispatch.js";
import { getChainAdapter } from "@/lib/chain";
import { handleEscrowPayment, toNextResponse } from "@server/middleware/nextjsAdapter.js";
import type { PaymentDeps } from "@server/middleware/types.js";

function buildDeps(): PaymentDeps {
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
    settle: async (payload) => {
      const { txHash, escrowId } = await getChainAdapter().settleEscrow(payload);
      return { txHash, escrowId };
    },
    config: {
      escrowVaultAddress: config.escrowVaultAddress,
      usdcAddress: config.usdcAddress,
      feeBps: config.feeBps,
      flatFee: config.flatFee,
    },
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await handleEscrowPayment(request, { id }, buildDeps());
  return toNextResponse(result);
}
