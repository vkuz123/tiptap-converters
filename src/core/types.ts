export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}

export interface ParseResult {
  title: string;
  doc: TipTapDoc;
}

export type TopicType = "concept" | "task" | "reference" | "glossary" | "custom";
