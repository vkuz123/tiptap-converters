import { describe, it, expect } from "vitest";
import {
  resolveComponents,
  type ComponentFetcher,
  type ComponentSource,
} from "../../src/pipeline/resolve";
import { publishTopic } from "../../src/pipeline/index";
import type { JSONContent } from "@tiptap/core";

// --- Helpers ---

function makeFetcher(components: ComponentSource[]): ComponentFetcher {
  return async (ids) => {
    const map = new Map<string, ComponentSource>();
    for (const c of components) {
      if (ids.includes(c.id)) map.set(c.id, c);
    }
    return map;
  };
}

const doc = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const compRef = (id: string): JSONContent => ({
  type: "componentRef",
  attrs: { componentId: id },
});

// --- Bug: Circular reference detection ---
// Before fix: A→B→A would resolve 5 nested copies (MAX_RESOLVE_DEPTH).
// After fix: A→B→A detects the cycle and shows "[circular reference]".

describe("Circular reference detection in component resolution", () => {
  it("detects direct self-reference: A→A", async () => {
    const fetcher = makeFetcher([
      {
        id: "comp-a",
        content_json: doc([compRef("comp-a")]),
      },
    ]);

    const result = await resolveComponents(doc([compRef("comp-a")]), fetcher);
    const text = result.content![0]?.content?.[0]?.text;
    expect(text).toContain("circular reference");
  });

  it("detects indirect cycle: A→B→A", async () => {
    const fetcher = makeFetcher([
      {
        id: "comp-a",
        content_json: doc([compRef("comp-b")]),
      },
      {
        id: "comp-b",
        content_json: doc([compRef("comp-a")]),
      },
    ]);

    const result = await resolveComponents(doc([compRef("comp-a")]), fetcher);
    const innerPara = result.content![0];
    const text = innerPara?.content?.[0]?.text;
    expect(text).toContain("circular reference");
  });

  it("detects 3-step cycle: A→B→C→A", async () => {
    const fetcher = makeFetcher([
      { id: "a", content_json: doc([compRef("b")]) },
      { id: "b", content_json: doc([compRef("c")]) },
      { id: "c", content_json: doc([compRef("a")]) },
    ]);

    const result = await resolveComponents(doc([compRef("a")]), fetcher);
    function findText(node: JSONContent): string[] {
      const texts: string[] = [];
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach((c) => texts.push(...findText(c)));
      return texts;
    }
    const allText = findText(result);
    expect(allText.some((t) => t.includes("circular reference"))).toBe(true);
  });

  it("allows same component used twice (not circular)", async () => {
    const fetcher = makeFetcher([
      {
        id: "shared",
        content_json: doc([para("Shared content")]),
      },
    ]);

    const result = await resolveComponents(
      doc([compRef("shared"), para("Middle"), compRef("shared")]),
      fetcher,
    );

    expect(result.content).toHaveLength(3);
    expect(result.content![0].content![0].text).toBe("Shared content");
    expect(result.content![2].content![0].text).toBe("Shared content");
  });

  it("allows diamond pattern: A→B, A→C, B→D, C→D", async () => {
    const fetcher = makeFetcher([
      { id: "b", content_json: doc([compRef("d")]) },
      { id: "c", content_json: doc([compRef("d")]) },
      { id: "d", content_json: doc([para("Leaf")]) },
    ]);

    const result = await resolveComponents(
      doc([compRef("b"), compRef("c")]),
      fetcher,
    );

    function findText(node: JSONContent): string[] {
      const texts: string[] = [];
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach((c) => texts.push(...findText(c)));
      return texts;
    }
    const leafOccurrences = findText(result).filter((t) => t === "Leaf");
    expect(leafOccurrences).toHaveLength(2);
  });
});

// --- Bug: Cross-refs in components resolved before component expansion ---
// Before fix: resolveTopicLinks ran before publishTopic, so topic links
// inside components were never resolved.
// After fix: postResolve callback runs AFTER component resolution.

describe("Topic links inside components resolved via postResolve", () => {
  it("postResolve runs after component resolution", async () => {
    const componentWithTopicLink: JSONContent = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          { type: "topicLink", attrs: { topicId: "topic-1" } },
        ],
      },
    ]);

    const fetcher = makeFetcher([
      { id: "comp-1", content_json: componentWithTopicLink },
    ]);

    function resolveLinks(resolved: JSONContent): JSONContent {
      if (resolved.type === "topicLink") {
        return {
          type: "text",
          text: "Getting Started",
          marks: [{ type: "link", attrs: { href: "getting-started" } }],
        };
      }
      if (resolved.content) {
        return {
          ...resolved,
          content: resolved.content.map(resolveLinks),
        };
      }
      return resolved;
    }

    const result = await publishTopic({
      doc: doc([compRef("comp-1")]),
      fetchComponents: fetcher,
      conditionProfile: {},
      variables: {},
      postResolve: resolveLinks,
    });

    expect(result.html).toContain("Getting Started");
    expect(result.html).toContain("getting-started");
    expect(result.html).not.toContain("topicLink");
  });

  it("postResolve does not run if not provided (backward compat)", async () => {
    const fetcher = makeFetcher([
      { id: "comp-1", content_json: doc([para("Simple")]) },
    ]);

    const result = await publishTopic({
      doc: doc([compRef("comp-1")]),
      fetchComponents: fetcher,
      conditionProfile: {},
      variables: {},
    });

    expect(result.html).toContain("Simple");
  });
});
