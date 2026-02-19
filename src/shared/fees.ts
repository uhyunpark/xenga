/**
 * Compute facilitator fee from amount and basis points.
 * Uses integer division (truncates). For micropayments, fees round down to 0.
 *
 * @param amount - USDC amount in smallest unit (6 decimals)
 * @param feeBps - Fee in basis points (100 = 1%, max 1000 = 10%)
 * @returns Fee amount in USDC smallest unit
 */
export function computeFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10000n;
}
