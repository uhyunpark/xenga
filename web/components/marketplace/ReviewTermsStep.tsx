"use client";

import { motion } from "framer-motion";
import { ReputationBadge } from "@/components/ui/ReputationBadge";
import type { Product } from "./ProductGrid";
import { formatReleaseWindow } from "./utils";

interface ReviewTermsStepProps {
  product: Product;
  operatorAddress: string | null;
  loading: boolean;
  onPayNow: () => void;
  onBack: () => void;
}

export function ReviewTermsStep({
  product,
  operatorAddress,
  loading,
  onPayNow,
  onBack,
}: ReviewTermsStepProps) {
  const price = product.price;
  // Estimate fee: 0.3% + $0 flat (matches typical demo config)
  const feeBps = 30;
  const estimatedFee = price * feeBps / 10000;
  const sellerReceives = price - estimatedFee;
  // Marketplace default release window
  const releaseWindow = 604800; // 7 days
  const disputeWindow = 259200; // 3 days

  return (
    <motion.div
      key="review_terms"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel-surface rounded-xl p-4"
    >
      <button
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 9.5l-3.5-3.5 3.5-3.5" />
        </svg>
        Back to products
      </button>

      {/* Product summary */}
      <div className="mb-4 rounded-lg border border-border-default bg-bg-secondary/50 p-3">
        <h4 className="text-sm font-semibold">{product.title}</h4>
        <p className="mt-0.5 text-xs text-text-tertiary">{product.description}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-text-secondary">Payment Amount</span>
          <span className="font-mono text-sm font-bold text-accent">
            {price.toFixed(2)} USDC
          </span>
        </div>
      </div>

      {/* Escrow terms */}
      <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 p-3">
        <h4 className="mb-2 text-xs font-semibold text-accent">Escrow Terms</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-tertiary">Release Window</span>
            <span>{formatReleaseWindow(releaseWindow)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Dispute Window</span>
            <span>{formatReleaseWindow(disputeWindow)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Service Type</span>
            <span>marketplace</span>
          </div>
          {estimatedFee > 0 && (
            <>
              <div className="flex justify-between text-text-tertiary">
                <span>Facilitator Fee ({(feeBps / 100).toFixed(1)}%)</span>
                <span className="font-mono">~{estimatedFee.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1">
                <span className="text-text-tertiary">Seller Receives</span>
                <span className="font-mono">~{sellerReceives.toFixed(2)} USDC</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Buyer protection */}
      <div className="mb-4 rounded-lg border border-success/20 bg-success/5 p-3">
        <h4 className="mb-1.5 text-xs font-semibold text-success">Buyer Protection</h4>
        <ul className="space-y-1 text-[11px] text-text-secondary">
          <li className="flex items-start gap-1.5">
            <svg className="mt-0.5 h-3 w-3 shrink-0 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8l3 3 5-5" />
            </svg>
            Funds locked in smart contract until delivery
          </li>
          <li className="flex items-start gap-1.5">
            <svg className="mt-0.5 h-3 w-3 shrink-0 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8l3 3 5-5" />
            </svg>
            Dispute window after delivery confirmation
          </li>
          <li className="flex items-start gap-1.5">
            <svg className="mt-0.5 h-3 w-3 shrink-0 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8l3 3 5-5" />
            </svg>
            Full refund if seller cancels
          </li>
        </ul>
      </div>

      {/* Seller trust */}
      {operatorAddress && (
        <div className="mb-4 rounded-lg border border-border-default bg-bg-secondary/50 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-semibold text-text-primary">Seller On-Chain History</span>
            <ReputationBadge address={operatorAddress} size="md" />
          </div>
          <p className="text-[11px] text-text-tertiary">
            On-chain escrow stats for this seller. Each service interprets this data with its own scoring model.
          </p>
        </div>
      )}

      <button
        onClick={onPayNow}
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Processing...
          </span>
        ) : (
          `Pay ${price.toFixed(2)} USDC`
        )}
      </button>

      <p className="mt-2 text-center text-[11px] text-text-tertiary">
        Exact terms confirmed during payment via HTTP 402
      </p>
    </motion.div>
  );
}
