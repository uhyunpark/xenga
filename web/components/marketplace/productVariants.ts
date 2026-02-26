import type { Product } from "./ProductGrid";

export interface VariantOption {
  id: string;
  label: string;
  multiplier: number;
}

export interface VariantCategory {
  id: string;
  label: string;
  options: VariantOption[];
}

export interface ProductVariantConfig {
  categories: VariantCategory[];
}

export type VariantSelections = Record<string, string>; // categoryId -> optionId

export const VARIANT_CONFIGS: Record<string, ProductVariantConfig> = {
  "api-access": {
    categories: [
      {
        id: "tier",
        label: "Tier",
        options: [
          { id: "basic", label: "Basic", multiplier: 1 },
          { id: "standard", label: "Standard", multiplier: 2 },
          { id: "enterprise", label: "Enterprise", multiplier: 5 },
        ],
      },
      {
        id: "duration",
        label: "Duration",
        options: [
          { id: "30d", label: "30 days", multiplier: 1 },
          { id: "90d", label: "90 days", multiplier: 2.5 },
          { id: "1yr", label: "1 year", multiplier: 8 },
        ],
      },
      {
        id: "rate_limit",
        label: "Rate Limit",
        options: [
          { id: "10k", label: "10k req/day", multiplier: 1 },
          { id: "50k", label: "50k req/day", multiplier: 1.5 },
          { id: "unlimited", label: "Unlimited", multiplier: 3 },
        ],
      },
    ],
  },
  "data-report": {
    categories: [
      {
        id: "tier",
        label: "Tier",
        options: [
          { id: "summary", label: "Summary", multiplier: 1 },
          { id: "detailed", label: "Detailed", multiplier: 2 },
          { id: "executive", label: "Executive", multiplier: 4 },
        ],
      },
      {
        id: "sectors",
        label: "Sectors",
        options: [
          { id: "1", label: "1 sector", multiplier: 1 },
          { id: "3", label: "3 sectors", multiplier: 2 },
          { id: "all", label: "All sectors", multiplier: 3.5 },
        ],
      },
      {
        id: "speed",
        label: "Speed",
        options: [
          { id: "standard", label: "Standard", multiplier: 1 },
          { id: "express", label: "Express", multiplier: 1.5 },
        ],
      },
    ],
  },
  "design-template": {
    categories: [
      {
        id: "tier",
        label: "Tier",
        options: [
          { id: "starter", label: "Starter", multiplier: 1 },
          { id: "pro", label: "Pro", multiplier: 2.5 },
          { id: "complete", label: "Complete", multiplier: 5 },
        ],
      },
      {
        id: "license",
        label: "License",
        options: [
          { id: "personal", label: "Personal", multiplier: 1 },
          { id: "team", label: "Team", multiplier: 1.5 },
          { id: "commercial", label: "Commercial", multiplier: 2.5 },
        ],
      },
      {
        id: "format",
        label: "Format",
        options: [
          { id: "figma", label: "Figma", multiplier: 1 },
          { id: "figma-sketch", label: "Figma + Sketch", multiplier: 1.3 },
        ],
      },
    ],
  },
  "consulting-hour": {
    categories: [
      {
        id: "duration",
        label: "Duration",
        options: [
          { id: "30min", label: "30 min", multiplier: 0.5 },
          { id: "1hr", label: "1 hour", multiplier: 1 },
          { id: "2hr", label: "2 hours", multiplier: 1.8 },
        ],
      },
      {
        id: "expertise",
        label: "Expertise",
        options: [
          { id: "general", label: "General", multiplier: 1 },
          { id: "specialized", label: "Specialized", multiplier: 1.5 },
          { id: "expert", label: "Expert", multiplier: 2.5 },
        ],
      },
      {
        id: "priority",
        label: "Priority",
        options: [
          { id: "standard", label: "Standard", multiplier: 1 },
          { id: "express", label: "Express", multiplier: 1.5 },
        ],
      },
    ],
  },
};

export function getDefaultSelections(productId: string): VariantSelections {
  const config = VARIANT_CONFIGS[productId];
  if (!config) return {};
  const selections: VariantSelections = {};
  for (const cat of config.categories) {
    selections[cat.id] = cat.options[0].id;
  }
  return selections;
}

export function computePrice(product: Product, selections: VariantSelections): number {
  const config = VARIANT_CONFIGS[product.id];
  if (!config) return product.price;

  let multiplier = 1;
  for (const cat of config.categories) {
    const selected = cat.options.find((o) => o.id === selections[cat.id]);
    if (selected) multiplier *= selected.multiplier;
  }

  return Math.round(product.price * multiplier * 100) / 100;
}

export function buildOrderDescription(product: Product, selections: VariantSelections): string {
  const config = VARIANT_CONFIGS[product.id];
  if (!config) return product.description;

  const parts: string[] = [product.title];
  for (const cat of config.categories) {
    const selected = cat.options.find((o) => o.id === selections[cat.id]);
    if (selected) parts.push(`${cat.label}: ${selected.label}`);
  }
  return parts.join(" | ");
}
