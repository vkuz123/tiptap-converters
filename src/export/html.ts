import { generateHTML } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import {
  ComponentRefSchema,
  InlineComponentRefSchema,
  ConditionalBlockSchema,
  VariableTokenSchema,
  TopicLinkSchema,
  CalloutSchema,
  CodeGroupSchema,
} from "./extensions";
import type { JSONContent } from "@tiptap/core";
import { sanitizeHtml } from "./sanitize";

const lowlight = createLowlight(common);

const extensions = [
  StarterKit.configure({ codeBlock: false }),
  Table,
  TableRow,
  TableCell,
  TableHeader,
  Image,
  Link.configure({ openOnClick: false }),
  CodeBlockLowlight.configure({ lowlight }),
  ComponentRefSchema,
  InlineComponentRefSchema,
  ConditionalBlockSchema,
  VariableTokenSchema,
  TopicLinkSchema,
  CalloutSchema,
  CodeGroupSchema,
];

export function renderToHTML(doc: JSONContent): string {
  return sanitizeHtml(generateHTML(doc, extensions));
}

export interface HeadingEntry {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(doc: JSONContent): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const idCounts = new Map<string, number>();
  function walk(node: JSONContent) {
    if (node.type === "heading" && node.attrs?.level && node.content) {
      const text = node.content
        .filter((n) => n.type === "text")
        .map((n) => n.text ?? "")
        .join("");
      const baseId = slugify(text);
      const count = idCounts.get(baseId) ?? 0;
      idCounts.set(baseId, count + 1);
      const id = count > 0 ? `${baseId}-${count}` : baseId;
      headings.push({ id, text, level: node.attrs.level as number });
    }
    if (node.content) node.content.forEach(walk);
  }
  walk(doc);
  return headings;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
