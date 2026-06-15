export function sanitizeHtml(html: string): string {
  return html
    .replace(
      /(<[^>]*\s)(href|src|action)\s*=\s*["']?\s*(javascript|vbscript|data(?!:image\/))[^"'>]*/gi,
      '$1$2=""',
    )
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
}
