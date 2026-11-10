import { describe, expect, it } from "vitest";
import { relativePath, stripVirtualPrefix, transformReactSource } from "../src/index";

const t = (code: string, id = "/proj/src/App.tsx", opts: Parameters<typeof transformReactSource>[2] = { root: "/proj" }) =>
  transformReactSource(code, id, opts)?.code ?? null;

describe("transformReactSource", () => {
  it("tags HTML elements and components with path:line", () => {
    const out = t(`export const A = () => (\n  <div className="w">\n    <Pencil size={16} />\n  </div>\n);`);
    expect(out).toContain(`<div className="w" data-source="src/App.tsx:2">`);
    expect(out).toContain(`<Pencil size={16} data-source="src/App.tsx:3" />`);
  });

  it("handles elements without attributes, member and namespaced names, type args", () => {
    const out = t(`const a = <main><UI.Button/><svg:rect></svg:rect><Gen<string>/></main>;`);
    expect(out).toBe(
      `const a = <main data-source="src/App.tsx:1"><UI.Button data-source="src/App.tsx:1"/><svg:rect data-source="src/App.tsx:1"></svg:rect><Gen<string> data-source="src/App.tsx:1"/></main>;`,
    );
  });

  it("skips excluded names case-insensitively (member expr uses the last part)", () => {
    const out = t(`const a = <><Fragment><React.fragment><slot/></React.fragment></Fragment><b/></>;`, undefined, {
      root: "/proj",
      excluded: ["Fragment", "Slot"],
    });
    expect(out).toBe(`const a = <><Fragment><React.fragment><slot/></React.fragment></Fragment><b data-source="src/App.tsx:1"/></>;`);
  });

  it("keeps an existing data-source attribute", () => {
    expect(t(`const a = <div data-source="x" />;`)).toBeNull();
  });

  it("does not treat a spread as data-source", () => {
    expect(t(`const a = <div {...p} />;`)).toBe(`const a = <div {...p} data-source="src/App.tsx:1" />;`);
  });

  it("emits absolute paths without root and strips query strings", () => {
    expect(t(`<i/>`, "/abs/x.jsx?v=123", {})).toBe(`<i data-source="/abs/x.jsx:1"/>`);
  });

  it("counts lines across CRLF and multi-line openers (uses the `<` line)", () => {
    expect(t(`const a = 1;\r\nconst b = (\r\n  <div\r\n    id="x"\r\n  />\r\n);`)).toContain(`id="x" data-source="src/App.tsx:3"`);
  });

  it("parses .js files as JSX and returns null on parse errors", () => {
    expect(t(`export default () => <p/>;`, "/proj/a.js")).toBe(`export default () => <p data-source="a.js:1"/>;`);
    expect(t(`const = <`)).toBeNull();
  });

  it("produces a source map", () => {
    const r = transformReactSource(`<a/>`, "/proj/a.jsx", { root: "/proj" });
    expect(r?.map.mappings).toBeTruthy();
  });
});

describe("path helpers (parity with the SWC plugin)", () => {
  it("stripVirtualPrefix", () => {
    expect(stripVirtualPrefix("[project]/src/a.tsx")).toBe("src/a.tsx");
    expect(stripVirtualPrefix("/src/a.tsx")).toBe("/src/a.tsx");
  });
  it("relativePath", () => {
    expect(relativePath("/proj/", "/proj/src/a.tsx")).toBe("src/a.tsx");
    expect(relativePath("C:/proj", "C:\\proj\\a.tsx")).toBe("a.tsx");
    expect(relativePath("/other", "/proj/a.tsx")).toBe("/proj/a.tsx");
  });
});
