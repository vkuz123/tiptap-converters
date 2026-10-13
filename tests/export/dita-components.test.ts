import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  renderToDita,
  renderComponentWarehouse,
  renderDitaMap,
  type DitaComponentInfo,
  type DitaContext,
} from "../../src/export/dita";

// A component authored in Topicary has no conrefPath. Before 2026-10-13 the
// DITA export wrote `<!-- Component: id -->` for it and the text was lost.

const warning: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Disconnect power before servicing " }, { type: "variableToken", attrs: { key: "product" } }, { type: "text", text: "." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Wear gloves" }] }] }] },
  ],
};

function topicWith(node: JSONContent): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Intro." }] }, node] };
}

function ctx(extra: Partial<DitaContext> = {}): DitaContext {
  const componentMap = new Map<string, DitaComponentInfo>([
    ["c1", { title: "Safety warning", content: warning }],
    ["imported", { title: "Imported", conrefPath: "shared.dita#shared" }],
    ["nocontent", { title: "Lost" }],
  ]);
  return { componentMap, variableMap: new Map([["product", "the X100"]]), ...extra };
}

describe("DITA export — natively authored components", () => {
  it("block component with a warehouse exports a div conref, and the warehouse holds the text", () => {
    const xml = renderToDita({ id: "t", title: "T", topicType: "concept", doc: topicWith({ type: "componentRef", attrs: { componentId: "c1" } }), context: ctx({ componentWarehouse: "_components.dita" }) });
    expect(xml).toContain('<div conref="_components.dita#components/c-c1" />');
    expect(xml).not.toContain("<!-- Component");

    const warehouse = renderComponentWarehouse([{ id: "c1", title: "Safety warning", content: warning }], ctx());
    expect(warehouse).toContain('<topic id="components">');
    expect(warehouse).toContain('<div id="c-c1" outputclass="component">');
    expect(warehouse).toContain("Disconnect power before servicing <keyword keyref=\"product\">the X100</keyword>.");
    expect(warehouse).toContain("Wear gloves");
    expect(warehouse).toContain('<ph id="ci-c1">');
  });

  it("block component without a warehouse writes its content inline", () => {
    const xml = renderToDita({ id: "t", title: "T", topicType: "concept", doc: topicWith({ type: "componentRef", attrs: { componentId: "c1" } }), context: ctx() });
    expect(xml).toContain("Disconnect power before servicing");
    expect(xml).toMatch(/<li>\s*<p>Wear gloves<\/p>\s*<\/li>/);
    expect(xml).not.toContain("conref");
    expect(xml).not.toContain("<!-- Component");
  });

  it("per-instance variable overrides are written inline, never conref'd to the shared base", () => {
    const ref = { type: "componentRef", attrs: { componentId: "c1", variableOverrides: { product: "the X200" } } };
    const xml = renderToDita({ id: "t", title: "T", topicType: "concept", doc: topicWith(ref), context: ctx({ componentWarehouse: "_components.dita" }) });
    expect(xml).toContain('<keyword keyref="product">the X200</keyword>');
    expect(xml).not.toContain("conref");
  });

  it("inline component exports a ph conref with a warehouse, inline text without one", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Note: " }, { type: "inlineComponentRef", attrs: { componentId: "c1" } }] }] };
    const withWarehouse = renderToDita({ id: "t", title: "T", topicType: "concept", doc, context: ctx({ componentWarehouse: "../_components.dita" }) });
    expect(withWarehouse).toContain('<p>Note: <ph conref="../_components.dita#components/ci-c1" /></p>');
    const without = renderToDita({ id: "t", title: "T", topicType: "concept", doc, context: ctx() });
    expect(without).toContain('<p>Note: Disconnect power before servicing <keyword keyref="product">the X100</keyword>.</p>');
  });

  it("DITA-imported components keep their original conref; components with no content keep the placeholder", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "componentRef", attrs: { componentId: "imported" } }, { type: "componentRef", attrs: { componentId: "nocontent" } }] };
    const xml = renderToDita({ id: "t", title: "T", topicType: "concept", doc, context: ctx({ componentWarehouse: "_components.dita" }) });
    expect(xml).toContain('<ph conref="shared.dita#shared" />');
    expect(xml).toContain("<!-- Component: nocontent -->");
  });

  it("a component that contains itself stops instead of recursing", () => {
    const self: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loop" }] }, { type: "componentRef", attrs: { componentId: "self" } }] };
    const componentMap = new Map<string, DitaComponentInfo>([["self", { title: "Self", content: self }]]);
    const inline = renderToDita({ id: "t", title: "T", topicType: "concept", doc: topicWith({ type: "componentRef", attrs: { componentId: "self" } }), context: { componentMap } });
    expect(inline.match(/Loop/g)?.length).toBe(1);
    expect(inline).toContain("<!-- Component: self -->");
    const warehouse = renderComponentWarehouse([{ id: "self", title: "Self", content: self }], { componentMap });
    expect(warehouse).not.toContain('conref="#components/c-self"');
    expect(warehouse).toContain("<!-- Component: self -->");
  });

  it("nested components inside the warehouse conref their sibling elements in the same file", () => {
    const outer: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Outer" }] }, { type: "componentRef", attrs: { componentId: "c1" } }] };
    const warehouse = renderComponentWarehouse([{ id: "outer", title: "Outer", content: outer }, { id: "c1", title: "Safety warning", content: warning }], ctx());
    expect(warehouse).toContain('<div conref="#components/c-c1" />');
    expect(warehouse).toContain('<div id="c-c1" outputclass="component">');
  });

  it("the map lists the warehouse as resource-only", () => {
    const map = renderDitaMap("Guide", [{ href: "intro.dita", navtitle: "Intro", children: [] }, { href: "_components.dita", navtitle: "Reusable components", processingRole: "resource-only", children: [] }]);
    expect(map).toContain('<topicref href="_components.dita" navtitle="Reusable components" processing-role="resource-only" />');
  });
});
