import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  external: ["vite", "oxc-parser", "magic-string"],
});
