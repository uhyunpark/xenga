/**
 * Compute facilitator fee from amount, basis points, and optional flat fee.
 * Uses integer division (truncates). For micropayments, percentage component rounds down to 0.
 *
 * @param amount - USDC amount in smallest unit (6 decimals)
 * @param feeBps - Fee in basis points (100 = 1%, max 1000 = 10%)
 * @param flatFee - Fixed fee in USDC smallest unit (e.g. 50000 = $0.05), default 0
 * @returns Fee amount in USDC smallest unit
 */
export function computeFee(amount: bigint, feeBps: number, flatFee: bigint = 0n): bigint {
  return (amount * BigInt(feeBps)) / 10000n + flatFee;
}
