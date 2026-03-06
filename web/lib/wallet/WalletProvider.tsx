"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type Address,
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
  isAutoConnecting: boolean;
  isFunding: boolean;
  usdcBalance: string | null;
  ethBalance: string | null;
  error: string | null;
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

const DEMO_KEY_STORAGE = "xenga-demo-pk";
const DISCONNECT_KEY = "xenga-wallet-disconnected";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14A34";

interface WalletProviderProps {
  children: ReactNode;
  mode?: "demo" | "browser";
}

export function WalletProvider({ children, mode }: WalletProviderProps) {
  const [type, setType] = useState<WalletType>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasAutoConnectAttempted = useRef(false);
  const prevAddressRef = useRef<Address | null>(null);

  // Track previous address for change detection
  useEffect(() => {
    prevAddressRef.current = address;
  }, [address]);

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
    if (mode === "browser") return; // No-op in browser-only mode
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
    setError(null);
  }, [mode]);

  // Internal helper: set browser wallet state from an address
  const setBrowserWallet = useCallback((addr: Address) => {
    const client = createWalletClient({
      chain: baseSepolia,
      transport: custom(window.ethereum!),
      account: addr,
    });
    setType("browser");
    setAddress(addr);
    setWalletClient(client);
    setError(null);
  }, []);

  const connectBrowser = useCallback(async () => {
    if (mode === "demo") return; // No-op in demo-only mode
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No wallet detected. Please install MetaMask.");
      return;
    }
    setIsConnecting(true);
    setError(null);

    try {
      // Clear explicit disconnect flag
      sessionStorage.removeItem(DISCONNECT_KEY);

      // Request permissions (EIP-2255) — always shows wallet popup
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      // Get accounts after permission granted
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found after permission grant.");
      }

      const addr = accounts[0] as Address;

      // Try to switch to Base Sepolia
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
        });
      } catch (switchError: any) {
        // Chain not added yet, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
                chainName: "Base Sepolia",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.base.org"],
                blockExplorerUrls: ["https://sepolia.basescan.org"],
              },
            ],
          });
        }
      }

      setBrowserWallet(addr);
    } catch (err: any) {
      // User rejected (4001) — silent, they can click again
      if (err?.code !== 4001) {
        setError(err instanceof Error ? err.message : "Failed to connect wallet");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [mode, setBrowserWallet]);

  // Internal: clear wallet state without setting disconnect flag
  const resetWallet = useCallback(() => {
    setType(null);
    setAddress(null);
    setWalletClient(null);
    setUsdcBalance(null);
    setEthBalance(null);
  }, []);

  // External: explicit user disconnect
  const disconnect = useCallback(() => {
    sessionStorage.setItem(DISCONNECT_KEY, "true");

    // Revoke wallet permissions (EIP-2255)
    try {
      window.ethereum
        ?.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        })
        .catch(() => {}); // Not all wallets support this
    } catch {
      // Silent fail
    }

    resetWallet();
    setError(null);
  }, [resetWallet]);

  const fundDemoWallet = useCallback(async () => {
    if (mode === "browser") return; // No-op in browser-only mode
    if (!address || type !== "demo") return;
    setIsFunding(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Funding failed");
    } finally {
      setIsFunding(false);
    }
  }, [mode, address, type, refreshBalances]);

  // Refresh balances when address changes
  useEffect(() => {
    if (address) refreshBalances();
  }, [address, refreshBalances]);

  // Auto-reconnect demo wallet on page load/refresh (skip in browser-only mode)
  useEffect(() => {
    if (mode === "browser") return;
    if (typeof window !== "undefined") {
      const pk = sessionStorage.getItem(DEMO_KEY_STORAGE);
      if (pk) connectDemo();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect browser wallet on mount (silent, no popup; skip in demo-only mode)
  useEffect(() => {
    if (mode === "demo") return;
    if (hasAutoConnectAttempted.current) return;
    hasAutoConnectAttempted.current = true;

    if (typeof window === "undefined" || !window.ethereum) return;
    if (sessionStorage.getItem(DISCONNECT_KEY) === "true") return;
    if (sessionStorage.getItem(DEMO_KEY_STORAGE)) return; // Demo wallet takes priority

    setIsAutoConnecting(true);
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          setBrowserWallet(accounts[0] as Address);
        }
      })
      .catch(() => {
        // Silent fail on auto-connect
      })
      .finally(() => setIsAutoConnecting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for account and chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        // MetaMask can transiently report empty accounts — verify before resetting
        try {
          const recheck = await window.ethereum!.request({ method: "eth_accounts" }) as string[];
          if (recheck.length > 0) return; // transient — ignore
        } catch {}
        resetWallet();
        return;
      }

      const newAddress = accounts[0].toLowerCase();
      const prevAddress = prevAddressRef.current?.toLowerCase();

      if (prevAddress && prevAddress !== newAddress) {
        resetWallet();
        setError("Wallet address changed. Please reconnect.");
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      if (type !== "browser") return;

      if (newChainId !== BASE_SEPOLIA_CHAIN_ID) {
        setError("Wrong network. Please switch to Base Sepolia.");
      } else {
        setError(null);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [resetWallet, type]);

  return (
    <WalletContext.Provider
      value={{
        type,
        address,
        walletClient,
        publicClient,
        isConnecting,
        isAutoConnecting,
        isFunding,
        usdcBalance,
        ethBalance,
        error,
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
