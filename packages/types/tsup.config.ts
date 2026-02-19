import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    abi: "src/abi.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["viem"],
});
