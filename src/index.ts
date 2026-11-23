//! Vite plugin: adds `data-source="path:line"` to every JSX opening element.
//! Native Vite port of `swc-plugin-react-source-string` (and the Babel plugin
//! `babel-plugin-react-source-string`): same options, same output.

import MagicString from "magic-string";
import { parseSync, Visitor } from "oxc-parser";
import type { JSXAttributeItem, JSXElementName, JSXOpeningElement } from "oxc-parser";
import type { FilterPattern, Plugin } from "vite";
import { createFilter } from "vite";
import { installReactSourceClient } from "./client";

export interface ReactSourceStringOptions {
  /** Component/element names to skip (case-insensitive). For `<Foo.Bar>` the name is `Bar`. */
  excluded?: string[];
  /**
   * Project root for relative paths. Defaults to Vite's resolved `root`
   * (the SWC plugin falls back to the host's cwd the same way).
   */
  root?: string;
  /**
   * Packages whose components get tagged (a subpath like `@mui/material/Button` matches `@mui/material`).
   * HTML elements are always tagged. Not set or empty: every component is tagged.
   */
  libraries?: string[];
  /**
   * Put the attribute before spread props, so a `data-source` passed in from the parent wins:
   * a wrapper like `<Button {...props} />` then points to where the wrapper is used, not to the wrapper file.
   */
  preferCallSite?: boolean;
  /**
   * In `vite serve`, add a tiny client to the page: Alt (Option) + hover highlights the element and shows
   * its `path:line`, Alt + click copies a prompt-ready reference for an AI agent, and
   * `window.__REACT_SOURCE__` lets browser agents look sources up with one JS call. Never added to builds.
   * Default: `true`.
   */
  overlay?: boolean;
  /** Files to transform. Default: `.js .jsx .mjs .cjs .tsx` (`.ts` cannot contain JSX). */
  include?: FilterPattern;
  /** Files to skip. Default: `node_modules`. */
  exclude?: FilterPattern;
}

const ATTR = "data-source";
const DEFAULT_INCLUDE = /\.(?:[cm]?jsx?|tsx)$/;
const DEFAULT_EXCLUDE = /[\\/]node_modules[\\/]/;

/** Turbopack-style ids look like `[project]/src/a.tsx`. Same as the SWC plugin. */
export function stripVirtualPrefix(filename: string): string {
  if (filename.startsWith("[")) {
    const pos = filename.indexOf("]/");
    if (pos !== -1) return filename.slice(pos + 2);
  }
  return filename;
}

/** Same semantics as the SWC plugin's `relative_path`. */
export function relativePath(cwd: string, filename: string): string {
  const base = cwd.replace(/\/+$/, "");
  const file = filename.replace(/\\/g, "/");
  return file.startsWith(base) ? file.slice(base.length).replace(/^\/+/, "") : file;
}

function elementName(name: JSXElementName): string | undefined {
  switch (name.type) {
    case "JSXIdentifier":
      return name.name;
    case "JSXMemberExpression":
      return name.property.name;
    case "JSXNamespacedName":
      return name.name.name;
    default:
      return undefined;
  }
}

/** `<Fragment>` and `<React.Fragment>` accept only `key` and `children`; React warns about any other prop. */
function isFragment(name: JSXElementName): boolean {
  if (name.type === "JSXIdentifier") return name.name === "Fragment";
  return name.type === "JSXMemberExpression" && name.property.name === "Fragment";
}

/** Same rule as the Babel and SWC plugins: the package itself or any of its subpaths. */
export function fromLibrary(source: string, libraries: Iterable<string>): boolean {
  for (const lib of libraries) {
    if (source === lib || source.startsWith(`${lib}/`)) return true;
  }
  return false;
}

/** The identifier that decides whether the element is a component: `UI` for `<UI.Button>`. */
function rootName(name: JSXElementName): string | undefined {
  switch (name.type) {
    case "JSXIdentifier":
      return name.name;
    case "JSXNamespacedName":
      return name.namespace.name;
    case "JSXMemberExpression": {
      let object = name.object;
      while (object.type === "JSXMemberExpression") object = object.object;
      return object.type === "JSXIdentifier" ? object.name : undefined;
    }
    default:
      return undefined;
  }
}

function isHtmlElement(name: JSXElementName): boolean {
  if (name.type === "JSXNamespacedName") return true;
  if (name.type !== "JSXIdentifier") return false;
  const first = name.name[0];
  return first === first.toLowerCase() && first !== first.toUpperCase();
}

function libraryImports(body: readonly { type: string }[], libraries: string[]): Set<string> {
  const imports = new Set<string>();
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") continue;
    const decl = statement as unknown as { source: { value: string }; specifiers: { local: { name: string } }[] };
    if (!fromLibrary(decl.source.value, libraries)) continue;
    for (const specifier of decl.specifiers) imports.add(specifier.local.name);
  }
  return imports;
}

function hasDataSource(attrs: JSXAttributeItem[]): boolean {
  return attrs.some(
    (a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === ATTR,
  );
}

function lineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13) {
      if (code.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** JSX string literals have no escapes, so fall back to an expression for odd paths. */
function attrValue(value: string): string {
  return /^[^"&<>{}\n\r]*$/.test(value) ? `"${value}"` : `{${JSON.stringify(value)}}`;
}

export interface TransformOptions {
  excluded?: Iterable<string>;
  /** Directory paths are made relative to; empty/undefined keeps them absolute. */
  root?: string;
  /** Tag only components imported from these packages; HTML elements are always tagged. */
  libraries?: string[];
  /** Insert the attribute before spread props, so a value passed from the parent wins. */
  preferCallSite?: boolean;
}

/**
 * Pure transform, usable outside Vite. Returns `null` when nothing changed or
 * the file could not be parsed.
 */
export function transformReactSource(
  code: string,
  id: string,
  options: TransformOptions = {},
): { code: string; map: ReturnType<MagicString["generateMap"]> } | null {
  if (!code.includes("<")) return null;

  const filename = id.split("?", 1)[0];
  const lang = /\.tsx$/i.test(filename) ? "tsx" : "jsx";
  const result = parseSync(filename, code, { lang, sourceType: "unambiguous" });
  if (result.errors.length > 0 || !result.program) return null;

  const excluded = new Set([...(options.excluded ?? [])].map((s) => s.toLowerCase()));
  const libraries = options.libraries ?? [];
  const imports = libraries.length > 0 ? libraryImports(result.program.body, libraries) : undefined;
  const display = stripVirtualPrefix(filename.replace(/\\/g, "/"));
  const source = options.root ? relativePath(options.root, display) : display;

  const s = new MagicString(code);
  let starts: number[] | undefined;

  new Visitor({
    JSXOpeningElement(el: JSXOpeningElement) {
      const name = elementName(el.name);
      if (name === undefined || isFragment(el.name) || excluded.has(name.toLowerCase())) return;
      if (hasDataSource(el.attributes)) return;
      if (imports && !isHtmlElement(el.name)) {
        const root = rootName(el.name);
        if (root === undefined || !imports.has(root)) return;
      }

      starts ??= lineStarts(code);
      const line = lineOf(starts, el.start);
      const afterName = el.typeArguments?.end ?? el.name.end;
      const last = el.attributes[el.attributes.length - 1];
      const at = options.preferCallSite || !last ? afterName : last.end;
      s.appendLeft(at, ` ${ATTR}=${attrValue(`${source}:${line}`)}`);
    },
  }).visit(result.program);

  if (!s.hasChanged()) return null;
  return { code: s.toString(), map: s.generateMap({ source: filename, hires: true }) };
}

export default function reactSourceString(options: ReactSourceStringOptions = {}): Plugin {
  const filter = createFilter(options.include ?? DEFAULT_INCLUDE, options.exclude ?? DEFAULT_EXCLUDE);
  const excluded = options.excluded ?? [];
  const libraries = options.libraries ?? [];
  const preferCallSite = options.preferCallSite ?? false;
  const overlay = options.overlay ?? true;
  let root = options.root || undefined;
  let serving = false;

  return {
    name: "vite-plugin-react-source-string",
    enforce: "pre",
    configResolved(config) {
      if (root === undefined) root = config.root;
      serving = config.command === "serve";
    },
    transformIndexHtml() {
      if (!overlay || !serving) return;
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `(${installReactSourceClient.toString()})(${JSON.stringify(ATTR)});`,
          injectTo: "head",
        },
      ];
    },
    transform(code, id) {
      if (!filter(id)) return null;
      return transformReactSource(code, id, { excluded, root, libraries, preferCallSite });
    },
  };
}

export { reactSourceString };
export type { ReactSourceApi, ReactSourceMatch } from "./client";
