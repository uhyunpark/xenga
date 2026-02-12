import { keccak256, toHex, type Hash } from "viem";

let counter = 0;

export function fakeTxHash(): Hash {
  counter++;
  return keccak256(toHex(`mock-tx-${Date.now()}-${counter}`));
}
