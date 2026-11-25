# Working on vite-plugin-react-source-string

A Vite plugin that adds `data-source="path:line"` to every JSX element, plus an optional dev overlay (`overlay: true`). It has the same options and output as [swc-plugin-react-source-string](https://github.com/tanchu/swc-plugin-react-source) and [babel-plugin-react-source-string](https://github.com/tanchu/babel-plugin-react-source-string).

## Layout

- `src/index.ts`: the plugin and `transformReactSource`. Parses with `oxc-parser`, rewrites with `magic-string` (with source maps).
- `src/client.ts`: the overlay runtime, `installReactSourceClient(attr)`: Alt + hover, Alt + click to copy, `window.__REACT_SOURCE__`.
- `test/transform.test.ts`, `test/client.test.ts` (jsdom), `test/vite-build.test.ts` (a real build of `test/fixture`), `test/compat/` (the Vite version matrix in CI).
- `scripts/gen-overlay.mjs`: copies the built overlay into the Babel and SWC plugins.

## Commands

```bash
pnpm install
pnpm test        # unit tests + a real Vite build
pnpm typecheck
pnpm build
```

## Rules

- **`src/client.ts` is the only source of the overlay.** Vite serializes `installReactSourceClient` with `Function.prototype.toString` into an inline script, and the Babel and SWC plugins ship the same function as `overlay.js`. Keep it self-contained: no imports, nothing from module scope, browser APIs only.
- **After changing the overlay, update the copies:**

  ```bash
  pnpm build
  node scripts/gen-overlay.mjs ../babel-plugin-react-source-string/overlay.js ../swc-plugin-react-source/overlay.js
  ```

  Then open PRs in those repositories (the SWC plugin's working branch is `next-16`).
- **Options and output stay identical across the three plugins.** A new option or a change to what gets tagged needs the same change in the Babel and SWC plugins, and in the agent skill at [tanchu/react-source-skills](https://github.com/tanchu/react-source-skills).
- **Do not move the source into accessibility attributes** (`title`, `aria-*`). `title` can replace the accessible name and breaks screen readers and role-based tests. The overlay exists for this reason.
- **The overlay must never reach a build.** It is injected through `transformIndexHtml` in `vite serve` only.
- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/).** release-please reads them: `fix:` makes a patch release, `feat:` a minor one, `docs:`, `test:`, `ci:` and `chore:` make none. Merging the release PR publishes to npm, so leave that to the maintainer.
