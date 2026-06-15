# tiptap-converters

Bidirectional content converters for [TipTap](https://tiptap.dev). Import from 7 formats, export to 3, and run a full structured authoring pipeline — all as pure functions with zero framework coupling.

## Format Support

| Format | Import | Export | Key dependency |
|--------|--------|--------|----------------|
| **Markdown** | `markdownToTipTap()` | `renderToMarkdown()` | `marked` |
| **HTML** | `htmlToTipTap()` | `renderToHTML()` | `cheerio` / `@tiptap/html` |
| **DITA XML** | `ditaToTipTap()` | `renderToDita()` | `fast-xml-parser` |
| **Confluence** | `confluenceToTipTap()` | — | `cheerio` |
| **Word (.docx)** | `wordToTipTap()` | — | `mammoth` |
| **MadCap Flare** | `parseFlareProject()` | — | `fast-xml-parser` |
| **OpenAPI 3.x** | `openapiToTopics()` | — | `@apidevtools/swagger-parser` |

## Install

```bash
npm install tiptap-converters
```

Format-specific dependencies are **optional peer deps** — install only what you need:

```bash
# Markdown support
npm install marked

# HTML import
npm install cheerio

# HTML export (server-side rendering)
npm install @tiptap/html @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-image @tiptap/extension-link @tiptap/extension-code-block-lowlight lowlight

# DITA support
npm install fast-xml-parser

# Word import
npm install mammoth cheerio

# OpenAPI import
npm install @apidevtools/swagger-parser js-yaml openapi-types
```

## Quick Start

### Import Markdown

```ts
import { markdownToTipTap } from "tiptap-converters/import/markdown";

const { title, doc } = markdownToTipTap("# Hello\n\nWorld");
// doc is a TipTap-compatible ProseMirror JSON document
```

### Export to Markdown

```ts
import { renderToMarkdown } from "tiptap-converters/export/markdown";

const markdown = renderToMarkdown(doc);
```

### Import DITA

```ts
import { ditaToTipTap, parseDitaMap } from "tiptap-converters/import/dita";

const { title, doc, topicType } = ditaToTipTap(xmlString);
const { title: mapTitle, items } = parseDitaMap(mapXml);
```

### Export to DITA

```ts
import { renderToDita, renderDitaMap } from "tiptap-converters/export/dita";

const xml = renderToDita({
  id: "my-topic",
  title: "Getting Started",
  topicType: "concept",
  doc,
});
```

### Import HTML

```ts
import { htmlToTipTap } from "tiptap-converters/import/html";

const { title, doc } = htmlToTipTap("<h1>Hello</h1><p>World</p>");
```

### Import Word

```ts
import { wordToTipTap } from "tiptap-converters/import/word";

const { title, doc } = await wordToTipTap(arrayBuffer);
```

### Import Confluence

```ts
import { confluenceToTipTap } from "tiptap-converters/import/confluence";

const { title, doc } = confluenceToTipTap(confluenceHtml);
```

### Import MadCap Flare

```ts
import { parseFlareProject } from "tiptap-converters/import/flare";

const files = new Map<string, string>();
files.set("Content/Topic.htm", htmlContent);
files.set("Content/Snippets/note.flsnp", snippetContent);

const { topics, components, variableSets, conditions, toc } = parseFlareProject(files);
```

### Import OpenAPI

```ts
import { openapiToTopics } from "tiptap-converters/import/openapi";

const { overview, topics } = await openapiToTopics(specString, "json");
```

## Structured Authoring Pipeline

The pipeline resolves structured authoring constructs in a TipTap document through 4 stages:

1. **Resolve** — replace component references with actual content
2. **Filter** — evaluate conditional blocks against a profile
3. **Variables** — substitute variable tokens with values
4. **Render** — convert to HTML

```ts
import { publishTopic } from "tiptap-converters/pipeline";
import type { ComponentFetcher } from "tiptap-converters/pipeline";

const fetchComponents: ComponentFetcher = async (ids) => {
  // Fetch component content from your database
  const components = await db.query("...", ids);
  return new Map(components.map(c => [c.id, c]));
};

const { html, resolved } = await publishTopic({
  doc,
  fetchComponents,
  conditionProfile: { audience: ["developer"] },
  variables: { productName: "Acme", version: "2.0" },
});
```

Or use individual stages:

```ts
import {
  resolveComponents,
  filterConditions,
  replaceVariables,
} from "tiptap-converters/pipeline";

const resolved = await resolveComponents(doc, fetchComponents);
const filtered = filterConditions(resolved, { audience: ["admin"] });
const final = replaceVariables(filtered, { product: "Acme" });
```

## Core Utilities

```ts
import {
  extractComponentIds,
  extractVariableKeys,
  extractTopicLinkIds,
  detectFormat,
  isOpenApiFile,
  isOpenApiContent,
} from "tiptap-converters/core";

// Extract references from TipTap content
const componentIds = extractComponentIds(doc);
const variableKeys = extractVariableKeys(doc);
const linkedTopicIds = extractTopicLinkIds(doc);

// Detect format from filename
const format = detectFormat("guide.md"); // "markdown"
const isApi = isOpenApiFile("spec.yaml"); // true
```

## Tree-Shaking

Each format is a separate entry point. Importing `tiptap-converters/import/markdown` won't pull in `mammoth`, `cheerio`, or any other format's dependencies.

```ts
// Only pulls in `marked` — not cheerio, mammoth, etc.
import { markdownToTipTap } from "tiptap-converters/import/markdown";
```

## Server-Safe Extensions

The package includes server-safe TipTap extension schemas for custom nodes used by the structured authoring system:

```ts
import {
  ComponentRefSchema,
  InlineComponentRefSchema,
  ConditionalBlockSchema,
  VariableTokenSchema,
  TopicLinkSchema,
  CalloutSchema,
  CodeGroupSchema,
} from "tiptap-converters";
```

These are schema-only (no `ReactNodeViewRenderer`) and safe for server-side HTML generation.

## Types

```ts
import type {
  TipTapNode,
  TipTapDoc,
  ParseResult,
  TopicType,
  ImportFormat,
} from "tiptap-converters/core";
```

## License

MIT
