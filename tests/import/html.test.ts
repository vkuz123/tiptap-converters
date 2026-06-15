import { describe, it, expect } from "vitest";
import { htmlToTipTap } from "../../src/import/html";

describe("HTML to TipTap — basic elements", () => {
  it("parses headings h1-h3", () => {
    const { doc } = htmlToTipTap("<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>");
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0].type).toBe("heading");
    expect(doc.content[0].attrs?.level).toBe(1);
    expect(doc.content[1].attrs?.level).toBe(2);
    expect(doc.content[2].attrs?.level).toBe(3);
  });

  it("parses paragraphs with inline marks", () => {
    const { doc } = htmlToTipTap("<p><strong>bold</strong> and <em>italic</em></p>");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
    const content = doc.content[0].content!;
    expect(content[0].marks?.[0].type).toBe("bold");
    expect(content[2].marks?.[0].type).toBe("italic");
  });

  it("parses unordered and ordered lists", () => {
    const { doc } = htmlToTipTap("<ul><li>A</li><li>B</li></ul><ol><li>1</li></ol>");
    expect(doc.content[0].type).toBe("bulletList");
    expect(doc.content[0].content).toHaveLength(2);
    expect(doc.content[1].type).toBe("orderedList");
  });

  it("parses code blocks with language", () => {
    const { doc } = htmlToTipTap('<pre><code class="language-js">const x = 1;</code></pre>');
    expect(doc.content[0].type).toBe("codeBlock");
    expect(doc.content[0].attrs?.language).toBe("js");
    expect(doc.content[0].content?.[0].text).toBe("const x = 1;");
  });

  it("parses blockquotes", () => {
    const { doc } = htmlToTipTap("<blockquote><p>Quoted text</p></blockquote>");
    expect(doc.content[0].type).toBe("blockquote");
  });

  it("parses links", () => {
    const { doc } = htmlToTipTap('<p><a href="https://example.com">Link</a></p>');
    const link = doc.content[0].content?.[0];
    expect(link?.marks?.[0].type).toBe("link");
    expect(link?.marks?.[0].attrs?.href).toBe("https://example.com");
  });

  it("parses images", () => {
    const { doc } = htmlToTipTap('<img src="photo.jpg" alt="A photo">');
    expect(doc.content[0].type).toBe("image");
    expect(doc.content[0].attrs?.src).toBe("photo.jpg");
    expect(doc.content[0].attrs?.alt).toBe("A photo");
  });

  it("parses horizontal rules", () => {
    const { doc } = htmlToTipTap("<p>Before</p><hr><p>After</p>");
    expect(doc.content[1].type).toBe("horizontalRule");
  });

  it("extracts title from <title> tag", () => {
    const { title } = htmlToTipTap("<html><head><title>My Page</title></head><body><p>Content</p></body></html>");
    expect(title).toBe("My Page");
  });

  it("extracts title from first h1 if no <title>", () => {
    const { title } = htmlToTipTap("<h1>First Heading</h1><p>Content</p>");
    expect(title).toBe("First Heading");
  });
});

describe("HTML to TipTap — tables", () => {
  it("parses table with header and body rows", () => {
    const { doc } = htmlToTipTap(`
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>A</td><td>1</td></tr></tbody>
      </table>
    `);
    expect(doc.content[0].type).toBe("table");
    const rows = doc.content[0].content!;
    expect(rows).toHaveLength(2);
    expect(rows[0].content?.[0].type).toBe("tableHeader");
    expect(rows[1].content?.[0].type).toBe("tableCell");
  });
});

describe("HTML to TipTap — edge cases", () => {
  it("strips script and style tags", () => {
    const { doc } = htmlToTipTap("<script>alert('xss')</script><p>Clean</p><style>body{}</style>");
    const hasScript = doc.content.some((n) => n.type === "script");
    expect(hasScript).toBe(false);
  });

  it("handles empty HTML", () => {
    const { doc } = htmlToTipTap("");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");
  });

  it("unwraps div/section/article into block content", () => {
    const { doc } = htmlToTipTap("<div><p>Inside div</p></div>");
    expect(doc.content[0].type).toBe("paragraph");
  });
});
