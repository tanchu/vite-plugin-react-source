import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build, version } from "vite";
import reactSourceString from "vite-plugin-react-source-string";

const root = fileURLToPath(new URL("../fixture", import.meta.url));

for (const preferCallSite of [false, true]) {
  const out = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [reactSourceString({ preferCallSite })],
    build: {
      write: false,
      minify: false,
      lib: { entry: "src/main.tsx", formats: ["es"] },
      rollupOptions: { external: [/^react/] },
    },
  });
  const code = (Array.isArray(out) ? out[0] : out).output[0].code;
  for (const line of [3, 4, 9]) {
    assert.ok(
      code.includes(`"data-source": "src/main.tsx:${line}"`),
      `missing src/main.tsx:${line} (preferCallSite: ${preferCallSite})`,
    );
  }
}

console.log(`OK on Vite ${version}`);
