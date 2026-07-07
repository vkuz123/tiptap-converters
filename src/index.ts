// Core
export type {
  TipTapNode,
  TipTapDoc,
  ParseResult,
  TopicType,
} from "./core/types";
export {
  extractComponentIds,
  extractVariableKeys,
  extractTopicLinkIds,
} from "./core/content";
export {
  detectFormat,
  isOpenApiFile,
  isOpenApiContent,
} from "./core/detect-format";
export type { ImportFormat } from "./core/detect-format";

// Import converters
export { markdownToTipTap, extractTitleFromMarkdown } from "./import/markdown";
export { htmlToTipTap } from "./import/html";
export { ditaToTipTap, parseDitaMap, parseKeydefs, parseDitaval, parseDitaTopics, parseSubjectScheme } from "./import/dita";
export type {
  DitaMapResult,
  DitaImportOptions,
  DitaMetadata,
  DitaParseResult,
  DitavalRule,
  DitavalResult,
  DitaReltable,
  SubjectSchemeNode,
  SubjectSchemeResult,
} from "./import/dita";
export { confluenceToTipTap } from "./import/confluence";
export { wordToTipTap } from "./import/word";
export type { WordResult } from "./import/word";
export { parseFlareProject, rewriteComponentPaths } from "./import/flare";
export type {
  FlareProjectResult,
  FlareVariable,
  FlareVariableSet,
  FlareCondition,
  FlareTocItem,
} from "./import/flare";
export { openapiToTopics, schemaToExample } from "./import/openapi";
export type { OpenAPIImportResult } from "./import/openapi";
export { parsePaligoExport } from "./import/paligo";
export type { PaligoExportResult, PaligoTopic, PaligoComponent } from "./import/paligo";

// Export converters
export { renderToMarkdown } from "./export/markdown";
export type { TopicLinkInfo, MarkdownContext } from "./export/markdown";
export { renderToDita, renderDitaMap, renderBookmap, renderReltable } from "./export/dita";
export type {
  DitaTopicOptions,
  DitaMapEntry,
  DitaContext,
  DitaTopicLinkInfo,
  DitaComponentInfo,
  DitaExportMetadata,
  DitaReltableExport,
} from "./export/dita";
export { renderToHTML, extractHeadings } from "./export/html";
export type { HeadingEntry } from "./export/html";
export { sanitizeHtml } from "./export/sanitize";
export {
  ComponentRefSchema,
  InlineComponentRefSchema,
  TopicLinkSchema,
  ConditionalBlockSchema,
  VariableTokenSchema,
  CalloutSchema,
  CodeGroupSchema,
  DefinitionListSchema,
  DefinitionItemSchema,
  DefinitionTermSchema,
  DefinitionDescriptionSchema,
} from "./export/extensions";

// Canonical model + HDITA
// The owned, versioned content model and its HTML5 + data-* serialization.
// TipTap JSON and HDITA are both serializations of the canonical model.
export {
  tiptapToCanonical,
  canonicalToTiptap,
  collectUnknownTypes,
  validateCanonical,
  applyMigrations,
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_NODE_TYPES,
  CANONICAL_MARK_TYPES,
} from "./canonical";
export type {
  CanonicalDoc,
  CanonicalNode,
  CanonicalFinding,
  CanonicalFindingSeverity,
  CanonicalMigration,
} from "./canonical";
export { canonicalToHdita, hditaToCanonical } from "./hdita";
export type { HditaContext } from "./hdita";

// Pipeline
export {
  resolveComponents,
  normalizeDocContent,
} from "./pipeline/resolve";
export type { ComponentFetcher, ComponentSource } from "./pipeline/resolve";
export { filterConditions } from "./pipeline/filter";
export type { ConditionProfile } from "./pipeline/filter";
export { replaceVariables } from "./pipeline/variables";
export type { VariableMap } from "./pipeline/variables";
export { publishTopic, resolveCanonical } from "./pipeline/index";
export type { PublishOptions, PublishResult, ResolveCanonicalOptions } from "./pipeline/index";
