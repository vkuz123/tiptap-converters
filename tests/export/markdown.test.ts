import { describe, it, expect } from "vitest";
import { renderToMarkdown } from "../../src/export/markdown";
import type { JSONContent } from "@tiptap/core";

// --- Helper ---

function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function p(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function text(t: string, marks?: JSONContent["marks"]): JSONContent {
  return marks ? { type: "text", text: t, marks } : { type: "text", text: t };
}

function heading(level: number, t: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [text(t)],
  };
}

// --- Basic Elements ---

describe("Markdown export — basic elements", () => {
  it("converts headings", () => {
    const result = renderToMarkdown(
      doc(heading(1, "Title"), heading(2, "Section"), heading(3, "Sub")),
    );
    expect(result).toBe("# Title\n\n## Section\n\n### Sub");
  });

  it("converts paragraphs", () => {
    const result = renderToMarkdown(
      doc(p(text("Hello world")), p(text("Second paragraph"))),
    );
    expect(result).toBe("Hello world\n\nSecond paragraph");
  });

  it("converts bold and italic marks", () => {
    const result = renderToMarkdown(
      doc(
        p(
          text("bold", [{ type: "bold" }]),
          text(" and "),
          text("italic", [{ type: "italic" }]),
        ),
      ),
    );
    expect(result).toBe("**bold** and *italic*");
  });

  it("converts inline code", () => {
    const result = renderToMarkdown(
      doc(p(text("Run "), text("npm install", [{ type: "code" }]))),
    );
    expect(result).toBe("Run `npm install`");
  });

  it("converts strikethrough", () => {
    const result = renderToMarkdown(
      doc(p(text("removed", [{ type: "strike" }]))),
    );
    expect(result).toBe("~~removed~~");
  });

  it("converts links", () => {
    const result = renderToMarkdown(
      doc(
        p(
          text("Visit "),
          text("our site", [
            { type: "link", attrs: { href: "https://example.com" } },
          ]),
        ),
      ),
    );
    expect(result).toBe("Visit [our site](https://example.com)");
  });

  it("converts bullet lists", () => {
    const result = renderToMarkdown(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("Item 1"))] },
          { type: "listItem", content: [p(text("Item 2"))] },
        ],
      }),
    );
    expect(result).toBe("- Item 1\n- Item 2");
  });

  it("converts ordered lists", () => {
    const result = renderToMarkdown(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [p(text("First"))] },
          { type: "listItem", content: [p(text("Second"))] },
        ],
      }),
    );
    expect(result).toBe("1. First\n2. Second");
  });

  it("converts code blocks", () => {
    const result = renderToMarkdown(
      doc({
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [text("const x = 1;")],
      }),
    );
    expect(result).toBe("```typescript\nconst x = 1;\n```");
  });

  it("converts blockquotes", () => {
    const result = renderToMarkdown(
      doc({
        type: "blockquote",
        content: [p(text("A wise quote"))],
      }),
    );
    expect(result).toBe("> A wise quote");
  });

  it("converts horizontal rules", () => {
    const result = renderToMarkdown(
      doc(p(text("Above")), { type: "horizontalRule" }, p(text("Below"))),
    );
    expect(result).toBe("Above\n\n---\n\nBelow");
  });
});

// --- Tables and Images ---

describe("Markdown export — tables and images", () => {
  it("converts tables", () => {
    const result = renderToMarkdown(
      doc({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [p(text("Name"))],
              },
              {
                type: "tableHeader",
                content: [p(text("Value"))],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [p(text("A"))] },
              { type: "tableCell", content: [p(text("1"))] },
            ],
          },
        ],
      }),
    );
    expect(result).toBe("| Name | Value |\n| --- | --- |\n| A | 1 |");
  });

  it("converts images", () => {
    const result = renderToMarkdown(
      doc({
        type: "image",
        attrs: { src: "https://example.com/img.png", alt: "A photo" },
      }),
    );
    expect(result).toBe("![A photo](https://example.com/img.png)");
  });
});

// --- Nested Lists ---

describe("Markdown export — nested structures", () => {
  it("converts nested bullet lists", () => {
    const result = renderToMarkdown(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              p(text("Parent")),
              {
                type: "bulletList",
                content: [
                  { type: "listItem", content: [p(text("Child"))] },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain("- Parent");
    expect(result).toContain("  - Child");
  });

  it("converts multiple marks on same text", () => {
    const result = renderToMarkdown(
      doc(
        p(
          text("bold italic", [{ type: "bold" }, { type: "italic" }]),
        ),
      ),
    );
    expect(result).toBe("***bold italic***");
  });
});

// --- Edge Cases ---

describe("Markdown export — edge cases", () => {
  it("returns empty string for empty doc", () => {
    expect(renderToMarkdown(doc())).toBe("");
    expect(renderToMarkdown({ type: "doc" })).toBe("");
  });

  it("handles variable tokens as placeholders", () => {
    const result = renderToMarkdown(
      doc(
        p(
          text("Welcome to "),
          { type: "variableToken", attrs: { key: "product_name" } },
        ),
      ),
    );
    expect(result).toBe("Welcome to <!-- var: product_name -->");
  });

  it("handles component refs as comments", () => {
    const result = renderToMarkdown(
      doc({
        type: "componentRef",
        attrs: { componentId: "abc-123" },
      }),
    );
    expect(result).toBe("<!-- component: abc-123 -->");
  });

  it("handles code blocks without language", () => {
    const result = renderToMarkdown(
      doc({
        type: "codeBlock",
        content: [text("plain code")],
      }),
    );
    expect(result).toBe("```\nplain code\n```");
  });

  it("escapes pipes in table cells", () => {
    const result = renderToMarkdown(
      doc({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [p(text("A|B"))] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [p(text("C|D"))] },
            ],
          },
        ],
      }),
    );
    expect(result).toContain("A\\|B");
    expect(result).toContain("C\\|D");
  });
});

