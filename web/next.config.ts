import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    // Resolve @shared/ alias to parent src/shared/ (types + EIP-712 functions)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shared": path.resolve(__dirname, "../src/shared"),
    };

    // Resolve .js imports to .ts files (shared code uses .js extensions for Node ESM compat)
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    // Allow webpack to process TypeScript files from ../src/shared
    const oneOfRule = config.module.rules.find(
      (rule: any) => typeof rule === "object" && rule.oneOf
    );
    if (oneOfRule) {
      for (const rule of oneOfRule.oneOf) {
        if (
          rule.include &&
          typeof rule.include === "object" &&
          !Array.isArray(rule.include)
        ) {
          const original = rule.include;
          rule.include = [original, path.resolve(__dirname, "../src/shared")];
        }
      }
    }

    return config;
  },
};

export default nextConfig;
