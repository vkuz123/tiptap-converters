import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../../src/export/sanitize";

describe("sanitizeHtml", () => {
  // --- javascript: URI stripping ---

  it("strips javascript: URI from href", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("strips javascript: URI with whitespace padding", () => {
    const html = '<a href="  javascript:alert(1)">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("strips javascript: URI case-insensitively", () => {
    const html = '<a href="JavaScript:alert(1)">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("JavaScript:");
    expect(result).not.toContain("javascript:");
  });

  it("strips vbscript: URI from href", () => {
    const html = '<a href="vbscript:MsgBox(1)">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("vbscript:");
  });

  it("strips javascript: URI from src attribute", () => {
    const html = '<img src="javascript:alert(1)" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("strips data:text/html URI from src", () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("data:text/html");
  });

  it("preserves data:image URIs (legitimate inline images)", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=" />';
    const result = sanitizeHtml(html);
    expect(result).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("preserves legitimate https: hrefs", () => {
    const html = '<a href="https://example.com">link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="https://example.com"');
  });

  it("preserves relative hrefs", () => {
    const html = '<a href="/docs/getting-started">link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="/docs/getting-started"');
  });

  it("preserves fragment hrefs", () => {
    const html = '<a href="#section-1">link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="#section-1"');
  });

  // --- Event handler stripping ---

  it("strips onerror attribute", () => {
    const html = '<img src="x.png" onerror="alert(1)" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
    expect(result).toContain("src=");
  });

  it("strips onclick attribute", () => {
    const html = '<div onclick="alert(1)">text</div>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("strips onload attribute", () => {
    const html = '<body onload="alert(1)"><p>hi</p></body>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onload");
  });

  it("strips onmouseover attribute", () => {
    const html = '<span onmouseover="alert(1)">hover</span>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onmouseover");
  });

  it("strips event handlers with single quotes", () => {
    const html = "<img onerror='alert(1)' src='x' />";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
  });

  it("strips event handlers without quotes", () => {
    const html = "<img onerror=alert(1) src=x />";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
  });

  it("strips ONERROR (case-insensitive)", () => {
    const html = '<img ONERROR="alert(1)" src="x" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("ONERROR");
    expect(result).not.toContain("onerror");
  });

  // --- Compound payloads ---

  it("strips both javascript: URI and event handler in same element", () => {
    const html = '<a href="javascript:void(0)" onclick="steal()">link</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("onclick");
    expect(result).toContain("link");
  });

  it("handles multiple elements with different XSS vectors", () => {
    const html =
      '<a href="javascript:x">a</a><img onerror="y" src="z" /><p>safe</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("onerror");
    expect(result).toContain("safe");
  });

  // --- Clean content passes through ---

  it("passes clean HTML through unchanged", () => {
    const html =
      '<h1>Title</h1><p>A <strong>bold</strong> and <em>italic</em> paragraph.</p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("preserves table structure", () => {
    const html = "<table><tr><th>H</th></tr><tr><td>C</td></tr></table>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("preserves code blocks", () => {
    const html = '<pre><code class="language-js">const x = 1;</code></pre>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  // --- Regression: bypasses that defeated the old regex sanitizer ---

  it("strips javascript: scheme obfuscated with a tab inside the scheme", () => {
    const html = '<a href="java\tscript:alert(1)">x</a>';
    const result = sanitizeHtml(html);
    expect(result.toLowerCase()).not.toContain("script:");
    expect(result).toContain(">x<");
  });

  it("strips javascript: scheme obfuscated with a newline", () => {
    const html = '<a href="java\nscript:alert(1)">x</a>';
    expect(sanitizeHtml(html).toLowerCase()).not.toContain("script:");
  });

  it("strips entity-encoded javascript: scheme", () => {
    const html = '<a href="&#106;avascript:alert(1)">x</a>';
    const result = sanitizeHtml(html);
    expect(result.toLowerCase()).not.toContain("javascript:");
    // and the entity must not survive to be re-decoded by a browser
    expect(result).not.toContain("&#106;");
  });

  it("strips data:image/svg+xml (SVG data URIs execute script)", () => {
    const html =
      '<a href="data:image/svg+xml;base64,PHN2Zy8+">x</a>';
    expect(sanitizeHtml(html)).not.toContain("svg+xml");
  });

  it("does NOT corrupt prose text that contains on-word=number", () => {
    const html = "<p>Measure the onset=5ms delay here.</p>";
    // text nodes must be untouched — the old regex deleted ' onset=5ms'
    expect(sanitizeHtml(html)).toContain("onset=5ms delay");
  });

  it("does NOT corrupt attribute values that look like schemes in text", () => {
    const html = "<p>Use the format data:type,value in your config.</p>";
    expect(sanitizeHtml(html)).toContain("data:type,value");
  });

  it("drops executable elements (script/iframe) entirely", () => {
    const html =
      '<p>ok</p><script>steal()</script><iframe src="//evil"></iframe>';
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>ok</p>");
    expect(result).not.toContain("steal");
    expect(result).not.toContain("<iframe");
  });

  it("keeps raster image data URIs while dropping svg ones", () => {
    const html =
      '<img src="data:image/webp;base64,UklGRg=="><img src="data:image/svg+xml,<svg/>">';
    const result = sanitizeHtml(html);
    expect(result).toContain("data:image/webp;base64,UklGRg==");
    expect(result).not.toContain("svg");
  });
});
