import { createPublicClient, http, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../../shared/constants.js";
import { config } from "../config.js";
import { logger } from "./logger.js";

const LOW_ETH_THRESHOLD = 0.01; // 0.01 ETH
const CHECK_INTERVAL_MS = 5 * 60_000; // 5 minutes

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  return _publicClient;
};

let _operatorAddress: Address | undefined;
function getOperatorAddress(): Address {
  if (!_operatorAddress) {
    _operatorAddress = privateKeyToAccount(config.privateKey).address;
  }
  return _operatorAddress;
}

export interface WalletStatus {
  address: Address;
  ethBalance: string;
  ethBalanceRaw: bigint;
  isLow: boolean;
  checkedAt: number;
}

let _lastStatus: WalletStatus | undefined;

export function getLastWalletStatus(): WalletStatus | undefined {
  return _lastStatus;
}

async function checkBalance(): Promise<WalletStatus> {
  const address = getOperatorAddress();
  const balance = await getPublicClient().getBalance({ address });

  const status: WalletStatus = {
    address,
    ethBalance: formatEther(balance),
    ethBalanceRaw: balance,
    isLow: Number(formatEther(balance)) < LOW_ETH_THRESHOLD,
    checkedAt: Math.floor(Date.now() / 1000),
  };

  if (status.isLow) {
    logger.warn("operator", `Low ETH balance: ${status.ethBalance} ETH — transactions may fail`, {
      address,
      balance: status.ethBalance,
    });
  }

  _lastStatus = status;
  return status;
}

/**
 * Start periodic operator wallet balance monitoring.
 * Logs warnings when ETH balance is too low to pay gas.
 */
export function startWalletMonitor() {
  // Initial check
  checkBalance().catch((err) => {
    logger.error("operator", `Failed to check operator wallet balance: ${err.message}`);
  });

  // Periodic check
  const interval = setInterval(() => {
    checkBalance().catch((err) => {
      logger.error("operator", `Failed to check operator wallet balance: ${err.message}`);
    });
  }, CHECK_INTERVAL_MS);
  interval.unref();

  logger.info("operator", `Monitoring operator wallet ${getOperatorAddress()}`);
}
