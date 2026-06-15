import { marked } from "marked";
import type { Token, Tokens } from "marked";
import type { TipTapNode, TipTapDoc, ParseResult } from "../core/types";

export function markdownToTipTap(markdown: string): ParseResult {
  const { frontmatter, body } = extractFrontmatter(markdown);
  const tokens = marked.lexer(body);

  const title =
    frontmatter.title ||
    extractFirstHeadingTitle(tokens) ||
    "";

  const content = tokensToNodes(tokens);

  return {
    title,
    doc: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
  };
}

export function extractTitleFromMarkdown(
  markdown: string,
  filename?: string,
): string {
  const { frontmatter, body } = extractFrontmatter(markdown);
  if (frontmatter.title) return frontmatter.title;

  const tokens = marked.lexer(body);
  const heading = extractFirstHeadingTitle(tokens);
  if (heading) return heading;

  if (filename) {
    return filename
      .replace(/\.md$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return "Untitled";
}

function extractFrontmatter(markdown: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = markdown.match(fmRegex);

  if (!match) return { frontmatter: {}, body: markdown };

  const fmBlock = match[1];
  const frontmatter: Record<string, string> = {};

  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) frontmatter[key] = value;
  }

  return { frontmatter, body: markdown.slice(match[0].length) };
}

function extractFirstHeadingTitle(tokens: Token[]): string | null {
  for (const token of tokens) {
    if (token.type === "heading" && (token as Tokens.Heading).depth === 1) {
      return (token as Tokens.Heading).text;
    }
  }
  return null;
}

function tokensToNodes(tokens: Token[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  let i = 0;
  let skipNextBlock = false;

  while (i < tokens.length) {
    const token = tokens[i];

    // After a <!-- component: --> comment, the next block token is an inline
    // preview of the component content (for human readability). Skip it.
    if (skipNextBlock) {
      skipNextBlock = false;
      if (token.type !== "html" && token.type !== "heading") {
        i++;
        continue;
      }
    }

    if (token.type === "html") {
      const text = (token as Tokens.HTML).text.trim();

      const condOpen = text.match(CONDITION_OPEN_RE);
      if (condOpen) {
        let depth = 1;
        let j = i + 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === "html") {
            const inner = (tokens[j] as Tokens.HTML).text.trim();
            if (CONDITION_OPEN_RE.test(inner)) depth++;
            if (CONDITION_CLOSE_RE.test(inner)) depth--;
          }
          if (depth > 0) j++;
        }
        const innerNodes = tokensToNodes(tokens.slice(i + 1, j));
        nodes.push({
          type: "conditionalBlock",
          attrs: {
            dimensionId: null,
            dimensionName: condOpen[1].trim(),
            valueIds: [],
            valueLabels: condOpen[2].split(",").map((v) => v.trim()),
            logic: condOpen[3],
            _mdCondition: true,
          },
          content: innerNodes.length > 0 ? innerNodes : [{ type: "paragraph" }],
        });
        i = j + 1;
        continue;
      }

      if (CODE_GROUP_OPEN_RE.test(text)) {
        let j = i + 1;
        while (j < tokens.length) {
          if (tokens[j].type === "html" && CODE_GROUP_CLOSE_RE.test((tokens[j] as Tokens.HTML).text.trim())) break;
          j++;
        }
        const codeBlocks = tokens.slice(i + 1, j)
          .filter((t) => t.type === "code")
          .map((t) => codeBlockNode(t as Tokens.Code));
        if (codeBlocks.length > 0) {
          nodes.push({ type: "codeGroup", content: codeBlocks });
        }
        i = j + 1;
        continue;
      }
    }

    const node = tokenToNode(token);
    if (node) {
      if (Array.isArray(node)) {
        nodes.push(...node);
      } else {
        nodes.push(node);
        if (node.type === "componentRef") {
          skipNextBlock = true;
        }
      }
    }
    i++;
  }

  return nodes;
}

function tokenToNode(token: Token): TipTapNode | TipTapNode[] | null {
  switch (token.type) {
    case "heading":
      return headingNode(token as Tokens.Heading);
    case "paragraph":
      return paragraphNode(token as Tokens.Paragraph);
    case "code":
      return codeBlockNode(token as Tokens.Code);
    case "blockquote":
      return blockquoteNode(token as Tokens.Blockquote);
    case "list":
      return listNode(token as Tokens.List);
    case "table":
      return tableNode(token as Tokens.Table);
    case "hr":
      return { type: "horizontalRule" };
    case "image":
      return imageNode(token as Tokens.Image);
    case "html":
      return htmlNode(token as Tokens.HTML);
    case "text": {
      // Non-loose list items produce top-level "text" tokens instead of "paragraph"
      const t = token as Tokens.Text;
      const inlineNodes = t.tokens
        ? inlineTokensToNodes(t.tokens)
        : t.text
          ? [{ type: "text" as const, text: t.text }]
          : [];
      return {
        type: "paragraph",
        content: inlineNodes.length > 0 ? inlineNodes : undefined,
      };
    }
    case "space":
      return null;
    default:
      return null;
  }
}

function headingNode(token: Tokens.Heading): TipTapNode {
  return {
    type: "heading",
    attrs: { level: token.depth },
    content: inlineTokensToNodes(token.tokens ?? []),
  };
}

function paragraphNode(token: Tokens.Paragraph): TipTapNode | TipTapNode[] {
  const inlineNodes = inlineTokensToNodes(token.tokens ?? []);

  if (
    inlineNodes.length === 1 &&
    inlineNodes[0].type === "image"
  ) {
    return inlineNodes[0];
  }

  return {
    type: "paragraph",
    content: inlineNodes.length > 0 ? inlineNodes : undefined,
  };
}

function codeBlockNode(token: Tokens.Code): TipTapNode {
  return {
    type: "codeBlock",
    attrs: token.lang ? { language: token.lang } : undefined,
    content: [{ type: "text", text: token.text }],
  };
}

const CALLOUT_MAP: Record<string, string> = {
  NOTE: "info",
  TIP: "success",
  WARNING: "warning",
  CAUTION: "danger",
  IMPORTANT: "info",
};

function blockquoteNode(token: Tokens.Blockquote): TipTapNode {
  const children = tokensToNodes(token.tokens ?? []);
  const firstPara = children[0];
  if (firstPara?.type === "paragraph" && firstPara.content?.[0]?.type === "text") {
    const text = firstPara.content[0].text ?? "";
    const match = text.match(/^\[!(\w+)]\s*/);
    if (match) {
      const variant = CALLOUT_MAP[match[1].toUpperCase()];
      if (variant) {
        const remaining = text.slice(match[0].length);
        const content = [...children];
        if (remaining) {
          content[0] = {
            ...firstPara,
            content: [{ type: "text", text: remaining }, ...(firstPara.content?.slice(1) ?? [])],
          };
        } else if ((firstPara.content?.length ?? 0) > 1) {
          content[0] = { ...firstPara, content: firstPara.content?.slice(1) };
        } else {
          content.shift();
        }
        if (content.length === 0) {
          content.push({ type: "paragraph" });
        }
        return { type: "callout", attrs: { variant }, content };
      }
    }
  }
  return {
    type: "blockquote",
    content: children,
  };
}

function listNode(token: Tokens.List): TipTapNode {
  const type = token.ordered ? "orderedList" : "bulletList";
  const attrs = token.ordered ? { start: token.start } : undefined;

  return {
    type,
    attrs,
    content: token.items.map((item) => listItemNode(item)),
  };
}

function listItemNode(item: Tokens.ListItem): TipTapNode {
  const children = tokensToNodes(item.tokens ?? []);

  const content: TipTapNode[] = [];
  for (const child of children) {
    if (
      child.type === "paragraph" ||
      child.type === "bulletList" ||
      child.type === "orderedList" ||
      child.type === "codeBlock" ||
      child.type === "blockquote"
    ) {
      content.push(child);
    } else {
      content.push({ type: "paragraph", content: [child] });
    }
  }

  return {
    type: "listItem",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function tableNode(token: Tokens.Table): TipTapNode {
  const rows: TipTapNode[] = [];

  if (token.header.length > 0) {
    rows.push({
      type: "tableRow",
      content: token.header.map((cell) => ({
        type: "tableHeader",
        content: [
          {
            type: "paragraph",
            content: inlineTokensToNodes(cell.tokens),
          },
        ],
      })),
    });
  }

  for (const row of token.rows) {
    rows.push({
      type: "tableRow",
      content: row.map((cell) => ({
        type: "tableCell",
        content: [
          {
            type: "paragraph",
            content: inlineTokensToNodes(cell.tokens),
          },
        ],
      })),
    });
  }

  return {
    type: "table",
    content: rows,
  };
}

function imageNode(token: Tokens.Image): TipTapNode {
  return {
    type: "image",
    attrs: {
      src: token.href,
      alt: token.text || null,
      title: token.title || null,
    },
  };
}

const COMPONENT_BLOCK_RE = /^<!--\s*component:\s*(.+?)\s*-->$/;
const COMPONENT_INLINE_RE = /<!--\s*component-inline:\s*(.+?)\s*-->/;
const CONDITION_OPEN_RE = /^<!--\s*condition:\s*(.+?)\s*=\s*(.+?)\s*\((include|exclude)\)\s*-->$/;
const CONDITION_CLOSE_RE = /^<!--\s*\/condition\s*-->$/;
const CODE_GROUP_OPEN_RE = /^<!--\s*code-group\s*-->$/;
const CODE_GROUP_CLOSE_RE = /^<!--\s*\/code-group\s*-->$/;
const VARIABLE_RE = /^<!--\s*var:\s*(.+?)\s*-->$/;
const TOPIC_LINK_RE = /^<!--\s*topic-link:\s*(?:(\S+\.md)\s+)?"([^"]+)"\s*-->$/;

function htmlNode(token: Tokens.HTML): TipTapNode | null {
  const text = token.text.trim();

  const blockMatch = text.match(COMPONENT_BLOCK_RE);
  if (blockMatch) {
    return {
      type: "componentRef",
      attrs: { componentId: null, _mdPath: blockMatch[1] },
    };
  }

  const inlineMatch = text.match(COMPONENT_INLINE_RE);
  if (inlineMatch) {
    return {
      type: "paragraph",
      content: [{
        type: "inlineComponentRef",
        attrs: { componentId: null, _mdPath: inlineMatch[1] },
      }],
    };
  }

  if (CONDITION_OPEN_RE.test(text) || CONDITION_CLOSE_RE.test(text)) return null;
  if (CODE_GROUP_OPEN_RE.test(text) || CODE_GROUP_CLOSE_RE.test(text)) return null;

  const varMatch = text.match(VARIABLE_RE);
  if (varMatch) {
    return {
      type: "paragraph",
      content: [{ type: "variableToken", attrs: { key: varMatch[1] } }],
    };
  }

  const topicLinkMatch = text.match(TOPIC_LINK_RE);
  if (topicLinkMatch) {
    return {
      type: "paragraph",
      content: [{
        type: "topicLink",
        attrs: {
          topicId: null,
          _mdSlug: topicLinkMatch[1] || null,
          _mdTitle: topicLinkMatch[2],
        },
      }],
    };
  }

  return {
    type: "paragraph",
    content: [{ type: "text", text: token.text }],
  };
}

function inlineTokensToNodes(tokens: Token[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const token of tokens) {
    const inline = inlineTokenToNode(token);
    if (inline) {
      if (Array.isArray(inline)) {
        nodes.push(...inline);
      } else {
        nodes.push(inline);
      }
    }
  }

  return nodes;
}

function inlineTokenToNode(
  token: Token,
  parentMarks?: TipTapNode["marks"],
): TipTapNode | TipTapNode[] | null {
  const marks = parentMarks ? [...parentMarks] : [];

  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        return flattenInlineWithMarks(t.tokens, marks.length > 0 ? marks : undefined);
      }
      const node: TipTapNode = { type: "text", text: t.text };
      if (marks.length > 0) node.marks = marks;
      return node;
    }

    case "strong": {
      const t = token as Tokens.Strong;
      const newMarks = [...marks, { type: "bold" }];
      return flattenInlineWithMarks(t.tokens ?? [], newMarks);
    }

    case "em": {
      const t = token as Tokens.Em;
      const newMarks = [...marks, { type: "italic" }];
      return flattenInlineWithMarks(t.tokens ?? [], newMarks);
    }

    case "del": {
      const t = token as Tokens.Del;
      const newMarks = [...marks, { type: "strike" }];
      return flattenInlineWithMarks(t.tokens ?? [], newMarks);
    }

    case "codespan": {
      const t = token as Tokens.Codespan;
      const node: TipTapNode = { type: "text", text: t.text };
      node.marks = [...marks, { type: "code" }];
      return node;
    }

    case "link": {
      const t = token as Tokens.Link;
      const linkMark = {
        type: "link",
        attrs: { href: t.href, target: "_blank" },
      };
      const newMarks = [...marks, linkMark];
      return flattenInlineWithMarks(t.tokens ?? [], newMarks);
    }

    case "image": {
      return imageNode(token as Tokens.Image);
    }

    case "br":
      return { type: "hardBreak" };

    case "html": {
      const t = token as Tokens.HTML;
      const trimmed = t.text.trim();
      const inlineCompMatch = trimmed.match(COMPONENT_INLINE_RE);
      if (inlineCompMatch) {
        return {
          type: "inlineComponentRef",
          attrs: { componentId: null, _mdPath: inlineCompMatch[1] },
        };
      }
      const varMatch = trimmed.match(VARIABLE_RE);
      if (varMatch) {
        return { type: "variableToken", attrs: { key: varMatch[1] } };
      }
      const topicLinkMatch = trimmed.match(TOPIC_LINK_RE);
      if (topicLinkMatch) {
        return {
          type: "topicLink",
          attrs: {
            topicId: null,
            _mdSlug: topicLinkMatch[1] || null,
            _mdTitle: topicLinkMatch[2],
          },
        };
      }
      const node: TipTapNode = { type: "text", text: t.text };
      if (marks.length > 0) node.marks = marks;
      return node;
    }

    case "escape": {
      const t = token as Tokens.Escape;
      const node: TipTapNode = { type: "text", text: t.text };
      if (marks.length > 0) node.marks = marks;
      return node;
    }

    default:
      return null;
  }
}

function flattenInlineWithMarks(
  tokens: Token[],
  marks: TipTapNode["marks"],
): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  for (const token of tokens) {
    const result = inlineTokenToNode(token, marks);
    if (result) {
      if (Array.isArray(result)) {
        nodes.push(...result);
      } else {
        nodes.push(result);
      }
    }
  }
  return nodes;
}

export function rewriteMarkdownConditions(
  doc: Record<string, unknown>,
  dimensionMap: Map<string, { id: string; values: Map<string, string> }>,
): Record<string, unknown> {
  return walkAndRewriteConditions(doc, dimensionMap);
}

function walkAndRewriteConditions(
  node: Record<string, unknown>,
  dimensionMap: Map<string, { id: string; values: Map<string, string> }>,
): Record<string, unknown> {
  const type = node.type as string | undefined;
  const attrs = node.attrs as Record<string, unknown> | undefined;

  if (type === "conditionalBlock" && attrs?._mdCondition) {
    const dimName = (attrs.dimensionName as string) || "";
    const valueLabels = (attrs.valueLabels as string[]) || [];
    const dim = dimensionMap.get(dimName.toLowerCase());

    const { _mdCondition: _, ...restAttrs } = attrs;
    const newAttrs = { ...restAttrs };

    if (dim) {
      newAttrs.dimensionId = dim.id;
      newAttrs.valueIds = valueLabels
        .map((label) => dim.values.get(label.toLowerCase()))
        .filter((id): id is string => id != null);
    }

    const content = node.content as Record<string, unknown>[] | undefined;
    return {
      ...node,
      attrs: newAttrs,
      ...(Array.isArray(content)
        ? { content: content.map((c) => walkAndRewriteConditions(c, dimensionMap)) }
        : {}),
    };
  }

  const content = node.content as Record<string, unknown>[] | undefined;
  if (Array.isArray(content)) {
    return { ...node, content: content.map((c) => walkAndRewriteConditions(c, dimensionMap)) };
  }
  return node;
}

export function rewriteMarkdownTopicLinks(
  doc: Record<string, unknown>,
  slugToId: Map<string, string>,
  titleToId: Map<string, string>,
): Record<string, unknown> {
  return walkAndRewriteTopicLinks(doc, slugToId, titleToId);
}

function walkAndRewriteTopicLinks(
  node: Record<string, unknown>,
  slugToId: Map<string, string>,
  titleToId: Map<string, string>,
): Record<string, unknown> {
  const type = node.type as string | undefined;
  const attrs = node.attrs as Record<string, unknown> | undefined;

  if (type === "topicLink" && (attrs?._mdSlug || attrs?._mdTitle)) {
    const slug = attrs._mdSlug as string | null;
    const title = attrs._mdTitle as string | null;
    const { _mdSlug: _s, _mdTitle: _t, ...restAttrs } = attrs;

    let topicId: string | null = null;
    if (slug) {
      const normalized = slug.replace(/\.md$/i, "").toLowerCase();
      topicId = slugToId.get(normalized) ?? null;
      if (!topicId) {
        const filename = normalized.split("/").pop() ?? "";
        if (filename) topicId = slugToId.get(filename) ?? null;
      }
    }
    if (!topicId && title) {
      topicId = titleToId.get(title.toLowerCase()) ?? null;
    }

    return { ...node, attrs: { ...restAttrs, topicId } };
  }

  const content = node.content as Record<string, unknown>[] | undefined;
  if (Array.isArray(content)) {
    return { ...node, content: content.map((c) => walkAndRewriteTopicLinks(c, slugToId, titleToId)) };
  }
  return node;
}

export function rewriteMarkdownComponentPaths(
  doc: Record<string, unknown>,
  pathToId: Map<string, string>,
): Record<string, unknown> {
  return walkAndRewrite(doc, pathToId);
}

function walkAndRewrite(
  node: Record<string, unknown>,
  pathToId: Map<string, string>,
): Record<string, unknown> {
  const type = node.type as string | undefined;
  const attrs = node.attrs as Record<string, unknown> | undefined;

  if (
    (type === "componentRef" || type === "inlineComponentRef") &&
    attrs?._mdPath
  ) {
    const mdPath = attrs._mdPath as string;
    const componentId = matchMdPath(mdPath, pathToId);
    const { _mdPath: _, ...restAttrs } = attrs;
    return { ...node, attrs: { ...restAttrs, componentId: componentId ?? null } };
  }

  const content = node.content as Record<string, unknown>[] | undefined;
  if (Array.isArray(content)) {
    return { ...node, content: content.map((c) => walkAndRewrite(c, pathToId)) };
  }

  return node;
}

function matchMdPath(
  mdPath: string,
  pathToId: Map<string, string>,
): string | undefined {
  if (pathToId.has(mdPath)) return pathToId.get(mdPath);

  const normalized = mdPath.toLowerCase();
  for (const [path, id] of pathToId) {
    if (path.toLowerCase() === normalized) return id;
  }

  const mdFile = mdPath.split("/").pop() ?? "";
  for (const [path, id] of pathToId) {
    const pathFile = path.split("/").pop() ?? "";
    if (pathFile && mdFile && pathFile.toLowerCase() === mdFile.toLowerCase())
      return id;
  }

  return undefined;
}
