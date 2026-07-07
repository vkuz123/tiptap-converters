import { describe, it, expect } from "vitest";
import { ditaToTipTap } from "../../src/import/dita";
import { renderToDita } from "../../src/export/dita";

describe("DITA roundtrip — DITA → TipTap → DITA", () => {
  function roundtrip(xml: string, topicType: "concept" | "task" | "reference" | "custom" = "concept") {
    const result = ditaToTipTap(xml);
    const dita = renderToDita({
      id: "test-topic",
      title: result.title,
      topicType: result.topicType ?? topicType,
      doc: result.doc,
    });
    return dita;
  }

  it("preserves concept topic structure", () => {
    const xml = `<concept id="intro"><title>Introduction</title><conbody><p>Hello world</p></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<concept");
    expect(result).toContain("<title>Introduction</title>");
    expect(result).toContain("<conbody>");
    expect(result).toContain("<p>Hello world</p>");
  });

  it("exports task as a DTD-valid generic topic and round-trips its type", () => {
    // <taskbody> can't hold our generic <ol>, and import already flattened
    // <steps> → ordered list, so we downgrade to <topic outputclass="task">.
    const xml = `<task id="install"><title>Installation</title><taskbody><steps><step><cmd>Run the installer</cmd></step><step><cmd>Restart</cmd></step></steps></taskbody></task>`;
    const result = roundtrip(xml);
    expect(result).toContain("<topic");
    expect(result).toContain('outputclass="task"');
    expect(result).not.toContain("<taskbody>");
    expect(result).toContain("<title>Installation</title>");
    expect(result).toContain("<ol>");
    expect(result).toContain("Run the installer");
    expect(result).toContain("Restart");
    // topic type survives the round trip via @outputclass
    expect(ditaToTipTap(result).topicType).toBe("task");
  });

  it("exports reference as a DTD-valid generic topic and round-trips its type", () => {
    const xml = `<reference id="api"><title>API Reference</title><refbody><p>Parameters listed below.</p></refbody></reference>`;
    const result = roundtrip(xml);
    expect(result).toContain("<topic");
    expect(result).toContain('outputclass="reference"');
    expect(result).not.toContain("<refbody>");
    expect(result).toContain("Parameters listed below.");
    expect(ditaToTipTap(result).topicType).toBe("reference");
  });

  it("exports glossary as a DTD-valid generic topic and round-trips its type", () => {
    const xml = `<glossentry id="g"><glossterm>API</glossterm><glossdef>Application Programming Interface</glossdef></glossentry>`;
    const result = roundtrip(xml);
    expect(result).toContain('outputclass="glossary"');
    expect(result).not.toContain("<glossbody>");
    expect(result).toContain("<title>API</title>");
    expect(result).toContain("Application Programming Interface");
    expect(ditaToTipTap(result).topicType).toBe("glossary");
  });

  it("keeps concept native (conbody accepts our content) and round-trips its type", () => {
    const xml = `<concept id="c"><title>C</title><conbody><p>Body</p></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<concept");
    expect(result).toContain("<conbody>");
    expect(result).not.toContain("outputclass=");
    expect(ditaToTipTap(result).topicType).toBe("concept");
  });

  it("imports substeps as an ordered (not bulleted) list", () => {
    const xml = `<task id="t"><title>T</title><taskbody><steps><step><cmd>Outer</cmd><substeps><substep><cmd>Inner</cmd></substep></substeps></step></steps></taskbody></task>`;
    const json = JSON.stringify(ditaToTipTap(xml).doc);
    expect((json.match(/"orderedList"/g) || []).length).toBe(2);
    expect(json).not.toContain('"bulletList"');
  });

  it("preserves bold and italic inline formatting", () => {
    const xml = `<concept id="fmt"><title>Formatting</title><conbody><p>This is <b>bold</b> and <i>italic</i></p></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<i>italic</i>");
  });

  it("preserves code phrases", () => {
    const xml = `<concept id="code"><title>Code</title><conbody><p>Use <codeph>npm install</codeph></p></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<codeph>npm install</codeph>");
  });

  it("preserves code blocks", () => {
    const xml = `<concept id="cb"><title>Example</title><conbody><codeblock>const x = 1;</codeblock></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<codeblock>");
    expect(result).toContain("const x = 1;");
  });

  it("preserves unordered lists", () => {
    const xml = `<concept id="lists"><title>Lists</title><conbody><ul><li>Alpha</li><li>Beta</li></ul></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("Alpha");
    expect(result).toContain("Beta");
  });

  it("preserves ordered lists", () => {
    const xml = `<concept id="ol"><title>Steps</title><conbody><ol><li>First</li><li>Second</li></ol></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<ol>");
    expect(result).toContain("First");
    expect(result).toContain("Second");
  });

  it("preserves notes as callouts and back", () => {
    const xml = `<concept id="notes"><title>Notes</title><conbody><note type="warning">Be careful</note></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain('<note type="warning">');
    expect(result).toContain("Be careful");
  });

  it("preserves images", () => {
    const xml = `<concept id="img"><title>Image</title><conbody><image href="photo.png"><alt>A photo</alt></image></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain('href="photo.png"');
    expect(result).toContain("A photo");
  });

  it("preserves sections with titles", () => {
    const xml = `<concept id="sec"><title>Main</title><conbody><section><title>Overview</title><p>Details here</p></section></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<section>");
    expect(result).toContain("<title>Overview</title>");
    expect(result).toContain("Details here");
  });

  it("preserves cross-references", () => {
    const xml = `<concept id="xref"><title>Links</title><conbody><p>See <xref href="other.dita">other topic</xref></p></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("other topic");
  });

  it("preserves simple tables", () => {
    const xml = `<concept id="tbl"><title>Table</title><conbody><simpletable><sthead><stentry>Name</stentry><stentry>Value</stentry></sthead><strow><stentry>A</stentry><stentry>1</stentry></strow></simpletable></conbody></concept>`;
    const result = roundtrip(xml);
    expect(result).toContain("<simpletable>");
    expect(result).toContain("<sthead>");
    expect(result).toContain("<stentry>Name</stentry>");
    expect(result).toContain("<stentry>A</stentry>");
  });
});
