import { fileURLToPath } from "node:url";
import { build } from "vite";
import { expect, it } from "vitest";
import reactSourceString from "../src/index";

it("works inside a real Vite build", async () => {
  const root = fileURLToPath(new URL("./fixture", import.meta.url));
  const out = await build({
    root,
    logLevel: "silent",
    plugins: [reactSourceString()],
    build: {
      write: false,
      minify: false,
      lib: { entry: "src/main.tsx", formats: ["es"] },
      rollupOptions: { external: [/^react/] },
    },
  });
  const code = (Array.isArray(out) ? out[0] : out as any).output[0].code as string;
  expect(code).toContain(`"data-source": "src/main.tsx:3"`);
  expect(code).toContain(`"data-source": "src/main.tsx:4"`);
  expect(code).toContain(`"data-source": "src/main.tsx:9"`);
});
