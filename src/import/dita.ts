import { XMLParser } from "fast-xml-parser";
import type { TipTapNode, TipTapDoc, ParseResult, TopicType } from "../core/types";

// --- Public types ---

interface DitaMapItem {
  href: string;
  navtitle?: string;
  role?: string;
  children: DitaMapItem[];
}

export interface DitaReltable {
  rows: Array<{ cells: Array<{ hrefs: string[] }> }>;
}

export interface DitaMapResult {
  title: string;
  items: DitaMapItem[];
  isBookmap?: boolean;
  reltables?: DitaReltable[];
}

export interface DitaImportOptions {
  preserveConrefs?: boolean;
  preserveConditions?: boolean;
  preserveMetadata?: boolean;
}

export interface DitaMetadata {
  topicId?: string;
  topicClass?: string;
  domains?: string;
  prolog?: Record<string, unknown>;
  shortdesc?: string;
  elementIds?: string[];
}

export interface DitaParseResult extends ParseResult {
  topicType?: TopicType;
  metadata?: DitaMetadata;
}

export interface DitavalRule {
  attribute: string;
  value: string;
  action: "include" | "exclude" | "flag";
}

export interface DitavalResult {
  rules: DitavalRule[];
}

export interface SubjectSchemeNode {
  keys: string;
  children: SubjectSchemeNode[];
}

export interface SubjectSchemeResult {
  dimensions: Array<{
    attribute: string;
    values: SubjectSchemeNode[];
  }>;
}

// --- Internal types ---

type XNode = Record<string, unknown>;

interface ProcessCtx {
  preserveConrefs: boolean;
  preserveConditions: boolean;
  preserveMetadata: boolean;
  elementIds: string[];
}

// --- Parser setup ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
});

const ROOT_TAGS = new Set(["topic", "concept", "task", "reference", "dita", "glossentry"]);
const BODY_TAGS = new Set(["body", "conbody", "taskbody", "refbody", "glossbody", "glossdef"]);
const BLOCK_TAGS = new Set([
  "p", "ul", "ol", "section", "codeblock", "note",
  "simpletable", "table", "image", "fig", "steps", "steps-unordered", "dl",
]);
const PROFILING_ATTRS = ["audience", "platform", "product", "otherprops", "props", "rev"];

// --- XML helpers ---

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
  return Array.isArray(c) ? c as XNode[] : [];
}

function nodeAttr(node: XNode, name: string): string | undefined {
  const a = node[":@"] as Record<string, unknown> | undefined;
  if (!a) return undefined;
  return a[`@_${name}`] as string | undefined;
}

function findChild(elements: XNode[], tagName: string): XNode | undefined {
  return elements.find(e => nodeTag(e) === tagName);
}

function findChildren(elements: XNode[], tagName: string): XNode[] {
  return elements.filter(e => nodeTag(e) === tagName);
}

function deepText(elements: XNode[]): string {
  let result = "";
  for (const el of elements) {
    if ("#text" in el) {
      result += String(el["#text"]);
    } else {
      result += deepText(nodeChildren(el));
    }
  }
  return result;
}

// --- Public API ---

export function ditaToTipTap(xml: string, options?: DitaImportOptions): DitaParseResult {
  const ctx: ProcessCtx = {
    preserveConrefs: options?.preserveConrefs ?? false,
    preserveConditions: options?.preserveConditions ?? false,
    preserveMetadata: options?.preserveMetadata ?? false,
    elementIds: [],
  };

  const parsed = parser.parse(xml) as XNode[];

  const root = parsed.find(e => ROOT_TAGS.has(nodeTag(e)));
  if (!root) {
    return { title: "", doc: { type: "doc", content: [{ type: "paragraph" }] } };
  }

  const rootChildren = nodeChildren(root);
  const topicType = mapTopicType(root);

  const titleEl = findChild(rootChildren, "title");
  let title = titleEl ? deepText(nodeChildren(titleEl)) : "";

  // Fallback for glossentry: use glossterm as title
  if (!title) {
    const glosstermEl = findChild(rootChildren, "glossterm");
    if (glosstermEl) title = deepText(nodeChildren(glosstermEl));
  }

  const bodyEl = rootChildren.find(e => BODY_TAGS.has(nodeTag(e)));
  const bodyChildren = bodyEl ? nodeChildren(bodyEl) : rootChildren;
  const content = processElements(bodyChildren, ctx);

  const result: DitaParseResult = {
    title,
    topicType,
    doc: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
  };

  if (ctx.preserveMetadata) {
    const metadata: DitaMetadata = {};

    const rootId = nodeAttr(root, "id");
    if (rootId) metadata.topicId = rootId;

    const topicClass = nodeAttr(root, "class");
    if (topicClass) metadata.topicClass = topicClass;

    const domains = nodeAttr(root, "domains");
    if (domains) metadata.domains = domains;

    const prologEl = findChild(rootChildren, "prolog");
    if (prologEl) metadata.prolog = extractProlog(prologEl);

    const shortdescEl = findChild(rootChildren, "shortdesc");
    if (shortdescEl) metadata.shortdesc = deepText(nodeChildren(shortdescEl));

    if (ctx.elementIds.length > 0) metadata.elementIds = ctx.elementIds;

    result.metadata = metadata;
  }

  return result;
}

/**
 * Extract key definitions from a ditamap.
 * Handles `<keydef>`, `<topicref keys="...">`, and `<mapref>`.
 * Space-separated keys are split into individual entries.
 */
export function parseKeydefs(xml: string): Map<string, string> {
  const parsed = parser.parse(xml) as XNode[];
  const mapEl = parsed.find(e => nodeTag(e) === "map" || nodeTag(e) === "bookmap");
  if (!mapEl) return new Map();

  const result = new Map<string, string>();
  extractKeydefs(nodeChildren(mapEl), result);
  return result;
}

function extractKeydefs(elements: XNode[], result: Map<string, string>): void {
  for (const el of elements) {
    const tag = nodeTag(el);
    const keys = nodeAttr(el, "keys");
    const href = nodeAttr(el, "href");

    if (keys && href) {
      for (const key of keys.split(/\s+/)) {
        if (key && !result.has(key)) {
          result.set(key, href);
        }
      }
    }

    if (tag === "keydef" || tag === "topicref" || tag === "mapref" ||
        tag === "frontmatter" || tag === "backmatter" || tag === "topicgroup" ||
        tag === "topichead" || tag === "chapter" || tag === "appendix" ||
        tag === "part" || tag === "map" || tag === "bookmap") {
      extractKeydefs(nodeChildren(el), result);
    }
  }
}

export function parseDitaMap(xml: string): DitaMapResult {
  const parsed = parser.parse(xml) as XNode[];

  const mapEl = parsed.find(e => nodeTag(e) === "map" || nodeTag(e) === "bookmap");
  if (!mapEl) return { title: "", items: [] };

  const isBookmap = nodeTag(mapEl) === "bookmap";
  const mapChildren = nodeChildren(mapEl);
  const titleEl = findChild(mapChildren, "title");
  const title = titleEl ? deepText(nodeChildren(titleEl)) : (nodeAttr(mapEl, "title") ?? "");

  const reltables = parseReltables(mapChildren);

  return {
    title,
    items: extractTopicRefs(mapChildren),
    ...(isBookmap ? { isBookmap: true } : {}),
    ...(reltables.length > 0 ? { reltables } : {}),
  };
}

export function parseDitaval(xml: string): DitavalResult {
  const parsed = parser.parse(xml) as XNode[];
  const val = parsed.find(e => nodeTag(e) === "val");
  if (!val) return { rules: [] };

  const rules: DitavalRule[] = [];
  for (const child of nodeChildren(val)) {
    if (nodeTag(child) !== "prop") continue;
    const att = nodeAttr(child, "att");
    const value = nodeAttr(child, "val");
    const action = nodeAttr(child, "action") as "include" | "exclude" | "flag" | undefined;

    if (att && value && action && ["include", "exclude", "flag"].includes(action)) {
      rules.push({ attribute: att, value, action });
    }
  }

  return { rules };
}

// --- Topic type mapping ---

function mapTopicType(root: XNode): TopicType {
  switch (nodeTag(root)) {
    case "concept": return "concept";
    case "task": return "task";
    case "reference": return "reference";
    case "glossentry": return "glossary";
    case "topic": {
      // A generic <topic> may carry its original specialization in @outputclass
      // (round-trip from our own DITA export, which downgrades task/reference/
      // glossary to <topic outputclass="..."> to keep the body DTD-valid).
      const oc = nodeAttr(root, "outputclass");
      if (oc === "task" || oc === "reference" || oc === "glossary" || oc === "concept") {
        return oc;
      }
      return "custom";
    }
    default: return "custom";
  }
}

// --- Profiling / condition helpers ---

function extractProfilingAttrs(el: XNode): Array<{ dimension: string; values: string[] }> {
  const conditions: Array<{ dimension: string; values: string[] }> = [];
  for (const attr of PROFILING_ATTRS) {
    const val = nodeAttr(el, attr);
    if (val) {
      conditions.push({
        dimension: attr,
        values: val.split(/\s+/).filter(Boolean),
      });
    }
  }
  return conditions;
}

function wrapWithConditions(
  result: TipTapNode | TipTapNode[],
  el: XNode,
): TipTapNode | TipTapNode[] {
  const conditions = extractProfilingAttrs(el);
  if (conditions.length === 0) return result;

  let content = Array.isArray(result) ? result : [result];

  for (let i = conditions.length - 1; i >= 0; i--) {
    const cond = conditions[i];
    content = [{
      type: "conditionalBlock",
      attrs: {
        dimensionId: null,
        dimensionName: cond.dimension,
        valueIds: [],
        valueLabels: cond.values,
        color: null,
        logic: "include",
      },
      content,
    }];
  }

  return content.length === 1 ? content[0] : content;
}

// --- Block processing ---

function processElements(elements: XNode[], ctx: ProcessCtx): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  for (const el of elements) {
    // Capture stray (non-whitespace) text mixed among block elements — e.g.
    // <glossdef>bare text</glossdef> or text before a <p> — as a paragraph,
    // rather than dropping it. Whitespace-only text between blocks is ignored.
    if ("#text" in el) {
      const text = String(el["#text"]);
      if (text.trim()) {
        nodes.push({ type: "paragraph", content: [{ type: "text", text }] });
      }
      continue;
    }
    const t = nodeTag(el);
    if (!t) continue;

    if (ctx.preserveMetadata) {
      const id = nodeAttr(el, "id");
      if (id) ctx.elementIds.push(id);
    }

    const result = processTag(t, el, ctx);
    if (result) {
      let finalResult = result;

      if (ctx.preserveConditions) {
        finalResult = wrapWithConditions(finalResult, el);
      }

      if (Array.isArray(finalResult)) nodes.push(...finalResult);
      else nodes.push(finalResult);
    }
  }
  return nodes;
}

function processTag(tag: string, el: XNode, ctx: ProcessCtx): TipTapNode | TipTapNode[] | null {
  if (ctx.preserveConrefs) {
    const conref = nodeAttr(el, "conref") || nodeAttr(el, "conkeyref");
    if (conref) {
      return {
        type: "componentRef",
        attrs: { componentId: null, _conrefPath: conref },
      };
    }
  }

  switch (tag) {
    case "title":
      return null;
    case "section":
      return processSection(el, ctx);
    case "p":
      return processParagraph(el, ctx);
    case "ol":
    case "ul":
      return processList(tag, el, ctx);
    case "steps":
    case "steps-unordered":
      return processSteps(tag, el, ctx);
    case "codeblock":
      return processCodeBlock(el);
    case "note":
      return processNote(el, ctx);
    case "simpletable":
      return processSimpleTable(el, ctx);
    case "table":
      return processTableElement(el, ctx);
    case "image":
      return processImage(el);
    case "fig":
      return processElements(nodeChildren(el), ctx);
    case "dl":
      return processDefinitionList(el, ctx);
    default:
      return processElements(nodeChildren(el), ctx);
  }
}

function processSection(el: XNode, ctx: ProcessCtx): TipTapNode[] {
  const children = nodeChildren(el);
  const nodes: TipTapNode[] = [];

  const titleEl = findChild(children, "title");
  if (titleEl) {
    const titleText = deepText(nodeChildren(titleEl));
    if (titleText) {
      nodes.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: titleText }],
      });
    }
  }

  const bodyChildren = children.filter(c => nodeTag(c) !== "title" && !("#text" in c));
  nodes.push(...processElements(bodyChildren, ctx));

  return nodes;
}

function processParagraph(el: XNode, ctx: ProcessCtx): TipTapNode {
  const content = processInlineContent(nodeChildren(el), ctx);
  return {
    type: "paragraph",
    content: content.length > 0 ? content : undefined,
  };
}

/**
 * Build a schema-valid listItem. The editor's listItem content model is
 * "paragraph block*" — the first child must be a paragraph, and block nodes
 * (image, callout, table, conditionalBlock, …) are valid as later children.
 * Never wrap a block inside a paragraph's inline content (that's malformed);
 * instead prepend an empty paragraph when the first node isn't one.
 */
function toListItem(content: TipTapNode[]): TipTapNode {
  if (content.length === 0) {
    return { type: "listItem", content: [{ type: "paragraph" }] };
  }
  const ordered =
    content[0].type === "paragraph"
      ? content
      : [{ type: "paragraph" } as TipTapNode, ...content];
  return { type: "listItem", content: ordered };
}

function processList(tag: string, el: XNode, ctx: ProcessCtx): TipTapNode {
  const type = tag === "ol" ? "orderedList" : "bulletList";
  const lis = findChildren(nodeChildren(el), "li");
  const items: TipTapNode[] = [];

  for (const li of lis) {
    const liChildren = nodeChildren(li);
    const hasBlockChildren = liChildren.some(c => BLOCK_TAGS.has(nodeTag(c)));

    let content: TipTapNode[];
    if (hasBlockChildren) {
      content = processElements(liChildren, ctx);
    } else {
      const inline = processInlineContent(liChildren, ctx);
      content = inline.length > 0 ? [{ type: "paragraph", content: inline }] : [];
    }

    items.push(toListItem(content));
  }

  return { type, content: items };
}

function processSteps(tag: string, el: XNode, ctx: ProcessCtx): TipTapNode {
  // Only <steps-unordered> is a bullet list; <steps> and <substeps> are ordered.
  const type = tag === "steps-unordered" ? "bulletList" : "orderedList";
  // <steps>/<steps-unordered> use <step>; <substeps> uses <substep>
  const stepTag = tag === "substeps" ? "substep" : "step";
  const steps = findChildren(nodeChildren(el), stepTag);
  const items: TipTapNode[] = [];

  for (const step of steps) {
    const content: TipTapNode[] = [];

    for (const child of nodeChildren(step)) {
      if ("#text" in child) continue;
      const ct = nodeTag(child);
      if (!ct || ct === "title") continue;

      let produced: TipTapNode[];
      switch (ct) {
        case "cmd":
          produced = [processParagraph(child, ctx)];
          break;
        case "substeps":
          produced = [processSteps("substeps", child, ctx)];
          break;
        case "choices":
          produced = [processChoices(child, ctx)];
          break;
        // <info>, <stepresult>, <stepxmp>, <choicetable>, <cmd> fallthroughs, etc.
        // are block containers — process their children so nested blocks,
        // conrefs, and profiling conditions are preserved (not flattened).
        default:
          produced = processStepBlock(child, ctx);
      }

      // Preserve profiling attributes on the step child itself.
      if (ctx.preserveConditions) {
        produced = produced.flatMap((n) => {
          const wrapped = wrapWithConditions(n, child);
          return Array.isArray(wrapped) ? wrapped : [wrapped];
        });
      }

      content.push(...produced);
    }

    items.push(toListItem(content));
  }

  return { type, content: items };
}

/**
 * Process a task step's block container child (<info>, <stepresult>,
 * <stepxmp>, etc). Mirrors note handling: descend into block children so
 * nested paragraphs, images, conrefs, and conditions survive; otherwise
 * treat as a single paragraph of inline content.
 */
function processStepBlock(el: XNode, ctx: ProcessCtx): TipTapNode[] {
  const children = nodeChildren(el);
  const hasBlockChildren = children.some((c) => BLOCK_TAGS.has(nodeTag(c)));
  if (hasBlockChildren) {
    return processElements(children, ctx);
  }
  const inline = processInlineContent(children, ctx);
  return inline.length > 0 ? [{ type: "paragraph", content: inline }] : [];
}

/**
 * <choices> → bulletList of <choice> items.
 */
function processChoices(el: XNode, ctx: ProcessCtx): TipTapNode {
  const choices = findChildren(nodeChildren(el), "choice");
  const items: TipTapNode[] = choices.map((choice) => {
    const children = nodeChildren(choice);
    const hasBlockChildren = children.some((c) => BLOCK_TAGS.has(nodeTag(c)));
    let content: TipTapNode[];
    if (hasBlockChildren) {
      content = processElements(children, ctx);
    } else {
      const inline = processInlineContent(children, ctx);
      content = inline.length > 0 ? [{ type: "paragraph", content: inline }] : [];
    }
    return toListItem(content);
  });
  return { type: "bulletList", content: items };
}

function processCodeBlock(el: XNode): TipTapNode {
  return {
    type: "codeBlock",
    content: [{ type: "text", text: deepText(nodeChildren(el)) }],
  };
}

function processNote(el: XNode, ctx: ProcessCtx): TipTapNode {
  const children = nodeChildren(el);
  const noteType = nodeAttr(el, "type");

  const CALLOUT_MAP: Record<string, string> = {
    note: "info", tip: "info",
    warning: "warning", caution: "warning",
    danger: "danger", important: "warning",
  };
  const calloutType = CALLOUT_MAP[noteType ?? "note"] ?? "info";

  const hasBlockChildren = children.some(c => BLOCK_TAGS.has(nodeTag(c)));
  let noteContent: TipTapNode[];
  if (hasBlockChildren) {
    noteContent = processElements(children, ctx);
  } else {
    const inline = processInlineContent(children, ctx);
    noteContent = [{
      type: "paragraph",
      content: inline.length > 0 ? inline : [{ type: "text", text: "" }],
    }];
  }

  return {
    type: "callout",
    attrs: { variant: calloutType },
    content: noteContent,
  };
}

function processSimpleTable(el: XNode, ctx: ProcessCtx): TipTapNode {
  const children = nodeChildren(el);
  const rows: TipTapNode[] = [];

  const sthead = findChild(children, "sthead");
  if (sthead) {
    const entries = findChildren(nodeChildren(sthead), "stentry");
    rows.push({
      type: "tableRow",
      content: entries.map((entry) => ({
        type: "tableHeader" as const,
        content: [{ type: "paragraph" as const, content: processInlineContent(nodeChildren(entry), ctx) }],
      })),
    });
  }

  for (const strow of findChildren(children, "strow")) {
    const entries = findChildren(nodeChildren(strow), "stentry");
    rows.push({
      type: "tableRow",
      content: entries.map((entry) => ({
        type: "tableCell" as const,
        content: [{ type: "paragraph" as const, content: processInlineContent(nodeChildren(entry), ctx) }],
      })),
    });
  }

  const frame = nodeAttr(el, "frame");
  return { type: "table", attrs: frame ? { frame } : undefined, content: rows };
}

function processTableElement(el: XNode, ctx: ProcessCtx): TipTapNode {
  const children = nodeChildren(el);

  if (findChild(children, "sthead") || findChild(children, "strow")) {
    return processSimpleTable(el, ctx);
  }

  const tgroup = findChild(children, "tgroup");
  if (!tgroup) return processSimpleTable(el, ctx);

  const tgChildren = nodeChildren(tgroup);
  const rows: TipTapNode[] = [];

  const thead = findChild(tgChildren, "thead");
  if (thead) {
    for (const row of findChildren(nodeChildren(thead), "row")) {
      rows.push(processCalsRow(row, true, ctx));
    }
  }

  const tbody = findChild(tgChildren, "tbody");
  if (tbody) {
    for (const row of findChildren(nodeChildren(tbody), "row")) {
      rows.push(processCalsRow(row, false, ctx));
    }
  }

  const frame = nodeAttr(el, "frame");
  return { type: "table", attrs: frame ? { frame } : undefined, content: rows };
}

function processCalsRow(row: XNode, isHeader: boolean, ctx: ProcessCtx): TipTapNode {
  const entries = findChildren(nodeChildren(row), "entry");
  return {
    type: "tableRow",
    content: entries.map((entry) => ({
      type: (isHeader ? "tableHeader" : "tableCell") as string,
      content: [{ type: "paragraph" as const, content: processInlineContent(nodeChildren(entry), ctx) }],
    })),
  };
}

function processDefinitionList(el: XNode, ctx: ProcessCtx): TipTapNode {
  const dlentries = findChildren(nodeChildren(el), "dlentry");
  const items: TipTapNode[] = [];

  for (const entry of dlentries) {
    const entryChildren = nodeChildren(entry);
    const dtEl = findChild(entryChildren, "dt");
    const ddEl = findChild(entryChildren, "dd");

    const term: TipTapNode = {
      type: "definitionTerm",
      content: dtEl ? processInlineContent(nodeChildren(dtEl), ctx) : [],
    };

    let descContent: TipTapNode[];
    if (ddEl) {
      const ddChildren = nodeChildren(ddEl);
      const hasBlocks = ddChildren.some(c => BLOCK_TAGS.has(nodeTag(c)));
      if (hasBlocks) {
        descContent = processElements(ddChildren, ctx);
      } else {
        const inline = processInlineContent(ddChildren, ctx);
        descContent = inline.length > 0 ? [{ type: "paragraph", content: inline }] : [{ type: "paragraph" }];
      }
    } else {
      descContent = [{ type: "paragraph" }];
    }

    items.push({
      type: "definitionItem",
      content: [term, { type: "definitionDescription", content: descContent }],
    });
  }

  return { type: "definitionList", content: items.length > 0 ? items : [{ type: "definitionItem", content: [{ type: "definitionTerm" }, { type: "definitionDescription", content: [{ type: "paragraph" }] }] }] };
}

function processImage(el: XNode): TipTapNode {
  const src = nodeAttr(el, "href") ?? "";
  // Images can be referenced by key instead of href (resolved via a keymap
  // at orchestration time). Carry the keyref as a placeholder so the
  // orchestrator can resolve it to a real path before image upload rewriting.
  const keyref = nodeAttr(el, "keyref");
  const altAttr = nodeAttr(el, "alt");
  const altChild = findChild(nodeChildren(el), "alt");
  const alt = altAttr || (altChild ? deepText(nodeChildren(altChild)) : null);
  const width = nodeAttr(el, "width");
  const height = nodeAttr(el, "height");
  const scale = nodeAttr(el, "scale");
  const placement = nodeAttr(el, "placement");

  const attrs: Record<string, unknown> = { src, alt };
  if (!src && keyref) attrs._imageKeyref = keyref;
  if (width) attrs.width = width;
  if (height) attrs.height = height;
  if (scale) attrs._ditaScale = scale;
  if (placement) attrs._ditaPlacement = placement;

  return { type: "image", attrs };
}

// --- Inline processing ---

function processInlineContent(elements: XNode[], ctx: ProcessCtx): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const el of elements) {
    if ("#text" in el) {
      const text = String(el["#text"]);
      if (text) nodes.push({ type: "text", text });
      continue;
    }

    const t = nodeTag(el);
    if (!t) continue;

    const result = processInlineTag(t, el, ctx);
    if (result) nodes.push(result);
  }

  return nodes;
}

function processInlineTag(tag: string, el: XNode, ctx: ProcessCtx): TipTapNode | null {
  if (ctx.preserveConrefs) {
    const conref = nodeAttr(el, "conref") || nodeAttr(el, "conkeyref");
    if (conref) {
      return {
        type: "inlineComponentRef",
        attrs: { componentId: null, _conrefPath: conref },
      };
    }
  }

  // Inline images: <p>...<image placement="inline"/>...</p>. Preserve as an
  // image node so it survives (TipTap tolerates image in inline position).
  if (tag === "image") {
    return processImage(el);
  }

  const text = deepText(nodeChildren(el));

  switch (tag) {
    case "b":
    case "bold":
      return { type: "text", text, marks: [{ type: "bold" }] };
    case "i":
    case "italic":
      return { type: "text", text, marks: [{ type: "italic" }] };
    case "codeph":
      return { type: "text", text, marks: [{ type: "code" }] };
    case "xref": {
      const href = nodeAttr(el, "href") ?? "";
      return { type: "text", text: text || href, marks: [{ type: "link", attrs: { href, target: "_blank" } }] };
    }
    case "ph":
    case "uicontrol":
    case "filepath":
    case "userinput":
    case "systemoutput":
    case "term":
    case "keyword":
      return text ? { type: "text", text } : null;
    default:
      return text ? { type: "text", text } : null;
  }
}

// --- Metadata extraction ---

function extractProlog(prologEl: XNode): Record<string, unknown> {
  const prolog: Record<string, unknown> = {};
  const children = nodeChildren(prologEl);

  const authors = findChildren(children, "author");
  if (authors.length > 0) {
    prolog.authors = authors.map(a => deepText(nodeChildren(a))).filter(Boolean);
  }

  const critdates = findChild(children, "critdates");
  if (critdates) {
    const cd: Record<string, string> = {};
    const created = findChild(nodeChildren(critdates), "created");
    if (created) cd.created = nodeAttr(created, "date") ?? "";
    const revised = findChildren(nodeChildren(critdates), "revised");
    if (revised.length > 0) {
      cd.revised = nodeAttr(revised[revised.length - 1], "modified") ?? "";
    }
    prolog.critdates = cd;
  }

  const metadataEl = findChild(children, "metadata");
  if (metadataEl) {
    const keywords = findChild(nodeChildren(metadataEl), "keywords");
    if (keywords) {
      const kws = findChildren(nodeChildren(keywords), "keyword");
      prolog.keywords = kws.map(k => deepText(nodeChildren(k))).filter(Boolean);
    }
    const audienceEls = findChildren(nodeChildren(metadataEl), "audience");
    if (audienceEls.length > 0) {
      prolog.audiences = audienceEls.map(a => ({
        type: nodeAttr(a, "type"),
        job: nodeAttr(a, "job"),
        experiencelevel: nodeAttr(a, "experiencelevel"),
      }));
    }
  }

  const permissions = findChild(children, "permissions");
  if (permissions) {
    prolog.permissions = nodeAttr(permissions, "view");
  }

  return prolog;
}

// --- Map parsing ---

function extractTopicRefs(elements: XNode[]): DitaMapItem[] {
  const items: DitaMapItem[] = [];

  for (const el of elements) {
    const tag = nodeTag(el);

    if (tag === "topicref" || tag === "chapter" || tag === "appendix" || tag === "part") {
      const role = tag !== "topicref" ? tag : undefined;
      items.push({
        href: nodeAttr(el, "href") ?? "",
        navtitle: nodeAttr(el, "navtitle") ?? undefined,
        role,
        children: extractTopicRefs(nodeChildren(el)),
      });
    } else if (tag === "frontmatter" || tag === "backmatter") {
      items.push({
        href: "",
        navtitle: tag,
        role: tag,
        children: extractTopicRefs(nodeChildren(el)),
      });
    } else if (tag === "topicgroup" || tag === "topichead") {
      // Unwrap grouping elements
      const navtitle = nodeAttr(el, "navtitle");
      if (navtitle) {
        items.push({
          href: "",
          navtitle,
          children: extractTopicRefs(nodeChildren(el)),
        });
      } else {
        items.push(...extractTopicRefs(nodeChildren(el)));
      }
    }
  }

  return items;
}

function parseReltables(elements: XNode[]): DitaReltable[] {
  const tables: DitaReltable[] = [];
  for (const el of findChildren(elements, "reltable")) {
    const rows: DitaReltable["rows"] = [];
    for (const row of findChildren(nodeChildren(el), "relrow")) {
      const cells: Array<{ hrefs: string[] }> = [];
      for (const cell of findChildren(nodeChildren(row), "relcell")) {
        const hrefs: string[] = [];
        for (const ref of findChildren(nodeChildren(cell), "topicref")) {
          const href = nodeAttr(ref, "href");
          if (href) hrefs.push(href);
        }
        cells.push({ hrefs });
      }
      rows.push({ cells });
    }
    if (rows.length > 0) tables.push({ rows });
  }
  return tables;
}

// --- Multi-topic parsing ---

export function parseDitaTopics(xml: string, options?: DitaImportOptions): DitaParseResult[] {
  const ctx: ProcessCtx = {
    preserveConrefs: options?.preserveConrefs ?? false,
    preserveConditions: options?.preserveConditions ?? false,
    preserveMetadata: options?.preserveMetadata ?? false,
    elementIds: [],
  };

  const parsed = parser.parse(xml) as XNode[];
  const results: DitaParseResult[] = [];

  // Handle <dita> container (ditabase)
  const ditaRoot = parsed.find(e => nodeTag(e) === "dita");
  if (ditaRoot) {
    const topLevelTopics = nodeChildren(ditaRoot).filter(e => ROOT_TAGS.has(nodeTag(e)));
    for (const topic of topLevelTopics) {
      results.push(...extractTopicsRecursive(topic, ctx));
    }
    return results.length > 0 ? results : [{ title: "", doc: { type: "doc", content: [{ type: "paragraph" }] } }];
  }

  // Handle single root topic with nested topics
  const root = parsed.find(e => ROOT_TAGS.has(nodeTag(e)));
  if (!root) return [{ title: "", doc: { type: "doc", content: [{ type: "paragraph" }] } }];

  return extractTopicsRecursive(root, ctx);
}

function extractTopicsRecursive(topicEl: XNode, parentCtx: ProcessCtx): DitaParseResult[] {
  // Each nested topic gets a fresh context for elementIds
  const ctx: ProcessCtx = { ...parentCtx, elementIds: [] };
  const results: DitaParseResult[] = [];

  const rootChildren = nodeChildren(topicEl);
  const topicType = mapTopicType(topicEl);

  const titleEl = findChild(rootChildren, "title");
  let title = titleEl ? deepText(nodeChildren(titleEl)) : "";
  if (!title) {
    const glosstermEl = findChild(rootChildren, "glossterm");
    if (glosstermEl) title = deepText(nodeChildren(glosstermEl));
  }

  const bodyEl = rootChildren.find(e => BODY_TAGS.has(nodeTag(e)));
  const bodyChildren = bodyEl ? nodeChildren(bodyEl) : rootChildren.filter(e => !ROOT_TAGS.has(nodeTag(e)));
  const content = processElements(bodyChildren, ctx);

  const result: DitaParseResult = {
    title,
    topicType,
    doc: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
  };

  if (ctx.preserveMetadata) {
    const metadata: DitaMetadata = {};
    const rootId = nodeAttr(topicEl, "id");
    if (rootId) metadata.topicId = rootId;
    const topicClass = nodeAttr(topicEl, "class");
    if (topicClass) metadata.topicClass = topicClass;
    const domains = nodeAttr(topicEl, "domains");
    if (domains) metadata.domains = domains;
    const prologEl = findChild(rootChildren, "prolog");
    if (prologEl) metadata.prolog = extractProlog(prologEl);
    const shortdescEl = findChild(rootChildren, "shortdesc");
    if (shortdescEl) metadata.shortdesc = deepText(nodeChildren(shortdescEl));
    if (ctx.elementIds.length > 0) metadata.elementIds = ctx.elementIds;
    result.metadata = metadata;
  }

  results.push(result);

  // Process nested topics
  const nestedTopics = rootChildren.filter(e => ROOT_TAGS.has(nodeTag(e)));
  for (const nested of nestedTopics) {
    results.push(...extractTopicsRecursive(nested, parentCtx));
  }

  return results;
}

// --- Subject scheme parsing ---

export function parseSubjectScheme(xml: string): SubjectSchemeResult {
  const parsed = parser.parse(xml) as XNode[];
  const root = parsed.find(e => nodeTag(e) === "subjectScheme");
  if (!root) return { dimensions: [] };

  const dimensions: SubjectSchemeResult["dimensions"] = [];

  // Look for enumerationdef or direct subjectdef with attribute binding
  for (const child of nodeChildren(root)) {
    const tag = nodeTag(child);
    if (tag === "enumerationdef") {
      const attrEl = findChild(nodeChildren(child), "attributedef");
      const subjectEl = findChild(nodeChildren(child), "defaultSubject") || findChild(nodeChildren(child), "subjectdef");
      if (attrEl) {
        const attribute = nodeAttr(attrEl, "name") ?? "";
        if (attribute) {
          const values = subjectEl ? extractSubjectDefs(nodeChildren(child)) : [];
          dimensions.push({ attribute, values });
        }
      }
    } else if (tag === "subjectdef") {
      // Top-level subjectdef defines a dimension
      const keys = nodeAttr(child, "keys") ?? "";
      if (keys) {
        dimensions.push({
          attribute: keys,
          values: extractSubjectDefs(nodeChildren(child)),
        });
      }
    }
  }

  return { dimensions };
}

function extractSubjectDefs(elements: XNode[]): SubjectSchemeNode[] {
  const nodes: SubjectSchemeNode[] = [];
  for (const el of findChildren(elements, "subjectdef")) {
    const keys = nodeAttr(el, "keys") ?? "";
    if (keys) {
      nodes.push({
        keys,
        children: extractSubjectDefs(nodeChildren(el)),
      });
    }
  }
  return nodes;
}
