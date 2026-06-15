import type { JSONContent } from "@tiptap/core";

export interface ComponentSource {
  id: string;
  content_json: JSONContent;
}

export type ComponentFetcher = (
  ids: string[],
) => Promise<Map<string, ComponentSource>>;

const MAX_RESOLVE_DEPTH = 5;

export async function resolveComponents(
  doc: JSONContent,
  fetchComponents: ComponentFetcher,
  depth = 0,
  visited: Set<string> = new Set(),
): Promise<JSONContent> {
  if (depth >= MAX_RESOLVE_DEPTH) return doc;
  if (!doc.content) return doc;

  const refIds = extractRefIds(doc);
  if (refIds.length === 0) return doc;

  const components = await fetchComponents(refIds);

  const resolved = await resolveNode(doc, components, fetchComponents, depth, visited);
  return resolved;
}

function extractRefIds(node: JSONContent): string[] {
  const ids: string[] = [];
  function walk(n: JSONContent) {
    if (
      (n.type === "componentRef" || n.type === "inlineComponentRef") &&
      n.attrs?.componentId
    ) {
      ids.push(n.attrs.componentId as string);
    }
    if (n.content) n.content.forEach(walk);
  }
  walk(node);
  return [...new Set(ids)];
}

async function resolveNode(
  node: JSONContent,
  components: Map<string, ComponentSource>,
  fetchComponents: ComponentFetcher,
  depth: number,
  visited: Set<string>,
): Promise<JSONContent> {
  if (node.type === "inlineComponentRef") {
    const id = node.attrs?.componentId as string | undefined;
    if (!id) return { type: "text", text: "[invalid component]" };
    if (visited.has(id)) return { type: "text", text: "[circular reference]" };

    const comp = components.get(id);
    if (!comp) return { type: "text", text: "[missing component]" };

    const childVisited = new Set(visited);
    childVisited.add(id);
    const normalized = normalizeDocContent(comp.content_json);
    const resolved = await resolveComponents(
      normalized,
      fetchComponents,
      depth + 1,
      childVisited,
    );

    return extractInlineContent(resolved);
  }

  if (node.type === "componentRef") {
    const id = node.attrs?.componentId as string | undefined;
    if (!id) return missingPlaceholder("[invalid component reference]");
    if (visited.has(id)) return missingPlaceholder("[circular reference]");

    const comp = components.get(id);
    if (!comp) return missingPlaceholder("[missing component]");

    const childVisited = new Set(visited);
    childVisited.add(id);
    const normalized = normalizeDocContent(comp.content_json);
    const resolved = await resolveComponents(
      normalized,
      fetchComponents,
      depth + 1,
      childVisited,
    );
    return resolved;
  }

  if (!node.content) return node;

  const newContent: JSONContent[] = [];
  for (const child of node.content) {
    const resolved = await resolveNode(child, components, fetchComponents, depth, visited);
    if (resolved.type === "doc" && resolved.content) {
      newContent.push(...resolved.content);
    } else {
      newContent.push(resolved);
    }
  }

  return { ...node, content: newContent };
}

export function normalizeDocContent(doc: JSONContent): JSONContent {
  if (!doc.content || doc.type !== "doc") return doc;
  const INLINE_TYPES = new Set(["text", "hardBreak"]);
  let changed = false;
  const normalized: JSONContent[] = [];
  let pending: JSONContent[] = [];

  for (const node of doc.content) {
    if (INLINE_TYPES.has(node.type ?? "")) {
      pending.push(node);
      changed = true;
    } else {
      if (pending.length > 0) {
        normalized.push({ type: "paragraph", content: pending });
        pending = [];
      }
      normalized.push(node);
    }
  }
  if (pending.length > 0) {
    normalized.push({ type: "paragraph", content: pending });
  }
  return changed ? { ...doc, content: normalized } : doc;
}

function extractInlineContent(doc: JSONContent): JSONContent {
  const firstBlock = doc.content?.[0];
  if (!firstBlock?.content) return { type: "text", text: "[empty component]" };
  return { type: "doc", content: firstBlock.content };
}

function missingPlaceholder(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", marks: [{ type: "italic" }], text }],
  };
}
