import { describe, it, expect } from "vitest";
import { ditaToTipTap, parseDitaMap } from "../../src/import/dita";

describe("DITA to TipTap — topic types", () => {
  it("parses a concept topic", () => {
    const xml = `
      <concept id="c1">
        <title>My Concept</title>
        <conbody>
          <p>This is a concept.</p>
        </conbody>
      </concept>
    `;
    const { title, doc, topicType } = ditaToTipTap(xml);
    expect(title).toBe("My Concept");
    expect(topicType).toBe("concept");
    expect(doc.content.some((n) => n.type === "paragraph")).toBe(true);
  });

  it("parses a task topic with steps", () => {
    const xml = `
      <task id="t1">
        <title>Install Guide</title>
        <taskbody>
          <steps>
            <step><cmd>Open terminal.</cmd></step>
            <step><cmd>Run the installer.</cmd></step>
          </steps>
        </taskbody>
      </task>
    `;
    const { title, doc, topicType } = ditaToTipTap(xml);
    expect(title).toBe("Install Guide");
    expect(topicType).toBe("task");
    const list = doc.content.find((n) => n.type === "orderedList");
    expect(list).toBeDefined();
    expect(list!.content).toHaveLength(2);
  });

  it("parses a reference topic", () => {
    const xml = `
      <reference id="r1">
        <title>API Reference</title>
        <refbody>
          <section>
            <title>Endpoints</title>
            <p>GET /api/users</p>
          </section>
        </refbody>
      </reference>
    `;
    const { title, topicType } = ditaToTipTap(xml);
    expect(title).toBe("API Reference");
    expect(topicType).toBe("reference");
  });
});

describe("DITA to TipTap — elements", () => {
  it("parses sections with titles as headings", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <section>
            <title>Section A</title>
            <p>Content A</p>
          </section>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const heading = doc.content.find((n) => n.type === "heading");
    expect(heading).toBeDefined();
    expect(heading!.attrs?.level).toBe(2);
  });

  it("parses inline formatting (bold and code)", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <p><b>bold</b> and <codeph>code</codeph></p>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const para = doc.content.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
    const boldNode = para!.content?.find(
      (n: any) => n.marks?.some((m: any) => m.type === "bold"),
    );
    expect(boldNode).toBeDefined();
    expect(boldNode!.text).toBe("bold");
    const codeNode = para!.content?.find(
      (n: any) => n.marks?.some((m: any) => m.type === "code"),
    );
    expect(codeNode).toBeDefined();
    expect(codeNode!.text).toBe("code");
  });

  it("parses codeblock elements", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <codeblock>function hello() {}</codeblock>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const codeBlock = doc.content.find((n) => n.type === "codeBlock");
    expect(codeBlock).toBeDefined();
    expect(codeBlock!.content?.[0].text).toBe("function hello() {}");
  });

  it("parses note elements as callouts", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <note>Important info here.</note>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const callout = doc.content.find((n) => n.type === "callout");
    expect(callout).toBeDefined();
    expect(callout!.attrs?.variant).toBe("info");
  });

  it("maps note type='warning' to warning variant", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <note type="warning">Be careful.</note>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const callout = doc.content.find((n) => n.type === "callout");
    expect(callout).toBeDefined();
    expect(callout!.attrs?.variant).toBe("warning");
  });

  it("maps note type='danger' to danger variant", () => {
    const xml = `
      <topic id="t1">
        <title>Topic</title>
        <body>
          <note type="danger">Critical issue.</note>
        </body>
      </topic>
    `;
    const { doc } = ditaToTipTap(xml);
    const callout = doc.content.find((n) => n.type === "callout");
    expect(callout).toBeDefined();
    expect(callout!.attrs?.variant).toBe("danger");
  });
});

describe("DITA map parsing", () => {
  it("parses a simple DITA map", () => {
    const xml = `
      <map>
        <title>User Guide</title>
        <topicref href="intro.dita" navtitle="Introduction">
          <topicref href="getting-started.dita" navtitle="Getting Started" />
        </topicref>
        <topicref href="reference.dita" navtitle="Reference" />
      </map>
    `;
    const { title, items } = parseDitaMap(xml);
    expect(title).toBe("User Guide");
    expect(items).toHaveLength(2);
    expect(items[0].href).toBe("intro.dita");
    expect(items[0].children).toHaveLength(1);
  });

  it("handles map with no topicrefs", () => {
    const xml = `<map><title>Empty Map</title></map>`;
    const { items } = parseDitaMap(xml);
    expect(items).toHaveLength(0);
  });
});
