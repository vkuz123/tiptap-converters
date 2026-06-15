import type { JSONContent } from "@tiptap/core";

export type VariableMap = Record<string, string>;

export function replaceVariables(
  doc: JSONContent,
  variables: VariableMap,
): JSONContent {
  if (!doc.content) return doc;
  return { ...doc, content: replaceNodes(doc.content, variables) };
}

function replaceNodes(
  nodes: JSONContent[],
  variables: VariableMap,
): JSONContent[] {
  const result: JSONContent[] = [];

  for (const node of nodes) {
    if (node.type === "variableToken") {
      const key = node.attrs?.key as string | undefined;
      if (!key) continue;
      const value = variables[key] ?? `[${key}]`;
      const replacement: JSONContent = { type: "text", text: value };
      if (node.marks && node.marks.length > 0) {
        replacement.marks = node.marks;
      }
      result.push(replacement);
    } else if (node.content) {
      result.push({ ...node, content: replaceNodes(node.content, variables) });
    } else {
      result.push(node);
    }
  }

  return result;
}
