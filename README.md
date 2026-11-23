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
    reactSourceString({ excluded: ["Slot"] }),
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
    command === "serve" && reactSourceString({ excluded: ["Slot"] }),
    react(),
  ],
}));
```

## Compatibility

Vite 5, 6, 7 and 8 (including Rolldown-based Vite). The supported range is declared in `peerDependencies`.
CI builds a fixture app with the plugin on each of these majors, on the newest Vite release and on the current
Vite beta, on every pull request and every Monday, so a breaking Vite release is caught before you hit it.

## Plugin options

| Option     | Type            | Default                       | Description                                                                 |
| ---------- | --------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `excluded` | `string[]`      | `[]`                          | Component/element names to skip (case-insensitive). For `<UI.Button>` the name is `Button`. |
| `root`     | `string`        | Vite's resolved `root`        | Project root for relative paths.                                            |
| `libraries` | `string[]`     | — (tag all)                   | Tag only components imported from these packages or their subpaths (`@mui/material/Button` matches `@mui/material`); HTML elements are always tagged. |
| `preferCallSite` | `boolean` | `false` | Put the attribute before spread props, so a `data-source` passed in from the parent wins: wrapper components point to where they are used. See [Call site or wrapper](#call-site-or-wrapper-prefercallsite). |
| `overlay` | `boolean` | `true` | In `vite serve`, Alt (Option) + click on an element copies its `path:line` for a prompt, and `window.__REACT_SOURCE__` lets browser agents look sources up. Never added to builds. See [For AI coding agents](#for-ai-coding-agents). |
| `include`  | `FilterPattern` | `/\.(?:[cm]?jsx?\|tsx)$/`     | Files to transform (`.ts` can't contain JSX).                               |
| `exclude`  | `FilterPattern` | `/[\\/]node_modules[\\/]/`    | Files to skip.                                                              |

## How it works

The plugin adds a `data-source` attribute to **every** JSX opening element — both HTML tags (`<div>`, `<span>`)
and React components (`<Dialog>`, `<Pencil>`, `<Link>`). Elements listed in `excluded` are skipped;
with `libraries` set, only components imported from those packages are tagged; elements that already have
a `data-source` attribute are left untouched. Fragments are never tagged: `<>`, `<Fragment>` and `<React.Fragment>` accept only `key` and `children`, and React warns about any other prop.

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

## Call site or wrapper: `preferCallSite`

By default the attribute points to the JSX in your code that renders the DOM node. With wrapper components
that is the wrapper's own file:

```tsx
// src/components/MyButton.tsx
export function MyButton(props) {
  return <Button variant="contained" {...props} />;   // line 2
}

// src/pages/Checkout.tsx
<MyButton onClick={pay}>Pay</MyButton>                // line 42
```

Both elements are tagged. `<MyButton>` gets `data-source="src/pages/Checkout.tsx:42"` and passes it down through
`{...props}`, but inside the wrapper the plugin adds its own attribute *after* the spread, so it overrides the one
from the page. The DOM shows `src/components/MyButton.tsx:2`.

With `preferCallSite: true` the plugin puts its attribute *before* spread props, so a value coming from the parent
wins and the DOM shows `src/pages/Checkout.tsx:42`:

```js
// vite.config.ts
export default defineConfig({
  plugins: [reactSourceString({ preferCallSite: true }), react()],
});
```

- Elements without spread props are tagged exactly as before.
- With several wrappers that all spread their props (`Page` → `Toolbar` → `MyButton` → `Button`), the outermost call site wins.
- A wrapper that does not pass its props on to the DOM element (picks `className`, `onClick` explicitly) keeps pointing to itself: the value from the call site never reaches the DOM.

**When it helps**

- **Design systems and UI kits.** A shared `<MyButton>` or `<Card>` is used hundreds of times. The default only tells you
  "this is MyButton"; the call site tells you which screen and which line rendered *this* button.
- **Bug reports and QA.** Copy the attribute of a broken element from DevTools and you land in the page code that
  configures it — its props, text and handlers — instead of the shared component.
- **AI coding agents.** Point an agent at an element on the page and it edits that usage (say, the label on the checkout
  page) rather than changing a wrapper that the whole app depends on.

Keep the default when you are working on the wrappers themselves: then you want to land in the wrapper's file.

## For AI coding agents

The attribute is in the DOM, but most browser agents never see it: Playwright MCP snapshots and the
page readers of agent browsers show the accessibility tree (`button "Pay"`), and `data-*` attributes are
not part of it. There are two ways to get the source to the agent.

**You point at it.** In `vite serve`, hold Alt (Option on macOS): the element under the cursor is outlined
with its `path:line`. Alt + click copies a reference you can paste into the prompt, without triggering the
element:

```text
src/pages/Checkout.tsx:42 <button> "Pay"
inside: src/pages/Checkout.tsx:30 ← src/App.tsx:12
```

**The agent looks it up.** Agents that can run JavaScript in the page (Playwright MCP `browser_evaluate`,
Claude in Chrome and similar tools) get one call:

```js
__REACT_SOURCE__.find("Pay");          // [{ source: "src/pages/Checkout.tsx:42", tag: "button", text: "Pay" }]
__REACT_SOURCE__.of("form button");    // "src/pages/Checkout.tsx:42" (an element or a CSS selector)
__REACT_SOURCE__.stack(element);       // ["src/pages/Checkout.tsx:42", "src/pages/Checkout.tsx:30", "src/App.tsx:12"]
__REACT_SOURCE__.describe(element);    // the text Alt + click copies
```

Add a rule so the agent knows about it (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules`):

```md
The dev build tags every JSX element with `data-source="path:line"`.
To find the code behind something on the page, run `__REACT_SOURCE__.find("<visible text>")`
in the browser (or read the element's `data-source`) and open that file at that line
instead of searching the repository.
```

With wrapper components (a shared `<MyButton>`), turn on [`preferCallSite`](#call-site-or-wrapper-prefercallsite)
so the reference points to the page that uses the wrapper.

The overlay is added to `index.html` in `vite serve` only. Frameworks that render their own HTML can load it
from the client entry:

```ts
import { installReactSourceClient } from "vite-plugin-react-source-string/client";

if (import.meta.env.DEV) installReactSourceClient("data-source");
```

## Programmatic use

The transform is exported for use outside Vite (e.g. in a Rollup/Vitest/custom pipeline):

```ts
import { transformReactSource } from "vite-plugin-react-source-string";

const result = transformReactSource(code, "/abs/path/App.tsx", { root: process.cwd(), excluded: ["Slot"] });
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
