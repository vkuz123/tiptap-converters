export type ImportFormat = "markdown" | "html" | "dita" | "confluence";

export function detectFormat(filename: string): ImportFormat | null {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".dita") || lower.endsWith(".ditamap")) return "dita";
  if (lower.endsWith(".xml")) return "dita";

  return null;
}

export function isOpenApiFile(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ["json", "yaml", "yml"].includes(ext ?? "");
}

export function isOpenApiContent(text: string): boolean {
  return (
    text.includes('"openapi"') ||
    text.includes("openapi:") ||
    text.includes('"swagger"') ||
    text.includes("swagger:")
  );
}
