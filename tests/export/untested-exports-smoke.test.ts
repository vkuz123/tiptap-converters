import { describe, it, expect } from "vitest";
import {
  renderDitaMap,
  renderBookmap,
  renderReltable,
} from "../../src/export/dita";
import { renderToHTML, extractHeadings } from "../../src/export/html";

// Smoke coverage for exports that shipped without any tests. These assert real
// output shape (not just "does not throw") so a regression in the map/bookmap/
// reltable/HTML paths is caught.

describe("renderDitaMap", () => {
  it("emits a DITA map with title and nested topicrefs", () => {
    const xml = renderDitaMap("Guide", [
      {
        href: "intro.dita",
        navtitle: "Intro",
        children: [{ href: "setup.dita", navtitle: "Setup", children: [] }],
      },
    ]);
    expect(xml).toContain('<!DOCTYPE map PUBLIC "-//OASIS//DTD DITA Map//EN"');
    expect(xml).toContain("<title>Guide</title>");
    expect(xml).toContain('href="intro.dita"');
    expect(xml).toContain('href="setup.dita"');
  });

  it("escapes special characters in the title", () => {
    expect(renderDitaMap("A & B <c>", [])).toContain(
      "<title>A &amp; B &lt;c&gt;</title>",
    );
  });
});

describe("renderBookmap", () => {
  it("emits a bookmap with mainbooktitle", () => {
    const xml = renderBookmap("Manual", [
      { href: "ch1.dita", navtitle: "Chapter 1", children: [] },
    ]);
    expect(xml).toContain(
      '<!DOCTYPE bookmap PUBLIC "-//OASIS//DTD DITA BookMap//EN"',
    );
    expect(xml).toContain("<mainbooktitle>Manual</mainbooktitle>");
    expect(xml).toContain('href="ch1.dita"');
  });
});

describe("renderReltable", () => {
  it("renders rows, cells, and topicrefs", () => {
    const out = renderReltable({
      rows: [{ cells: [{ hrefs: ["a.dita"] }, { hrefs: ["b.dita", "c.dita"] }] }],
    });
    expect(out).toContain("<reltable>");
    expect(out).toContain("<relrow>");
    expect(out).toContain('<topicref href="a.dita" />');
    expect(out).toContain('<topicref href="c.dita" />');
  });

  it("emits a self-closing relcell when a cell has no hrefs", () => {
    const out = renderReltable({ rows: [{ cells: [{ hrefs: [] }] }] });
    expect(out).toContain("<relcell />");
  });
});

describe("renderToHTML", () => {
  it("renders a TipTap doc to sanitized HTML", () => {
    const html = renderToHTML({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
    expect(html).toContain("Hello world");
    expect(html).toContain("<p>");
  });

  it("output is run through the sanitizer (no javascript: links survive)", () => {
    const html = renderToHTML({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    });
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).toContain("link");
  });
});

describe("extractHeadings", () => {
  it("collects headings with slugified, de-duplicated ids", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Getting Started" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Setup" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Setup" }] },
      ],
    };
    const headings = extractHeadings(doc);
    expect(headings).toEqual([
      { id: "getting-started", text: "Getting Started", level: 1 },
      { id: "setup", text: "Setup", level: 2 },
      { id: "setup-1", text: "Setup", level: 2 },
    ]);
  });
});
