"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Address,
  type Chain,
  custom,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { facilitatorFetch } from "@/lib/api/client";

type WalletType = "demo" | "browser" | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicClient = any;

interface WalletState {
  type: WalletType;
  address: Address | null;
  walletClient: WalletClient | null;
  publicClient: AnyPublicClient;
  isConnecting: boolean;
  isFunding: boolean;
  usdcBalance: string | null;
  ethBalance: string | null;
  connectDemo: () => void;
  connectBrowser: () => Promise<void>;
  disconnect: () => void;
  fundDemoWallet: () => Promise<void>;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

const RPC_URL = "https://sepolia.base.org";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const DEMO_KEY_STORAGE = "x402-demo-pk";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<WalletType>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!address) return;

    // In mock mode, return hardcoded balances (no RPC needed)
    if (process.env.NEXT_PUBLIC_MOCK_CHAIN === "true") {
      setEthBalance("1.0000");
      setUsdcBalance("1000.00");
      return;
    }

    try {
      const eth = await publicClient.getBalance({ address });
      setEthBalance((Number(eth) / 1e18).toFixed(4));

      // Read USDC balance
      // Base Sepolia USDC — matches USDC_ADDRESS in src/shared/constants.ts
      const usdcAddr = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
      const balance = (await publicClient.readContract({
        address: usdcAddr,
        abi: [
          {
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      setUsdcBalance((Number(balance) / 1e6).toFixed(2));
    } catch {
      // Silently fail on balance check
    }
  }, [address]);

  const connectDemo = useCallback(() => {
    // Check sessionStorage for existing demo wallet
    let pk = sessionStorage.getItem(DEMO_KEY_STORAGE);
    if (!pk) {
      pk = generatePrivateKey();
      sessionStorage.setItem(DEMO_KEY_STORAGE, pk);
    }
    const account = privateKeyToAccount(pk as `0x${string}`);
    const client = createWalletClient({
      chain: baseSepolia,
      transport: http(RPC_URL),
      account,
    });
    setType("demo");
    setAddress(account.address);
    setWalletClient(client);
  }, []);

  const connectBrowser = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("No wallet detected. Please install MetaMask.");
    }
    setIsConnecting(true);
    try {
      const [addr] = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as Address[];

      // Try to switch to Base Sepolia
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x14A34" }],
        });
      } catch (switchError: any) {
        // Chain not added yet, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x14A34",
                chainName: "Base Sepolia",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.base.org"],
                blockExplorerUrls: ["https://sepolia.basescan.org"],
              },
            ],
          });
        }
      }

      const client = createWalletClient({
        chain: baseSepolia,
        transport: custom(window.ethereum),
        account: addr,
      });
      setType("browser");
      setAddress(addr);
      setWalletClient(client);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setType(null);
    setAddress(null);
    setWalletClient(null);
    setUsdcBalance(null);
    setEthBalance(null);
  }, []);

  const fundDemoWallet = useCallback(async () => {
    if (!address || type !== "demo") return;
    setIsFunding(true);
    try {
      const res = await facilitatorFetch("/api/demo/fund", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Funding failed");
      }
      await refreshBalances();
    } finally {
      setIsFunding(false);
    }
  }, [address, type, refreshBalances]);

  // Refresh balances when address changes
  useEffect(() => {
    if (address) refreshBalances();
  }, [address, refreshBalances]);

  return (
    <WalletContext.Provider
      value={{
        type,
        address,
        walletClient,
        publicClient,
        isConnecting,
        isFunding,
        usdcBalance,
        ethBalance,
        connectDemo,
        connectBrowser,
        disconnect,
        fundDemoWallet,
        refreshBalances,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

// Augment Window for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
