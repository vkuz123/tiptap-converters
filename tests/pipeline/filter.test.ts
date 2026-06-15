import { describe, it, expect } from "vitest";
import { filterConditions, type ConditionProfile } from "../../src/pipeline/filter";
import type { JSONContent } from "@tiptap/core";

const simpleDoc = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

describe("filterConditions", () => {
  it("keeps block when profile matches include condition", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "include" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Admin only" }] },
        ],
      },
    ]);

    const profile: ConditionProfile = { "dim-1": ["val-admin"] };
    const result = filterConditions(doc, profile);

    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe("paragraph");
    expect(result.content![0].content![0].text).toBe("Admin only");
  });

  it("removes block when profile does not match include condition", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "include" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Admin only" }] },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Always visible" }] },
    ]);

    const profile: ConditionProfile = { "dim-1": ["val-user"] };
    const result = filterConditions(doc, profile);

    expect(result.content).toHaveLength(1);
    expect(result.content![0].content![0].text).toBe("Always visible");
  });

  it("exclude logic: removes when profile matches", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "exclude" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Not for admins" }] },
        ],
      },
    ]);

    const profile: ConditionProfile = { "dim-1": ["val-admin"] };
    const result = filterConditions(doc, profile);
    expect(result.content).toHaveLength(0);
  });

  it("exclude logic: keeps when profile does not match", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "exclude" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Not for admins" }] },
        ],
      },
    ]);

    const profile: ConditionProfile = { "dim-1": ["val-user"] };
    const result = filterConditions(doc, profile);
    expect(result.content).toHaveLength(1);
  });

  it("keeps block when profile has no entry for dimension", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "include" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
        ],
      },
    ]);

    const profile: ConditionProfile = {};
    const result = filterConditions(doc, profile);
    expect(result.content).toHaveLength(1);
    expect(result.content![0].content![0].text).toBe("Kept");
  });

  it("handles nested conditions", () => {
    const doc = simpleDoc([
      {
        type: "conditionalBlock",
        attrs: { dimensionId: "dim-1", valueIds: ["val-admin"], logic: "include" },
        content: [
          {
            type: "conditionalBlock",
            attrs: { dimensionId: "dim-2", valueIds: ["val-web"], logic: "include" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Admin + Web" }] },
            ],
          },
        ],
      },
    ]);

    const bothMatch: ConditionProfile = { "dim-1": ["val-admin"], "dim-2": ["val-web"] };
    expect(filterConditions(doc, bothMatch).content).toHaveLength(1);

    const outerOnly: ConditionProfile = { "dim-1": ["val-admin"], "dim-2": ["val-mobile"] };
    expect(filterConditions(doc, outerOnly).content).toHaveLength(0);

    const neitherMatch: ConditionProfile = { "dim-1": ["val-user"] };
    expect(filterConditions(doc, neitherMatch).content).toHaveLength(0);
  });
});
