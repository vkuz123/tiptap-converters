import type { JSONContent } from "@tiptap/core";
import type { TopicType } from "../core/types";

// --- Public types ---

export interface DitaTopicLinkInfo {
  title: string;
  href?: string;
}

export interface DitaComponentInfo {
  conrefPath?: string;
  title: string;
}

export interface DitaExportMetadata {
  topicClass?: string;
  domains?: string;
  prolog?: {
    authors?: string[];
    critdates?: { created?: string; revised?: string };
    keywords?: string[];
  };
  shortdesc?: string;
}

export interface DitaContext {
  topicLinks?: Map<string, DitaTopicLinkInfo>;
  componentMap?: Map<string, DitaComponentInfo>;
  conditionDimensionMap?: Map<string, string>;
  variableMap?: Map<string, string>;
  metadata?: DitaExportMetadata;
}

export interface DitaTopicOptions {
  id: string;
  title: string;
  topicType: TopicType;
  doc: JSONContent;
  context?: DitaContext;
}

export interface DitaMapEntry {
  href: string;
  navtitle: string;
  role?: string;
  children: DitaMapEntry[];
}

export interface DitaReltableExport {
  rows: Array<{ cells: Array<{ hrefs: string[] }> }>;
}

// --- Topic type config ---

const TOPIC_CONFIG: Record<
  TopicType,
  { element: string; bodyElement: string; doctype: string }
> = {
  concept: {
    element: "concept",
    bodyElement: "conbody",
    doctype:
      '<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">',
  },
  task: {
    element: "task",
    bodyElement: "taskbody",
    doctype:
      '<!DOCTYPE task PUBLIC "-//OASIS//DTD DITA Task//EN" "task.dtd">',
  },
  reference: {
    element: "reference",
    bodyElement: "refbody",
    doctype:
      '<!DOCTYPE reference PUBLIC "-//OASIS//DTD DITA Reference//EN" "reference.dtd">',
  },
  glossary: {
    element: "glossentry",
    bodyElement: "glossbody",
    doctype:
      '<!DOCTYPE glossentry PUBLIC "-//OASIS//DTD DITA Glossary Entry//EN" "glossentry.dtd">',
  },
  custom: {
    element: "topic",
    bodyElement: "body",
    doctype:
      '<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">',
  },
};

// Specializations whose strict body content model can't hold our generic
// blocks — exported as <topic outputclass="<type>"> (see renderToDita).
const DOWNGRADE_TO_TOPIC = new Set<TopicType>(["task", "reference", "glossary"]);

const DITA_PROFILING_ATTRS = new Set([
  "audience", "platform", "product", "otherprops", "props", "rev",
]);

// --- Render topic ---

export function renderToDita(options: DitaTopicOptions): string {
  const { id, title, topicType, doc, context } = options;

  // task/reference/glossary have strict body content models (<taskbody>,
  // <refbody>, <glossbody>) that forbid the generic <section>/<p>/<ol> we
  // produce — and our import already flattened their specialized structure
  // (steps, glossterm/glossdef) into generic blocks, so we can't faithfully
  // rebuild it. To keep the export DTD-valid AND round-trip the topic type
  // losslessly, downgrade these to a generic <topic outputclass="<type>">;
  // the importer restores topic_type from @outputclass. concept (<conbody>
  // accepts our content) and custom stay native.
  const downgrade = DOWNGRADE_TO_TOPIC.has(topicType);
  const config = downgrade
    ? TOPIC_CONFIG.custom
    : TOPIC_CONFIG[topicType] || TOPIC_CONFIG.custom;
  const bodyContent = renderBody(doc, context);

  let rootAttrs = ` id="${escAttr(xmlId(id))}"`;
  if (downgrade) {
    rootAttrs += ` outputclass="${escAttr(topicType)}"`;
  }
  // Only emit the source @class on its native root — a task's class on a
  // generic <topic> would be self-contradictory.
  if (!downgrade && context?.metadata?.topicClass) {
    rootAttrs += ` class="${escAttr(context.metadata.topicClass)}"`;
  }
  if (context?.metadata?.domains) {
    rootAttrs += ` domains="${escAttr(context.metadata.domains)}"`;
  }

  const prolog = context?.metadata ? renderProlog(context.metadata) : "";
  const shortdesc = context?.metadata?.shortdesc
    ? `  <shortdesc>${esc(context.metadata.shortdesc)}</shortdesc>`
    : "";

  const titleTag = !downgrade && topicType === "glossary" ? "glossterm" : "title";

  const lines: (string | null)[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    config.doctype,
    `<${config.element}${rootAttrs}>`,
    `  <${titleTag}>${esc(title)}</${titleTag}>`,
    shortdesc || null,
    prolog || null,
    `  <${config.bodyElement}>`,
    bodyContent,
    `  </${config.bodyElement}>`,
    `</${config.element}>`,
    "",
  ];

  return lines.filter(line => line !== null).join("\n");
}

// --- Render map ---

export function renderDitaMap(title: string, items: DitaMapEntry[]): string {
  const refs = items.map((item) => renderTopicRef(item, 1)).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE map PUBLIC "-//OASIS//DTD DITA Map//EN" "map.dtd">',
    "<map>",
    `  <title>${esc(title)}</title>`,
    refs,
    "</map>",
    "",
  ].join("\n");
}

// --- Body rendering ---

function renderBody(doc: JSONContent, ctx?: DitaContext): string {
  if (!doc.content || doc.content.length === 0) return "";

  const groups = groupBySections(doc.content);
  const lines: string[] = [];

  for (const group of groups) {
    if (group.heading) {
      const titleText = inlineContent(group.heading, ctx);
      lines.push("    <section>");
      lines.push(`      <title>${titleText}</title>`);
      for (const node of group.nodes) {
        const rendered = blockToDita(node, 6, ctx);
        if (rendered) lines.push(rendered);
      }
      lines.push("    </section>");
    } else {
      for (const node of group.nodes) {
        const rendered = blockToDita(node, 4, ctx);
        if (rendered) lines.push(rendered);
      }
    }
  }

  return lines.join("\n");
}

interface SectionGroup {
  heading?: JSONContent;
  nodes: JSONContent[];
}

function groupBySections(nodes: JSONContent[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup = { nodes: [] };

  for (const node of nodes) {
    const level = node.type === "heading" ? (node.attrs?.level as number) : 0;
    if (level === 1 || level === 2) {
      if (current.heading || current.nodes.length > 0) {
        groups.push(current);
      }
      current = { heading: node, nodes: [] };
    } else {
      current.nodes.push(node);
    }
  }

  if (current.heading || current.nodes.length > 0) {
    groups.push(current);
  }

  return groups;
}

// --- Block rendering ---

function blockToDita(
  node: JSONContent,
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);

  switch (node.type) {
    case "heading": {
      const level = (node.attrs?.level as number) ?? 3;
      return `${pad}<p outputclass="h${level}"><b>${inlineContent(node, ctx)}</b></p>`;
    }

    case "paragraph":
      return `${pad}<p>${inlineContent(node, ctx)}</p>`;

    case "bulletList":
      return listToDita(node, "ul", indent, ctx);

    case "orderedList":
      return listToDita(node, "ol", indent, ctx);

    case "codeBlock": {
      const lang = (node.attrs?.language as string) || undefined;
      const code =
        node.content?.map((n) => n.text ?? "").join("") ?? "";
      const langAttr = lang
        ? ` outputclass="language-${escAttr(lang)}"`
        : "";
      return `${pad}<codeblock${langAttr}>${esc(code)}</codeblock>`;
    }

    case "blockquote":
      return blockquoteToDita(node, indent, ctx);

    case "horizontalRule":
      return "";

    case "table":
      return tableToDita(node, indent, ctx);

    case "definitionList":
      return definitionListToDita(node, indent, ctx);

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      const width = node.attrs?.width as string | undefined;
      const height = node.attrs?.height as string | undefined;
      const scale = node.attrs?._ditaScale as string | undefined;
      const placement = node.attrs?._ditaPlacement as string | undefined;

      let imgAttrs = `href="${escAttr(src)}"`;
      if (width) imgAttrs += ` width="${escAttr(width)}"`;
      if (height) imgAttrs += ` height="${escAttr(height)}"`;
      if (scale) imgAttrs += ` scale="${escAttr(scale)}"`;
      if (placement) imgAttrs += ` placement="${escAttr(placement)}"`;

      return alt
        ? `${pad}<image ${imgAttrs}><alt>${esc(alt)}</alt></image>`
        : `${pad}<image ${imgAttrs} />`;
    }

    case "callout":
      return calloutToDita(node, indent, ctx);

    case "codeGroup":
      return (
        node.content
          ?.map((child) => blockToDita(child, indent, ctx))
          .filter(Boolean)
          .join("\n") ?? ""
      );

    case "componentRef": {
      const componentId = node.attrs?.componentId as string | undefined;
      if (componentId && ctx?.componentMap) {
        const comp = ctx.componentMap.get(componentId);
        if (comp?.conrefPath) {
          return `${pad}<ph conref="${escAttr(comp.conrefPath)}" />`;
        }
      }
      return `${pad}<!-- Component: ${componentId ?? "unknown"} -->`;
    }

    case "conditionalBlock": {
      if (!node.content) return "";
      const profilingAttr = buildProfilingAttr(node, ctx);
      return node.content
        .map((child) => {
          const rendered = blockToDita(child, indent, ctx);
          if (!rendered || !profilingAttr) return rendered;
          return rendered.replace(/^(\s*<\w+)/, `$1 ${profilingAttr}`);
        })
        .filter(Boolean)
        .join("\n");
    }

    case "text":
      return node.text ? `${pad}<p>${esc(node.text)}</p>` : "";

    default:
      if (node.content) {
        return `${pad}<p>${inlineContent(node, ctx)}</p>`;
      }
      return "";
  }
}

// --- Definition list rendering ---

function definitionListToDita(
  node: JSONContent,
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);
  if (!node.content) return `${pad}<dl />`;

  const entries = node.content
    .filter(item => item.type === "definitionItem")
    .map(item => {
      const termNode = item.content?.find(c => c.type === "definitionTerm");
      const descNode = item.content?.find(c => c.type === "definitionDescription");

      const dt = termNode ? inlineContent(termNode, ctx) : "";
      const dd = descNode?.content
        ?.map(child => blockToDita(child, indent + 6, ctx))
        .filter(Boolean)
        .join("\n") ?? "";

      return [
        `${pad}  <dlentry>`,
        `${pad}    <dt>${dt}</dt>`,
        `${pad}    <dd>`,
        dd,
        `${pad}    </dd>`,
        `${pad}  </dlentry>`,
      ].join("\n");
    })
    .join("\n");

  return `${pad}<dl>\n${entries}\n${pad}</dl>`;
}

// --- List rendering ---

function listToDita(
  node: JSONContent,
  tag: "ul" | "ol",
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);
  if (!node.content) return `${pad}<${tag} />`;

  const items = node.content
    .map((item) => {
      if (item.type !== "listItem" || !item.content)
        return `${pad}  <li><p></p></li>`;

      // Delegate every child to blockToDita so non-paragraph blocks nested in
      // a list item — images, callouts, conditionalBlocks, code, tables, nested
      // lists — survive instead of being flattened to an (often empty) <p>.
      // DITA <li> permits block content, so this is valid.
      const inner = item.content
        .map((child) => blockToDita(child, indent + 4, ctx))
        .filter(Boolean)
        .join("\n");

      return `${pad}  <li>\n${inner}\n${pad}  </li>`;
    })
    .join("\n");

  return `${pad}<${tag}>\n${items}\n${pad}</${tag}>`;
}

// --- Callout / note rendering ---

const CALLOUT_TO_NOTE: Record<string, string> = {
  info: "note",
  warning: "warning",
  danger: "danger",
  success: "tip",
};

function calloutToDita(
  node: JSONContent,
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);
  const variant = (node.attrs?.variant as string) ?? "info";
  const noteType = CALLOUT_TO_NOTE[variant] || "note";

  if (!node.content) return `${pad}<note type="${noteType}" />`;

  const inner = node.content
    .map((child) => blockToDita(child, indent + 2, ctx))
    .filter(Boolean)
    .join("\n");

  return `${pad}<note type="${noteType}">\n${inner}\n${pad}</note>`;
}

function blockquoteToDita(
  node: JSONContent,
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);
  if (!node.content) return `${pad}<lq></lq>`;

  const inner = node.content
    .map((child) => blockToDita(child, indent + 2, ctx))
    .filter(Boolean)
    .join("\n");

  return `${pad}<lq>\n${inner}\n${pad}</lq>`;
}

// --- Table rendering ---

function tableToDita(
  node: JSONContent,
  indent: number,
  ctx?: DitaContext,
): string {
  const pad = " ".repeat(indent);
  if (!node.content) return `${pad}<simpletable />`;

  const rows = node.content.filter((r) => r.type === "tableRow");
  if (rows.length === 0) return `${pad}<simpletable />`;

  const frame = node.attrs?.frame as string | undefined;
  const frameAttr = frame ? ` frame="${escAttr(frame)}"` : "";
  const lines: string[] = [`${pad}<simpletable${frameAttr}>`];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const isHeader =
      ri === 0 &&
      (row.content ?? []).some((c) => c.type === "tableHeader");
    const rowTag = isHeader ? "sthead" : "strow";

    lines.push(`${pad}  <${rowTag}>`);
    for (const cell of row.content ?? []) {
      const text =
        cell.content?.map((child) => inlineContent(child, ctx)).join(" ") ??
        "";
      lines.push(`${pad}    <stentry>${text}</stentry>`);
    }
    lines.push(`${pad}  </${rowTag}>`);
  }

  lines.push(`${pad}</simpletable>`);
  return lines.join("\n");
}

// --- Map rendering ---

function renderTopicRef(item: DitaMapEntry, depth: number): string {
  const pad = "  ".repeat(depth);
  const hrefAttr = item.href
    ? ` href="${escAttr(item.href)}"`
    : "";

  if (item.children.length === 0) {
    return `${pad}<topicref${hrefAttr} navtitle="${escAttr(item.navtitle)}" />`;
  }

  const children = item.children
    .map((child) => renderTopicRef(child, depth + 1))
    .join("\n");

  return [
    `${pad}<topicref${hrefAttr} navtitle="${escAttr(item.navtitle)}">`,
    children,
    `${pad}</topicref>`,
  ].join("\n");
}

// --- Bookmap rendering ---

export function renderBookmap(title: string, items: DitaMapEntry[]): string {
  const refs = items.map((item) => renderBookmapItem(item, 1)).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE bookmap PUBLIC "-//OASIS//DTD DITA BookMap//EN" "bookmap.dtd">',
    "<bookmap>",
    `  <booktitle><mainbooktitle>${esc(title)}</mainbooktitle></booktitle>`,
    refs,
    "</bookmap>",
    "",
  ].join("\n");
}

function renderBookmapItem(item: DitaMapEntry, depth: number): string {
  const pad = "  ".repeat(depth);
  const role = (item as DitaMapEntry & { role?: string }).role;

  // Container elements (no href)
  if (role === "frontmatter" || role === "backmatter") {
    if (item.children.length === 0) return "";
    const children = item.children
      .map((child) => renderBookmapItem(child, depth + 1))
      .join("\n");
    return [`${pad}<${role}>`, children, `${pad}</${role}>`].join("\n");
  }

  // Element tag based on role
  const tag = role || "topicref";
  const hrefAttr = item.href ? ` href="${escAttr(item.href)}"` : "";
  const navAttr = item.navtitle ? ` navtitle="${escAttr(item.navtitle)}"` : "";

  if (item.children.length === 0) {
    return `${pad}<${tag}${hrefAttr}${navAttr} />`;
  }

  const children = item.children
    .map((child) => renderBookmapItem(child, depth + 1))
    .join("\n");

  return [`${pad}<${tag}${hrefAttr}${navAttr}>`, children, `${pad}</${tag}>`].join("\n");
}

// --- Relationship table rendering ---

export function renderReltable(reltable: DitaReltableExport, indent: number = 1): string {
  const pad = "  ".repeat(indent);
  const rows = reltable.rows.map(row => {
    const cells = row.cells.map(cell => {
      const refs = cell.hrefs.map(href =>
        `${pad}      <topicref href="${escAttr(href)}" />`
      ).join("\n");
      return refs
        ? `${pad}    <relcell>\n${refs}\n${pad}    </relcell>`
        : `${pad}    <relcell />`;
    }).join("\n");
    return `${pad}  <relrow>\n${cells}\n${pad}  </relrow>`;
  }).join("\n");

  return `${pad}<reltable>\n${rows}\n${pad}</reltable>`;
}

// --- Inline rendering ---

function inlineContent(node: JSONContent, ctx?: DitaContext): string {
  if (!node.content) return "";
  return node.content.map((child) => inlineNode(child, ctx)).join("");
}

function inlineNode(node: JSONContent, ctx?: DitaContext): string {
  if (node.type === "inlineComponentRef") {
    const componentId = node.attrs?.componentId as string | undefined;
    if (componentId && ctx?.componentMap) {
      const comp = ctx.componentMap.get(componentId);
      if (comp?.conrefPath) {
        return `<ph conref="${escAttr(comp.conrefPath)}" />`;
      }
    }
    return `<!-- Inline component: ${componentId ?? "unknown"} -->`;
  }

  if (node.type === "variableToken") {
    const key = String(node.attrs?.key ?? "variable");
    if (ctx?.variableMap) {
      const value = ctx.variableMap.get(key);
      if (value) return `<keyword keyref="${escAttr(key)}">${esc(value)}</keyword>`;
    }
    return `<keyword keyref="${escAttr(key)}">${esc(key)}</keyword>`;
  }

  if (node.type === "topicLink") {
    const topicId = node.attrs?.topicId as string | undefined;
    const info = topicId ? ctx?.topicLinks?.get(topicId) : undefined;
    if (info?.href) {
      return `<xref href="${escAttr(info.href)}">${esc(info.title)}</xref>`;
    }
    return info ? esc(info.title) : "[Topic Link]";
  }

  if (node.type === "hardBreak") {
    return "<?linebreak?>";
  }

  // Inline images (DITA <p><image placement="inline"/></p>).
  if (node.type === "image") {
    const src = (node.attrs?.src as string) ?? "";
    const alt = (node.attrs?.alt as string) ?? "";
    const width = node.attrs?.width as string | undefined;
    const height = node.attrs?.height as string | undefined;
    const placement = (node.attrs?._ditaPlacement as string | undefined) ?? "inline";
    let imgAttrs = `href="${escAttr(src)}"`;
    if (width) imgAttrs += ` width="${escAttr(width)}"`;
    if (height) imgAttrs += ` height="${escAttr(height)}"`;
    imgAttrs += ` placement="${escAttr(placement)}"`;
    return alt
      ? `<image ${imgAttrs}><alt>${esc(alt)}</alt></image>`
      : `<image ${imgAttrs} />`;
  }

  if (node.type !== "text" || !node.text) return "";

  let text = esc(node.text);

  if (!node.marks || node.marks.length === 0) return text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case "bold":
        text = `<b>${text}</b>`;
        break;
      case "italic":
        text = `<i>${text}</i>`;
        break;
      case "code":
        text = `<codeph>${text}</codeph>`;
        break;
      case "strike":
        text = `<ph outputclass="strikethrough">${text}</ph>`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) ?? "";
        text = `<xref href="${escAttr(href)}" scope="external" format="html">${text}</xref>`;
        break;
      }
    }
  }

  return text;
}

// --- Profiling / condition helpers ---

function buildProfilingAttr(node: JSONContent, ctx?: DitaContext): string {
  const dimensionId = node.attrs?.dimensionId as string | undefined;
  const dimensionName = node.attrs?.dimensionName as string | undefined;
  const valueLabels = node.attrs?.valueLabels as string[] | undefined;

  let attrName: string | undefined;
  if (dimensionId && ctx?.conditionDimensionMap) {
    attrName = ctx.conditionDimensionMap.get(dimensionId);
  }
  if (!attrName && dimensionName) {
    if (DITA_PROFILING_ATTRS.has(dimensionName.toLowerCase())) {
      attrName = dimensionName.toLowerCase();
    } else {
      attrName = "otherprops";
    }
  }

  if (!attrName || !valueLabels || valueLabels.length === 0) return "";
  return `${attrName}="${escAttr(valueLabels.join(" "))}"`;
}

// --- Prolog rendering ---

function renderProlog(metadata: DitaExportMetadata): string {
  const inner: string[] = [];

  if (metadata.prolog?.authors) {
    for (const author of metadata.prolog.authors) {
      inner.push(`    <author>${esc(author)}</author>`);
    }
  }

  if (metadata.prolog?.critdates) {
    const cd = metadata.prolog.critdates;
    const cdLines: string[] = [];
    if (cd.created) cdLines.push(`      <created date="${escAttr(cd.created)}" />`);
    if (cd.revised) cdLines.push(`      <revised modified="${escAttr(cd.revised)}" />`);
    if (cdLines.length > 0) {
      inner.push("    <critdates>");
      inner.push(...cdLines);
      inner.push("    </critdates>");
    }
  }

  if (metadata.prolog?.keywords && metadata.prolog.keywords.length > 0) {
    inner.push("    <metadata>");
    inner.push("      <keywords>");
    for (const kw of metadata.prolog.keywords) {
      inner.push(`        <keyword>${esc(kw)}</keyword>`);
    }
    inner.push("      </keywords>");
    inner.push("    </metadata>");
  }

  if (inner.length === 0) return "";

  return ["  <prolog>", ...inner, "  </prolog>"].join("\n");
}

// --- Helpers ---

function xmlId(slug: string): string {
  let id = slug.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!id || /^[^a-zA-Z_]/.test(id)) {
    id = `_${id}`;
  }
  return id;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
