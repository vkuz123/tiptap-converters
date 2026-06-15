import { describe, it, expect } from "vitest";
import { markdownToTipTap } from "../../src/import/markdown";
import { renderToMarkdown, type MarkdownContext } from "../../src/export/markdown";

describe("Markdown roundtrip — markdown → TipTap → markdown", () => {
  function roundtrip(md: string): string {
    const { doc } = markdownToTipTap(md);
    return renderToMarkdown(doc);
  }

  it("preserves headings", () => {
    const md = "# Heading 1\n\n## Heading 2\n\n### Heading 3";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves paragraphs", () => {
    const md = "First paragraph\n\nSecond paragraph";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves bold and italic marks", () => {
    const md = "Some **bold** and *italic* text";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves inline code", () => {
    const md = "Use `console.log()` to debug";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves code blocks with language", () => {
    const md = "```javascript\nconst x = 1;\n```";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves code blocks without language", () => {
    const md = "```\nplain code\n```";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves bullet lists", () => {
    const md = "- Item one\n- Item two\n- Item three";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves ordered lists", () => {
    const md = "1. First\n2. Second\n3. Third";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves links", () => {
    const md = "Visit [Example](https://example.com) for more";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves horizontal rules", () => {
    const md = "Before\n\n---\n\nAfter";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves images", () => {
    const md = "![Alt text](https://example.com/img.png)";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves blockquotes", () => {
    const md = "> This is a quote";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves tables", () => {
    const input = "| Name | Value |\n| --- | --- |\n| A | 1 |";
    const result = roundtrip(input);
    expect(result).toContain("| Name | Value |");
    expect(result).toContain("| A | 1 |");
  });

  it("preserves strikethrough", () => {
    const md = "This is ~~deleted~~ text";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves callouts (GFM alerts)", () => {
    const md = "> [!NOTE]\n> This is important";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves nested lists", () => {
    const md = "- Parent\n  - Child\n  - Child 2\n- Parent 2";
    expect(roundtrip(md)).toBe(md);
  });

  it("preserves combined inline marks", () => {
    const md = "Some **bold *and italic*** text";
    const result = roundtrip(md);
    expect(result).toContain("**");
    expect(result).toContain("*");
  });
});

describe("Component marker + inline content round-trip", () => {
  it("imports component comment with inline preview as single componentRef (no duplicate)", () => {
    const md = `<!-- component: ai-plan-prerequisite.md -->\n- You need a **Pro** plan.\n- Open a topic.`;
    const { doc } = markdownToTipTap(md);
    const componentRefs = doc.content!.filter((n) => n.type === "componentRef");
    const lists = doc.content!.filter((n) => n.type === "bulletList");
    expect(componentRefs).toHaveLength(1);
    expect(componentRefs[0].attrs!._mdPath).toBe("ai-plan-prerequisite.md");
    expect(lists).toHaveLength(0);
  });

  it("imports bare component comment with no trailing content", () => {
    const md = `# Title\n\n<!-- component: widget.md -->\n\n## Next section`;
    const { doc } = markdownToTipTap(md);
    const componentRefs = doc.content!.filter((n) => n.type === "componentRef");
    const headings = doc.content!.filter((n) => n.type === "heading");
    expect(componentRefs).toHaveLength(1);
    expect(headings).toHaveLength(2);
  });

  it("imports component comment followed by a heading without skipping the heading", () => {
    const md = `<!-- component: intro.md -->\n## Real heading`;
    const { doc } = markdownToTipTap(md);
    expect(doc.content).toHaveLength(2);
    expect(doc.content![0].type).toBe("componentRef");
    expect(doc.content![1].type).toBe("heading");
  });

  it("imports multiple consecutive components, each skipping its own preview", () => {
    const md = [
      `<!-- component: a.md -->`,
      `Content of A.`,
      `<!-- component: b.md -->`,
      `> [!NOTE]`,
      `> Content of B.`,
    ].join("\n");
    const { doc } = markdownToTipTap(md);
    const componentRefs = doc.content!.filter((n) => n.type === "componentRef");
    expect(componentRefs).toHaveLength(2);
    expect(componentRefs[0].attrs!._mdPath).toBe("a.md");
    expect(componentRefs[1].attrs!._mdPath).toBe("b.md");
    // No paragraphs or callouts — both previews were skipped
    const others = doc.content!.filter((n) => n.type !== "componentRef");
    expect(others).toHaveLength(0);
  });

  it("exports componentRef with componentContent as comment + preview", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "comp-1" } },
      ],
    };
    const ctx: MarkdownContext = {
      componentLinks: new Map([["comp-1", { title: "Warning", filename: "warning.md" }]]),
      componentContent: new Map([["comp-1", "> [!WARNING]\n> Be careful."]]),
    };
    const result = renderToMarkdown(doc, ctx);
    expect(result).toBe(`<!-- component: warning.md -->\n> [!WARNING]\n> Be careful.`);
  });

  it("exports componentRef without componentContent as bare comment", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "comp-1" } },
      ],
    };
    const ctx: MarkdownContext = {
      componentLinks: new Map([["comp-1", { title: "Warning", filename: "warning.md" }]]),
    };
    const result = renderToMarkdown(doc, ctx);
    expect(result).toBe(`<!-- component: warning.md -->`);
  });

  it("full round-trip: export with componentContent then re-import produces single componentRef", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "componentRef", attrs: { componentId: "comp-1" } },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Next" }] },
      ],
    };
    const ctx: MarkdownContext = {
      componentLinks: new Map([["comp-1", { title: "Prereq", filename: "prereq.md" }]]),
      componentContent: new Map([["comp-1", "- Step one\n- Step two"]]),
    };
    const exported = renderToMarkdown(doc, ctx);
    expect(exported).toContain("<!-- component: prereq.md -->");
    expect(exported).toContain("- Step one");

    const { doc: reimported } = markdownToTipTap(exported);
    const refs = reimported.content!.filter((n) => n.type === "componentRef");
    const lists = reimported.content!.filter((n) => n.type === "bulletList");
    expect(refs).toHaveLength(1);
    expect(refs[0].attrs!._mdPath).toBe("prereq.md");
    expect(lists).toHaveLength(0);
  });
});
