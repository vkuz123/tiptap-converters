import { XMLParser } from "fast-xml-parser";
import { htmlToTipTap } from "./html";
import type { TipTapNode, TipTapDoc, ParseResult } from "../core/types";

export interface FlareVariable {
  key: string;
  value: string;
}

export interface FlareVariableSet {
  name: string;
  variables: FlareVariable[];
}

export interface FlareConditionValue {
  label: string;
  color: string;
}

export interface FlareCondition {
  dimension: string;
  values: FlareConditionValue[];
}

export interface FlareTocItem {
  title: string;
  href: string;
  children: FlareTocItem[];
}

export interface FlareProjectResult {
  topics: Array<ParseResult & { path: string }>;
  components: Array<ParseResult & { path: string }>;
  variableSets: FlareVariableSet[];
  conditions: FlareCondition[];
  toc: FlareTocItem[];
  masterTocPath: string | null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
  // Disable entity expansion — untrusted input should not be able to trigger
  // entity-expansion DoS (billion laughs); this converter never needs it.
  processEntities: false,
});

export function parseFlareProject(
  files: Map<string, string>,
): FlareProjectResult {
  const result: FlareProjectResult = {
    topics: [],
    components: [],
    variableSets: [],
    conditions: [],
    toc: [],
    masterTocPath: null,
  };

  // Collect TOCs keyed by path for master TOC selection
  const tocsByPath = new Map<string, FlareTocItem[]>();

  for (const [path, content] of files) {
    const lower = path.toLowerCase();

    if (lower.endsWith(".flsnp")) {
      const parsed = parseFlareSnippet(content, path);
      if (parsed) result.components.push(parsed);
    } else if (lower.endsWith(".htm") || lower.endsWith(".html")) {
      if (lower.includes("/snippets/") || lower.includes("\\snippets\\")) {
        const parsed = parseFlareSnippet(content, path);
        if (parsed) result.components.push(parsed);
      } else {
        const parsed = parseFlareTopic(content, path);
        if (parsed) result.topics.push(parsed);
      }
    }

    if (lower.endsWith(".fltoc")) {
      tocsByPath.set(path, parseFlareToc(content));
    }

    if (lower.endsWith(".flvar")) {
      const vs = parseFlareVariables(content, path);
      if (vs) result.variableSets.push(vs);
    }

    if (lower.endsWith(".flcts")) {
      const cond = parseFlareConditionTagSet(content, path);
      if (cond) result.conditions.push(cond);
    }

    if (lower.endsWith(".flprj")) {
      try {
        const parsed = xmlParser.parse(content);
        const masterToc = parsed?.CatapultProject?.["@_MasterToc"] as string | undefined;
        if (masterToc) result.masterTocPath = masterToc.replace(/^\//, "");
      } catch { /* ignore */ }
    }
  }

  // Use master TOC if identified, otherwise merge all
  if (result.masterTocPath) {
    const masterEntries = [...tocsByPath.entries()].find(
      ([p]) => p.endsWith(result.masterTocPath!) || result.masterTocPath!.endsWith(p),
    );
    if (masterEntries) {
      result.toc = masterEntries[1];
    } else {
      for (const entries of tocsByPath.values()) result.toc.push(...entries);
    }
  } else {
    for (const entries of tocsByPath.values()) result.toc.push(...entries);
  }

  return result;
}

// --- Marker constants ---

const SNIPPET_PREFIX = "%%FLARE_SNIPPET:";
const ISNIPPET_PREFIX = "%%FLARE_ISNIPPET:";
const VAR_PREFIX = "%%FLARE_VAR:";
const XREF_PREFIX = "%%FLARE_XREF:";
const COND_NEXT_PREFIX = "%%FLARE_COND_NEXT:";
const COND_INLINE_START_PREFIX = "%%FLARE_COND_INLINE_START:";
const COND_INLINE_END = "%%FLARE_COND_INLINE_END%%";
const MARKER_SUFFIX = "%%";
const MARKER_RE = /%%FLARE_(?:VAR|ISNIPPET):([^%]+)%%/g;
const COND_INLINE_RE = /%%FLARE_COND_INLINE_(?:START:[^%]+|END)%%/g;

// Node types whose content is inline (text, marks) — not block containers.
// Everything else (listItem, tableCell, blockquote, conditionalBlock, etc.)
// recurses with rewriteBlockContent to handle nested SNIPPET/COND_NEXT markers.
const INLINE_CONTENT_TYPES = new Set(["paragraph", "heading", "codeBlock"]);

// Block elements that can have MadCap:conditions attributes
const COND_BLOCK_TAGS = "p|div|h[1-6]|li|td|th|ul|ol|table|tr|section|article|blockquote|pre|dl|dt|dd";

// --- Topic/snippet parsing ---

function parseFlareTopic(
  html: string,
  path: string,
): (ParseResult & { path: string }) | null {
  try {
    const preprocessed = preprocessFlareHtml(html);
    const result = htmlToTipTap(preprocessed);
    const doc = rewriteFlareMarkers(result.doc);
    return {
      title: result.title || titleFromPath(path),
      doc,
      path,
    };
  } catch {
    return null;
  }
}

function parseFlareSnippet(
  html: string,
  path: string,
): (ParseResult & { path: string }) | null {
  try {
    const preprocessed = preprocessFlareHtml(html);
    const result = htmlToTipTap(preprocessed);
    const doc = rewriteFlareMarkers(result.doc);
    return {
      title: result.title || titleFromPath(path),
      doc,
      path,
    };
  } catch {
    return null;
  }
}

// --- HTML preprocessing ---

function preprocessFlareHtml(html: string): string {
  // MadCap:snippetBlock → block component marker (captures conditions + variable overrides)
  html = html.replace(
    /<MadCap:snippetBlock\s[^>]*?\/?>/gi,
    (tag) => {
      const srcMatch = tag.match(/(?:src|Src)="([^"]*)"/);
      if (!srcMatch) return "";
      const src = srcMatch[1];
      const varsMatch = tag.match(/MadCap:snippetVariables="([^"]*)"/);
      const condMatch = tag.match(/MadCap:conditions="([^"]*)"/);
      const condExprMatch = tag.match(/MadCap:conditionTagExpression="([^"]*)"/);

      let result = "";
      const condStr = condMatch?.[1] ?? (condExprMatch ? parseConditionExpression(condExprMatch[1]) : null);
      if (condStr) {
        result += `<p>${COND_NEXT_PREFIX}${condStr}${MARKER_SUFFIX}</p>`;
      }
      const marker = varsMatch ? `${src}|${varsMatch[1]}` : src;
      result += `<p>${SNIPPET_PREFIX}${marker}${MARKER_SUFFIX}</p>`;
      return result;
    },
  );

  // MadCap:snippetText → inline component marker (captures conditions)
  html = html.replace(
    /<MadCap:snippetText\s[^>]*?\/?>/gi,
    (tag) => {
      const srcMatch = tag.match(/(?:src|Src)="([^"]*)"/);
      if (!srcMatch) return "";
      const src = srcMatch[1];
      const condMatch = tag.match(/MadCap:conditions="([^"]*)"/);
      const condExprMatch = tag.match(/MadCap:conditionTagExpression="([^"]*)"/);

      const condStr = condMatch?.[1] ?? (condExprMatch ? parseConditionExpression(condExprMatch[1]) : null);
      let result = "";
      if (condStr) result += `${COND_INLINE_START_PREFIX}${condStr}${MARKER_SUFFIX}`;
      result += `${ISNIPPET_PREFIX}${src}${MARKER_SUFFIX}`;
      if (condStr) result += COND_INLINE_END;
      return result;
    },
  );

  // MadCap:variable → variable token marker
  html = html.replace(
    /<MadCap:variable\s[^>]*?(?:name|Name)="([^"]*)"[^>]*?\/?>/gi,
    `${VAR_PREFIX}$1${MARKER_SUFFIX}`,
  );

  // MadCap:xref with content → regular link with marker href
  html = html.replace(
    /<MadCap:xref\s+[^>]*?(?:href|Href)="([^"]*)"[^>]*?>([\s\S]*?)<\/MadCap:xref>/gi,
    (_match, href: string, text: string) =>
      `<a href="${XREF_PREFIX}${href}${MARKER_SUFFIX}">${text || href}</a>`,
  );

  // MadCap:xref self-closing → regular link with marker href
  html = html.replace(
    /<MadCap:xref\s+[^>]*?(?:href|Href)="([^"]*)"[^>]*?\/>/gi,
    (_match, href: string) =>
      `<a href="${XREF_PREFIX}${href}${MARKER_SUFFIX}">${href}</a>`,
  );

  // MadCap:conditions attribute on block elements → inject condition marker paragraph before element
  html = html.replace(
    new RegExp(
      `(<(?:${COND_BLOCK_TAGS})\\b)([^>]*?)\\sMadCap:conditions="([^"]*)"([^>]*?>)`,
      "gi",
    ),
    `<p>${COND_NEXT_PREFIX}$3${MARKER_SUFFIX}</p>$1$2$4`,
  );

  // MadCap:conditions on inline HTML elements → inline condition markers
  const COND_INLINE_TAGS = "code|a|b|span|strong|em|i|u|sub|sup";
  html = html.replace(
    new RegExp(
      `<(${COND_INLINE_TAGS})\\b([^>]*?)\\sMadCap:conditions="([^"]*)"([^>]*?)>([\\s\\S]*?)<\\/\\1>`,
      "gi",
    ),
    (_match, tag: string, before: string, cond: string, after: string, content: string) =>
      `<${tag}${before}${after}>${COND_INLINE_START_PREFIX}${cond}${MARKER_SUFFIX}${content}${COND_INLINE_END}</${tag}>`,
  );

  // MadCap:conditionalText → inline condition markers (wraps content, not a block)
  html = html.replace(
    /<MadCap:conditionalText\s[^>]*?MadCap:conditions="([^"]*)"[^>]*?>([\s\S]*?)<\/MadCap:conditionalText>/gi,
    `${COND_INLINE_START_PREFIX}$1${MARKER_SUFFIX}$2${COND_INLINE_END}`,
  );

  // MadCap:codeSnippetCaption → italic paragraph (before code block)
  html = html.replace(
    /<MadCap:codeSnippetCaption>([\s\S]*?)<\/MadCap:codeSnippetCaption>/gi,
    "<p><em>$1</em></p>",
  );

  // MadCap:codeSnippetBody → <pre><code> (must run before catch-all strip)
  html = html.replace(
    /<MadCap:codeSnippetBody[^>]*>([\s\S]*?)<\/MadCap:codeSnippetBody>/gi,
    "<pre><code>$1</code></pre>",
  );

  // MadCap:dropDownHotspot → bold paragraph for visual distinction
  html = html.replace(
    /<MadCap:dropDownHotspot>([\s\S]*?)<\/MadCap:dropDownHotspot>/gi,
    "<p><strong>$1</strong></p>",
  );

  // Strip remaining MadCap: elements (closing tags + any unhandled elements)
  html = html.replace(/<\/?MadCap:[^>]*?\/?>/gi, "");

  return html;
}

// --- Marker rewriting ---

function rewriteFlareMarkers(doc: TipTapDoc): TipTapDoc {
  return {
    ...doc,
    content: rewriteBlockContent(doc.content as TipTapNode[]),
  } as TipTapDoc;
}

function extractSoleMarkerText(node: TipTapNode): string | null {
  if (node.type !== "paragraph" || !node.content) return null;
  let markerText: string | null = null;
  for (const child of node.content) {
    if (child.type !== "text") return null;
    const t = child.text ?? "";
    if (t.trim() === "") continue;
    if (markerText !== null) return null;
    markerText = t;
  }
  return markerText;
}

function convertSnippetParagraph(node: TipTapNode): TipTapNode | null {
  const text = extractSoleMarkerText(node);
  if (text && text.startsWith(SNIPPET_PREFIX) && text.endsWith(MARKER_SUFFIX)) {
    const raw = text.slice(SNIPPET_PREFIX.length, -MARKER_SUFFIX.length);
    const pipeIdx = raw.indexOf("|");
    const path = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw;
    const overrides = pipeIdx >= 0 ? parseSnippetVariables(raw.slice(pipeIdx + 1)) : {};
    return {
      type: "componentRef",
      attrs: { componentId: null, _flarePath: normalizeFlarePath(path), variableOverrides: overrides },
    };
  }
  return null;
}

function isBlockMarkerText(text: string): boolean {
  return (
    (text.startsWith(SNIPPET_PREFIX) || text.startsWith(COND_NEXT_PREFIX)) &&
    text.endsWith(MARKER_SUFFIX)
  );
}

function splitParagraphOnBlockMarkers(node: TipTapNode): TipTapNode[] {
  if ((node.type !== "paragraph" && node.type !== "heading") || !node.content) return [node];
  const hasBlockMarker = node.content.some(
    (c) => c.type === "text" && c.text && isBlockMarkerText(c.text),
  );
  if (!hasBlockMarker) return [node];

  const result: TipTapNode[] = [];
  let pending: TipTapNode[] = [];

  const flushPending = () => {
    const meaningful = pending.filter((c) => c.type !== "text" || (c.text ?? "").trim() !== "");
    if (meaningful.length > 0) {
      result.push({ ...node, content: pending });
    }
    pending = [];
  };

  for (const child of node.content) {
    if (child.type === "text" && child.text && isBlockMarkerText(child.text)) {
      flushPending();
      result.push({ type: "paragraph", content: [child] });
    } else {
      pending.push(child);
    }
  }
  flushPending();
  return result;
}

function rewriteBlockContent(nodes: TipTapNode[]): TipTapNode[] {
  // Split paragraphs that contain embedded block markers mixed with other content
  const expanded: TipTapNode[] = [];
  for (const node of nodes) {
    expanded.push(...splitParagraphOnBlockMarkers(node));
  }

  const result: TipTapNode[] = [];

  for (let i = 0; i < expanded.length; i++) {
    const node = expanded[i];

    // Snippet: full paragraph → componentRef
    const snippetNode = convertSnippetParagraph(node);
    if (snippetNode) {
      result.push(snippetNode);
      continue;
    }

    // Condition: marker paragraph → wrap next node in conditionalBlock.
    // Consecutive COND_NEXT markers nest: A then B then content → cond(A, cond(B, content)).
    const markerText = extractSoleMarkerText(node);
    if (markerText && markerText.startsWith(COND_NEXT_PREFIX) && markerText.endsWith(MARKER_SUFFIX)) {
      const condStrs: string[] = [];
      condStrs.push(markerText.slice(COND_NEXT_PREFIX.length, -MARKER_SUFFIX.length));
      // Consume consecutive COND_NEXT markers
      while (i + 1 < expanded.length) {
        const peek = extractSoleMarkerText(expanded[i + 1]);
        if (peek && peek.startsWith(COND_NEXT_PREFIX) && peek.endsWith(MARKER_SUFFIX)) {
          condStrs.push(peek.slice(COND_NEXT_PREFIX.length, -MARKER_SUFFIX.length));
          i++;
        } else {
          break;
        }
      }
      const nextNode = expanded[i + 1];
      if (nextNode) {
        i++;
        const converted = convertSnippetParagraph(nextNode);
        const processed = converted ?? processNodeContent(nextNode);
        // Nest from innermost to outermost
        let wrapped = processed;
        for (let j = condStrs.length - 1; j >= 0; j--) {
          wrapped = wrapWithFlareConditions(wrapped, condStrs[j]);
        }
        result.push(wrapped);
      }
      continue;
    }

    // Bare text nodes at block level (e.g. VAR/ISNIPPET markers without paragraph wrapper)
    if (node.type === "text") {
      const linkMark = node.marks?.find(m => m.type === "link");
      const href = linkMark?.attrs?.href as string | undefined;
      if (href && href.startsWith(XREF_PREFIX) && href.endsWith(MARKER_SUFFIX)) {
        const path = href.slice(XREF_PREFIX.length, -MARKER_SUFFIX.length);
        result.push({ type: "topicLink", attrs: { topicId: null, _flarePath: normalizeFlarePath(path) } });
        continue;
      }
      if (node.text) {
        MARKER_RE.lastIndex = 0;
        if (MARKER_RE.test(node.text)) {
          result.push(...splitTextOnMarkers(node));
          continue;
        }
      }
    }

    // Process children
    if (node.content) {
      const useBlockRewrite = !INLINE_CONTENT_TYPES.has(node.type ?? "");
      result.push({
        ...node,
        content: useBlockRewrite
          ? rewriteBlockContent(node.content)
          : rewriteInlineContent(node.content),
      });
    } else {
      result.push(node);
    }
  }

  return result;
}

function processNodeContent(node: TipTapNode): TipTapNode {
  if (node.content) {
    const useBlockRewrite = !INLINE_CONTENT_TYPES.has(node.type ?? "");
    return {
      ...node,
      content: useBlockRewrite
        ? rewriteBlockContent(node.content)
        : rewriteInlineContent(node.content),
    };
  }
  return node;
}

function rewriteInlineContent(nodes: TipTapNode[]): TipTapNode[] {
  const result: TipTapNode[] = [];

  for (const node of nodes) {
    // Check for XREF markers in link marks
    if (node.type === "text" && node.marks) {
      const linkMark = node.marks.find(m => m.type === "link");
      const href = linkMark?.attrs?.href as string | undefined;
      if (href && href.startsWith(XREF_PREFIX) && href.endsWith(MARKER_SUFFIX)) {
        const path = href.slice(XREF_PREFIX.length, -MARKER_SUFFIX.length);
        result.push({
          type: "topicLink",
          attrs: { topicId: null, _flarePath: normalizeFlarePath(path) },
        });
        continue;
      }
    }

    MARKER_RE.lastIndex = 0;
    if (node.type === "text" && node.text && MARKER_RE.test(node.text)) {
      result.push(...splitTextOnMarkers(node));
    } else if (node.content) {
      result.push({ ...node, content: rewriteInlineContent(node.content) });
    } else {
      result.push(node);
    }
  }

  return resolveInlineConditions(result);
}

function splitTextOnMarkers(node: TipTapNode): TipTapNode[] {
  const text = node.text ?? "";
  const marks = node.marks;
  const parts: TipTapNode[] = [];
  let lastIndex = 0;

  MARKER_RE.lastIndex = 0;
  let match;
  while ((match = MARKER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(marks ? { type: "text", text: before, marks } : { type: "text", text: before });
    }

    const fullMarker = match[0];
    const value = match[1];

    if (fullMarker.startsWith(VAR_PREFIX)) {
      const dotIndex = value.indexOf(".");
      const key = dotIndex >= 0 ? value.slice(dotIndex + 1) : value;
      parts.push({ type: "variableToken", attrs: { key } });
    } else {
      parts.push({
        type: "inlineComponentRef",
        attrs: { componentId: null, _flarePath: normalizeFlarePath(value) },
      });
    }

    lastIndex = match.index + fullMarker.length;
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex);
    parts.push(marks ? { type: "text", text: after, marks } : { type: "text", text: after });
  }

  return parts;
}

// --- Snippet variable parsing ---

function parseSnippetVariables(varsStr: string): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const pair of varsStr.split(";")) {
    const trimmed = pair.replace(/,$/, "").trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const fullKey = trimmed.slice(0, colonIdx);
    const value = decodeHtmlEntities(trimmed.slice(colonIdx + 1));
    const dotIdx = fullKey.indexOf(".");
    const key = dotIdx >= 0 ? fullKey.slice(dotIdx + 1) : fullKey;
    if (key) overrides[key] = value;
  }
  return overrides;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// --- Condition expression parsing ---

function parseConditionExpression(expr: string): string | null {
  const match = expr.match(/^include\[([^\]]+)\]$/i);
  if (!match) return null;
  const inner = match[1].trim();
  return inner.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean).join(",");
}

// --- Inline condition resolution ---

function resolveInlineConditions(nodes: TipTapNode[]): TipTapNode[] {
  let hasMarkers = false;
  for (const n of nodes) {
    if (n.type === "text" && n.text) {
      COND_INLINE_RE.lastIndex = 0;
      if (COND_INLINE_RE.test(n.text)) { hasMarkers = true; break; }
    }
  }
  if (!hasMarkers) return nodes;

  // Split text nodes so each condition marker becomes a standalone text node
  const expanded: TipTapNode[] = [];
  for (const node of nodes) {
    if (node.type === "text" && node.text) {
      COND_INLINE_RE.lastIndex = 0;
      if (COND_INLINE_RE.test(node.text)) {
        COND_INLINE_RE.lastIndex = 0;
        let lastIdx = 0;
        let m;
        while ((m = COND_INLINE_RE.exec(node.text)) !== null) {
          if (m.index > lastIdx) {
            const before = node.text.slice(lastIdx, m.index);
            expanded.push(node.marks ? { type: "text", text: before, marks: node.marks } : { type: "text", text: before });
          }
          expanded.push({ type: "text", text: m[0] });
          lastIdx = m.index + m[0].length;
        }
        if (lastIdx < node.text.length) {
          const after = node.text.slice(lastIdx);
          expanded.push(node.marks ? { type: "text", text: after, marks: node.marks } : { type: "text", text: after });
        }
      } else {
        expanded.push(node);
      }
    } else {
      expanded.push(node);
    }
  }

  // Apply conditionalInline marks to nodes between START/END sentinels
  const result: TipTapNode[] = [];
  let activeCondStr: string | null = null;

  for (const node of expanded) {
    if (node.type === "text" && node.text?.startsWith(COND_INLINE_START_PREFIX) && node.text.endsWith(MARKER_SUFFIX)) {
      activeCondStr = node.text.slice(COND_INLINE_START_PREFIX.length, -MARKER_SUFFIX.length);
      continue;
    }
    if (node.type === "text" && node.text === COND_INLINE_END) {
      activeCondStr = null;
      continue;
    }

    if (activeCondStr) {
      const conditions = parseFlareConditionString(activeCondStr);
      const condMarks = conditions.map((cond) => ({
        type: "conditionalInline",
        attrs: {
          dimensionId: null,
          dimensionName: cond.dimension,
          valueIds: [] as string[],
          valueLabels: cond.values,
          color: null,
          logic: "include",
        },
      }));
      if (condMarks.length > 0) {
        const existing = node.marks ?? [];
        result.push({ ...node, marks: [...existing, ...condMarks] });
      } else {
        result.push(node);
      }
    } else {
      result.push(node);
    }
  }

  return result;
}

// --- Condition helpers ---

function parseFlareConditionString(
  condStr: string,
): Array<{ dimension: string; values: string[] }> {
  const byDimension = new Map<string, string[]>();
  for (const part of condStr.split(",")) {
    const trimmed = part.trim();
    const dotIndex = trimmed.indexOf(".");
    if (dotIndex < 0) continue;
    const dimension = trimmed.slice(0, dotIndex);
    const value = trimmed.slice(dotIndex + 1);
    if (!byDimension.has(dimension)) byDimension.set(dimension, []);
    byDimension.get(dimension)!.push(value);
  }
  return Array.from(byDimension.entries()).map(([dimension, values]) => ({
    dimension,
    values,
  }));
}

function wrapWithFlareConditions(
  node: TipTapNode,
  condStr: string,
): TipTapNode {
  const conditions = parseFlareConditionString(condStr);
  if (conditions.length === 0) return node;

  let wrapped = node;
  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];
    wrapped = {
      type: "conditionalBlock",
      attrs: {
        dimensionId: null,
        dimensionName: cond.dimension,
        valueIds: [],
        valueLabels: cond.values,
        color: null,
        logic: "include",
      },
      content: [wrapped],
    };
  }

  return wrapped;
}

// --- Component path rewriting ---

export function rewriteComponentPaths(
  doc: Record<string, unknown>,
  pathToId: Map<string, string>,
): Record<string, unknown> {
  return walkAndRewrite(doc as unknown as TipTapNode, pathToId) as unknown as Record<string, unknown>;
}

function walkAndRewrite(
  node: TipTapNode,
  pathToId: Map<string, string>,
): TipTapNode {
  if (
    (node.type === "componentRef" || node.type === "inlineComponentRef") &&
    node.attrs?._flarePath
  ) {
    const flarePath = node.attrs._flarePath as string;
    const componentId = matchComponentPath(flarePath, pathToId);
    const { _flarePath: _, ...restAttrs } = node.attrs;
    return { ...node, attrs: { ...restAttrs, componentId: componentId ?? null } };
  }

  if (node.content) {
    return { ...node, content: node.content.map((c) => walkAndRewrite(c, pathToId)) };
  }

  return node;
}

function matchComponentPath(
  flarePath: string,
  pathToId: Map<string, string>,
): string | undefined {
  if (pathToId.has(flarePath)) return pathToId.get(flarePath);
  for (const [path, id] of pathToId) {
    if (normalizeFlarePath(path) === flarePath) return id;
    const pathFile = path.split("/").pop()?.split("\\").pop() ?? "";
    const flareFile = flarePath.split("/").pop()?.split("\\").pop() ?? "";
    if (pathFile && flareFile && pathFile.toLowerCase() === flareFile.toLowerCase()) return id;
  }
  return undefined;
}

function normalizeFlarePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\.\//, "")
    .replace(/^\/Content\//i, "")
    .replace(/^Content\//i, "")
    .replace(/^\/Resources\//i, "Resources/")
    .toLowerCase();
}

// --- TOC parsing ---

function parseFlareToc(xml: string): FlareTocItem[] {
  try {
    const parsed = xmlParser.parse(xml);
    const tocRoot = parsed.CatapultToc || parsed;
    return extractTocEntries(tocRoot);
  } catch {
    return [];
  }
}

function extractTocEntries(obj: Record<string, unknown>): FlareTocItem[] {
  const items: FlareTocItem[] = [];
  const entries = Array.isArray(obj.TocEntry)
    ? obj.TocEntry
    : obj.TocEntry ? [obj.TocEntry] : [];

  for (const entry of entries) {
    if (typeof entry !== "object" || !entry) continue;
    const e = entry as Record<string, unknown>;

    items.push({
      title: (e["@_Title"] as string) || "",
      href: (e["@_Link"] as string) || "",
      children: extractTocEntries(e),
    });
  }

  return items;
}

// --- Variable parsing ---

function parseFlareVariables(
  xml: string,
  path: string,
): FlareVariableSet | null {
  try {
    const parsed = xmlParser.parse(xml);
    const root = parsed.CatapultVariableSet || parsed;
    const variables: FlareVariable[] = [];

    const vars = Array.isArray(root.Variable)
      ? root.Variable
      : root.Variable ? [root.Variable] : [];

    for (const v of vars) {
      if (typeof v !== "object" || !v) continue;
      const vObj = v as Record<string, unknown>;

      variables.push({
        key: (vObj["@_Name"] as string) || "",
        value: (vObj["#text"] as string) || (vObj["@_Value"] as string) || "",
      });
    }

    if (variables.length === 0) return null;

    return {
      name: titleFromPath(path),
      variables,
    };
  } catch {
    return null;
  }
}

// --- Condition tag set parsing ---

function parseFlareConditionTagSet(
  xml: string,
  path: string,
): FlareCondition | null {
  try {
    const parsed = xmlParser.parse(xml);
    const root = parsed.CatapultConditionTagSet || parsed;

    const tags = Array.isArray(root.ConditionTag)
      ? root.ConditionTag
      : root.ConditionTag ? [root.ConditionTag] : [];

    const values: FlareConditionValue[] = [];
    for (const t of tags) {
      if (typeof t !== "object" || !t) continue;
      const tag = t as Record<string, unknown>;
      const label = (tag["@_Name"] as string) || "";
      const color = (tag["@_BackgroundColor"] as string) || "#6366f1";
      if (label) values.push({ label, color });
    }

    if (values.length === 0) return null;
    return { dimension: titleFromPath(path), values };
  } catch {
    return null;
  }
}

// --- Helpers ---

function titleFromPath(path: string): string {
  const filename = path.split("/").pop()?.split("\\").pop() || "Untitled";
  return filename
    .replace(/\.(htm|html|flsnp|flvar|fltoc|flprj|flcts)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
