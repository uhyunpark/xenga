"use client";

import { motion } from "framer-motion";
import type { Product } from "./ProductGrid";
import {
  VARIANT_CONFIGS,
  computePrice,
  type VariantSelections,
} from "./productVariants";

interface ConfigureStepProps {
  product: Product;
  selections: VariantSelections;
  onSelectionChange: (categoryId: string, optionId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ConfigureStep({
  product,
  selections,
  onSelectionChange,
  onContinue,
  onBack,
}: ConfigureStepProps) {
  const config = VARIANT_CONFIGS[product.id];
  const computedPrice = computePrice(product, selections);

  return (
    <motion.div
      key="configure"
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

      <h3 className="mb-1 text-sm font-semibold">{product.title}</h3>
      <p className="mb-4 text-xs text-text-tertiary">{product.description}</p>

      {config && (
        <div className="space-y-3">
          {config.categories.map((cat) => (
            <div key={cat.id}>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                {cat.label}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {cat.options.map((opt) => {
                  const isSelected = selections[cat.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onSelectionChange(cat.id, opt.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                        isSelected
                          ? "border-accent bg-accent/10 text-accent font-medium"
                          : "border-border-default bg-bg-secondary text-text-secondary hover:border-border-active hover:text-text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border-default pt-3">
        <span className="text-xs text-text-secondary">Total</span>
        <span className="font-mono text-lg font-bold text-accent">
          {computedPrice.toFixed(2)} USDC
        </span>
      </div>

      <button
        onClick={onContinue}
        className="mt-3 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover"
      >
        Continue to Review
      </button>
    </motion.div>
  );
}
