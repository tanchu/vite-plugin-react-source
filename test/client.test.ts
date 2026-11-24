// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { installReactSourceClient } from "../src/client";

beforeAll(() => {
  document.body.innerHTML = `
    <main data-source="src/App.tsx:6">
      <section data-source="src/App.tsx:8">
        <p data-source="src/App.tsx:9">Total: 42 €</p>
        <button data-source="src/pages/Checkout.tsx:42"><span>Pay</span></button>
        <a href="/terms" data-source="src/App.tsx:11">Terms</a>
        <img data-source="src/App.tsx:12" alt="Red sneakers" src="sneakers.png">
        <button data-source="src/App.tsx:13" aria-label="Close dialog">×</button>
        <a href="/search" data-source="src/App.tsx:14"><img alt="Search" src="search.svg"></a>
      </section>
    </main>`;
  installReactSourceClient("data-source");
});

describe("window.__REACT_SOURCE__", () => {
  it("of: the element or its nearest tagged ancestor", () => {
    expect(window.__REACT_SOURCE__!.of("button span")).toBe("src/pages/Checkout.tsx:42");
    expect(window.__REACT_SOURCE__!.of("body")).toBeNull();
  });

  it("stack: distinct sources from the element up to the root", () => {
    expect(window.__REACT_SOURCE__!.stack("a")).toEqual(["src/App.tsx:11", "src/App.tsx:8", "src/App.tsx:6"]);
  });

  it("find: innermost elements whose text matches, case-insensitive", () => {
    expect(window.__REACT_SOURCE__!.find("pay")).toEqual([
      { source: "src/pages/Checkout.tsx:42", tag: "button", text: "Pay" },
    ]);
  });

  it("find: images and icon buttons by the name agents see (alt, aria-label)", () => {
    expect(window.__REACT_SOURCE__!.find("sneakers")).toEqual([
      { source: "src/App.tsx:12", tag: "img", text: "Red sneakers" },
    ]);
    expect(window.__REACT_SOURCE__!.find("close")).toEqual([
      { source: "src/App.tsx:13", tag: "button", text: "Close dialog" },
    ]);
    expect(window.__REACT_SOURCE__!.find("search")).toEqual([
      { source: "src/App.tsx:14", tag: "a", text: "Search" },
    ]);
  });

  it("describe: an image gets its alt text", () => {
    expect(window.__REACT_SOURCE__!.describe("img")).toBe(
      `src/App.tsx:12 <img> "Red sneakers"\ninside: src/App.tsx:8 ← src/App.tsx:6`
    );
  });

  it("describe: a prompt-ready reference", () => {
    expect(window.__REACT_SOURCE__!.describe("button")).toBe(
      `src/pages/Checkout.tsx:42 <button> "Pay"\ninside: src/App.tsx:8 ← src/App.tsx:6`
    );
  });

  it("does not install twice", () => {
    const api = window.__REACT_SOURCE__;
    installReactSourceClient("data-source");
    expect(window.__REACT_SOURCE__).toBe(api);
  });
});

describe("Alt + click", () => {
  it("swallows the click instead of running the element's handler", () => {
    let handled = 0;
    const button = document.querySelector("button")!;
    button.addEventListener("click", () => handled++);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, altKey: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(handled).toBe(0);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(handled).toBe(1);
  });
});
