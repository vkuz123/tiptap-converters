import { describe, it, expect } from "vitest";
import { extractComponentIds } from "../../src/core/content";

describe("extractComponentIds", () => {
  it("extracts component IDs from content with multiple refs", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "componentRef", attrs: { componentId: "aaa-111" } },
        { type: "paragraph", content: [{ type: "text", text: "World" }] },
        { type: "componentRef", attrs: { componentId: "bbb-222" } },
        { type: "componentRef", attrs: { componentId: "ccc-333" } },
      ],
    };
    expect(extractComponentIds(content)).toEqual(["aaa-111", "bbb-222", "ccc-333"]);
  });

  it("returns empty array when no component refs exist", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "No refs here" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      ],
    };
    expect(extractComponentIds(content)).toEqual([]);
  });

  it("deduplicates repeated component references", () => {
    const content = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "same-id" } },
        { type: "paragraph", content: [{ type: "text", text: "..." }] },
        { type: "componentRef", attrs: { componentId: "same-id" } },
        { type: "componentRef", attrs: { componentId: "other-id" } },
      ],
    };
    expect(extractComponentIds(content)).toEqual(["same-id", "other-id"]);
  });

  it("handles empty document", () => {
    expect(extractComponentIds({ type: "doc", content: [] })).toEqual([]);
  });

  it("handles nested content (e.g. inside blockquote)", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "componentRef", attrs: { componentId: "nested-ref" } },
          ],
        },
      ],
    };
    expect(extractComponentIds(content)).toEqual(["nested-ref"]);
  });

  it("ignores nodes with missing or non-string componentId", () => {
    const content = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: {} },
        { type: "componentRef", attrs: { componentId: null } },
        { type: "componentRef", attrs: { componentId: 123 } },
        { type: "componentRef", attrs: { componentId: "valid-id" } },
      ],
    };
    expect(extractComponentIds(content)).toEqual(["valid-id"]);
  });

  it("extracts IDs from both componentRef and inlineComponentRef", () => {
    const content = {
      type: "doc",
      content: [
        { type: "componentRef", attrs: { componentId: "block-comp" } },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "inlineComponentRef", attrs: { componentId: "inline-comp" } },
            { type: "text", text: " here" },
          ],
        },
        { type: "componentRef", attrs: { componentId: "block-comp" } },
      ],
    };
    expect(extractComponentIds(content)).toEqual(["block-comp", "inline-comp"]);
  });
});
