"use client";

import { motion } from "framer-motion";

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
}

const products: Product[] = [
  {
    id: "api-access",
    title: "Premium API Access",
    description: "30 days of premium API access with 10k requests/day",
    price: 5.0,
    image: "api",
  },
  {
    id: "data-report",
    title: "Custom Data Report",
    description: "Comprehensive market analysis report with insights",
    price: 10.0,
    image: "report",
  },
  {
    id: "design-template",
    title: "Design Template Pack",
    description: "Professional UI/UX design templates for web3 apps",
    price: 2.5,
    image: "design",
  },
  {
    id: "consulting-hour",
    title: "1-Hour Consulting",
    description: "Expert blockchain consulting session via video call",
    price: 25.0,
    image: "consulting",
  },
];

const iconMap: Record<string, React.ReactNode> = {
  api: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="8" width="24" height="16" rx="3" />
      <path d="M10 16h4M18 14v4M22 14l-2 2 2 2" />
    </svg>
  ),
  report: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 4h10l6 6v18a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M18 4v6h6M10 18h8M10 22h6" />
    </svg>
  ),
  design: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="24" height="24" rx="3" />
      <circle cx="16" cy="16" r="5" />
      <path d="M16 4v4M16 24v4M4 16h4M24 16h4" />
    </svg>
  ),
  consulting: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="16" cy="12" r="5" />
      <path d="M6 26c0-4.4 4.5-8 10-8s10 3.6 10 8" />
    </svg>
  ),
};

interface ProductGridProps {
  onSelect: (product: Product) => void;
  disabled?: boolean;
}

export function ProductGrid({ onSelect, disabled }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {products.map((product, i) => (
        <motion.button
          key={product.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => onSelect(product)}
          disabled={disabled}
          className="group rounded-xl border border-border-default bg-bg-secondary p-4 text-left transition-all hover:border-border-active hover:scale-[1.01] disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="mb-3 text-accent">{iconMap[product.image]}</div>
          <h3 className="mb-1 text-sm font-semibold">{product.title}</h3>
          <p className="mb-3 text-xs text-text-tertiary">
            {product.description}
          </p>
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-accent">
              {product.price.toFixed(2)} USDC
            </span>
            <span className="text-xs text-text-tertiary group-hover:text-text-primary transition-colors">
              Buy Now &rarr;
            </span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

export { products };
