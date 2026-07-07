import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { openapiToTopics, schemaToExample } from "../../src/import/openapi";

const petstore = readFileSync(
  join(__dirname, "../fixtures/petstore.json"),
  "utf-8",
);

describe("openapiToTopics", () => {
  it("produces an overview topic with API title", async () => {
    const result = await openapiToTopics(petstore, "json");
    expect(result.overview.title).toBe("Petstore — Overview");
    const headings = result.overview.doc.content.filter(
      (n) => n.type === "heading",
    );
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("groups operations by tag into separate topics", async () => {
    const result = await openapiToTopics(petstore, "json");
    const tags = result.topics.map((t) => t.tag);
    expect(tags).toContain("Pets");
    expect(tags).toContain("Store");
  });

  it("generates correct number of topics", async () => {
    const result = await openapiToTopics(petstore, "json");
    expect(result.topics).toHaveLength(2);
  });

  it("includes endpoint headings in tag topics", async () => {
    const result = await openapiToTopics(petstore, "json");
    const petsTopic = result.topics.find((t) => t.tag === "Pets")!;
    const h2s = petsTopic.doc.content.filter(
      (n) => n.type === "heading" && n.attrs?.level === 2,
    );
    expect(h2s).toHaveLength(4);
  });

  it("includes parameter tables", async () => {
    const result = await openapiToTopics(petstore, "json");
    const petsTopic = result.topics.find((t) => t.tag === "Pets")!;
    const tables = petsTopic.doc.content.filter((n) => n.type === "table");
    expect(tables.length).toBeGreaterThan(0);
  });

  it("includes code examples for endpoints", async () => {
    const result = await openapiToTopics(petstore, "json");
    const petsTopic = result.topics.find((t) => t.tag === "Pets")!;
    const codeGroups = petsTopic.doc.content.filter(
      (n) => n.type === "codeGroup",
    );
    expect(codeGroups.length).toBeGreaterThan(0);
  });

  it("includes auth schemes in overview", async () => {
    const result = await openapiToTopics(petstore, "json");
    const authHeading = result.overview.doc.content.find(
      (n) =>
        n.type === "heading" &&
        n.content?.[0]?.text === "Authentication",
    );
    expect(authHeading).toBeDefined();
  });
});

describe("schemaToExample", () => {
  it("generates string example", () => {
    expect(schemaToExample({ type: "string" })).toBe("string");
  });

  it("generates email format example", () => {
    expect(schemaToExample({ type: "string", format: "email" })).toBe(
      "user@example.com",
    );
  });

  it("generates number example", () => {
    expect(schemaToExample({ type: "number" })).toBe(0);
  });

  it("uses enum first value", () => {
    expect(
      schemaToExample({ type: "string", enum: ["active", "inactive"] }),
    ).toBe("active");
  });

  it("generates object with properties", () => {
    const result = schemaToExample({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
    });
    expect(result).toEqual({ name: "string", age: 0 });
  });

  it("generates array with item example", () => {
    const result = schemaToExample({
      type: "array",
      items: { type: "string" },
    });
    expect(result).toEqual(["string"]);
  });

  it("uses explicit example when provided", () => {
    expect(schemaToExample({ type: "string", example: "foobar" })).toBe(
      "foobar",
    );
  });

  it("respects depth limit", () => {
    const recursive: Record<string, unknown> = {
      type: "object",
      properties: {},
    };
    recursive.properties = { child: recursive };
    expect(schemaToExample(recursive as never, 6)).toBeNull();
  });
});
