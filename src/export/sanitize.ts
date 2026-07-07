import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import type { AnyNode, ChildNode } from "domhandler";

/**
 * DOM-based HTML sanitizer. Parses the input, walks the node tree removing
 * dangerous attributes and elements, then reserializes. Operating on a parsed
 * DOM (rather than regex over the serialized string) is what makes this
 * correct: text content is never rewritten, and URL schemes are checked against
 * the entity-decoded, whitespace-normalized value the browser would actually
 * see.
 *
 * Scope: neutralizes script-execution vectors (event handlers, javascript:/
 * vbscript: URLs, script-bearing data: URIs, and executable elements). It is a
 * safe-output filter for the HTML export path, not a general-purpose allowlist
 * sanitizer — it does not strip unknown-but-inert markup.
 */

// URL schemes safe to navigate to. Anything else in an href/src is removed.
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "ftp"]);

// Attributes whose value is a URL and must be scheme-checked.
const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "background",
  "xlink:href",
]);

// Elements that execute or load code — dropped with their subtree.
const DANGEROUS_ELEMENTS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
]);

/**
 * True if a URL attribute value is safe to keep. Entities are already decoded
 * by the parser; browsers ignore control chars and whitespace inside the scheme
 * (so `java\tscript:` runs), hence the strip before the scheme test.
 */
function isSafeUrl(raw: string): boolean {
  const v = raw.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  const match = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!match) return true; // relative URL, absolute path, or fragment
  const scheme = match[1];
  if (SAFE_SCHEMES.has(scheme)) return true;
  if (scheme === "data") {
    // Raster image data URIs are inert; data:image/svg+xml executes script.
    return /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon)[;,]/.test(v);
  }
  return false;
}

function isElementLike(
  node: AnyNode,
): node is AnyNode & {
  name: string;
  attribs: Record<string, string>;
  children: ChildNode[];
} {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function scrub(nodes: ChildNode[]): ChildNode[] {
  const kept: ChildNode[] = [];
  for (const node of nodes) {
    if (isElementLike(node)) {
      if (DANGEROUS_ELEMENTS.has(node.name)) continue; // drop element + subtree
      const attribs = node.attribs ?? {};
      for (const name of Object.keys(attribs)) {
        const lower = name.toLowerCase();
        if (lower.startsWith("on")) {
          delete attribs[name]; // event handler
          continue;
        }
        if (URL_ATTRS.has(lower) && !isSafeUrl(attribs[name])) {
          delete attribs[name];
        }
      }
      node.children = scrub(node.children);
    }
    kept.push(node);
  }
  return kept;
}

export function sanitizeHtml(html: string): string {
  const doc = parseDocument(html, { decodeEntities: true });
  doc.children = scrub(doc.children as ChildNode[]);
  return render(doc, { encodeEntities: false, selfClosingTags: false });
}
