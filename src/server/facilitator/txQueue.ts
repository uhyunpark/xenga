import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../../shared/constants.js";
import { config } from "../config.js";
import { logger } from "../services/logger.js";

// ──────────── Client Singletons ────────────

let _account: ReturnType<typeof privateKeyToAccount> | undefined;
const getAccount = () => {
  if (!_account) _account = privateKeyToAccount(config.privateKey);
  return _account;
};

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
export const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  return _publicClient;
};

const getWalletClient = (() => {
  let client: ReturnType<typeof create> | undefined;
  function create() {
    return createWalletClient({ chain: CHAIN, transport: http(config.rpcUrl), account: getAccount() });
  }
  return () => {
    if (!client) client = create();
    return client;
  };
})();

// ──────────── Transaction Queue ────────────

class TxQueue {
  private pendingNonce: number | null = null;
  private submitQueue: Promise<void> = Promise.resolve();
  private _queueDepth = 0;

  /**
   * Serialize nonce acquisition + tx submission.
   * The submitFn receives the nonce, sends the tx, and returns the hash.
   * Receipt waiting happens outside the lock (callers do it after getting the hash).
   *
   * On "nonce too low" errors (stale cache from external txs), automatically
   * re-fetches the nonce from the network and retries once.
   */
  private withSerializedNonce(label: string, submitFn: (nonce: number) => Promise<Hash>): Promise<Hash> {
    return new Promise<Hash>((resolve, reject) => {
      this._queueDepth++;
      this.submitQueue = this.submitQueue.then(async () => {
        try {
          if (this.pendingNonce === null) {
            this.pendingNonce = await this.fetchNonce();
          }

          const nonce = this.pendingNonce;
          logger.info("txQueue", `Submitting ${label} with nonce ${nonce}`, { queueDepth: this._queueDepth });

          let hash: Hash;
          try {
            hash = await submitFn(nonce);
          } catch (err) {
            // Retry once on stale nonce — RPC rejects pre-send so no gas is burned
            if (this.isNonceTooLow(err)) {
              const freshNonce = await this.fetchNonce();
              logger.warn("txQueue", `Nonce too low (had ${nonce}, chain at ${freshNonce}). Retrying ${label} with fresh nonce ${freshNonce}`);
              hash = await submitFn(freshNonce);
              this.pendingNonce = freshNonce + 1;
              resolve(hash);
              return;
            }
            throw err;
          }

          this.pendingNonce = nonce + 1;
          resolve(hash);
        } catch (err) {
          // Reset nonce on failure — next call will re-fetch from the network
          this.pendingNonce = null;
          logger.error("txQueue", `Failed ${label}: ${err instanceof Error ? err.message : String(err)}`);
          reject(err);
        } finally {
          this._queueDepth--;
        }
      });
    });
  }

  private async fetchNonce(): Promise<number> {
    const nonce = await getPublicClient().getTransactionCount({
      address: getAccount().address,
      blockTag: "pending",
    });
    logger.info("txQueue", `Fetched nonce: ${nonce}`);
    return nonce;
  }

  private isNonceTooLow(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("nonce too low") || msg.includes("nonce has already been used");
  }

  async writeContract(label: string, args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }): Promise<Hash> {
    return this.withSerializedNonce(label, (nonce) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWalletClient().writeContract({ ...(args as any), nonce })
    );
  }

  async sendTransaction(label: string, args: {
    to: Address;
    value?: bigint;
    data?: `0x${string}`;
  }): Promise<Hash> {
    return this.withSerializedNonce(label, (nonce) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getWalletClient().sendTransaction({ ...(args as any), nonce })
    );
  }

  getQueueDepth(): number {
    return this._queueDepth;
  }
}

export const txQueue = new TxQueue();
