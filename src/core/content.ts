export function extractComponentIds(
  content: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  walk(content, (node) => {
    if (
      (node.type === "componentRef" || node.type === "inlineComponentRef") &&
      typeof node.attrs?.componentId === "string"
    ) {
      ids.add(node.attrs.componentId);
    }
  });
  return Array.from(ids);
}

export function extractVariableKeys(
  content: Record<string, unknown>,
): string[] {
  const keys = new Set<string>();
  walk(content, (node) => {
    if (
      node.type === "variableToken" &&
      typeof node.attrs?.key === "string"
    ) {
      keys.add(node.attrs.key);
    }
  });
  return Array.from(keys);
}

export function extractTopicLinkIds(
  content: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  walk(content, (node) => {
    if (
      node.type === "topicLink" &&
      typeof node.attrs?.topicId === "string"
    ) {
      ids.add(node.attrs.topicId);
    }
  });
  return Array.from(ids);
}

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

function walk(
  node: Record<string, unknown>,
  visitor: (node: JsonNode) => void,
) {
  visitor(node as JsonNode);
  const content = (node as JsonNode).content;
  if (Array.isArray(content)) {
    for (const child of content) {
      walk(child as Record<string, unknown>, visitor);
    }
  }
}
