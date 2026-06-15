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

describe("resolveComponents", () => {
  it("replaces componentRef with component content", async () => {
    const doc = simpleDoc([
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "componentRef", attrs: { componentId: "comp-1" } },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ]);

    const fetcher = makeFetcher([
      {
        id: "comp-1",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "Component content" }] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    expect(result.content).toHaveLength(3);
    expect(result.content![1].type).toBe("paragraph");
    expect(result.content![1].content![0].text).toBe("Component content");
  });

  it("handles missing component gracefully", async () => {
    const doc = simpleDoc([
      { type: "componentRef", attrs: { componentId: "nonexistent" } },
    ]);

    const fetcher = makeFetcher([]);
    const result = await resolveComponents(doc, fetcher);

    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe("paragraph");
    expect(result.content![0].content![0].text).toContain("missing component");
  });

  it("resolves nested component refs (A contains B)", async () => {
    const doc = simpleDoc([
      { type: "componentRef", attrs: { componentId: "comp-a" } },
    ]);

    const fetcher = makeFetcher([
      {
        id: "comp-a",
        content_json: simpleDoc([
          { type: "componentRef", attrs: { componentId: "comp-b" } },
        ]),
      },
      {
        id: "comp-b",
        content_json: simpleDoc([
          { type: "paragraph", content: [{ type: "text", text: "Nested" }] },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    expect(result.content![0].content![0].text).toBe("Nested");
  });

  it("halts on circular reference with placeholder", async () => {
    const doc = simpleDoc([
      { type: "componentRef", attrs: { componentId: "loop" } },
    ]);

    const fetcher = makeFetcher([
      {
        id: "loop",
        content_json: simpleDoc([
          { type: "componentRef", attrs: { componentId: "loop" } },
        ]),
      },
    ]);

    const result = await resolveComponents(doc, fetcher);
    const text = JSON.stringify(result);
    expect(text).toContain("[circular reference]");
  });

  it("returns doc unchanged when no componentRefs present", async () => {
    const doc = simpleDoc([
      { type: "paragraph", content: [{ type: "text", text: "Plain" }] },
    ]);

    const fetcher = makeFetcher([]);
    const result = await resolveComponents(doc, fetcher);
    expect(result).toEqual(doc);
  });
});
