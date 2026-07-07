import { describe, it, expect } from "vitest";
import {
  renderToMarkdown,
  type MarkdownContext,
} from "../../src/export/markdown";
import type { JSONContent } from "@tiptap/core";

// --- Topic Link Rendering (Bug #45) ---

describe("Topic link rendering in markdown export", () => {
  it("renders topic link with slug as .md link", () => {
    const ctx: MarkdownContext = {
      topicLinks: new Map([
        ["topic-1", { title: "Getting Started", slug: "getting-started" }],
      ]),
    };
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "topicLink", attrs: { topicId: "topic-1" } },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toContain('<!-- topic-link: getting-started.md "Getting Started" -->');
  });

  it("renders topic link without slug as title-only marker", () => {
    const ctx: MarkdownContext = {
      topicLinks: new Map([
        ["topic-2", { title: "Installation Guide" }],
      ]),
    };
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "topicLink", attrs: { topicId: "topic-2" } },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toBe('<!-- topic-link: "Installation Guide" -->');
  });

  it("renders topic link not in context as fallback marker", () => {
    const ctx: MarkdownContext = {
      topicLinks: new Map(), // empty
    };
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "topicLink", attrs: { topicId: "unknown-id" } },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc, ctx);
    expect(md).toBe('<!-- topic-link: "Topic Link" -->');
  });

  it("renders topic link without context (single topic export) as fallback", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "topicLink", attrs: { topicId: "any-id" } },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc); // no context
    expect(md).toBe('<!-- topic-link: "Topic Link" -->');
  });
});

// --- Callout Variants ---

describe("Callout export variants", () => {
  function makeCallout(variant: string, text: string): JSONContent {
    return {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { variant },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text }],
            },
          ],
        },
      ],
    };
  }

  it("exports info callout as > [!NOTE]", () => {
    const md = renderToMarkdown(makeCallout("info", "Information here"));
    expect(md).toContain("> [!NOTE]");
    expect(md).toContain("> Information here");
  });

  it("exports warning callout as > [!WARNING]", () => {
    const md = renderToMarkdown(makeCallout("warning", "Be careful"));
    expect(md).toContain("> [!WARNING]");
  });

  it("exports danger callout as > [!CAUTION]", () => {
    const md = renderToMarkdown(makeCallout("danger", "Danger zone"));
    expect(md).toContain("> [!CAUTION]");
  });

  it("exports success callout as > [!TIP]", () => {
    const md = renderToMarkdown(makeCallout("success", "Pro tip"));
    expect(md).toContain("> [!TIP]");
  });

  it("defaults unknown variant to NOTE", () => {
    const md = renderToMarkdown(makeCallout("custom", "Stuff"));
    expect(md).toContain("> [!NOTE]");
  });

  it("handles empty callout (no content)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "callout", attrs: { variant: "info" } }],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("> [!NOTE]");
  });
});

// --- Hard Break ---

describe("Hard break rendering", () => {
  it("renders hardBreak as two-space line break", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line one" },
            { type: "hardBreak" },
            { type: "text", text: "Line two" },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("Line one  \nLine two");
  });
});

// --- Variable Token ---

describe("Variable token rendering", () => {
  it("renders variable token as bracketed key", () => {
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
  });

  it("renders variable token with missing key as [variable]", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "variableToken", attrs: {} }],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("<!-- var: variable -->");
  });
});

// --- Component Ref (unresolved) ---

describe("Unresolved component ref rendering", () => {
  it("renders as HTML comment with componentId", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "abc-123" } },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("<!-- component: abc-123 -->");
  });

  it("renders as 'unknown' when componentId missing", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "componentRef", attrs: {} }],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe("<!-- component: unknown -->");
  });
});

// --- Code Group ---

describe("Code group export", () => {
  it("renders code group as consecutive fenced code blocks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "codeGroup",
          content: [
            {
              type: "codeBlock",
              attrs: { language: "javascript" },
              content: [{ type: "text", text: "console.log('hello')" }],
            },
            {
              type: "codeBlock",
              attrs: { language: "python" },
              content: [{ type: "text", text: "print('hello')" }],
            },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toContain("<!-- code-group -->");
    expect(md).toContain("```javascript\nconsole.log('hello')\n```");
    expect(md).toContain("```python\nprint('hello')\n```");
    expect(md).toContain("<!-- /code-group -->");
  });
});

// --- Table pipe escaping ---

describe("Table cell pipe escaping", () => {
  it("escapes pipe characters in cell content", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "value | with pipe" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "normal" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toContain("value \\| with pipe");
  });
});

// --- Conditional block (unresolved) ---

describe("Conditional block export", () => {
  it("renders with condition markers wrapping content", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: {
            dimensionId: "d1",
            dimensionName: "Platform",
            valueIds: ["v1"],
            valueLabels: ["Windows"],
            logic: "include",
          },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Conditional content" }],
            },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe(
      "<!-- condition: Platform = Windows (include) -->\n\nConditional content\n\n<!-- /condition -->",
    );
  });

  it("uses defaults when attrs are missing", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: { dimensionId: "d1", valueIds: ["v1"] },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Content" }],
            },
          ],
        },
      ],
    };
    const md = renderToMarkdown(doc);
    expect(md).toBe(
      "<!-- condition: Condition = All (include) -->\n\nContent\n\n<!-- /condition -->",
    );
  });
});
