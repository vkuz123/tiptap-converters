import * as cheerio from "cheerio";
import type { AnyNode, Element as DomElement, Text as DomText } from "domhandler";
import type { TipTapNode, TipTapDoc, ParseResult } from "../core/types";

export function htmlToTipTap(html: string): ParseResult {
  const $ = cheerio.load(html);

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "";

  const bodyEl = $("body").length > 0 ? $("body") : $.root();
  const content = processChildren($, bodyEl);

  return {
    title,
    doc: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
  };
}

function processChildren(
  $: cheerio.CheerioAPI,
  parent: cheerio.Cheerio<AnyNode>,
): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  parent.contents().each((_, el) => {
    const result = processNode($, el);
    if (result) {
      if (Array.isArray(result)) {
        nodes.push(...result);
      } else {
        nodes.push(result);
      }
    }
  });

  return nodes;
}

function processNode(
  $: cheerio.CheerioAPI,
  node: AnyNode,
): TipTapNode | TipTapNode[] | null {
  if (node.type === "text") {
    const text = (node as DomText).data;
    if (!text || (!text.trim() && /\n/.test(text))) return null;
    return { type: "text", text };
  }

  if (node.type !== "tag") return null;

  const el = node as DomElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return processHeading($, $(el), parseInt(tag[1]));

    case "p":
      return processParagraph($, $(el));

    case "strong":
    case "b":
    case "em":
    case "i":
    case "code":
    case "s":
    case "del":
    case "strike":
    case "a":
    case "span":
      return processInlineElement($, $(el), []);

    case "ul":
      return processList($, $(el), "bulletList");
    case "ol":
      return processList($, $(el), "orderedList");

    case "blockquote":
      return {
        type: "blockquote",
        content: processBlockChildren($, $(el)),
      };

    case "pre":
      return processPreBlock($, $(el));

    case "table":
      return processTable($, $(el));

    case "img":
      return processImage($, $(el));

    case "hr":
      return { type: "horizontalRule" };

    case "br":
      return { type: "hardBreak" };

    case "div":
    case "section":
    case "article":
    case "main":
    case "header":
    case "footer":
    case "nav":
    case "aside":
      return processBlockChildren($, $(el));

    case "script":
    case "style":
    case "link":
    case "meta":
    case "noscript":
      return null;

    default:
      return processBlockChildren($, $(el));
  }
}

function processHeading(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
  level: number,
): TipTapNode {
  const content = processInlineChildren($, el, []);
  return {
    type: "heading",
    attrs: { level: Math.min(level, 6) },
    content: content.length > 0 ? content : undefined,
  };
}

function processParagraph(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): TipTapNode | null {
  const content = processInlineChildren($, el, []);

  if (content.length === 1 && content[0].type === "image") {
    return content[0];
  }

  if (content.length === 0) return null;

  return {
    type: "paragraph",
    content,
  };
}

function processBlockChildren(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  el.contents().each((_, child) => {
    const result = processNode($, child);
    if (result) {
      if (Array.isArray(result)) {
        nodes.push(...result);
      } else {
        nodes.push(result);
      }
    }
  });
  return nodes;
}

function processList(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
  type: "bulletList" | "orderedList",
): TipTapNode {
  const items: TipTapNode[] = [];

  el.children("li").each((_, li) => {
    const liEl = $(li);
    const content = processBlockChildren($, liEl);

    const wrapped: TipTapNode[] = [];
    for (const node of content) {
      if (
        node.type === "paragraph" ||
        node.type === "bulletList" ||
        node.type === "orderedList" ||
        node.type === "codeBlock" ||
        node.type === "blockquote"
      ) {
        wrapped.push(node);
      } else if (node.type === "text" || node.marks) {
        if (wrapped.length > 0 && wrapped[wrapped.length - 1].type === "paragraph") {
          wrapped[wrapped.length - 1].content?.push(node);
        } else {
          wrapped.push({ type: "paragraph", content: [node] });
        }
      } else {
        wrapped.push(node);
      }
    }

    items.push({
      type: "listItem",
      content: wrapped.length > 0 ? wrapped : [{ type: "paragraph" }],
    });
  });

  return { type, content: items };
}

function processPreBlock(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): TipTapNode {
  const codeEl = el.find("code");
  const text = codeEl.length > 0 ? codeEl.text() : el.text();

  let language: string | undefined;
  if (codeEl.length > 0) {
    const className = codeEl.attr("class") || "";
    const langMatch = className.match(/language-(\S+)/);
    if (langMatch) language = langMatch[1];
  }

  return {
    type: "codeBlock",
    attrs: language ? { language } : undefined,
    content: [{ type: "text", text }],
  };
}

function processTable(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): TipTapNode {
  const rows: TipTapNode[] = [];

  el.find("tr").each((_, tr) => {
    const cells: TipTapNode[] = [];
    $(tr).children("th, td").each((_, cell) => {
      const isHeader = (cell as DomElement).tagName.toLowerCase() === "th";
      const content = processInlineChildren($, $(cell), []);
      cells.push({
        type: isHeader ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: content.length > 0 ? content : undefined,
          },
        ],
      });
    });

    if (cells.length > 0) {
      rows.push({ type: "tableRow", content: cells });
    }
  });

  return { type: "table", content: rows };
}

function processImage(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): TipTapNode {
  return {
    type: "image",
    attrs: {
      src: el.attr("src") || "",
      alt: el.attr("alt") || null,
      title: el.attr("title") || null,
    },
  };
}

function processInlineChildren(
  $: cheerio.CheerioAPI,
  parent: cheerio.Cheerio<AnyNode>,
  marks: Array<{ type: string; attrs?: Record<string, unknown> }>,
): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  parent.contents().each((_, child) => {
    const result = processInlineElement($, $(child), marks);
    if (result) {
      if (Array.isArray(result)) {
        nodes.push(...result);
      } else {
        nodes.push(result);
      }
    }
  });

  return nodes;
}

function processInlineElement(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
  parentMarks: Array<{ type: string; attrs?: Record<string, unknown> }>,
): TipTapNode | TipTapNode[] | null {
  const node = el.get(0);
  if (!node) return null;

  if (node.type === "text") {
    const text = (node as DomText).data;
    if (!text) return null;
    const n: TipTapNode = { type: "text", text };
    if (parentMarks.length > 0) n.marks = [...parentMarks];
    return n;
  }

  if (node.type !== "tag") return null;

  const tag = (node as DomElement).tagName.toLowerCase();
  const marks = [...parentMarks];

  switch (tag) {
    case "strong":
    case "b":
      marks.push({ type: "bold" });
      return processInlineChildren($, el, marks);

    case "em":
    case "i":
      marks.push({ type: "italic" });
      return processInlineChildren($, el, marks);

    case "code":
      marks.push({ type: "code" });
      return processInlineChildren($, el, marks);

    case "s":
    case "del":
    case "strike":
      marks.push({ type: "strike" });
      return processInlineChildren($, el, marks);

    case "a": {
      const href = el.attr("href") || "";
      marks.push({ type: "link", attrs: { href, target: "_blank" } });
      return processInlineChildren($, el, marks);
    }

    case "img":
      return processImage($, el);

    case "br":
      return { type: "hardBreak" };

    case "span":
      return processInlineChildren($, el, marks);

    default:
      return processInlineChildren($, el, marks);
  }
}
