import SwaggerParser from "@apidevtools/swagger-parser";
import yaml from "js-yaml";
import type { OpenAPI, OpenAPIV3 } from "openapi-types";
import type { TipTapNode, TipTapDoc } from "../core/types";

export interface OpenAPIImportResult {
  overview: { title: string; doc: TipTapDoc };
  topics: Array<{ title: string; doc: TipTapDoc; tag: string }>;
}

export async function openapiToTopics(
  specString: string,
  format: "json" | "yaml",
): Promise<OpenAPIImportResult> {
  const rawSpec =
    format === "yaml" ? yaml.load(specString) : JSON.parse(specString);
  const api = (await SwaggerParser.dereference(
    rawSpec as OpenAPI.Document,
  )) as OpenAPIV3.Document;

  const baseUrl = api.servers?.[0]?.url ?? "https://api.example.com";

  const tagGroups = new Map<
    string,
    Array<{ method: string; path: string; op: OpenAPIV3.OperationObject }>
  >();

  for (const [path, pathItem] of Object.entries(api.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
    ] as const) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!op) continue;
      const tag = op.tags?.[0] ?? deriveTagFromPath(path);
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push({ method: method.toUpperCase(), path, op });
    }
  }

  const overview = buildOverviewDoc(api, baseUrl);

  const topics: OpenAPIImportResult["topics"] = [];
  for (const [tag, operations] of tagGroups) {
    const doc = buildTagDoc(tag, operations, baseUrl);
    topics.push({ title: tag, doc, tag });
  }

  return { overview, topics };
}

function buildOverviewDoc(
  api: OpenAPIV3.Document,
  baseUrl: string,
): { title: string; doc: TipTapDoc } {
  const content: TipTapNode[] = [];

  content.push(heading(1, `${api.info.title} API`));
  if (api.info.description) {
    content.push(paragraph(text(api.info.description)));
  }

  content.push(heading(2, "Base URL"));
  content.push(codeBlock("bash", baseUrl));

  content.push(heading(2, "Version"));
  content.push(paragraph(text(api.info.version)));

  if (api.info.contact?.email) {
    content.push(heading(2, "Contact"));
    content.push(paragraph(text(api.info.contact.email)));
  }

  const securitySchemes = (api.components?.securitySchemes ?? {}) as Record<
    string,
    OpenAPIV3.SecuritySchemeObject
  >;
  if (Object.keys(securitySchemes).length > 0) {
    content.push(heading(2, "Authentication"));
    for (const [name, scheme] of Object.entries(securitySchemes)) {
      content.push(heading(3, name));
      content.push(paragraph(text(`Type: ${scheme.type}`)));
      if ("scheme" in scheme && scheme.scheme) {
        content.push(paragraph(text(`Scheme: ${scheme.scheme}`)));
      }
      if (scheme.description) {
        content.push(paragraph(text(scheme.description)));
      }
    }
  }

  return {
    title: `${api.info.title} — Overview`,
    doc: { type: "doc", content },
  };
}

function buildTagDoc(
  tag: string,
  operations: Array<{
    method: string;
    path: string;
    op: OpenAPIV3.OperationObject;
  }>,
  baseUrl: string,
): TipTapDoc {
  const content: TipTapNode[] = [];

  content.push(heading(1, tag));

  for (const { method, path, op } of operations) {
    const summary = op.summary ? ` — ${op.summary}` : "";
    content.push(heading(2, `${method} ${path}${summary}`));

    if (op.description) {
      content.push(paragraph(text(op.description)));
    }

    const params = (op.parameters ?? []) as OpenAPIV3.ParameterObject[];
    if (params.length > 0) {
      content.push(heading(3, "Parameters"));
      content.push(buildParamTable(params));
    }

    const reqBody = op.requestBody as
      | OpenAPIV3.RequestBodyObject
      | undefined;
    if (reqBody) {
      content.push(heading(3, "Request Body"));
      if (reqBody.description) {
        content.push(paragraph(text(reqBody.description)));
      }
      const jsonContent = reqBody.content?.["application/json"];
      if (jsonContent?.schema) {
        const example = schemaToExample(
          jsonContent.schema as OpenAPIV3.SchemaObject,
        );
        content.push(codeBlock("json", JSON.stringify(example, null, 2)));
      }
    }

    if (op.responses) {
      content.push(heading(3, "Responses"));
      for (const [code, response] of Object.entries(op.responses)) {
        const resp = response as OpenAPIV3.ResponseObject;
        content.push(
          paragraph(
            bold(`${code}`),
            text(` — ${resp.description ?? ""}`),
          ),
        );
        const jsonResp = resp.content?.["application/json"];
        if (jsonResp?.schema) {
          const example = schemaToExample(
            jsonResp.schema as OpenAPIV3.SchemaObject,
          );
          content.push(codeBlock("json", JSON.stringify(example, null, 2)));
        }
      }
    }

    content.push(heading(3, "Examples"));
    const curlExample = buildCurlExample(method, path, baseUrl, reqBody);
    const fetchExample = buildFetchExample(method, path, baseUrl, reqBody);
    content.push({
      type: "codeGroup",
      content: [
        { type: "codeBlock", attrs: { language: "bash" }, content: [text(curlExample)] },
        { type: "codeBlock", attrs: { language: "javascript" }, content: [text(fetchExample)] },
      ],
    });
  }

  return { type: "doc", content };
}

function heading(level: number, textContent: string): TipTapNode {
  return {
    type: "heading",
    attrs: { level },
    content: [text(textContent)],
  };
}

function paragraph(...nodes: TipTapNode[]): TipTapNode {
  return { type: "paragraph", content: nodes };
}

function text(content: string): TipTapNode {
  return { type: "text", text: content || " " };
}

function bold(...content: string[]): TipTapNode {
  return {
    type: "text",
    text: content.join(""),
    marks: [{ type: "bold" }],
  };
}

function codeBlock(language: string, content: string): TipTapNode {
  return {
    type: "codeBlock",
    attrs: { language },
    content: [text(content)],
  };
}

function buildParamTable(
  params: OpenAPIV3.ParameterObject[],
): TipTapNode {
  const headerRow: TipTapNode = {
    type: "tableRow",
    content: ["Name", "In", "Type", "Required", "Description"].map((h) => ({
      type: "tableHeader",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [paragraph(bold(h))],
    })),
  };

  const rows = params.map((p) => ({
    type: "tableRow" as const,
    content: [
      p.name,
      p.in,
      (p.schema as OpenAPIV3.SchemaObject)?.type ?? "string",
      p.required ? "Yes" : "No",
      p.description ?? "",
    ].map((cell) => ({
      type: "tableCell" as const,
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [paragraph(text(cell))],
    })),
  }));

  return { type: "table", content: [headerRow, ...rows] };
}

function buildCurlExample(
  method: string,
  path: string,
  baseUrl: string,
  reqBody?: OpenAPIV3.RequestBodyObject,
): string {
  let cmd = `curl -X ${method} "${baseUrl}${path}"`;
  cmd += ` \\\n  -H "Content-Type: application/json"`;
  if (reqBody) {
    const jsonContent = reqBody.content?.["application/json"];
    if (jsonContent?.schema) {
      const example = schemaToExample(
        jsonContent.schema as OpenAPIV3.SchemaObject,
      );
      cmd += ` \\\n  -d '${JSON.stringify(example)}'`;
    }
  }
  return cmd;
}

function buildFetchExample(
  method: string,
  path: string,
  baseUrl: string,
  reqBody?: OpenAPIV3.RequestBodyObject,
): string {
  let code = `const response = await fetch("${baseUrl}${path}", {\n`;
  code += `  method: "${method}",\n`;
  code += `  headers: { "Content-Type": "application/json" },\n`;
  if (reqBody) {
    const jsonContent = reqBody.content?.["application/json"];
    if (jsonContent?.schema) {
      const example = schemaToExample(
        jsonContent.schema as OpenAPIV3.SchemaObject,
      );
      code += `  body: JSON.stringify(${JSON.stringify(example, null, 4).replace(/\n/g, "\n  ")}),\n`;
    }
  }
  code += `});\n\nconst data = await response.json();`;
  return code;
}

export function schemaToExample(
  schema: OpenAPIV3.SchemaObject,
  depth = 0,
): unknown {
  if (depth > 5) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  if (schema.enum) return schema.enum[0];

  if (schema.allOf) {
    const merged: Record<string, unknown> = {};
    for (const sub of schema.allOf as OpenAPIV3.SchemaObject[]) {
      const example = schemaToExample(sub, depth + 1);
      if (example && typeof example === "object" && !Array.isArray(example)) {
        Object.assign(merged, example);
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf) as OpenAPIV3.SchemaObject[];
    if (variants.length > 0) return schemaToExample(variants[0], depth + 1);
  }

  switch (schema.type) {
    case "string":
      if (schema.format === "date-time") return "2024-01-01T00:00:00Z";
      if (schema.format === "date") return "2024-01-01";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri") return "https://example.com";
      if (schema.format === "uuid")
        return "550e8400-e29b-41d4-a716-446655440000";
      return "string";
    case "number":
    case "integer":
      return schema.minimum ?? 0;
    case "boolean":
      return true;
    case "array": {
      const itemSchema = schema.items as OpenAPIV3.SchemaObject | undefined;
      if (!itemSchema) return [];
      return [schemaToExample(itemSchema, depth + 1)];
    }
    case "object": {
      const result: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(
        schema.properties ?? {},
      )) {
        result[key] = schemaToExample(
          propSchema as OpenAPIV3.SchemaObject,
          depth + 1,
        );
      }
      return result;
    }
    default:
      if (schema.properties) {
        const result: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          result[key] = schemaToExample(
            propSchema as OpenAPIV3.SchemaObject,
            depth + 1,
          );
        }
        return result;
      }
      return null;
  }
}

function deriveTagFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const first = parts[0] ?? "default";
  return first.charAt(0).toUpperCase() + first.slice(1);
}
