/**
 * Tests for the canonical resolver (resolveCanonical) and the canonical
 * structural validator (validateCanonical) — Phase 2 of own-model-canonical.
 *
 * Outcomes verified:
 * - resolveCanonical runs the publish pipeline (conditions + variables) over a
 *   CanonicalDoc and returns a resolved CanonicalDoc with the version stamp.
 * - validateCanonical flags vocabulary and required-attribute violations and
 *   passes a clean document.
 */

import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  resolveCanonical,
  type ResolveCanonicalOptions,
} from "../../src/pipeline/index";
import {
  validateCanonical,
  applyMigrations,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalDoc,
  type CanonicalMigration,
} from "../../src/canonical";

const noComponents: ResolveCanonicalOptions["fetchComponents"] = async () => new Map();

// --- resolveCanonical ---

describe("resolveCanonical", () => {
  it("filters conditions and replaces variables over a canonical doc, preserving the version stamp", async () => {
    const doc: CanonicalDoc = {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      content: [
        {
          type: "conditionalBlock",
          attrs: { dimensionId: "dim-1", valueIds: ["v1"], logic: "include" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "shown" }] }],
        },
        {
          type: "conditionalBlock",
          attrs: { dimensionId: "dim-1", valueIds: ["v2"], logic: "include" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "hidden" }] }],
        },
        { type: "paragraph", content: [{ type: "variableToken", attrs: { key: "product" } }] },
      ],
    };

    const result = await resolveCanonical(doc, {
      fetchComponents: noComponents,
      conditionProfile: { "dim-1": ["v1"] },
      variables: { product: "Topicary" },
    });

    expect(result.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
    const json = JSON.stringify(result.content);
    expect(json).toContain("shown");
    expect(json).not.toContain("hidden");
    // variableToken resolved to its value; no token node remains.
    expect(json).not.toContain("variableToken");
    expect(json).toContain("Topicary");
  });

  it("returns a doc unchanged when there are no conditions, variables, or components", async () => {
    const doc: CanonicalDoc = {
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      content: [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }],
    };
    const result = await resolveCanonical(doc, {
      fetchComponents: noComponents,
      conditionProfile: {},
      variables: {},
    });
    expect(result.content).toEqual(doc.content);
  });
});

// --- applyMigrations (the schema-bump mechanism) ---

describe("applyMigrations", () => {
  const migrations: Record<number, CanonicalMigration> = {
    1: (c) => c.map((n) => ({ ...n, attrs: { ...(n.attrs ?? {}), step1: true } })),
    2: (c) => c.map((n) => ({ ...n, attrs: { ...(n.attrs ?? {}), step2: true } })),
  };

  it("chains migrations one version at a time from→to", () => {
    const out = applyMigrations([{ type: "paragraph" }], 1, 3, migrations);
    expect(out[0].attrs).toMatchObject({ step1: true, step2: true });
  });

  it("runs only the steps within the requested range", () => {
    const out = applyMigrations([{ type: "paragraph" }], 2, 3, migrations);
    expect(out[0].attrs).toMatchObject({ step2: true });
    expect(out[0].attrs).not.toHaveProperty("step1");
  });

  it("is a no-op when fromVersion >= toVersion", () => {
    const input = [{ type: "paragraph" }];
    expect(applyMigrations(input, 3, 3, migrations)).toEqual(input);
  });

  it("skips missing version steps without throwing (gaps are no-ops)", () => {
    const sparse: Record<number, CanonicalMigration> = { 2: migrations[2] };
    const out = applyMigrations([{ type: "paragraph" }], 1, 3, sparse);
    expect(out[0].attrs).toMatchObject({ step2: true });
    expect(out[0].attrs).not.toHaveProperty("step1");
  });

  it("defaults to the (empty at v1) registry → identity", () => {
    const input = [{ type: "paragraph" }];
    expect(applyMigrations(input, 0, CANONICAL_SCHEMA_VERSION)).toEqual(input);
  });
});

// --- validateCanonical ---

describe("validateCanonical", () => {
  it("passes a structurally valid document", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "ok" }] },
        { type: "image", attrs: { src: "/a.png", alt: "a" } },
      ],
    };
    expect(validateCanonical(doc)).toEqual([]);
  });

  it("flags an unknown node type as an error", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "mermaidDiagram" }] };
    const findings = validateCanonical(doc);
    expect(findings.some((f) => f.code === "unknown-node" && f.severity === "error")).toBe(true);
  });

  it("flags a heading with no/invalid level", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "x" }] }] };
    expect(validateCanonical(doc).some((f) => f.code === "heading-level")).toBe(true);
  });

  it("flags a componentRef missing its componentId", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "componentRef", attrs: {} }] };
    const f = validateCanonical(doc).find((x) => x.code === "missing-component-id");
    expect(f?.severity).toBe("error");
  });

  it("flags an image missing its src and reports a path", () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "paragraph" }, { type: "image", attrs: { alt: "a" } }] };
    const f = validateCanonical(doc).find((x) => x.code === "missing-image-src");
    expect(f).toBeDefined();
    // path is [rootIndex, ...childIndices]; image is the 2nd child of the doc.
    expect(f?.path[f.path.length - 1]).toBe(1);
  });

  it("warns on a malformed definition item", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "definitionList", content: [{ type: "definitionItem", content: [{ type: "definitionTerm", content: [] }] }] }],
    };
    expect(validateCanonical(doc).some((f) => f.code === "malformed-definition-item" && f.severity === "warning")).toBe(true);
  });
});
