import { describe, it, expect } from "vitest";
import { resolveComponents, type ComponentFetcher, type ComponentSource } from "../../src/pipeline/resolve";
import type { JSONContent } from "@tiptap/core";

function makeFetcher(components: ComponentSource[]): ComponentFetcher {
  return async (ids) => {
    const map = new Map<string, ComponentSource>();
    for (const c of components) {
      if (ids.includes(c.id)) map.set(c.id, c);
    }
    return map;
  };
}

const simpleDoc = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

describe("resolveComponents — inlineComponentRef", () => {
  it("resolves inline ref to first paragraph content", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "inlineComponentRef", attrs: { componentId: "brand" } },
          { type: "text", text: " world" },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      {
        id: "brand",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "Topicary" }] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.type).toBe("paragraph");
    expect(para.content).toHaveLength(3);
    expect(para.content![0].text).toBe("Hello ");
    expect(para.content![1].text).toBe("Topicary");
    expect(para.content![2].text).toBe(" world");
  });

  it("extracts only first paragraph from multi-block component", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "inlineComponentRef", attrs: { componentId: "multi" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      {
        id: "multi",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "First" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second" }] },
          { type: "table", content: [] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.content).toHaveLength(1);
    expect(para.content![0].text).toBe("First");
  });

  it("returns missing text for missing component", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          { type: "inlineComponentRef", attrs: { componentId: "gone" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([]);
    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.content![1].text).toBe("[missing component]");
  });

  it("returns circular reference text for self-referencing inline", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "inlineComponentRef", attrs: { componentId: "loop" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      {
        id: "loop",
        content_json: simpleDoc([
          {
            type: "paragraph",
            content: [
              { type: "inlineComponentRef", attrs: { componentId: "loop" } },
            ],
          },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const text = JSON.stringify(result);
    expect(text).toContain("[circular reference]");
  });

  it("resolves inline ref nested inside a block component", async () => {
    const doc = simpleDoc([
      { type: "componentRef", attrs: { componentId: "wrapper" } },
    ]);

    const fetcher = makeFetcher([
      {
        id: "wrapper",
        content_json: simpleDoc([
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Use " },
              { type: "inlineComponentRef", attrs: { componentId: "brand" } },
              { type: "text", text: " here" },
            ],
          },
        ]),
      },
      {
        id: "brand",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "Acme" }] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.content![0].text).toBe("Use ");
    expect(para.content![1].text).toBe("Acme");
    expect(para.content![2].text).toBe(" here");
  });

  it("returns empty component text for component with no content", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "inlineComponentRef", attrs: { componentId: "empty" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      {
        id: "empty",
        content_json: simpleDoc([]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.content![0].text).toBe("[empty component]");
  });

  it("leaves null-componentId node unchanged when no other refs trigger resolution", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "inlineComponentRef", attrs: { componentId: null } },
        ],
      },
    ]);

    const fetcher = makeFetcher([]);
    const result = await resolveComponents(doc, fetcher);
    // No valid IDs to fetch → doc returned unchanged, node stays as-is
    expect(result.content![0].content![0].type).toBe("inlineComponentRef");
    expect(result.content![0].content![0].attrs?.componentId).toBeNull();
  });

  it("replaces null-componentId with error text when resolution walk is active", async () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "inlineComponentRef", attrs: { componentId: null } },
          { type: "inlineComponentRef", attrs: { componentId: "real" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      {
        id: "real",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "OK" }] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const para = result.content![0];
    expect(para.content![0].text).toBe("[invalid component]");
    expect(para.content![1].text).toBe("OK");
  });
});
