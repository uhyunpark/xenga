import { createPublicClient, http, type Address } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import { CHAIN } from "../../shared/constants.js";
import type { Stats } from "../../shared/types.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient)
    _publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(config.rpcUrl),
    });
  return _publicClient;
};

function toStats(raw: any): Stats {
  return {
    totalEscrows: BigInt(raw.totalEscrows ?? raw[0] ?? 0),
    totalAmount: BigInt(raw.totalAmount ?? raw[1] ?? 0),
    completedCount: BigInt(raw.completedCount ?? raw[2] ?? 0),
    completedAmount: BigInt(raw.completedAmount ?? raw[3] ?? 0),
    disputedCount: BigInt(raw.disputedCount ?? raw[4] ?? 0),
    disputedAmount: BigInt(raw.disputedAmount ?? raw[5] ?? 0),
    resolvedCount: BigInt(raw.resolvedCount ?? raw[6] ?? 0),
    refundedCount: BigInt(raw.refundedCount ?? raw[7] ?? 0),
    refundedAmount: BigInt(raw.refundedAmount ?? raw[8] ?? 0),
  };
}

export async function getOnChainSellerStats(
  seller: Address
): Promise<Stats> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getSellerStats",
    args: [seller],
  });
  return toStats(result);
}

export async function getOnChainServiceStats(
  serviceType: string
): Promise<Stats> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getServiceTypeStats",
    args: [serviceType],
  });
  return toStats(result);
}

export interface TimeWindowedRow {
  sellerAddress: string;
  serviceType: string;
  totalEscrows: number;
  totalAmount: number;
  completedCount: number;
  completedAmount: number;
  disputedCount: number;
  disputedAmount: number;
  disputeRatio: number;
}

export function getTimeWindowedStats(
  days: number,
  seller?: string,
  serviceType?: string
): TimeWindowedRow[] {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

  let sql = `
    SELECT
      seller_address as sellerAddress,
      service_type as serviceType,
      COUNT(*) as totalEscrows,
      SUM(CAST(price AS INTEGER)) as totalAmount,
      SUM(CASE WHEN status IN ('completed') THEN 1 ELSE 0 END) as completedCount,
      SUM(CASE WHEN status IN ('completed') THEN CAST(price AS INTEGER) ELSE 0 END) as completedAmount,
      SUM(CASE WHEN status IN ('disputed','resolved') THEN 1 ELSE 0 END) as disputedCount,
      SUM(CASE WHEN status IN ('disputed','resolved') THEN CAST(price AS INTEGER) ELSE 0 END) as disputedAmount
    FROM orders
    WHERE created_at > ?
      AND status != 'created'
  `;

  const params: any[] = [cutoff];

  if (seller) {
    sql += ` AND LOWER(seller_address) = LOWER(?)`;
    params.push(seller);
  }
  if (serviceType) {
    sql += ` AND service_type = ?`;
    params.push(serviceType);
  }

  sql += ` GROUP BY seller_address, service_type`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => ({
    sellerAddress: row.sellerAddress,
    serviceType: row.serviceType,
    totalEscrows: row.totalEscrows,
    totalAmount: row.totalAmount ?? 0,
    completedCount: row.completedCount,
    completedAmount: row.completedAmount ?? 0,
    disputedCount: row.disputedCount,
    disputedAmount: row.disputedAmount ?? 0,
    disputeRatio:
      row.totalEscrows > 0 ? row.disputedCount / row.totalEscrows : 0,
  }));
}
