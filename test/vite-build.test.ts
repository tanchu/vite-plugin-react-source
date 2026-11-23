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

it("adds the overlay client to index.html in dev only", async () => {
  const { createServer } = await import("vite");
  const root = fileURLToPath(new URL("./fixture", import.meta.url));
  const html = `<!doctype html><html><head></head><body></body></html>`;

  const server = await createServer({ root, logLevel: "silent", plugins: [reactSourceString()], server: { middlewareMode: true } });
  try {
    expect(await server.transformIndexHtml("/", html)).toContain("__REACT_SOURCE__");
  } finally {
    await server.close();
  }

  const off = await createServer({ root, logLevel: "silent", plugins: [reactSourceString({ overlay: false })], server: { middlewareMode: true } });
  try {
    expect(await off.transformIndexHtml("/", html)).not.toContain("__REACT_SOURCE__");
  } finally {
    await off.close();
  }

  const out = await build({
    root,
    logLevel: "silent",
    plugins: [reactSourceString()],
    build: { write: false, minify: false, rollupOptions: { external: [/^react/] } },
  });
  const assets = (Array.isArray(out) ? out[0] : (out as any)).output as { fileName: string; source?: string }[];
  const page = assets.find((a) => a.fileName === "index.html");
  expect(page?.source).toBeDefined();
  expect(String(page!.source)).not.toContain("__REACT_SOURCE__");
});
