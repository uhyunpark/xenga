import { NextResponse } from "next/server";
import { config } from "@server/config.js";
import { getAllServiceTypes } from "@server/service-types/index.js";
import { privateKeyToAccount } from "viem/accounts";
import { isMockChain } from "@/lib/chain";

export async function GET() {
  try {
    const serviceTypes = getAllServiceTypes().map((st) => ({
      name: st.name,
      releaseWindow: st.releaseWindow,
      autoVerify: st.autoVerify,
      description: st.description,
    }));

    // Derive operator address from private key (in mock mode, use a hardcoded address)
    const operatorAddress = isMockChain()
      ? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
      : privateKeyToAccount(config.privateKey).address;

    return NextResponse.json({
      status: "ok",
      chain: "base-sepolia",
      escrowContract: config.escrowVaultAddress,
      operatorAddress,
      serviceTypes,
    });
  } catch (err) {
    console.error("[Health] Failed:", err);
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
