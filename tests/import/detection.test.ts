import { describe, it, expect } from "vitest";
import {
  detectFormat,
  isOpenApiFile,
  isOpenApiContent,
} from "../../src/core/detect-format";

// --- Format Detection ---

describe("detectFormat", () => {
  it("detects Markdown files", () => {
    expect(detectFormat("readme.md")).toBe("markdown");
    expect(detectFormat("doc.markdown")).toBe("markdown");
  });

  it("is case-insensitive", () => {
    expect(detectFormat("GUIDE.MD")).toBe("markdown");
    expect(detectFormat("PAGE.HTML")).toBe("html");
  });

  it("detects HTML files", () => {
    expect(detectFormat("page.html")).toBe("html");
    expect(detectFormat("page.htm")).toBe("html");
  });

  it("detects DITA/XML files", () => {
    expect(detectFormat("topic.dita")).toBe("dita");
    expect(detectFormat("map.ditamap")).toBe("dita");
    expect(detectFormat("config.xml")).toBe("dita");
  });

  it("returns null for unsupported formats", () => {
    expect(detectFormat("image.png")).toBeNull();
    expect(detectFormat("document.pdf")).toBeNull();
    expect(detectFormat("archive.zip")).toBeNull();
    expect(detectFormat("spreadsheet.xlsx")).toBeNull();
  });

  it("returns null for OpenAPI files (handled separately)", () => {
    expect(detectFormat("api.json")).toBeNull();
    expect(detectFormat("spec.yaml")).toBeNull();
    expect(detectFormat("openapi.yml")).toBeNull();
  });

  it("handles files with multiple dots", () => {
    expect(detectFormat("my.project.readme.md")).toBe("markdown");
    expect(detectFormat("version.2.1.html")).toBe("html");
  });

  it("handles files with no extension", () => {
    expect(detectFormat("Makefile")).toBeNull();
    expect(detectFormat("README")).toBeNull();
  });
});

// --- OpenAPI File Detection ---

describe("isOpenApiFile", () => {
  it("detects JSON files", () => {
    expect(isOpenApiFile("petstore.json")).toBe(true);
    expect(isOpenApiFile("api.JSON")).toBe(true);
  });

  it("detects YAML files", () => {
    expect(isOpenApiFile("spec.yaml")).toBe(true);
    expect(isOpenApiFile("spec.yml")).toBe(true);
    expect(isOpenApiFile("API.YAML")).toBe(true);
  });

  it("rejects non-API files", () => {
    expect(isOpenApiFile("readme.md")).toBe(false);
    expect(isOpenApiFile("page.html")).toBe(false);
    expect(isOpenApiFile("data.csv")).toBe(false);
  });
});

// --- OpenAPI Content Detection ---

describe("isOpenApiContent", () => {
  it("detects OpenAPI 3.x JSON content", () => {
    expect(
      isOpenApiContent('{ "openapi": "3.0.0", "info": {} }'),
    ).toBe(true);
  });

  it("detects OpenAPI 3.x YAML content", () => {
    expect(isOpenApiContent("openapi: 3.0.0\ninfo:\n  title: API")).toBe(true);
  });

  it("detects Swagger 2.0 JSON content", () => {
    expect(
      isOpenApiContent('{ "swagger": "2.0", "info": {} }'),
    ).toBe(true);
  });

  it("detects Swagger 2.0 YAML content", () => {
    expect(isOpenApiContent('swagger: "2.0"')).toBe(true);
  });

  it("rejects non-OpenAPI JSON", () => {
    expect(
      isOpenApiContent('{ "name": "package", "version": "1.0.0" }'),
    ).toBe(false);
  });

  it("rejects non-OpenAPI YAML", () => {
    expect(isOpenApiContent("name: config\nvalues:\n  key: val")).toBe(false);
  });

  it("rejects empty content", () => {
    expect(isOpenApiContent("")).toBe(false);
    expect(isOpenApiContent("   ")).toBe(false);
  });

  it("handles content with leading whitespace", () => {
    expect(isOpenApiContent('  \n  { "openapi": "3.1.0" }')).toBe(true);
  });
});
