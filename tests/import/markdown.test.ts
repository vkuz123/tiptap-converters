import { describe, it, expect } from "vitest";
import {
  markdownToTipTap,
  extractTitleFromMarkdown,
} from "../../src/import/markdown";

// --- U-301: Basic Elements ---

describe("markdownToTipTap — basic elements", () => {
  it("converts headings H1-H3", () => {
    const md = "# H1\n## H2\n### H3";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    expect(doc.content[1]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(doc.content[2]).toMatchObject({
      type: "heading",
      attrs: { level: 3 },
    });
  });

  it("converts paragraphs", () => {
    const md = "Hello world";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("paragraph");
    expect(doc.content[0].content?.[0]).toMatchObject({
      type: "text",
      text: "Hello world",
    });
  });

  it("converts bold, italic, and code inline marks", () => {
    const md = "**bold** *italic* `code`";
    const { doc } = markdownToTipTap(md);

    const content = doc.content[0].content!;
    const boldNode = content.find(
      (n) => n.marks?.some((m) => m.type === "bold"),
    );
    const italicNode = content.find(
      (n) => n.marks?.some((m) => m.type === "italic"),
    );
    const codeNode = content.find(
      (n) => n.marks?.some((m) => m.type === "code"),
    );

    expect(boldNode).toBeDefined();
    expect(italicNode).toBeDefined();
    expect(codeNode).toBeDefined();
  });

  it("converts unordered lists", () => {
    const md = "- item 1\n- item 2";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("bulletList");
    expect(doc.content[0].content).toHaveLength(2);
    expect(doc.content[0].content![0].type).toBe("listItem");
  });

  it("converts ordered lists", () => {
    const md = "1. first\n2. second";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("orderedList");
    expect(doc.content[0].content).toHaveLength(2);
  });

  it("converts code blocks with language", () => {
    const md = "```python\nprint('hello')\n```";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "python" },
    });
    expect(doc.content[0].content?.[0].text).toBe("print('hello')");
  });

  it("converts blockquotes", () => {
    const md = "> quoted text";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("blockquote");
  });

  it("converts horizontal rules", () => {
    const md = "---";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("horizontalRule");
  });
});

// --- U-302: Tables and Images ---

describe("markdownToTipTap — tables and images", () => {
  it("converts markdown tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { doc } = markdownToTipTap(md);

    const table = doc.content[0];
    expect(table.type).toBe("table");
    expect(table.content).toHaveLength(2); // header + 1 data row
    expect(table.content![0].content![0].type).toBe("tableHeader");
    expect(table.content![1].content![0].type).toBe("tableCell");
  });

  it("converts images", () => {
    const md = "![Alt text](https://example.com/img.png)";
    const { doc } = markdownToTipTap(md);

    const img = doc.content[0];
    expect(img.type).toBe("image");
    expect(img.attrs).toMatchObject({
      src: "https://example.com/img.png",
      alt: "Alt text",
    });
  });
});

// --- U-303: Edge Cases ---

describe("markdownToTipTap — edge cases", () => {
  it("handles empty markdown", () => {
    const { doc } = markdownToTipTap("");
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });

  it("handles markdown with only frontmatter", () => {
    const md = "---\ntitle: Test\n---\n";
    const { title, doc } = markdownToTipTap(md);

    expect(title).toBe("Test");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });

  it("handles nested lists", () => {
    const md = "- parent\n  - child\n    - grandchild";
    const { doc } = markdownToTipTap(md);

    expect(doc.content[0].type).toBe("bulletList");
    // Nested structure should exist
    const firstItem = doc.content[0].content![0];
    expect(firstItem.type).toBe("listItem");
  });

  it("handles mixed inline formatting", () => {
    const md = "**bold _and italic_**";
    const { doc } = markdownToTipTap(md);

    const content = doc.content[0].content!;
    const hasNested = content.some(
      (n) =>
        n.marks &&
        n.marks.length >= 2 &&
        n.marks.some((m) => m.type === "bold") &&
        n.marks.some((m) => m.type === "italic"),
    );
    expect(hasNested).toBe(true);
  });
});

// --- U-304: Title Extraction ---

describe("extractTitleFromMarkdown", () => {
  it("extracts title from first H1", () => {
    const title = extractTitleFromMarkdown("# My Title\n\nSome content");
    expect(title).toBe("My Title");
  });

  it("extracts title from YAML frontmatter", () => {
    const md = "---\ntitle: My Doc\n---\n\n# Not This\n\nContent";
    const title = extractTitleFromMarkdown(md);
    expect(title).toBe("My Doc");
  });

  it("falls back to filename when no H1 or frontmatter", () => {
    const title = extractTitleFromMarkdown("Just some text", "getting-started.md");
    expect(title).toBe("Getting Started");
  });

  it("falls back to Untitled with no H1, no frontmatter, and no filename", () => {
    const title = extractTitleFromMarkdown("Just some text");
    expect(title).toBe("Untitled");
  });
});

// --- U-305: AI Response Parsing ---

describe("markdownToTipTap — AI response", () => {
  it("parses a typical AI response with headings, lists, code", () => {
    const md = `# Installation Guide

## Prerequisites

- Docker Desktop installed
- 4 GB RAM minimum

## Steps

1. Pull the image:

\`\`\`bash
docker pull myapp:latest
\`\`\`

2. Run the container:

\`\`\`bash
docker run -d -p 3000:3000 myapp
\`\`\``;

    const { doc } = markdownToTipTap(md);

    const types = doc.content.map((n) => n.type);
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(types).toContain("orderedList");
    expect(types).toContain("codeBlock");
  });

  it("handles plain text response without formatting", () => {
    const md = "This is a simple response with no markdown formatting.";
    const { doc } = markdownToTipTap(md);

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });
});
