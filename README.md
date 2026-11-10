# vite-plugin-react-source-string

Native Vite plugin that adds `data-source="path:line"` attributes to **every JSX element** for debugging — HTML tags, React components, icons, anything.

Vite port of [swc-plugin-react-source-string](https://github.com/tanchu/swc-plugin-react-source) and
[babel-plugin-react-source-string](https://github.com/tanchu/babel-plugin-react-source-string): same options, same output.
Written in TypeScript, parses with [oxc-parser](https://oxc.rs) (native, fast) and rewrites with `magic-string`
(with source maps). No Babel, no WASM, no ABI coupling to a bundler version — works with any Vite ≥ 5 (including Rolldown-based Vite).

## Installation

```bash
npm install -D vite-plugin-react-source-string
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactSourceString from "vite-plugin-react-source-string";

export default defineConfig({
  plugins: [
    reactSourceString({ excluded: ["Fragment", "Slot"] }),
    react(),
  ],
});
```

The plugin runs with `enforce: "pre"`, so it sees the original JSX before `@vitejs/plugin-react`
(or esbuild/oxc) transforms it — its position in the array does not matter.

**Tip:** You probably only want this in development:

```ts
export default defineConfig(({ command }) => ({
  plugins: [
    command === "serve" && reactSourceString({ excluded: ["Fragment"] }),
    react(),
  ],
}));
```

## Plugin options

| Option     | Type            | Default                       | Description                                                                 |
| ---------- | --------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `excluded` | `string[]`      | `[]`                          | Component/element names to skip (case-insensitive). For `<UI.Button>` the name is `Button`. |
| `root`     | `string`        | Vite's resolved `root`        | Project root for relative paths.                                            |
| `include`  | `FilterPattern` | `/\.(?:[cm]?jsx?\|tsx)$/`     | Files to transform (`.ts` can't contain JSX).                               |
| `exclude`  | `FilterPattern` | `/[\\/]node_modules[\\/]/`    | Files to skip.                                                              |

## How it works

The plugin adds a `data-source` attribute to **every** JSX opening element — both HTML tags (`<div>`, `<span>`)
and React components (`<Dialog>`, `<Pencil>`, `<Link>`). Elements listed in `excluded` are skipped,
and elements that already have a `data-source` attribute are left untouched. Fragments (`<>`) are never tagged.

The attribute value is `relative/path/to/file.tsx:line`, where `line` is the line of the element's opening `<`,
making it easy to locate any DOM node back to its source from DevTools.

### Before

```tsx
// src/components/Example.tsx
<div className="wrapper">
  <Pencil size={16} />
  <Dialog open={isOpen}>
    <DialogContent>Hello</DialogContent>
  </Dialog>
</div>
```

### After

```html
<div class="wrapper" data-source="src/components/Example.tsx:1">
  <svg xmlns="http://www.w3.org/2000/svg" data-source="src/components/Example.tsx:2">
  </svg>
  <div data-source="src/components/Example.tsx:3">
    <div data-source="src/components/Example.tsx:4">Hello</div>
  </div>
</div>
```

> Components that spread props to their root element (e.g. lucide-react icons,
> Radix UI primitives, react-router `<Link>`) will forward `data-source` to the DOM.
> Components that don't — simply ignore the extra prop; no runtime errors.

## Programmatic use

The transform is exported for use outside Vite (e.g. in a Rollup/Vitest/custom pipeline):

```ts
import { transformReactSource } from "vite-plugin-react-source-string";

const result = transformReactSource(code, "/abs/path/App.tsx", { root: process.cwd(), excluded: ["Fragment"] });
// result: { code, map } | null (null = nothing to change or unparseable)
```

## Development

```bash
pnpm install
pnpm test       # unit tests + a real Vite build
pnpm typecheck
pnpm build
```

## Related

- [swc-plugin-react-source-string](https://github.com/tanchu/swc-plugin-react-source) — SWC (Next.js / Rspack) equivalent
- [babel-plugin-react-source-string](https://github.com/tanchu/babel-plugin-react-source-string) — Babel equivalent

## License

MIT
