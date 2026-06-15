import { describe, it, expect } from "vitest";
import { extractTopicLinkIds } from "../../src/core/content";

describe("extractTopicLinkIds", () => {
  it("extracts topic IDs from content with multiple links", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "See " },
          { type: "topicLink", attrs: { topicId: "topic-aaa" } },
          { type: "text", text: " and " },
          { type: "topicLink", attrs: { topicId: "topic-bbb" } },
        ]},
      ],
    };
    expect(extractTopicLinkIds(content)).toEqual(["topic-aaa", "topic-bbb"]);
  });

  it("deduplicates repeated topic links", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "topicLink", attrs: { topicId: "same-topic" } },
        ]},
        { type: "paragraph", content: [
          { type: "topicLink", attrs: { topicId: "same-topic" } },
          { type: "topicLink", attrs: { topicId: "other-topic" } },
        ]},
      ],
    };
    expect(extractTopicLinkIds(content)).toEqual(["same-topic", "other-topic"]);
  });

  it("returns empty array when no topic links exist", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "No links" }] },
        { type: "componentRef", attrs: { componentId: "comp-1" } },
      ],
    };
    expect(extractTopicLinkIds(content)).toEqual([]);
  });

  it("finds topic links inside conditional blocks (deep walk)", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: { dimensionId: "aud", valueIds: ["admin"], logic: "include" },
          content: [
            { type: "paragraph", content: [
              { type: "topicLink", attrs: { topicId: "deep-topic" } },
            ]},
          ],
        },
      ],
    };
    expect(extractTopicLinkIds(content)).toEqual(["deep-topic"]);
  });

  it("ignores nodes with missing or non-string topicId", () => {
    const content = {
      type: "doc",
      content: [
        { type: "topicLink", attrs: {} },
        { type: "topicLink", attrs: { topicId: null } },
        { type: "topicLink", attrs: { topicId: 42 } },
        { type: "topicLink", attrs: { topicId: "valid-id" } },
      ],
    };
    expect(extractTopicLinkIds(content)).toEqual(["valid-id"]);
  });

  it("handles empty document", () => {
    expect(extractTopicLinkIds({ type: "doc", content: [] })).toEqual([]);
  });
});
