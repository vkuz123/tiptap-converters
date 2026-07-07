import { describe, it, expect } from "vitest";
import { markdownToTipTap, rewriteMarkdownComponentPaths, rewriteMarkdownConditions, rewriteMarkdownTopicLinks } from "../../src/import/markdown";
import { renderToMarkdown, type MarkdownContext } from "../../src/export/markdown";
import type { JSONContent } from "@tiptap/core";

// --- Component Roundtrip ---

describe("Component marker roundtrip", () => {
  it("exports componentRef as marker → imports back as componentRef with _mdPath", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "abc-123" } },
      ],
    };
    const ctx: MarkdownContext = {
      componentLinks: new Map([["abc-123", { title: "Alert Box", filename: "alert-box.md" }]]),
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toBe("<!-- component: alert-box.md -->");

    const { doc: imported } = markdownToTipTap(md);
    expect(imported.content[0]).toMatchObject({
      type: "componentRef",
      attrs: { componentId: null, _mdPath: "alert-box.md" },
    });
  });

  it("rewriteMarkdownComponentPaths resolves _mdPath to componentId", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: null, _mdPath: "alert-box.md" } },
      ],
    };
    const pathToId = new Map([["alert-box.md", "abc-123"]]);
    const rewritten = rewriteMarkdownComponentPaths(doc, pathToId);
    expect((rewritten.content as any[])[0].attrs).toEqual({ componentId: "abc-123" });
  });
});

// --- Conditional Block Roundtrip ---

describe("Conditional block roundtrip", () => {
  it("exports condition markers → imports back as conditionalBlock with _mdCondition", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: {
            dimensionId: "d1",
            dimensionName: "Platform",
            valueIds: ["v1", "v2"],
            valueLabels: ["Windows", "Mac"],
            logic: "include",
          },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Platform content" }] },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toContain("<!-- condition: Platform = Windows, Mac (include) -->");
    expect(md).toContain("Platform content");
    expect(md).toContain("<!-- /condition -->");

    const { doc: imported } = markdownToTipTap(md);
    expect(imported.content[0]).toMatchObject({
      type: "conditionalBlock",
      attrs: {
        dimensionId: null,
        dimensionName: "Platform",
        valueLabels: ["Windows", "Mac"],
        logic: "include",
        _mdCondition: true,
      },
    });
  });

  it("rewriteMarkdownConditions resolves dimension/value IDs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: {
            dimensionId: null,
            dimensionName: "Platform",
            valueIds: [],
            valueLabels: ["Windows", "Mac"],
            logic: "include",
            _mdCondition: true,
          },
          content: [{ type: "paragraph" }],
        },
      ],
    };
    const dimensionMap = new Map([
      ["platform", {
        id: "dim-1",
        values: new Map([["windows", "val-1"], ["mac", "val-2"]]),
      }],
    ]);
    const rewritten = rewriteMarkdownConditions(doc, dimensionMap);
    const block = (rewritten.content as any[])[0];
    expect(block.attrs.dimensionId).toBe("dim-1");
    expect(block.attrs.valueIds).toEqual(["val-1", "val-2"]);
    expect(block.attrs._mdCondition).toBeUndefined();
  });

  it("handles nested conditions", () => {
    const md = [
      "<!-- condition: Audience = Admin (include) -->",
      "",
      "Admin-only content",
      "",
      "<!-- condition: Platform = Windows (exclude) -->",
      "",
      "Not-windows content",
      "",
      "<!-- /condition -->",
      "",
      "<!-- /condition -->",
    ].join("\n");

    const { doc } = markdownToTipTap(md);
    expect(doc.content[0].type).toBe("conditionalBlock");
    expect(doc.content[0].attrs?.dimensionName).toBe("Audience");
    const inner = doc.content[0].content!;
    const nestedBlock = inner.find((n) => n.type === "conditionalBlock");
    expect(nestedBlock).toBeDefined();
    expect(nestedBlock!.attrs?.dimensionName).toBe("Platform");
    expect(nestedBlock!.attrs?.logic).toBe("exclude");
  });
});

// --- Variable Token Roundtrip ---

describe("Variable token roundtrip", () => {
  it("exports variable marker → imports back as variableToken", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Welcome to " },
            { type: "variableToken", attrs: { key: "product_name" } },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("Welcome to <!-- var: product_name -->");

    const { doc: imported } = markdownToTipTap(md);
    const paraContent = imported.content[0].content!;
    const textNode = paraContent.find((n) => n.type === "text" && n.text?.includes("Welcome"));
    expect(textNode).toBeDefined();
    const varNode = paraContent.find((n) => n.type === "variableToken");
    expect(varNode).toBeDefined();
    expect(varNode!.attrs?.key).toBe("product_name");
  });
});

// --- Topic Link Roundtrip ---

describe("Topic link roundtrip", () => {
  it("exports topic link with slug → imports back as topicLink with _mdSlug", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "topicLink", attrs: { topicId: "t-1" } },
          ],
        },
      ],
    };
    const ctx: MarkdownContext = {
      topicLinks: new Map([["t-1", { title: "Getting Started", slug: "getting-started" }]]),
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toContain('<!-- topic-link: getting-started.md "Getting Started" -->');

    const { doc: imported } = markdownToTipTap(md);
    const paraContent = imported.content[0].content!;
    const linkNode = paraContent.find((n) => n.type === "topicLink");
    expect(linkNode).toBeDefined();
    expect(linkNode!.attrs?._mdSlug).toBe("getting-started.md");
    expect(linkNode!.attrs?._mdTitle).toBe("Getting Started");
    expect(linkNode!.attrs?.topicId).toBeNull();
  });

  it("exports topic link without slug → imports back with title only", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "topicLink", attrs: { topicId: "t-2" } },
          ],
        },
      ],
    };
    const ctx: MarkdownContext = {
      topicLinks: new Map([["t-2", { title: "FAQ" }]]),
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toContain('<!-- topic-link: "FAQ" -->');

    const { doc: imported } = markdownToTipTap(md);
    const linkNode = imported.content[0].content![0];
    expect(linkNode.type).toBe("topicLink");
    expect(linkNode.attrs?._mdSlug).toBeNull();
    expect(linkNode.attrs?._mdTitle).toBe("FAQ");
  });

  it("rewriteMarkdownTopicLinks resolves slug and title to topicId", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "topicLink", attrs: { topicId: null, _mdSlug: "getting-started.md", _mdTitle: "Getting Started" } },
            { type: "topicLink", attrs: { topicId: null, _mdSlug: null, _mdTitle: "FAQ" } },
          ],
        },
      ],
    };
    const slugToId = new Map([["getting-started", "id-1"]]);
    const titleToId = new Map([["faq", "id-2"]]);
    const rewritten = rewriteMarkdownTopicLinks(doc, slugToId, titleToId);
    const content = (rewritten.content as any[])[0].content;
    expect(content[0].attrs.topicId).toBe("id-1");
    expect(content[0].attrs._mdSlug).toBeUndefined();
    expect(content[1].attrs.topicId).toBe("id-2");
    expect(content[1].attrs._mdTitle).toBeUndefined();
  });
});

// --- Code Group Roundtrip ---

describe("Code group roundtrip", () => {
  it("exports code group markers → imports back as codeGroup", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "codeGroup",
          content: [
            {
              type: "codeBlock",
              attrs: { language: "javascript" },
              content: [{ type: "text", text: "console.log('hi')" }],
            },
            {
              type: "codeBlock",
              attrs: { language: "python" },
              content: [{ type: "text", text: "print('hi')" }],
            },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toContain("<!-- code-group -->");
    expect(md).toContain("<!-- /code-group -->");

    const { doc: imported } = markdownToTipTap(md);
    expect(imported.content[0].type).toBe("codeGroup");
    expect(imported.content[0].content).toHaveLength(2);
    expect(imported.content[0].content![0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "javascript" },
    });
    expect(imported.content[0].content![1]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "python" },
    });
  });
});

// --- Callout Roundtrip ---

describe("Callout roundtrip", () => {
  it("exports callout as GFM alert → imports back as callout", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { variant: "warning" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Be careful" }] },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toContain("> [!WARNING]");
    expect(md).toContain("> Be careful");

    const { doc: imported } = markdownToTipTap(md);
    expect(imported.content[0]).toMatchObject({
      type: "callout",
      attrs: { variant: "warning" },
    });
    const inner = imported.content[0].content!;
    const textNode = inner[0]?.content?.[0];
    expect(textNode?.text).toBe("Be careful");
  });
});
