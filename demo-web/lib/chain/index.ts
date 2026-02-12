import type { ChainAdapter } from "./types";
import { MockChainAdapter } from "./mock-adapter";
import { RealChainAdapter } from "./real-adapter";

export function isMockChain(): boolean {
  return process.env.MOCK_CHAIN === "true";
}

let _adapter: ChainAdapter | undefined;

export function getChainAdapter(): ChainAdapter {
  if (!_adapter) {
    _adapter = isMockChain() ? new MockChainAdapter() : new RealChainAdapter();
  }
  return _adapter;
}

export type { ChainAdapter } from "./types";
