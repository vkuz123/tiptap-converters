/**
 * Canonical model ↔ HDITA serialization.
 *
 * HDITA is HTML5 + semantic `data-*` attributes — the canonical *interchange*
 * shape. It maps cleanly onto ProseMirror's DOM model and is one DITA-OT
 * (`org.lwdita`) hop from normalized DITA, so it is the natural serialization
 * target.
 *
 * `canonicalToHdita(doc)` emits a compact, well-formed HDITA string (no
 * inter-block whitespace, so the parse direction sees no spurious text nodes).
 * `hditaToCanonical(html)` parses it back. The pair round-trips losslessly for
 * canonical documents in normalized form — that round-trip is the point of an
 * owned canonical model: content is not trapped in TipTap's shape.
 *
 * Design notes:
 * - HDITA here is intentionally **lossless** (full HTML5 tables with spans,
 *   code groups, `<hr>`, blockquotes are all preserved). LwDITA downgrades
 *   (simpletable drops spans, etc.) happen at the later DITA-OT hop, NOT in
 *   HDITA.
 * - App-specific node attributes are projected onto HDITA-standard `data-*`:
 *   componentRef→`data-conref`, variableToken→`data-keyref`, conditionals→
 *   `data-props` (plus the raw `data-*` carriers for lossless round-trip).
 *
 * The serialize direction is dependency-free. The parse direction lazily loads
 * `cheerio`.
 */

import type { JSONContent } from "@tiptap/core";
import { CANONICAL_SCHEMA_VERSION } from "./canonical";
import type { CanonicalDoc, CanonicalNode } from "./canonical";

// --- Context ---

/**
 * Optional resolution context. Not required for a lossless round-trip
 * (topic/component references serialize by id); used to attach human-facing
 * `href`s when available.
 */
export interface HditaContext {
  /** topicId → link target, for adding `href` on topic xrefs. */
  topicLinks?: Map<string, { href: string; title?: string }>;
}

// --- Escaping ---

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build ` name="value"` only when `value` is a non-empty/non-null primitive. */
function attr(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return ` ${name}="${escapeAttr(String(value))}"`;
}

/** Build a `data-*` attribute carrying a JSON value. */
function jsonAttr(name: string, value: unknown): string {
  return ` ${name}="${escapeAttr(JSON.stringify(value))}"`;
}

// --- Marks ---

/**
 * Canonical mark ordering. Marks are a flat set; emitting and re-attaching them
 * in a fixed order makes the round-trip deterministic regardless of DOM nesting.
 */
const MARK_ORDER = ["link", "code", "bold", "italic", "strike", "conditionalInline"];

function markRank(type: string): number {
  const i = MARK_ORDER.indexOf(type);
  return i === -1 ? MARK_ORDER.length : i;
}

function sortMarks<T extends { type: string }>(marks: T[]): T[] {
  return [...marks].sort((a, b) => markRank(a.type) - markRank(b.type));
}

type Mark = { type: string; attrs?: Record<string, unknown> };

/** Wrap inline text in its marks, outermost-first per MARK_ORDER. */
function wrapMarks(inner: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return inner;
  // Apply in reverse rank order so the lowest-rank mark ends up outermost.
  let out = inner;
  for (const m of [...sortMarks(marks)].reverse()) {
    out = openMark(m) + out + closeMark(m.type);
  }
  return out;
}

function openMark(m: Mark): string {
  switch (m.type) {
    case "bold": return "<b>";
    case "italic": return "<i>";
    case "code": return "<code>";
    case "strike": return "<s>";
    case "link":
      return `<a${attr("href", m.attrs?.href)}${attr("rel", m.attrs?.rel)}${attr("class", m.attrs?.class)}${attr("target", m.attrs?.target)}>`;
    case "conditionalInline":
      return `<span data-class="conditional-inline"${conditionAttrs(m.attrs)}>`;
    default: return "<span>";
  }
}

function closeMark(type: string): string {
  switch (type) {
    case "bold": return "</b>";
    case "italic": return "</i>";
    case "code": return "</code>";
    case "strike": return "</s>";
    case "link": return "</a>";
    default: return "</span>";
  }
}

/** Shared profiling (`data-props` + raw carriers) for conditional block/inline. */
function conditionAttrs(a: Record<string, unknown> | undefined): string {
  if (!a) return "";
  const labels = Array.isArray(a.valueLabels) ? (a.valueLabels as string[]).join(",") : "";
  const props = `${a.dimensionName ?? ""}=${labels}`;
  return (
    attr("data-props", props) +
    attr("data-dimension-id", a.dimensionId) +
    attr("data-dimension-name", a.dimensionName) +
    jsonAttr("data-value-ids", a.valueIds ?? []) +
    jsonAttr("data-value-labels", a.valueLabels ?? []) +
    attr("data-color", a.color) +
    attr("data-logic", a.logic)
  );
}

// --- Serialize: canonical → HDITA ---

/** Convert a canonical document to a compact HDITA (HTML5 + data-*) string. */
export function canonicalToHdita(doc: CanonicalDoc, _ctx?: HditaContext): string {
  return `<article>${emitBlocks(doc.content)}</article>`;
}

function emitBlocks(nodes: CanonicalNode[] | undefined): string {
  return (nodes ?? []).map(emitBlock).join("");
}

function emitBlock(node: CanonicalNode): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "paragraph":
      return `<p>${emitInline(node.content)}</p>`;
    case "heading":
      return `<h${a.level ?? 1}>${emitInline(node.content)}</h${a.level ?? 1}>`;
    case "blockquote":
      return `<div data-class="lq">${emitBlocks(node.content)}</div>`;
    case "horizontalRule":
      return "<hr>";
    case "bulletList":
      return `<ul>${emitBlocks(node.content)}</ul>`;
    case "orderedList":
      return `<ol${attr("start", a.start && a.start !== 1 ? a.start : null)}>${emitBlocks(node.content)}</ol>`;
    case "listItem":
      return `<li>${emitBlocks(node.content)}</li>`;
    case "definitionList":
      return `<dl>${emitBlocks(node.content)}</dl>`;
    case "definitionItem":
      return `<div data-class="dlentry">${emitBlocks(node.content)}</div>`;
    case "definitionTerm":
      return `<dt>${emitInline(node.content)}</dt>`;
    case "definitionDescription":
      return `<dd>${emitBlocks(node.content)}</dd>`;
    case "codeBlock":
      return `<pre${attr("data-language", a.language)}>${escapeText(textContent(node))}</pre>`;
    case "codeGroup":
      return `<div data-class="code-group">${emitBlocks(node.content)}</div>`;
    case "table":
      return `<table>${emitBlocks(node.content)}</table>`;
    case "tableRow":
      return `<tr>${emitBlocks(node.content)}</tr>`;
    case "tableHeader":
      return `<th${cellAttrs(a)}>${emitBlocks(node.content)}</th>`;
    case "tableCell":
      return `<td${cellAttrs(a)}>${emitBlocks(node.content)}</td>`;
    case "image":
      return `<img${attr("src", a.src)}${attr("alt", a.alt)}${attr("title", a.title)}>`;
    case "callout":
      return `<div data-class="note"${attr("data-note-type", a.variant)}>${emitBlocks(node.content)}</div>`;
    case "conditionalBlock":
      return `<div data-class="conditional"${conditionAttrs(a)}>${emitBlocks(node.content)}</div>`;
    case "componentRef":
      return `<div${attr("data-conref", a.componentId)}${jsonAttr("data-variable-overrides", a.variableOverrides ?? {})}></div>`;
    default:
      // Inline node appearing at block level, or unknown — emit inline form.
      return emitInlineNode(node);
  }
}

function cellAttrs(a: Record<string, unknown>): string {
  let out = "";
  if (a.colspan && a.colspan !== 1) out += attr("colspan", a.colspan);
  if (a.rowspan && a.rowspan !== 1) out += attr("rowspan", a.rowspan);
  if (Array.isArray(a.colwidth) && a.colwidth.length) out += jsonAttr("data-colwidth", a.colwidth);
  return out;
}

function emitInline(nodes: CanonicalNode[] | undefined): string {
  return (nodes ?? []).map(emitInlineNode).join("");
}

function emitInlineNode(node: CanonicalNode): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "text":
      return wrapMarks(escapeText(node.text ?? ""), node.marks as Mark[] | undefined);
    case "hardBreak":
      return "<br>";
    case "variableToken":
      return `<span${attr("data-keyref", a.key)}></span>`;
    case "inlineComponentRef":
      return `<span${attr("data-conref", a.componentId)}${jsonAttr("data-variable-overrides", a.variableOverrides ?? {})}></span>`;
    case "topicLink":
      return `<a${attr("data-keyref", a.topicId)}></a>`;
    default:
      return "";
  }
}

/** Concatenated text of a node's direct text children (for codeBlock). */
function textContent(node: CanonicalNode): string {
  return (node.content ?? []).map((c) => c.text ?? "").join("");
}

// --- Parse: HDITA → canonical ---

/**
 * Parse an HDITA string back into a canonical document. Inverse of
 * `canonicalToHdita`. Lazily loads `cheerio`.
 */
export async function hditaToCanonical(html: string): Promise<CanonicalDoc> {
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html, null, false);
  // Parse from <article> if present, else from the fragment root.
  const article = $("article").get(0);
  const roots = article ? domChildren(article) : $.root().children().toArray();
  return { schemaVersion: CANONICAL_SCHEMA_VERSION, content: parseBlocks(roots) };
}

// Minimal structural typing over cheerio/domhandler nodes (avoids a type dep).
type DomNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

function domChildren(el: DomNode): DomNode[] {
  return el.children ?? [];
}

function isTag(n: DomNode): boolean {
  return n.type === "tag" || n.type === "script" || n.type === "style";
}

function dataClass(n: DomNode): string | undefined {
  return n.attribs?.["data-class"];
}

function parseBlocks(nodes: DomNode[]): CanonicalNode[] {
  const out: CanonicalNode[] = [];
  for (const n of nodes) {
    if (!isTag(n)) continue; // skip stray whitespace/text between blocks
    // HTML parsers inject <tbody>/<thead>/<tfoot> around table rows even when
    // the source omits them — flatten these wrappers so rows attach to <table>.
    if (n.name === "tbody" || n.name === "thead" || n.name === "tfoot") {
      out.push(...parseBlocks(domChildren(n)));
      continue;
    }
    const node = parseBlock(n);
    if (node) {
      out.push(node);
      continue;
    }
    // An unrecognized <div> is a structural wrapper — descend so we don't lose
    // its children (mirrors the tbody/thead/tfoot flattening above). Other
    // null-returning tags are genuinely inert and stay dropped.
    if (n.name === "div") out.push(...parseBlocks(domChildren(n)));
  }
  return out;
}

function parseBlock(el: DomNode): CanonicalNode | null {
  const name = el.name;
  const kids = domChildren(el);
  switch (name) {
    case "p":
      return { type: "paragraph", content: parseInline(kids) };
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return { type: "heading", attrs: { level: Number(name.slice(1)) }, content: parseInline(kids) };
    case "hr":
      return { type: "horizontalRule" };
    case "ul":
      return { type: "bulletList", content: parseBlocks(kids) };
    case "ol": {
      const start = el.attribs?.start;
      return { type: "orderedList", ...(start ? { attrs: { start: Number(start) } } : {}), content: parseBlocks(kids) };
    }
    case "li":
      return { type: "listItem", content: parseBlocks(kids) };
    case "dl":
      return { type: "definitionList", content: parseBlocks(kids) };
    case "dt":
      return { type: "definitionTerm", content: parseInline(kids) };
    case "dd":
      return { type: "definitionDescription", content: parseBlocks(kids) };
    case "pre": {
      const language = el.attribs?.["data-language"];
      const text = collectText(el);
      return {
        type: "codeBlock",
        ...(language ? { attrs: { language } } : {}),
        ...(text ? { content: [{ type: "text", text }] } : {}),
      };
    }
    case "table":
      return { type: "table", content: parseBlocks(kids) };
    case "tr":
      return { type: "tableRow", content: parseBlocks(kids) };
    case "th":
      return { type: "tableHeader", ...cellAttrsFromDom(el), content: parseBlocks(kids) };
    case "td":
      return { type: "tableCell", ...cellAttrsFromDom(el), content: parseBlocks(kids) };
    case "img":
      return { type: "image", attrs: pickAttrs(el, { src: "src", alt: "alt", title: "title" }) };
    case "div":
      return parseDiv(el);
    default:
      return null;
  }
}

function parseDiv(el: DomNode): CanonicalNode | null {
  const cls = dataClass(el);
  const kids = domChildren(el);
  if (cls === "lq") return { type: "blockquote", content: parseBlocks(kids) };
  if (cls === "code-group") return { type: "codeGroup", content: parseBlocks(kids) };
  if (cls === "dlentry") return { type: "definitionItem", content: parseBlocks(kids) };
  if (cls === "note") {
    const variant = el.attribs?.["data-note-type"];
    return { type: "callout", attrs: { variant: variant ?? "info" }, content: parseBlocks(kids) };
  }
  if (cls === "conditional") {
    return { type: "conditionalBlock", attrs: conditionAttrsFromDom(el), content: parseBlocks(kids) };
  }
  if (el.attribs?.["data-conref"] !== undefined) {
    return { type: "componentRef", attrs: conrefAttrsFromDom(el) };
  }
  // Unrecognized div: signal "flatten" by returning null — parseBlocks descends
  // into the children so the subtree is preserved, not dropped.
  return null;
}

// --- Inline parsing (accumulate marks while descending) ---

function parseInline(nodes: DomNode[]): CanonicalNode[] {
  const out: CanonicalNode[] = [];
  for (const n of nodes) parseInlineNode(n, [], out);
  return out;
}

function parseInlineNode(n: DomNode, marks: Mark[], out: CanonicalNode[]): void {
  if (n.type === "text") {
    const text = n.data ?? "";
    if (text.length === 0) return;
    out.push({ type: "text", text, ...(marks.length ? { marks: sortMarks(marks) } : {}) });
    return;
  }
  if (!isTag(n)) return;
  const name = n.name;
  const kids = domChildren(n);

  // Inline atoms.
  if (name === "br") { out.push({ type: "hardBreak" }); return; }
  if (name === "span" && n.attribs?.["data-keyref"] !== undefined) {
    out.push({ type: "variableToken", attrs: { key: n.attribs["data-keyref"] } });
    return;
  }
  if (name === "span" && n.attribs?.["data-conref"] !== undefined) {
    out.push({ type: "inlineComponentRef", attrs: conrefAttrsFromDom(n) });
    return;
  }
  if (name === "a" && n.attribs?.["data-keyref"] !== undefined) {
    out.push({ type: "topicLink", attrs: { topicId: n.attribs["data-keyref"] } });
    return;
  }

  // Mark wrappers — add the mark and descend.
  const mark = markForElement(n);
  const nextMarks = mark ? [...marks, mark] : marks;
  for (const c of kids) parseInlineNode(c, nextMarks, out);
}

function markForElement(n: DomNode): Mark | null {
  switch (n.name) {
    case "b": case "strong": return { type: "bold" };
    case "i": case "em": return { type: "italic" };
    case "code": return { type: "code" };
    case "s": case "strike": case "del": return { type: "strike" };
    case "a": {
      const attrs = pickAttrs(n, { href: "href", rel: "rel", class: "class", target: "target" });
      return { type: "link", attrs };
    }
    case "span":
      if (dataClass(n) === "conditional-inline") {
        return { type: "conditionalInline", attrs: conditionAttrsFromDom(n) };
      }
      return null;
    default:
      return null;
  }
}

// --- DOM attribute helpers ---

function pickAttrs(el: DomNode, map: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, attrName] of Object.entries(map)) {
    const v = el.attribs?.[attrName];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function cellAttrsFromDom(el: DomNode): { attrs?: Record<string, unknown> } {
  const attrs: Record<string, unknown> = {};
  if (el.attribs?.colspan) attrs.colspan = Number(el.attribs.colspan);
  if (el.attribs?.rowspan) attrs.rowspan = Number(el.attribs.rowspan);
  if (el.attribs?.["data-colwidth"]) attrs.colwidth = JSON.parse(el.attribs["data-colwidth"]);
  return Object.keys(attrs).length ? { attrs } : {};
}

function conrefAttrsFromDom(el: DomNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = { componentId: el.attribs?.["data-conref"] };
  const overrides = el.attribs?.["data-variable-overrides"];
  attrs.variableOverrides = overrides ? JSON.parse(overrides) : {};
  return attrs;
}

function conditionAttrsFromDom(el: DomNode): Record<string, unknown> {
  const a = el.attribs ?? {};
  return {
    dimensionId: a["data-dimension-id"] ?? null,
    dimensionName: a["data-dimension-name"] ?? "",
    valueIds: a["data-value-ids"] ? JSON.parse(a["data-value-ids"]) : [],
    valueLabels: a["data-value-labels"] ? JSON.parse(a["data-value-labels"]) : [],
    color: a["data-color"] ?? "#6366f1",
    logic: a["data-logic"] ?? "include",
  };
}

/** Concatenate all descendant text (for <pre>). */
function collectText(el: DomNode): string {
  let out = "";
  for (const c of domChildren(el)) {
    if (c.type === "text") out += c.data ?? "";
    else if (isTag(c)) out += collectText(c);
  }
  return out;
}
