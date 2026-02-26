/**
 * Pre-recorded data for the no-wallet marketplace preview.
 * Shows the full xenga payment lifecycle with realistic payloads.
 */

export const PREVIEW_PRODUCT = {
  id: "preview-1",
  title: "AI Market Analysis Report",
  description: "Comprehensive analysis of AI market trends, powered by on-chain escrow.",
  price: 25,
  priceUsdc: "25000000",
  image: null,
};

export const PREVIEW_VARIANT = {
  tier: "Detailed",
  sectors: "3 sectors",
  speed: "Express",
};

export const PREVIEW_ORDER = {
  id: "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f90",
  orderId: "0x8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7" as const,
  title: PREVIEW_PRODUCT.title,
  price: "25000000",
  priceUsdc: 25,
  serviceType: "marketplace",
  sellerAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
  status: "created",
};

export const PREVIEW_PAYMENT_REQUIRED = {
  scheme: "escrow" as const,
  network: "base-sepolia",
  escrowContract: "0x1234567890abcdef1234567890abcdef12345678",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "25000000",
  orderId: PREVIEW_ORDER.orderId,
  sellerAddress: PREVIEW_ORDER.sellerAddress,
  releaseWindow: 604800,
  serviceType: "marketplace",
  facilitatorFee: "75000",
  feeBps: 30,
  flatFee: "0",
};

export const PREVIEW_SETTLEMENT = {
  escrowId: 42,
  txHash: "0x9f8e7d6c5b4a3928171605f4e3d2c1b0a9f8e7d6c5b4a3928171605f4e3d2c1b",
};

export interface PreviewStep {
  id: string;
  label: string;
  description: string;
  durationMs: number;
}

export const PREVIEW_STEPS: PreviewStep[] = [
  {
    id: "browse",
    label: "Browse Products",
    description: "Buyer browses the marketplace and selects a product.",
    durationMs: 4000,
  },
  {
    id: "configure",
    label: "Configure Options",
    description: "Buyer customizes the order — tier, quantity, and delivery speed affect the final price.",
    durationMs: 5000,
  },
  {
    id: "review_terms",
    label: "Review Escrow Terms",
    description: "Buyer reviews escrow parameters: release window, dispute window, fees, and buyer protection.",
    durationMs: 6000,
  },
  {
    id: "pay",
    label: "Pay",
    description: "Single click triggers the full payment protocol: order creation, 402 payment request, EIP-712 signing, and on-chain settlement.",
    durationMs: 8000,
  },
  {
    id: "tracking",
    label: "Delivery Tracking",
    description: "Buyer watches delivery progress. Once confirmed, they can release funds or file a dispute.",
    durationMs: 6000,
  },
  {
    id: "complete",
    label: "Complete",
    description: "Seller receives USDC minus facilitator fee. Both parties' reputation scores update on-chain.",
    durationMs: 6000,
  },
];
