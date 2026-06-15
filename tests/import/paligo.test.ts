/**
 * Paligo export importer tests — run against a REAL Paligo `<e:export>`
 * artifact (tests/fixtures/paligo/data-file.xml, an actual export pulled from a
 * public GitHub repo). Verifies the high-fidelity transfer-export import path
 * from MIGRATION_FIDELITY.md: text-fragment references resolve, structure and
 * tables survive, and output is canonical-clean.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePaligoExport } from "../../src/import/paligo";
import { tiptapToCanonical, collectUnknownTypes } from "../../src/canonical";

const xml = readFileSync(
  fileURLToPath(new URL("../fixtures/paligo/data-file.xml", import.meta.url)),
  "utf8",
);

describe("parsePaligoExport (real artifact)", () => {
  const result = parsePaligoExport(xml);

  it("reads the publication title", () => {
    expect(result.publicationTitle).toBe("Sample Publication");
  });

  it("produces one topic per component resource", () => {
    expect(result.topics).toHaveLength(2);
  });

  it("resolves topic titles from xinfo:text references", () => {
    expect(result.topics.map((t) => t.title)).toEqual([
      "Topic 1 with repeated text",
      "Topic 2 with repeated text",
    ]);
  });

  it("resolves a referenced paragraph's text (xinfo:text → text resource)", () => {
    const firstPara = result.topics[0].doc.content[0];
    expect(firstPara.type).toBe("paragraph");
    expect(firstPara.content?.[0].text).toBe(
      "Testing changing out repeated text to make it reused:",
    );
  });

  it("converts informaltable to a table, resolving header and body cells", () => {
    const table = result.topics[0].doc.content.find((n) => n.type === "table");
    expect(table).toBeDefined();
    const rows = table!.content!;
    expect(rows).toHaveLength(4); // 1 header row + 3 body rows

    const header = rows[0].content!;
    expect(header.map((c) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(header[0].content?.[0].content?.[0].text).toBe("Code");
    expect(header[1].content?.[0].content?.[0].text).toBe("Description");

    const firstBody = rows[1].content!;
    expect(firstBody.map((c) => c.type)).toEqual(["tableCell", "tableCell"]);
    expect(firstBody[0].content?.[0].content?.[0].text).toBe("123"); // literal cell
    expect(firstBody[1].content?.[0].content?.[0].text).toBe("Item description goes here"); // resolved ref
  });

  it("leaves no unresolved xinfo:text references in the output", () => {
    expect(JSON.stringify(result.topics)).not.toContain("xinfo");
  });

  it("output converts cleanly to the canonical model (no unknown node types)", () => {
    for (const t of result.topics) {
      const canon = tiptapToCanonical(t.doc);
      expect(collectUnknownTypes(canon.content).nodes).toEqual([]);
    }
  });

  it("creates no reuse components when fragments aren't shared by id", () => {
    // The real fixture repeats text *content* but each topic has its own
    // fragment *ids*, so nothing is reused-by-reference → no components.
    expect(result.components).toEqual([]);
  });

  it("throws on non-Paligo input", () => {
    expect(() => parsePaligoExport("<html></html>")).toThrow(/Paligo export/);
  });
});

// A synthetic export where one text fragment (id 100) is referenced by a
// paragraph in BOTH topics — i.e. genuine single-source reuse by reference.
const SHARED_FRAGMENT_EXPORT = `<?xml version="1.0" encoding="utf-8"?>
<e:export xmlns="http://docbook.org/ns/docbook" xmlns:e="http://ns.expertinfo.se/cms/xmlns/export/1.0" xmlns:xinfo="http://ns.expertinfo.se/cms/xmlns/1.0">
<e:structure><e:publication title="Reuse Sample" id="1"/></e:structure>
<e:resource id="100" type="text"><e:content>Shared safety note</e:content></e:resource>
<e:resource id="101" type="text"><e:content>Intro one</e:content></e:resource>
<e:resource id="200" type="component"><e:content>
<section xml:id="UUID-a"><title>Topic A</title><para xinfo:text="101"/><para xinfo:text="100"/></section>
</e:content></e:resource>
<e:resource id="201" type="component"><e:content>
<section xml:id="UUID-b"><title>Topic B</title><para xinfo:text="100"/></section>
</e:content></e:resource>
</e:export>`;

describe("parsePaligoExport (reuse detection)", () => {
  const result = parsePaligoExport(SHARED_FRAGMENT_EXPORT);

  it("lifts a fragment referenced by ≥2 paragraphs into a component", () => {
    expect(result.components).toHaveLength(1);
    expect(result.components[0].id).toBe("paligo-100");
    expect(result.components[0].doc.content[0].content?.[0].text).toBe("Shared safety note");
  });

  it("replaces each reused reference with a componentRef (reuse graph preserved, not flattened)", () => {
    const a = result.topics.find((t) => t.title === "Topic A")!;
    const b = result.topics.find((t) => t.title === "Topic B")!;
    // Topic A: para 101 (single-use → inlined) then para 100 (reused → componentRef).
    expect(a.doc.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Intro one" }] });
    expect(a.doc.content[1]).toEqual({ type: "componentRef", attrs: { componentId: "paligo-100", variableOverrides: {} } });
    // Topic B: its only para is the reused fragment → componentRef.
    expect(b.doc.content[0]).toEqual({ type: "componentRef", attrs: { componentId: "paligo-100", variableOverrides: {} } });
  });

  it("leaves single-use fragments inlined as text", () => {
    const a = result.topics.find((t) => t.title === "Topic A")!;
    expect(JSON.stringify(a.doc)).toContain("Intro one");
    expect(result.components.some((c) => c.title === "Intro one")).toBe(false);
  });

  it("componentRef output is canonical-valid", async () => {
    const { tiptapToCanonical, validateCanonical } = await import("../../src/canonical");
    for (const t of result.topics) {
      expect(validateCanonical(tiptapToCanonical(t.doc).content)).toEqual([]);
    }
  });
});
