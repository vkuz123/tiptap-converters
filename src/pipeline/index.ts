import type { JSONContent } from "@tiptap/core";
import { resolveComponents, type ComponentFetcher } from "./resolve";
import { filterConditions, type ConditionProfile } from "./filter";
import { replaceVariables, type VariableMap } from "./variables";
import { renderToHTML } from "../export/html";
import { canonicalToTiptap, tiptapToCanonical, type CanonicalDoc } from "../canonical";

export { resolveComponents, normalizeDocContent } from "./resolve";
export type { ComponentFetcher, ComponentSource } from "./resolve";
export { filterConditions } from "./filter";
export type { ConditionProfile } from "./filter";
export { replaceVariables } from "./variables";
export type { VariableMap } from "./variables";

export interface PublishOptions {
  doc: JSONContent;
  fetchComponents: ComponentFetcher;
  conditionProfile: ConditionProfile;
  variables: VariableMap;
  postResolve?: (doc: JSONContent) => JSONContent;
}

export interface PublishResult {
  html: string;
  resolved: JSONContent;
}

export async function publishTopic(
  options: PublishOptions,
): Promise<PublishResult> {
  const { doc, fetchComponents, conditionProfile, variables, postResolve } = options;

  let resolved = await resolveComponents(doc, fetchComponents);
  if (postResolve) resolved = postResolve(resolved);
  const filtered = filterConditions(resolved, conditionProfile);
  const replaced = replaceVariables(filtered, variables);
  const html = renderToHTML(replaced);

  return { html, resolved: replaced };
}

// --- Canonical resolver ---

export interface ResolveCanonicalOptions {
  fetchComponents: ComponentFetcher;
  conditionProfile: ConditionProfile;
  variables: VariableMap;
  postResolve?: (doc: JSONContent) => JSONContent;
}

/**
 * Run the publish-time resolution pipeline over a canonical document:
 * component (conref) resolution → condition filtering → variable (keyref)
 * replacement. Returns a fully-resolved `CanonicalDoc`, ready to serialize via
 * `canonicalToHdita` or `renderToHTML`. The canonical-model equivalent of
 * `publishTopic`, minus rendering; `schemaVersion` is preserved.
 *
 * Note: build-time DITA keyspace/keyscope resolution (key→target with scopes)
 * is not modeled here — `keyref` maps to the variable mechanism, and full
 * keyspace handling remains an import-side concern.
 */
export async function resolveCanonical(
  doc: CanonicalDoc,
  options: ResolveCanonicalOptions,
): Promise<CanonicalDoc> {
  const tiptap = canonicalToTiptap(doc);
  let resolved = await resolveComponents(tiptap, options.fetchComponents);
  if (options.postResolve) resolved = options.postResolve(resolved);
  const filtered = filterConditions(resolved, options.conditionProfile);
  const replaced = replaceVariables(filtered, options.variables);
  return tiptapToCanonical(replaced, doc.schemaVersion);
}
