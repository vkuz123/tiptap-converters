import type { JSONContent } from "@tiptap/core";

export type ConditionProfile = Record<string, string[]>;

export function filterConditions(
  doc: JSONContent,
  profile: ConditionProfile,
): JSONContent {
  if (!doc.content) return doc;
  return { ...doc, content: filterNodes(doc.content, profile) };
}

function filterNodes(
  nodes: JSONContent[],
  profile: ConditionProfile,
): JSONContent[] {
  const result: JSONContent[] = [];

  for (const node of nodes) {
    if (node.type === "conditionalBlock") {
      const shouldKeep = evaluateCondition(node, profile);
      if (shouldKeep) {
        const children = node.content
          ? filterNodes(node.content, profile)
          : [];
        result.push(...children);
      }
    } else {
      const processed = node.content
        ? { ...node, content: filterNodes(node.content, profile) }
        : node;
      result.push(processed);
    }
  }

  return result;
}

function evaluateCondition(
  node: JSONContent,
  profile: ConditionProfile,
): boolean {
  const dimensionId = node.attrs?.dimensionId as string | undefined;
  const valueIds = node.attrs?.valueIds as string[] | undefined;
  const logic = (node.attrs?.logic as string) || "include";

  if (!dimensionId || !valueIds || valueIds.length === 0) return true;

  const activeValues = profile[dimensionId];

  // Absent key = dimension not filtered — keep everything.
  if (!activeValues) return true;

  // Present-but-empty = the profile explicitly excludes every value of
  // this dimension (e.g. NOT over all values) — matches nothing, so
  // include-blocks are hidden and exclude-blocks are kept.
  if (activeValues.length === 0) return logic !== "include";

  const hasOverlap = valueIds.some((id) => activeValues.includes(id));

  return logic === "include" ? hasOverlap : !hasOverlap;
}
