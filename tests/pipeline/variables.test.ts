import { describe, it, expect } from "vitest";
import { replaceVariables, type VariableMap } from "../../src/pipeline/variables";
import type { JSONContent } from "@tiptap/core";

const simpleDoc = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

describe("replaceVariables", () => {
  it("replaces variableToken with text node", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Welcome to " },
          { type: "variableToken", attrs: { key: "product_name" } },
          { type: "text", text: "!" },
        ],
      },
    ]);

    const vars: VariableMap = { product_name: "Acme Pro" };
    const result = replaceVariables(doc, vars);

    const para = result.content![0];
    expect(para.content).toHaveLength(3);
    expect(para.content![0].text).toBe("Welcome to ");
    expect(para.content![1].type).toBe("text");
    expect(para.content![1].text).toBe("Acme Pro");
    expect(para.content![2].text).toBe("!");
  });

  it("uses fallback for missing keys", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "variableToken", attrs: { key: "unknown_key" } },
        ],
      },
    ]);

    const vars: VariableMap = {};
    const result = replaceVariables(doc, vars);

    expect(result.content![0].content![0].text).toBe("[unknown_key]");
  });

  it("replaces multiple tokens with same key consistently", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "variableToken", attrs: { key: "version" } },
          { type: "text", text: " and " },
          { type: "variableToken", attrs: { key: "version" } },
        ],
      },
    ]);

    const vars: VariableMap = { version: "3.2.1" };
    const result = replaceVariables(doc, vars);

    const para = result.content![0];
    expect(para.content![0].text).toBe("3.2.1");
    expect(para.content![2].text).toBe("3.2.1");
  });

  it("returns doc unchanged when no variableTokens present", () => {
    const doc = simpleDoc([
      { type: "paragraph", content: [{ type: "text", text: "Plain text" }] },
    ]);

    const result = replaceVariables(doc, { anything: "val" });
    expect(result).toEqual(doc);
  });

  // --- Mark preservation (U-1003) ---

  it("preserves bold mark on variable substitution", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "variableToken",
            attrs: { key: "product" },
            marks: [{ type: "bold" }],
          },
        ],
      },
    ]);

    const result = replaceVariables(doc, { product: "Acme" });
    const node = result.content![0].content![0];
    expect(node.text).toBe("Acme");
    expect(node.marks).toEqual([{ type: "bold" }]);
  });

  it("preserves italic mark on variable substitution", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "variableToken",
            attrs: { key: "version" },
            marks: [{ type: "italic" }],
          },
        ],
      },
    ]);

    const result = replaceVariables(doc, { version: "2.0" });
    const node = result.content![0].content![0];
    expect(node.text).toBe("2.0");
    expect(node.marks).toEqual([{ type: "italic" }]);
  });

  it("preserves multiple marks (bold + italic)", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "variableToken",
            attrs: { key: "name" },
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
    ]);

    const result = replaceVariables(doc, { name: "Important" });
    const node = result.content![0].content![0];
    expect(node.text).toBe("Important");
    expect(node.marks).toEqual([{ type: "bold" }, { type: "italic" }]);
  });

  it("does not add marks to unmarked variable", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          { type: "variableToken", attrs: { key: "plain" } },
        ],
      },
    ]);

    const result = replaceVariables(doc, { plain: "value" });
    const node = result.content![0].content![0];
    expect(node.text).toBe("value");
    expect(node.marks).toBeUndefined();
  });

  it("preserves marks on fallback (missing key)", () => {
    const doc = simpleDoc([
      {
        type: "paragraph",
        content: [
          {
            type: "variableToken",
            attrs: { key: "missing" },
            marks: [{ type: "bold" }],
          },
        ],
      },
    ]);

    const result = replaceVariables(doc, {});
    const node = result.content![0].content![0];
    expect(node.text).toBe("[missing]");
    expect(node.marks).toEqual([{ type: "bold" }]);
  });

  it("preserves marks in nested structure (heading)", () => {
    const doc = simpleDoc([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "Version: " },
          {
            type: "variableToken",
            attrs: { key: "ver" },
            marks: [{ type: "bold" }],
          },
        ],
      },
    ]);

    const result = replaceVariables(doc, { ver: "3.0" });
    const heading = result.content![0];
    expect(heading.type).toBe("heading");
    expect(heading.content![1].text).toBe("3.0");
    expect(heading.content![1].marks).toEqual([{ type: "bold" }]);
  });
});
