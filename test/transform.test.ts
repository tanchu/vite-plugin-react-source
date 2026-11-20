import { describe, expect, it } from "vitest";
import { fromLibrary, relativePath, stripVirtualPrefix, transformReactSource } from "../src/index";

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

  it("never tags Fragment or React.Fragment, even without options", () => {
    expect(t(`const a = <Fragment><React.Fragment key="k"><b/></React.Fragment></Fragment>;`, undefined, {})).toBe(
      `const a = <Fragment><React.Fragment key="k"><b data-source="/proj/src/App.tsx:1"/></React.Fragment></Fragment>;`,
    );
    expect(t(`const a = <Fragments/>;`)).toBe(`const a = <Fragments data-source="src/App.tsx:1"/>;`);
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

  it("with libraries, tags HTML elements and only components imported from those packages", () => {
    const out = t(
      [
        `import { Button } from "@mui/material";`,
        `import Card from "@mui/material/Card";`,
        `import * as UI from "@mui/material";`,
        `import { Pencil } from "lucide-react";`,
        `const a = <div><Button/><Card/><UI.Chip/><Pencil/><Local/><svg:rect/></div>;`,
      ].join("\n"),
      undefined,
      { root: "/proj", libraries: ["@mui/material"] },
    );
    expect(out).toContain(
      `<div data-source="src/App.tsx:5"><Button data-source="src/App.tsx:5"/><Card data-source="src/App.tsx:5"/><UI.Chip data-source="src/App.tsx:5"/><Pencil/><Local/><svg:rect data-source="src/App.tsx:5"/></div>`,
    );
  });

  it("with libraries, excluded still wins; an empty list tags every component", () => {
    expect(
      t(`import { Button } from "@mui/material";\nconst a = <p><Button/></p>;`, undefined, {
        root: "/proj",
        libraries: ["@mui/material"],
        excluded: ["button", "P"],
      }),
    ).toBeNull();
    expect(t(`const a = <Local/>;`, undefined, { root: "/proj", libraries: [] })).toBe(
      `const a = <Local data-source="src/App.tsx:1"/>;`,
    );
  });

  it("by default the attribute goes after spread props (the wrapper file wins)", () => {
    expect(t(`const B = (props) => <Button variant="x" {...props} />;`)).toBe(
      `const B = (props) => <Button variant="x" {...props} data-source="src/App.tsx:1" />;`,
    );
  });

  it("preferCallSite puts the attribute first, so a data-source from the call site wins", () => {
    const opts = { root: "/proj", preferCallSite: true };
    expect(t(`const B = (props) => <Button variant="x" {...props} />;`, undefined, opts)).toBe(
      `const B = (props) => <Button data-source="src/App.tsx:1" variant="x" {...props} />;`,
    );
    expect(t(`const a = <Gen<string> {...p}/>;`, undefined, opts)).toBe(
      `const a = <Gen<string> data-source="src/App.tsx:1" {...p}/>;`,
    );
    expect(t(`const a = <i/>;`, undefined, opts)).toBe(`const a = <i data-source="src/App.tsx:1"/>;`);
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
  it("fromLibrary", () => {
    expect(fromLibrary("@mui/material", ["@mui/material"])).toBe(true);
    expect(fromLibrary("@mui/material/Button", ["@mui/material"])).toBe(true);
    expect(fromLibrary("@mui/material-next", ["@mui/material"])).toBe(false);
    expect(fromLibrary("@mui/icons-material", ["@mui"])).toBe(true);
  });
  it("relativePath", () => {
    expect(relativePath("/proj/", "/proj/src/a.tsx")).toBe("src/a.tsx");
    expect(relativePath("C:/proj", "C:\\proj\\a.tsx")).toBe("a.tsx");
    expect(relativePath("/other", "/proj/a.tsx")).toBe("/proj/a.tsx");
  });
});
