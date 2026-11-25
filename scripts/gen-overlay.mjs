// Regenerates overlay.js in the Babel and SWC plugins from the built client of this plugin.
// Usage: pnpm build && node scripts/gen-overlay.mjs ../babel-plugin-react-source-string/overlay.js ../swc-plugin-react-source/overlay.js
// Each target keeps its header comment; the body is replaced with installReactSourceClient from dist/client.js.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: node scripts/gen-overlay.mjs <path/to/overlay.js>...");
  process.exit(1);
}

const { installReactSourceClient } = await import(new URL("../dist/client.js", import.meta.url).href);

for (const target of targets) {
  const old = readFileSync(target, "utf8");
  const start = old.indexOf("(function () {");
  const header = start === -1 ? "" : old.slice(0, start);
  writeFileSync(
    target,
    `${header}(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production") return;
  (${installReactSourceClient.toString()})("data-source");
})();
`,
  );
  console.log(`wrote ${pathToFileURL(target).pathname}`);
}
