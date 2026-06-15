/**
 * Unit tests for the canonical model ↔ HDITA adapter (Phase 1 of
 * own-model-canonical). See ../../TEST_PLAN.md and
 * ../../../docs/strategy/CANONICAL_MODEL.md.
 *
 * Tests verify the user-facing promise: "A user's content survives a
 * round-trip through the canonical/HDITA format with no loss." Concretely:
 * - the TipTap↔canonical adapter is lossless,
 * - HDITA serialization emits the expected HTML5 + data-* shapes,
 * - the full tiptap→canonical→hdita→canonical→tiptap round-trip is lossless.
 */

import { describe, it, expect } from "vitest";
import {
  tiptapToCanonical,
  canonicalToTiptap,
  collectUnknownTypes,
  CANONICAL_SCHEMA_VERSION,
} from "../../src/canonical";
import {
  canonicalToHdita,
  hditaToCanonical,
} from "../../src/hdita";
import type { JSONContent } from "@tiptap/core";

// --- Fixture: a document exercising every canonical node + mark type ---
// In normalized form (no default/null attrs) so round-trip equality is exact.

const ALL_TYPES_DOC: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "code", marks: [{ type: "code" }] },
        { type: "text", text: " " },
        { type: "text", text: "struck", marks: [{ type: "strike" }] },
        { type: "text", text: " " },
        { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        { type: "hardBreak" },
        { type: "variableToken", attrs: { key: "product_name" } },
        { type: "inlineComponentRef", attrs: { componentId: "comp-1", variableOverrides: {} } },
        { type: "topicLink", attrs: { topicId: "topic-9" } },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "combined", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "text", text: "<escaped> & \"quoted\"" },
      ],
    },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quote" }] }] },
    { type: "horizontalRule" },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "c" }] }] },
      ],
    },
    {
      type: "definitionList",
      content: [
        {
          type: "definitionItem",
          content: [
            { type: "definitionTerm", content: [{ type: "text", text: "term" }] },
            { type: "definitionDescription", content: [{ type: "paragraph", content: [{ type: "text", text: "def" }] }] },
          ],
        },
      ],
    },
    { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const x = 1 < 2;" }] },
    {
      type: "codeGroup",
      content: [
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "let y: number" }] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H1" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H2" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "r1c1" }] }] },
            { type: "tableCell", attrs: { colspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "spanned" }] }] },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: "/img/a.png", alt: "alt text", title: "a title" } },
    {
      type: "callout",
      attrs: { variant: "warning" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "watch out" }] }],
    },
    {
      type: "conditionalBlock",
      attrs: {
        dimensionId: "dim-1",
        dimensionName: "Audience",
        valueIds: ["v1", "v2"],
        valueLabels: ["Admin", "Dev"],
        color: "#6366f1",
        logic: "include",
      },
      content: [{ type: "paragraph", content: [{ type: "text", text: "for admins" }] }],
    },
    { type: "componentRef", attrs: { componentId: "comp-42", variableOverrides: { product_name: "Topicary" } } },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "conditional inline",
          marks: [
            {
              type: "conditionalInline",
              attrs: {
                dimensionId: "dim-2",
                dimensionName: "Platform",
                valueIds: ["m"],
                valueLabels: ["Mac"],
                color: "#10b981",
                logic: "include",
              },
            },
          ],
        },
      ],
    },
  ],
};

// --- U-001: TipTap ↔ canonical adapter ---

describe("tiptapToCanonical / canonicalToTiptap", () => {
  it("stamps the current schema version", () => {
    const canon = tiptapToCanonical(ALL_TYPES_DOC);
    expect(canon.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it("round-trips a TipTap doc through the canonical model losslessly", () => {
    const back = canonicalToTiptap(tiptapToCanonical(ALL_TYPES_DOC));
    expect(back).toEqual(ALL_TYPES_DOC);
  });

  it("produces a valid doc root", () => {
    const back = canonicalToTiptap(tiptapToCanonical(ALL_TYPES_DOC));
    expect(back.type).toBe("doc");
    expect(Array.isArray(back.content)).toBe(true);
  });
});

// --- U-002: vocabulary validation ---

describe("collectUnknownTypes", () => {
  it("passes a document using only canonical types", () => {
    const { nodes, marks } = collectUnknownTypes(ALL_TYPES_DOC);
    expect(nodes).toEqual([]);
    expect(marks).toEqual([]);
  });

  it("flags a node type outside the closed vocabulary", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "mermaidDiagram" }] };
    expect(collectUnknownTypes(doc).nodes).toContain("mermaidDiagram");
  });

  it("flags a mark type outside the closed vocabulary", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "highlight" }] }] }],
    };
    expect(collectUnknownTypes(doc).marks).toContain("highlight");
  });
});

// --- U-003: HDITA serialization (golden — the §4 mapping) ---

describe("canonicalToHdita", () => {
  const hdita = (doc: JSONContent) => canonicalToHdita(tiptapToCanonical(doc));

  it("wraps the document in an <article>", () => {
    expect(hdita({ type: "doc", content: [] })).toBe("<article></article>");
  });

  it("maps componentRef to data-conref", () => {
    const out = hdita({ type: "doc", content: [{ type: "componentRef", attrs: { componentId: "c1", variableOverrides: {} } }] });
    expect(out).toContain('data-conref="c1"');
  });

  it("maps variableToken to data-keyref", () => {
    const out = hdita({ type: "doc", content: [{ type: "paragraph", content: [{ type: "variableToken", attrs: { key: "k1" } }] }] });
    expect(out).toContain('data-keyref="k1"');
  });

  it("maps callout to data-class=note with note type", () => {
    const out = hdita({ type: "doc", content: [{ type: "callout", attrs: { variant: "danger" }, content: [] }] });
    expect(out).toContain('data-class="note"');
    expect(out).toContain('data-note-type="danger"');
  });

  it("maps conditionalBlock to data-props plus raw carriers", () => {
    const out = hdita({
      type: "doc",
      content: [{
        type: "conditionalBlock",
        attrs: { dimensionId: "d", dimensionName: "Audience", valueIds: ["v"], valueLabels: ["Admin"], color: "#000", logic: "include" },
        content: [],
      }],
    });
    expect(out).toContain('data-props="Audience=Admin"');
    expect(out).toContain('data-dimension-id="d"');
  });

  it("escapes special characters in text", () => {
    const out = hdita({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a < b & c" }] }] });
    expect(out).toContain("a &lt; b &amp; c");
  });
});

// --- U-004: full round-trip (the headline lossless gate) ---

describe("tiptap → canonical → hdita → canonical → tiptap", () => {
  it("is lossless for a document using every node and mark type", async () => {
    const canon = tiptapToCanonical(ALL_TYPES_DOC);
    const html = canonicalToHdita(canon);
    const reparsed = await hditaToCanonical(html);
    const back = canonicalToTiptap(reparsed);
    expect(back).toEqual(ALL_TYPES_DOC);
  });
});
