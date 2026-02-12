import { NextResponse } from "next/server";
import { config } from "@server/config.js";
import { getAllServiceTypes } from "@server/service-types/index.js";

export async function GET() {
  const serviceTypes = getAllServiceTypes().map((st) => ({
    name: st.name,
    releaseWindow: st.releaseWindow,
    autoVerify: st.autoVerify,
    description: st.description,
  }));

  return NextResponse.json({
    status: "ok",
    chain: "base-sepolia",
    escrowContract: config.escrowVaultAddress,
    serviceTypes,
  });
}
