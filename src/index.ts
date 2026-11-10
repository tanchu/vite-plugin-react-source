//! Vite plugin: adds `data-source="path:line"` to every JSX opening element.
//! Native Vite port of `swc-plugin-react-source-string` (and the Babel plugin
//! `babel-plugin-react-source-string`): same options, same output.

import MagicString from "magic-string";
import { parseSync, Visitor } from "oxc-parser";
import type { JSXAttributeItem, JSXElementName, JSXOpeningElement } from "oxc-parser";
import type { FilterPattern, Plugin } from "vite";
import { createFilter } from "vite";

export interface ReactSourceStringOptions {
  /** Component/element names to skip (case-insensitive). For `<Foo.Bar>` the name is `Bar`. */
  excluded?: string[];
  /**
   * Project root for relative paths. Defaults to Vite's resolved `root`
   * (the SWC plugin falls back to the host's cwd the same way).
   */
  root?: string;
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
  const display = stripVirtualPrefix(filename.replace(/\\/g, "/"));
  const source = options.root ? relativePath(options.root, display) : display;

  const s = new MagicString(code);
  let starts: number[] | undefined;

  new Visitor({
    JSXOpeningElement(el: JSXOpeningElement) {
      const name = elementName(el.name);
      if (name === undefined || excluded.has(name.toLowerCase())) return;
      if (hasDataSource(el.attributes)) return;

      starts ??= lineStarts(code);
      const line = lineOf(starts, el.start);
      const last = el.attributes[el.attributes.length - 1];
      const at = last ? last.end : (el.typeArguments?.end ?? el.name.end);
      s.appendLeft(at, ` ${ATTR}=${attrValue(`${source}:${line}`)}`);
    },
  }).visit(result.program);

  if (!s.hasChanged()) return null;
  return { code: s.toString(), map: s.generateMap({ source: filename, hires: true }) };
}

export default function reactSourceString(options: ReactSourceStringOptions = {}): Plugin {
  const filter = createFilter(options.include ?? DEFAULT_INCLUDE, options.exclude ?? DEFAULT_EXCLUDE);
  const excluded = options.excluded ?? [];
  let root = options.root || undefined;

  return {
    name: "vite-plugin-react-source-string",
    enforce: "pre",
    configResolved(config) {
      if (root === undefined) root = config.root;
    },
    transform(code, id) {
      if (!filter(id)) return null;
      return transformReactSource(code, id, { excluded, root });
    },
  };
}

export { reactSourceString };
