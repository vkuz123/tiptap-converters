import { describe, it, expect, vi } from "vitest";

// Mock mammoth since we can't create real .docx buffers easily in unit tests.
// Instead we test that wordToTipTap correctly chains mammoth → htmlToTipTap.
vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

import mammoth from "mammoth";
import { wordToTipTap } from "../../src/import/word";

const mockedMammoth = vi.mocked(mammoth);

describe("wordToTipTap", () => {
  it("converts headings and paragraphs", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: "<h1>Getting Started</h1><p>Welcome to the guide.</p>",
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    expect(result.title).toBe("Getting Started");
    expect(result.doc.type).toBe("doc");

    const heading = result.doc.content.find((n) => n.type === "heading");
    expect(heading).toBeDefined();
    expect(heading?.attrs?.level).toBe(1);

    const para = result.doc.content.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
  });

  it("converts bold and italic text", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: "<p><strong>Bold</strong> and <em>italic</em></p>",
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    const para = result.doc.content.find((n) => n.type === "paragraph");
    expect(para?.content).toBeDefined();
    expect(para!.content!.length).toBeGreaterThan(0);

    const boldNode = (para!.content! as { marks?: { type: string }[] }[]).find(
      (n) => n.marks && n.marks.some((m) => m.type === "bold"),
    );
    expect(boldNode).toBeDefined();
  });

  it("converts tables", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value:
        "<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>",
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    const table = result.doc.content.find((n) => n.type === "table");
    expect(table).toBeDefined();
  });

  it("extracts title from h1 heading", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: "<h1>Primary Title</h1><p>Body text.</p>",
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    expect(result.title).toBe("Primary Title");
  });

  it("returns empty title when no h1 heading present", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: "<p>Just a paragraph with no heading.</p>",
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    expect(result.title).toBe("");
  });

  it("passes Buffer to mammoth (not raw ArrayBuffer)", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: "<p>Test</p>",
      messages: [],
    });

    const ab = new ArrayBuffer(8);
    await wordToTipTap(ab);

    expect(mockedMammoth.convertToHtml).toHaveBeenCalledWith(
      { buffer: expect.any(Buffer) },
      expect.any(Object),
    );
  });

  it("converts images to image nodes", async () => {
    mockedMammoth.convertToHtml.mockResolvedValue({
      value: '<p><img src="data:image/png;base64,abc" alt="Screenshot" /></p>',
      messages: [],
    });

    const result = await wordToTipTap(new ArrayBuffer(0));

    const hasImage = result.doc.content.some(
      (n) =>
        n.type === "image" ||
        (n.content && n.content.some((c) => (c as { type: string }).type === "image")),
    );
    expect(hasImage).toBe(true);
  });
});
