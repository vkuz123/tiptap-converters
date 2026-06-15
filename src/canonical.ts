/**
 * Topicary canonical content model + TipTap adapter boundary.
 *
 * The canonical model is the **closed, versioned vocabulary Topicary owns**
 * (see ../../../docs/strategy/CANONICAL_MODEL.md). TipTap/ProseMirror JSON and
 * HDITA are both *serializations* of it — neither is the system of record.
 *
 * This module is the adapter boundary between TipTap's wire JSON and the
 * canonical model. At schema v1 the transform is near-identity (the canonical
 * vocabulary deliberately mirrors what the editor already emits), but routing
 * every read/write through here is what makes a future TipTap reshape
 * (v3→v4 precedent) an *adapter change*, not a migration of every customer's
 * stored `content_json`. New schema versions register their transform in
 * `MIGRATIONS` and bump `CANONICAL_SCHEMA_VERSION`.
 *
 * Pure, dependency-free. The HDITA serializer lives in ./hdita.ts.
 *
 * @module @topicary/export/canonical
 */

import type { JSONContent } from "@tiptap/core";

// --- Version ---

/**
 * Current canonical-model schema version. Stored in the `content_version`
 * column (migration 081). Independent of TipTap's npm version. Bump when the
 * node/mark vocabulary or an attribute shape changes; register the upgrade in
 * `MIGRATIONS`.
 */
export const CANONICAL_SCHEMA_VERSION = 1;

// --- Closed vocabulary (CANONICAL_MODEL.md §2 / §3) ---

/** Every node `type` the canonical model recognises. */
export const CANONICAL_NODE_TYPES: ReadonlySet<string> = new Set([
  // structural / root
  "doc", "paragraph", "heading", "blockquote", "horizontalRule",
  // lists
  "bulletList", "orderedList", "listItem",
  "definitionList", "definitionItem", "definitionTerm", "definitionDescription",
  // code
  "codeBlock", "codeGroup",
  // tables
  "table", "tableRow", "tableHeader", "tableCell",
  // media
  "image",
  // semantic / Topicary-specific
  "componentRef", "inlineComponentRef", "variableToken", "topicLink",
  "conditionalBlock", "callout",
  // inline leaves
  "text", "hardBreak",
]);

/** Every mark `type` the canonical model recognises. */
export const CANONICAL_MARK_TYPES: ReadonlySet<string> = new Set([
  "bold", "italic", "strike", "code", "link", "conditionalInline",
]);

// --- Types ---

/**
 * A canonical content node. Structurally identical to a TipTap node at schema
 * v1 — declared as an owned alias so the rest of the codebase depends on *our*
 * type, not `@tiptap/core`'s. Future schema versions may diverge.
 */
export type CanonicalNode = JSONContent;

/**
 * A canonical document: the version stamp plus the top-level block content.
 * The TipTap `doc` wrapper is unwrapped (its children become `content`).
 */
export interface CanonicalDoc {
  /** Canonical-model schema version this document conforms to. */
  schemaVersion: number;
  /** Top-level block nodes (the TipTap doc's children). */
  content: CanonicalNode[];
}

// --- Migrations (forward-compatibility hook) ---

/** A single canonical-model upgrade step: transforms content one version forward. */
export type CanonicalMigration = (content: CanonicalNode[]) => CanonicalNode[];

/**
 * Registry of canonical-model upgrades, keyed by the version being upgraded
 * *from*. Each entry transforms content at version `N` into version `N+1`.
 * Empty at v1 — this is the seam where a TipTap reshape is absorbed without
 * touching stored content. See CANONICAL_MODEL.md §5.
 */
const MIGRATIONS: Record<number, CanonicalMigration> = {};

/**
 * Apply registered migrations to bring `content` from `fromVersion` up to
 * `toVersion`, one step at a time. Missing version steps are skipped (no-op),
 * so gaps don't throw. Pure; `migrations` is injectable for testing. This is
 * the mechanism that lets a schema bump migrate stored content instead of
 * rewriting it — the core promise of the own-model-canonical architecture.
 */
export function applyMigrations(
  content: CanonicalNode[],
  fromVersion: number,
  toVersion: number = CANONICAL_SCHEMA_VERSION,
  migrations: Record<number, CanonicalMigration> = MIGRATIONS,
): CanonicalNode[] {
  let current = content;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v];
    if (step) current = step(current);
  }
  return current;
}

// --- Adapter: TipTap JSON ↔ canonical ---

/**
 * Convert a TipTap/ProseMirror JSON document to the canonical model.
 *
 * Accepts either a full `{ type: "doc", content: [...] }` document or a bare
 * content array. Lossless: node attributes and marks pass through unchanged
 * (v1 is near-identity). Use `collectUnknownTypes` separately to validate the
 * vocabulary — this function does not drop unknown nodes (losslessness wins).
 *
 * @param json    a TipTap doc (or its content array)
 * @param sourceVersion the schema version `json` was stored at (default: current)
 */
export function tiptapToCanonical(
  json: JSONContent | JSONContent[],
  sourceVersion: number = CANONICAL_SCHEMA_VERSION,
): CanonicalDoc {
  const content = Array.isArray(json) ? json : json.content ?? [];
  const migrated = sourceVersion < CANONICAL_SCHEMA_VERSION ? applyMigrations(content, sourceVersion) : content;
  return { schemaVersion: CANONICAL_SCHEMA_VERSION, content: migrated };
}

/**
 * Convert a canonical document back to a TipTap/ProseMirror JSON document.
 * Re-wraps the content in a `doc` node. Inverse of `tiptapToCanonical`.
 */
export function canonicalToTiptap(doc: CanonicalDoc): JSONContent {
  return { type: "doc", content: doc.content };
}

// --- Validation ---

/**
 * Walk a TipTap/canonical document and collect any node or mark `type` that
 * is not in the closed canonical vocabulary. An empty result for both means
 * the document is fully representable. This is the per-document equivalent of
 * the Phase-0 histogram gate (CANONICAL_MODEL.md §6).
 */
export function collectUnknownTypes(
  json: JSONContent | JSONContent[],
): { nodes: string[]; marks: string[] } {
  const nodes = new Set<string>();
  const marks = new Set<string>();

  function walk(node: JSONContent): void {
    if (node.type && !CANONICAL_NODE_TYPES.has(node.type)) nodes.add(node.type);
    if (node.marks) {
      for (const m of node.marks) {
        if (m.type && !CANONICAL_MARK_TYPES.has(m.type)) marks.add(m.type);
      }
    }
    if (node.content) node.content.forEach(walk);
  }

  const roots = Array.isArray(json) ? json : [json];
  roots.forEach(walk);
  return { nodes: [...nodes], marks: [...marks] };
}

// --- Structural validation ---

export type CanonicalFindingSeverity = "error" | "warning";

/** A single structural-validation finding against the canonical model. */
export interface CanonicalFinding {
  severity: CanonicalFindingSeverity;
  /** Stable machine code, e.g. "unknown-node", "missing-component-id". */
  code: string;
  /** Human-readable description. */
  message: string;
  /** The node/mark type the finding concerns, when applicable. */
  type?: string;
  /** Index path from the document root to the offending node. */
  path: number[];
}

const CALLOUT_VARIANTS: ReadonlySet<string> = new Set(["info", "warning", "danger", "success"]);

function isMissing(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Validate a document against the canonical model's structural rules:
 * vocabulary membership (§2/§3), required attributes on semantic nodes, and a
 * few content-model invariants the HDITA serializer relies on. Pure; returns a
 * flat list of findings (empty = valid).
 *
 * This is the in-model structural gate. Schema validation against LwDITA
 * RELAX NG / Schematron over the *serialized* DITA output is a separate,
 * heavier layer that requires DITA-OT (JVM) and runs in the publish pipeline,
 * not here.
 */
export function validateCanonical(json: JSONContent | JSONContent[]): CanonicalFinding[] {
  const findings: CanonicalFinding[] = [];
  const at = (node: JSONContent, name: string): unknown => node.attrs?.[name];

  function walk(node: JSONContent, path: number[]): void {
    const type = node.type;

    if (type && !CANONICAL_NODE_TYPES.has(type)) {
      findings.push({ severity: "error", code: "unknown-node", message: `Unknown node type "${type}" is not in the canonical vocabulary.`, type, path });
    }

    if (node.marks) {
      for (const m of node.marks) {
        if (m.type && !CANONICAL_MARK_TYPES.has(m.type)) {
          findings.push({ severity: "error", code: "unknown-mark", message: `Unknown mark type "${m.type}" is not in the canonical vocabulary.`, type: m.type, path });
        }
        if (m.type === "conditionalInline" && isMissing(m.attrs?.dimensionId)) {
          findings.push({ severity: "warning", code: "missing-dimension", message: "conditionalInline mark has no dimensionId.", type: "conditionalInline", path });
        }
      }
    }

    switch (type) {
      case "heading": {
        const level = at(node, "level");
        if (typeof level !== "number" || level < 1 || level > 6) {
          findings.push({ severity: "error", code: "heading-level", message: `heading has invalid level ${String(level)} (expected 1–6).`, type, path });
        }
        break;
      }
      case "componentRef":
      case "inlineComponentRef":
        if (isMissing(at(node, "componentId"))) {
          findings.push({ severity: "error", code: "missing-component-id", message: `${type} has no componentId.`, type, path });
        }
        break;
      case "variableToken":
        if (isMissing(at(node, "key"))) {
          findings.push({ severity: "error", code: "missing-variable-key", message: "variableToken has no key.", type, path });
        }
        break;
      case "topicLink":
        if (isMissing(at(node, "topicId"))) {
          findings.push({ severity: "error", code: "missing-topic-id", message: "topicLink has no topicId.", type, path });
        }
        break;
      case "image":
        if (isMissing(at(node, "src"))) {
          findings.push({ severity: "error", code: "missing-image-src", message: "image has no src.", type, path });
        }
        break;
      case "callout": {
        const variant = at(node, "variant");
        if (!isMissing(variant) && !CALLOUT_VARIANTS.has(String(variant))) {
          findings.push({ severity: "warning", code: "unknown-callout-variant", message: `callout variant "${String(variant)}" is not info/warning/danger/success.`, type, path });
        }
        break;
      }
      case "conditionalBlock":
        if (isMissing(at(node, "dimensionId"))) {
          findings.push({ severity: "warning", code: "missing-dimension", message: "conditionalBlock has no dimensionId.", type, path });
        }
        break;
      case "definitionItem": {
        const kinds = (node.content ?? []).map((k) => k.type);
        if (kinds.length !== 2 || kinds[0] !== "definitionTerm" || kinds[1] !== "definitionDescription") {
          findings.push({ severity: "warning", code: "malformed-definition-item", message: "definitionItem must contain exactly a definitionTerm then a definitionDescription.", type, path });
        }
        break;
      }
    }

    if (node.content) node.content.forEach((child, i) => walk(child, [...path, i]));
  }

  const roots = Array.isArray(json) ? json : [json];
  roots.forEach((r, i) => walk(r, [i]));
  return findings;
}
