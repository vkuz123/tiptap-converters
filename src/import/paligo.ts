/**
 * Paligo export (`<e:export>`) → TipTap topics + reused components.
 *
 * Imports a Paligo **transfer export** — the reference-based XML payload that
 * the PEF wraps (namespace `http://ns.expertinfo.se/cms/xmlns/export/1.0`), NOT
 * the lossy published-DocBook output. This is the high-fidelity migration path
 * documented in MIGRATION_FIDELITY.md Part 2: text fragments are stored once as
 * `type="text"` resources and referenced from topic bodies via `xinfo:text`
 * pointers.
 *
 * `parsePaligoExport(xml)` returns the publication title, one topic per
 * `type="component"` resource, and the set of **reused** text fragments lifted
 * into components. Reuse preservation: a `<para xinfo:text="X"/>` whose fragment
 * `X` is referenced by **two or more** paragraphs across the publication becomes
 * a reusable component, and every such reference becomes a `componentRef` — so
 * the single-source reuse graph survives the import instead of being flattened
 * into duplicate copies (the whole point of importing the transfer export rather
 * than the published DocBook). Fragments referenced once are inlined as text.
 *
 * Conversion: `<title>`→ topic title, `<para>`→ paragraph (or `componentRef`
 * when reused), `<informaltable>`/`<table>`→ table. Run the result through
 * `tiptapToCanonical` to get canonical documents.
 *
 * Scope (v1) NOT yet handled (documented follow-ups): the `type="publication"`
 * cover with `<?placeholder?>` variable slots, lists/notes/inline marks, and
 * reuse of non-paragraph fragments (titles, inline phrases). Uses
 * `fast-xml-parser` with `preserveOrder` so title→para→table order is faithful.
 *
 * @module tiptap-converters/import/paligo
 */

import { XMLParser } from "fast-xml-parser";
import type { TipTapNode, TipTapDoc } from "../core/types";

// --- Types ---

/** A topic reconstructed from a Paligo `type="component"` resource. */
export interface PaligoTopic {
  /** The component resource id (Paligo's numeric id). */
  id: string;
  /** Resolved topic title. */
  title: string;
  /** Topic body as a TipTap document (title excluded — it's a separate field). */
  doc: TipTapDoc;
}

/** A reusable component lifted from a text fragment referenced by ≥2 topics. */
export interface PaligoComponent {
  /** Synthetic component id, `paligo-<textFragmentId>`. */
  id: string;
  /** Human-readable title (the fragment text). */
  title: string;
  /** Component body (a single paragraph holding the fragment text). */
  doc: TipTapDoc;
}

/** Result of parsing a Paligo `<e:export>` payload. */
export interface PaligoExportResult {
  publicationTitle: string;
  topics: PaligoTopic[];
  /** Reused text fragments, lifted into components (single-use fragments are inlined). */
  components: PaligoComponent[];
}

// --- Parser (preserveOrder mirrors the DITA importer's config) ---

type XNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
  // Disable entity expansion — untrusted input should not be able to trigger
  // entity-expansion DoS (billion laughs); this converter never needs it.
  processEntities: false,
});

/** Conversion context threaded through the body walk. */
interface Ctx {
  /** text-fragment id → resolved text. */
  textMap: Map<string, string>;
  /** text-fragment id → component id, for fragments reused ≥2× (→ componentRef). */
  shared: Map<string, string>;
}

// --- XML helpers (preserveOrder node shape) ---

function nodeTag(node: XNode): string {
  for (const k of Object.keys(node)) {
    if (k !== ":@" && k !== "#text") return k;
  }
  return "";
}

function nodeChildren(node: XNode): XNode[] {
  const t = nodeTag(node);
  if (!t) return [];
  const c = node[t];
  return Array.isArray(c) ? (c as XNode[]) : [];
}

function nodeAttr(node: XNode, name: string): string | undefined {
  const a = node[":@"] as Record<string, unknown> | undefined;
  if (!a) return undefined;
  const v = a[`@_${name}`];
  return v === undefined ? undefined : String(v);
}

function findChild(elements: XNode[], tag: string): XNode | undefined {
  return elements.find((e) => nodeTag(e) === tag);
}

function findChildren(elements: XNode[], tag: string): XNode[] {
  return elements.filter((e) => nodeTag(e) === tag);
}

function deepText(elements: XNode[]): string {
  let out = "";
  for (const el of elements) {
    if ("#text" in el) out += String(el["#text"]);
    else out += deepText(nodeChildren(el));
  }
  return out;
}

// --- Content conversion ---

/** Resolve an element's text: an `xinfo:text` reference if present, else its own text. */
function resolveText(el: XNode, textMap: Map<string, string>): string {
  const ref = nodeAttr(el, "xinfo:text");
  if (ref && textMap.has(ref)) return textMap.get(ref)!.trim();
  return deepText(nodeChildren(el)).trim();
}

function paragraph(text: string): TipTapNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

/** Collect table rows in document order (direct <tr> plus <thead>/<tbody>/<tfoot>). */
function gatherRows(table: XNode): XNode[] {
  const rows: XNode[] = [];
  for (const child of nodeChildren(table)) {
    const tag = nodeTag(child);
    if (tag === "tr") rows.push(child);
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      rows.push(...findChildren(nodeChildren(child), "tr"));
    }
  }
  return rows;
}

function tableNode(el: XNode, ctx: Ctx): TipTapNode {
  const rows: TipTapNode[] = [];
  for (const tr of gatherRows(el)) {
    const cells: TipTapNode[] = [];
    for (const cell of nodeChildren(tr)) {
      const ct = nodeTag(cell);
      if (ct !== "th" && ct !== "td") continue;
      const blocks = convertBlocks(nodeChildren(cell), ctx);
      cells.push({
        type: ct === "th" ? "tableHeader" : "tableCell",
        content: blocks.length ? blocks : [{ type: "paragraph" }],
      });
    }
    if (cells.length) rows.push({ type: "tableRow", content: cells });
  }
  return { type: "table", content: rows };
}

/** Convert a `<para>` to either a componentRef (reused fragment) or an inline paragraph. */
function paraBlock(el: XNode, ctx: Ctx): TipTapNode {
  const ref = nodeAttr(el, "xinfo:text");
  if (ref && ctx.shared.has(ref)) {
    return { type: "componentRef", attrs: { componentId: ctx.shared.get(ref), variableOverrides: {} } };
  }
  return paragraph(resolveText(el, ctx.textMap));
}

/** Convert a list of DocBook block elements to TipTap block nodes. */
function convertBlocks(elements: XNode[], ctx: Ctx): TipTapNode[] {
  const out: TipTapNode[] = [];
  for (const el of elements) {
    switch (nodeTag(el)) {
      case "para":
        out.push(paraBlock(el, ctx));
        break;
      case "informaltable":
      case "table":
        out.push(tableNode(el, ctx));
        break;
      // Unrecognized elements (and whitespace #text) are skipped in v1.
      default:
        break;
    }
  }
  return out;
}

function sectionOf(resource: XNode): XNode | undefined {
  const content = findChild(nodeChildren(resource), "e:content");
  if (!content) return undefined;
  return findChild(nodeChildren(content), "section");
}

function convertComponent(resource: XNode, ctx: Ctx): PaligoTopic | null {
  const section = sectionOf(resource);
  if (!section) return null;

  const kids = nodeChildren(section);
  const titleEl = findChild(kids, "title");
  const title = titleEl
    ? resolveText(titleEl, ctx.textMap)
    : nodeAttr(section, "xinfo:resource-title") || "Untitled";

  const body = convertBlocks(kids.filter((k) => nodeTag(k) !== "title"), ctx);
  const id = nodeAttr(resource, "id") || nodeAttr(section, "xml:id") || "";

  return { id, title, doc: { type: "doc", content: body } };
}

function buildTextMap(resources: XNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of resources) {
    if (nodeAttr(r, "type") !== "text") continue;
    const id = nodeAttr(r, "id");
    const content = findChild(nodeChildren(r), "e:content");
    if (id && content) map.set(id, deepText(nodeChildren(content)));
  }
  return map;
}

/** Count, across all topic bodies, how many `<para>` reference each text fragment. */
function countParaRefs(elements: XNode[], counts: Map<string, number>): void {
  for (const el of elements) {
    if (nodeTag(el) === "para") {
      const ref = nodeAttr(el, "xinfo:text");
      if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    const kids = nodeChildren(el);
    if (kids.length) countParaRefs(kids, counts);
  }
}

// --- Public API ---

/**
 * Parse a Paligo `<e:export>` transfer payload into a publication title,
 * topics, and reused components. Throws if the input is not a Paligo export.
 */
export function parsePaligoExport(xml: string): PaligoExportResult {
  const parsed = parser.parse(xml) as XNode[];
  const exportNode = parsed.find((n) => nodeTag(n) === "e:export");
  if (!exportNode) {
    throw new Error("Not a Paligo export: missing <e:export> root element.");
  }

  const top = nodeChildren(exportNode);
  const resources = findChildren(top, "e:resource");
  const componentResources = resources.filter((r) => nodeAttr(r, "type") === "component");
  const textMap = buildTextMap(resources);

  // Pass 1: count paragraph references to find reused fragments (≥2 uses).
  const counts = new Map<string, number>();
  for (const r of componentResources) {
    const section = sectionOf(r);
    if (section) {
      // Title text isn't a reusable component, so only the non-title body counts.
      countParaRefs(nodeChildren(section).filter((k) => nodeTag(k) !== "title"), counts);
    }
  }
  const shared = new Map<string, string>();
  const components: PaligoComponent[] = [];
  for (const [textId, n] of counts) {
    if (n >= 2 && textMap.has(textId)) {
      const compId = `paligo-${textId}`;
      shared.set(textId, compId);
      const text = textMap.get(textId)!.trim();
      components.push({ id: compId, title: text, doc: { type: "doc", content: [paragraph(text)] } });
    }
  }

  const ctx: Ctx = { textMap, shared };

  // Publication title from the structure manifest.
  let publicationTitle = "Untitled";
  const structure = findChild(top, "e:structure");
  if (structure) {
    const pub = findChild(nodeChildren(structure), "e:publication");
    if (pub) publicationTitle = nodeAttr(pub, "title") || publicationTitle;
  }

  // Pass 2: convert topics, substituting componentRefs for reused fragments.
  const topics: PaligoTopic[] = [];
  for (const r of componentResources) {
    const topic = convertComponent(r, ctx);
    if (topic) topics.push(topic);
  }

  return { publicationTitle, topics, components };
}
