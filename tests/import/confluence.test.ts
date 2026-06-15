import { describe, it, expect } from "vitest";
import { confluenceToTipTap } from "../../src/import/confluence";

describe("Confluence to TipTap", () => {
  it("parses standard HTML content", () => {
    const html = `<h1>Page Title</h1><p>Some content.</p>`;
    const { title, doc } = confluenceToTipTap(html);
    expect(title).toBe("Page Title");
    expect(doc.content.length).toBeGreaterThan(0);
  });

  it("converts code macros to code blocks", () => {
    const html = `
      <ac:structured-macro ac:name="code">
        <ac:parameter ac:name="language">python</ac:parameter>
        <ac:plain-text-body>print("hello")</ac:plain-text-body>
      </ac:structured-macro>
    `;
    const { doc } = confluenceToTipTap(html);
    const codeBlock = doc.content.find((n) => n.type === "codeBlock");
    expect(codeBlock).toBeDefined();
  });

  it("converts info/note macros to blockquotes", () => {
    const html = `
      <ac:structured-macro ac:name="info">
        <ac:rich-text-body><p>Important note here.</p></ac:rich-text-body>
      </ac:structured-macro>
    `;
    const { doc } = confluenceToTipTap(html);
    const bq = doc.content.find((n) => n.type === "blockquote");
    expect(bq).toBeDefined();
  });

  it("strips Confluence page chrome", () => {
    const html = `
      <div class="aui-header">Nav</div>
      <div class="wiki-content">
        <p>Actual content</p>
      </div>
      <div id="footer">Footer</div>
    `;
    const { doc } = confluenceToTipTap(html);
    const texts = JSON.stringify(doc);
    expect(texts).not.toContain("Nav");
    expect(texts).not.toContain("Footer");
    expect(texts).toContain("Actual content");
  });

  it("handles tables from Confluence export", () => {
    const html = `
      <table>
        <thead><tr><th>Header</th></tr></thead>
        <tbody><tr><td>Cell</td></tr></tbody>
      </table>
    `;
    const { doc } = confluenceToTipTap(html);
    const table = doc.content.find((n) => n.type === "table");
    expect(table).toBeDefined();
  });
});
