import type { JSONContent } from "@tiptap/core";

export interface TopicLinkInfo {
  title: string;
  slug?: string;
}

export interface ComponentLinkInfo {
  title: string;
  filename: string;
}

export interface MarkdownContext {
  topicLinks?: Map<string, TopicLinkInfo>;
  componentLinks?: Map<string, ComponentLinkInfo>;
  /** When provided, rendered component markdown is emitted after the comment marker for human readability. */
  componentContent?: Map<string, string>;
}

export function renderToMarkdown(
  doc: JSONContent,
  context?: MarkdownContext,
): string {
  if (!doc.content || doc.content.length === 0) return "";
  return doc.content
    .map((node) => blockToMarkdown(node, 0, context))
    .join("\n\n");
}

function blockToMarkdown(
  node: JSONContent,
  depth: number,
  ctx?: MarkdownContext,
): string {
  switch (node.type) {
    case "heading":
      return headingToMd(node, ctx);
    case "paragraph":
      return inlineContentToMd(node, ctx);
    case "bulletList":
      return listToMd(node, "bullet", depth, ctx);
    case "orderedList":
      return listToMd(node, "ordered", depth, ctx);
    case "codeBlock":
      return codeBlockToMd(node);
    case "blockquote":
      return blockquoteToMd(node, ctx);
    case "horizontalRule":
      return "---";
    case "table":
      return tableToMd(node, ctx);
    case "image":
      return imageToMd(node);
    case "callout":
      return calloutToMd(node, depth, ctx);
    case "codeGroup": {
      const inner =
        node.content
          ?.map((child) => blockToMarkdown(child, depth, ctx))
          .join("\n\n") ?? "";
      return `<!-- code-group -->\n\n${inner}\n\n<!-- /code-group -->`;
    }
    case "componentRef": {
      const compId = node.attrs?.componentId as string | undefined;
      const compInfo = compId ? ctx?.componentLinks?.get(compId) : undefined;
      const ref = compInfo?.filename ?? compId ?? "unknown";
      const comment = `<!-- component: ${ref} -->`;
      const content = compId ? ctx?.componentContent?.get(compId) : undefined;
      return content ? `${comment}\n${content}` : comment;
    }
    case "conditionalBlock":
      return conditionalToMd(node, depth, ctx);
    case "definitionList":
      return definitionListToMd(node, ctx);
    case "text":
      return node.text ?? "";
    default:
      return inlineContentToMd(node, ctx);
  }
}

function headingToMd(node: JSONContent, ctx?: MarkdownContext): string {
  const level = (node.attrs?.level as number) ?? 1;
  const prefix = "#".repeat(Math.min(level, 6));
  return `${prefix} ${inlineContentToMd(node, ctx)}`;
}

function listToMd(
  node: JSONContent,
  type: "bullet" | "ordered",
  depth: number,
  ctx?: MarkdownContext,
): string {
  if (!node.content) return "";
  const indent = "  ".repeat(depth);
  return node.content
    .map((item, i) => {
      if (item.type !== "listItem" || !item.content) return "";
      const marker = type === "bullet" ? "-" : `${i + 1}.`;
      const parts = item.content.map((child, ci) => {
        if (child.type === "bulletList" || child.type === "orderedList") {
          return listToMd(
            child,
            child.type === "bulletList" ? "bullet" : "ordered",
            depth + 1,
            ctx,
          );
        }
        const text = inlineContentToMd(child, ctx);
        if (ci === 0) return `${indent}${marker} ${text}`;
        return `${indent}  ${text}`;
      });
      return parts.join("\n");
    })
    .join("\n");
}

function codeBlockToMd(node: JSONContent): string {
  const lang = (node.attrs?.language as string) ?? "";
  const code = node.content?.map((n) => n.text ?? "").join("") ?? "";
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

const CALLOUT_LABELS: Record<string, string> = {
  info: "NOTE",
  warning: "WARNING",
  danger: "CAUTION",
  success: "TIP",
};

function calloutToMd(
  node: JSONContent,
  depth: number,
  ctx?: MarkdownContext,
): string {
  const variant = (node.attrs?.variant as string) ?? "info";
  const label = CALLOUT_LABELS[variant] || "NOTE";
  if (!node.content) return `> [!${label}]`;
  const body = node.content
    .map((child) => blockToMarkdown(child, depth, ctx))
    .join("\n\n");
  const lines = body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `> [!${label}]\n${lines}`;
}

function blockquoteToMd(node: JSONContent, ctx?: MarkdownContext): string {
  if (!node.content) return ">";
  return node.content
    .map((child) => {
      const text = blockToMarkdown(child, 0, ctx);
      return text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    })
    .join("\n>\n");
}

function tableToMd(node: JSONContent, ctx?: MarkdownContext): string {
  if (!node.content) return "";

  const rows = node.content.filter((r) => r.type === "tableRow");
  if (rows.length === 0) return "";

  const mdRows: string[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const cells = (row.content ?? []).map((cell) => {
      const text =
        cell.content
          ?.map((child) => inlineContentToMd(child, ctx))
          .join(" ") ?? "";
      return text.replace(/\|/g, "\\|");
    });
    mdRows.push(`| ${cells.join(" | ")} |`);

    if (ri === 0) {
      const sep = cells.map(() => "---");
      mdRows.push(`| ${sep.join(" | ")} |`);
    }
  }

  return mdRows.join("\n");
}

function imageToMd(node: JSONContent): string {
  const src = (node.attrs?.src as string) ?? "";
  const alt = (node.attrs?.alt as string) ?? "";
  return `![${alt}](${src})`;
}

function definitionListToMd(node: JSONContent, ctx?: MarkdownContext): string {
  if (!node.content) return "";
  return node.content
    .filter((item) => item.type === "definitionItem")
    .map((item) => {
      const termNode = item.content?.find((c) => c.type === "definitionTerm");
      const descNode = item.content?.find((c) => c.type === "definitionDescription");
      const term = termNode ? inlineContentToMd(termNode, ctx) : "";
      const desc = descNode?.content
        ?.map((child) => blockToMarkdown(child, 0, ctx))
        .join("\n\n") ?? "";
      return `${term}\n: ${desc.replace(/\n/g, "\n  ")}`;
    })
    .join("\n\n");
}

function conditionalToMd(
  node: JSONContent,
  depth: number,
  ctx?: MarkdownContext,
): string {
  if (!node.content) return "";
  const dimensionName = (node.attrs?.dimensionName as string) || "Condition";
  const valueLabels = (node.attrs?.valueLabels as string[]) || [];
  const logic = (node.attrs?.logic as string) || "include";
  const valuesStr = valueLabels.join(", ") || "All";
  const body = node.content
    .map((child) => blockToMarkdown(child, depth, ctx))
    .join("\n\n");
  return `<!-- condition: ${dimensionName} = ${valuesStr} (${logic}) -->\n\n${body}\n\n<!-- /condition -->`;
}

function inlineContentToMd(node: JSONContent, ctx?: MarkdownContext): string {
  if (!node.content) return "";
  return node.content.map((child) => inlineNodeToMd(child, ctx)).join("");
}

function inlineNodeToMd(node: JSONContent, ctx?: MarkdownContext): string {
  if (node.type === "inlineComponentRef") {
    const compId = node.attrs?.componentId as string | undefined;
    const compInfo = compId ? ctx?.componentLinks?.get(compId) : undefined;
    const ref = compInfo?.filename ?? compId ?? "unknown";
    return `<!-- component-inline: ${ref} -->`;
  }

  if (node.type === "variableToken") {
    return `<!-- var: ${node.attrs?.key ?? "variable"} -->`;
  }

  if (node.type === "topicLink") {
    const topicId = node.attrs?.topicId as string | undefined;
    const info = topicId ? ctx?.topicLinks?.get(topicId) : undefined;
    if (info?.slug) {
      return `<!-- topic-link: ${info.slug}.md "${info.title}" -->`;
    }
    if (info) {
      return `<!-- topic-link: "${info.title}" -->`;
    }
    return `<!-- topic-link: "Topic Link" -->`;
  }

  if (node.type === "hardBreak") {
    return "  \n";
  }

  if (node.type !== "text" || !node.text) return "";

  let text = node.text;

  if (!node.marks || node.marks.length === 0) return text;

  const sortedMarks = [...node.marks].sort((a, b) => {
    if (a.type === "link") return 1;
    if (b.type === "link") return -1;
    return 0;
  });

  for (const mark of sortedMarks) {
    switch (mark.type) {
      case "bold":
        text = `**${text}**`;
        break;
      case "italic":
        text = `*${text}*`;
        break;
      case "strike":
        text = `~~${text}~~`;
        break;
      case "code":
        text = `\`${text}\``;
        break;
      case "link":
        text = `[${text}](${(mark.attrs?.href as string) ?? ""})`;
        break;
    }
  }

  return text;
}
