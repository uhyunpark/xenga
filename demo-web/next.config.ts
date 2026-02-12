import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    // Resolve path aliases for parent src/ directory
    config.resolve.alias = {
      ...config.resolve.alias,
      "@server": path.resolve(__dirname, "../src/server"),
      "@shared": path.resolve(__dirname, "../src/shared"),
      // Deduplicate viem to single copy (prevents type conflicts)
      viem: path.resolve(__dirname, "node_modules/viem"),
    };

    // Resolve .js imports to .ts files (existing server code uses .js extensions for Node ESM)
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    // Allow webpack to process TypeScript files from parent directory
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
          rule.include = [original, path.resolve(__dirname, "../src")];
        }
      }
    }

    return config;
  },
};

export default nextConfig;
