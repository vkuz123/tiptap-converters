import { describe, it, expect } from "vitest";
import { parseFlareProject, rewriteComponentPaths } from "../../src/import/flare";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Helpers ---

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

function findNodes(doc: TipTapNode, type: string): TipTapNode[] {
  const found: TipTapNode[] = [];
  function walk(n: TipTapNode) {
    if (n.type === type) found.push(n);
    if (n.content) n.content.forEach(walk);
  }
  walk(doc);
  return found;
}

// --- Basic Parsing (existing) ---

describe("Flare project parsing", () => {
  it("parses topic .htm files", () => {
    const files = new Map([
      ["Content/Topic1.htm", "<html><body><h1>Getting Started</h1><p>Welcome.</p></body></html>"],
      ["Content/Topic2.htm", "<html><body><h1>Installation</h1><p>Steps here.</p></body></html>"],
    ]);
    const result = parseFlareProject(files);
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0].title).toBe("Getting Started");
    expect(result.topics[1].title).toBe("Installation");
  });

  it("parses snippet .flsnp files as components", () => {
    const files = new Map([
      ["Content/Resources/Snippets/Warning.flsnp", "<html><body><p>Warning: this is important.</p></body></html>"],
    ]);
    const result = parseFlareProject(files);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].title).toBe("Warning");
  });

  it("parses .fltoc TOC files", () => {
    const files = new Map([
      ["Project/TOCs/Primary.fltoc", `
        <CatapultToc>
          <TocEntry Title="Introduction" Link="Content/Intro.htm">
            <TocEntry Title="Overview" Link="Content/Overview.htm" />
          </TocEntry>
          <TocEntry Title="Reference" Link="Content/Ref.htm" />
        </CatapultToc>
      `],
    ]);
    const result = parseFlareProject(files);
    expect(result.toc).toHaveLength(2);
    expect(result.toc[0].title).toBe("Introduction");
    expect(result.toc[0].children).toHaveLength(1);
    expect(result.toc[1].title).toBe("Reference");
  });

  it("parses .flvar variable files", () => {
    const files = new Map([
      ["Project/Variables/General.flvar", `
        <CatapultVariableSet>
          <Variable Name="ProductName">Acme Pro</Variable>
          <Variable Name="Version">3.0</Variable>
        </CatapultVariableSet>
      `],
    ]);
    const result = parseFlareProject(files);
    expect(result.variableSets).toHaveLength(1);
    expect(result.variableSets[0].name).toBe("General");
    expect(result.variableSets[0].variables).toHaveLength(2);
    expect(result.variableSets[0].variables[0].key).toBe("ProductName");
    expect(result.variableSets[0].variables[0].value).toBe("Acme Pro");
  });

  it("parses condition tag sets from .flcts files (dimension = filename, values carry color)", () => {
    const files = new Map([
      ["Project/ConditionTagSets/Audience.flcts", `
        <CatapultConditionTagSet>
          <ConditionTag Name="Admin" BackgroundColor="#ff0000" />
          <ConditionTag Name="User" />
        </CatapultConditionTagSet>
      `],
      ["Project/ConditionTagSets/Output.flcts", `
        <CatapultConditionTagSet>
          <ConditionTag Name="PDF" />
          <ConditionTag Name="Web" />
        </CatapultConditionTagSet>
      `],
    ]);
    const result = parseFlareProject(files);
    expect(result.conditions).toHaveLength(2);
    const audience = result.conditions.find((c) => c.dimension === "Audience")!;
    expect(audience).toBeDefined();
    expect(audience.values.map((v) => v.label)).toEqual(["Admin", "User"]);
    expect(audience.values[0].color).toBe("#ff0000");
    const output = result.conditions.find((c) => c.dimension === "Output")!;
    expect(output.values.map((v) => v.label)).toEqual(["PDF", "Web"]);
  });

  it("handles empty project", () => {
    const result = parseFlareProject(new Map());
    expect(result.topics).toHaveLength(0);
    expect(result.components).toHaveLength(0);
    expect(result.variableSets).toHaveLength(0);
    expect(result.conditions).toHaveLength(0);
    expect(result.toc).toHaveLength(0);
  });
});

// --- MadCap Element → TipTap Node Conversion ---

describe("Flare MadCap element conversion", () => {
  it("converts MadCap:snippetBlock to componentRef node", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <h1>Guide</h1>
        <p>Before snippet.</p>
        <MadCap:snippetBlock src="../Resources/Snippets/Warning.flsnp" />
        <p>After snippet.</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const refs = findNodes(doc, "componentRef");
    expect(refs).toHaveLength(1);
    expect(refs[0].attrs?._flarePath).toContain("warning.flsnp");
    expect(refs[0].attrs?.componentId).toBeNull();
  });

  it("converts MadCap:variable to variableToken node", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <h1>Welcome</h1>
        <p>Welcome to <MadCap:variable name="General.ProductName" />!</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const vars = findNodes(doc, "variableToken");
    expect(vars).toHaveLength(1);
    expect(vars[0].attrs?.key).toBe("ProductName");
  });

  it("converts MadCap:snippetText to inlineComponentRef node", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <h1>Guide</h1>
        <p>See the <MadCap:snippetText src="../Resources/Snippets/Disclaimer.flsnp" /> for details.</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const refs = findNodes(doc, "inlineComponentRef");
    expect(refs).toHaveLength(1);
    expect(refs[0].attrs?._flarePath).toContain("disclaimer.flsnp");
  });

  it("handles multiple MadCap elements in the same topic", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <h1>Setup</h1>
        <p>Install <MadCap:variable name="General.ProductName" /> version <MadCap:variable name="General.Version" />.</p>
        <MadCap:snippetBlock src="../Resources/Snippets/SystemReqs.flsnp" />
        <p>Read <MadCap:snippetText src="../Resources/Snippets/License.flsnp" /> before proceeding.</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    expect(findNodes(doc, "variableToken")).toHaveLength(2);
    expect(findNodes(doc, "componentRef")).toHaveLength(1);
    expect(findNodes(doc, "inlineComponentRef")).toHaveLength(1);
  });

  it("preserves surrounding text around inline markers", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <p>Welcome to <MadCap:variable name="General.ProductName" /> documentation!</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const para = doc.content?.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
    const texts = (para?.content ?? []).filter((n) => n.type === "text").map((n) => n.text);
    expect(texts).toContain("Welcome to ");
    expect(texts).toContain(" documentation!");
  });

  it("extracts variable key from SetName.Key format", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <p><MadCap:variable name="MySet.MyKey" /></p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const vars = findNodes(doc, "variableToken");
    expect(vars[0].attrs?.key).toBe("MyKey");
  });

  it("handles bare variable name without set prefix", () => {
    const files = new Map([
      ["Content/Topic.htm", `<html><body>
        <p><MadCap:variable name="CompanyName" /></p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    const doc = result.topics[0].doc as TipTapNode;
    const vars = findNodes(doc, "variableToken");
    expect(vars[0].attrs?.key).toBe("CompanyName");
  });

  it("converts MadCap variables inside snippets (lossless component reuse)", () => {
    const files = new Map([
      ["Content/Resources/Snippets/Note.flsnp", `<html><body>
        <p>Note: <MadCap:variable name="General.ProductName" /> requires admin access.</p>
      </body></html>`],
    ]);
    const result = parseFlareProject(files);
    expect(result.components).toHaveLength(1);
    // Snippets now run through the full marker-processing path so their
    // MadCap variables are preserved as variableToken nodes (not flattened).
    const doc = result.components[0].doc as TipTapNode;
    const vars = findNodes(doc, "variableToken");
    expect(vars).toHaveLength(1);
  });
});

// --- Content Rewriting (path → ID) ---

describe("rewriteComponentPaths", () => {
  it("replaces _flarePath with componentId from path map", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "componentRef",
          attrs: { componentId: null, _flarePath: "resources/snippets/warning.flsnp" },
        },
      ],
    };
    const pathToId = new Map([
      ["Content/Resources/Snippets/Warning.flsnp", "uuid-123"],
    ]);
    const rewritten = rewriteComponentPaths(doc, pathToId) as TipTapNode;
    const refs = findNodes(rewritten, "componentRef");
    expect(refs[0].attrs?.componentId).toBe("uuid-123");
    expect(refs[0].attrs?._flarePath).toBeUndefined();
  });

  it("rewrites inlineComponentRef paths too", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "inlineComponentRef",
              attrs: { componentId: null, _flarePath: "resources/snippets/note.flsnp" },
            },
          ],
        },
      ],
    };
    const pathToId = new Map([
      ["Content/Resources/Snippets/Note.flsnp", "uuid-456"],
    ]);
    const rewritten = rewriteComponentPaths(doc, pathToId) as TipTapNode;
    const refs = findNodes(rewritten, "inlineComponentRef");
    expect(refs[0].attrs?.componentId).toBe("uuid-456");
  });

  it("leaves componentId null when path has no match", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "componentRef",
          attrs: { componentId: null, _flarePath: "resources/snippets/missing.flsnp" },
        },
      ],
    };
    const rewritten = rewriteComponentPaths(doc, new Map()) as TipTapNode;
    const refs = findNodes(rewritten, "componentRef");
    expect(refs[0].attrs?.componentId).toBeNull();
    expect(refs[0].attrs?._flarePath).toBeUndefined();
  });

  it("matches by filename when full path differs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "componentRef",
          attrs: { componentId: null, _flarePath: "snippets/warning.flsnp" },
        },
      ],
    };
    const pathToId = new Map([
      ["Content/Resources/Snippets/Warning.flsnp", "uuid-789"],
    ]);
    const rewritten = rewriteComponentPaths(doc, pathToId) as TipTapNode;
    expect(findNodes(rewritten, "componentRef")[0].attrs?.componentId).toBe("uuid-789");
  });
});

// --- Full Synthetic Flare Project ---

describe("Full Flare project import", () => {
  const syntheticProject = new Map([
    // Condition tag set (.flcts — dimension name comes from the filename)
    ["Project/ConditionTagSets/Audience.flcts", `
      <CatapultConditionTagSet>
        <ConditionTag Name="Admin" />
        <ConditionTag Name="EndUser" />
      </CatapultConditionTagSet>
    `],
    // Variable set
    ["Project/Variables/General.flvar", `
      <CatapultVariableSet>
        <Variable Name="ProductName">Acme Suite</Variable>
        <Variable Name="Version">4.0</Variable>
        <Variable Name="CompanyName">Acme Corp</Variable>
      </CatapultVariableSet>
    `],
    // Snippets
    ["Content/Resources/Snippets/CopyrightNotice.flsnp",
      "<html><body><p>Copyright 2026 Acme Corp. All rights reserved.</p></body></html>"],
    ["Content/Resources/Snippets/SupportContact.flsnp",
      "<html><body><p>Contact support@acme.com for assistance.</p></body></html>"],
    // Topics with MadCap elements
    ["Content/Welcome.htm", `<html><body>
      <h1>Welcome</h1>
      <p>Welcome to <MadCap:variable name="General.ProductName" /> v<MadCap:variable name="General.Version" />.</p>
      <MadCap:snippetBlock src="../Resources/Snippets/CopyrightNotice.flsnp" />
    </body></html>`],
    ["Content/GettingStarted.htm", `<html><body>
      <h1>Getting Started</h1>
      <p>Follow these steps to set up <MadCap:variable name="General.ProductName" />.</p>
      <p>For help, see <MadCap:snippetText src="../Resources/Snippets/SupportContact.flsnp" />.</p>
    </body></html>`],
    ["Content/AdminGuide.htm", `<html><body>
      <h1>Admin Guide</h1>
      <p>This guide is for administrators of <MadCap:variable name="General.ProductName" />.</p>
    </body></html>`],
    // TOC
    ["Project/TOCs/Online.fltoc", `
      <CatapultToc>
        <TocEntry Title="Welcome" Link="/Content/Welcome.htm" />
        <TocEntry Title="Getting Started" Link="/Content/GettingStarted.htm">
          <TocEntry Title="Admin Guide" Link="/Content/AdminGuide.htm" />
        </TocEntry>
      </CatapultToc>
    `],
  ]);

  it("extracts all artifact types", () => {
    const result = parseFlareProject(syntheticProject);
    expect(result.topics).toHaveLength(3);
    expect(result.components).toHaveLength(2);
    expect(result.variableSets).toHaveLength(1);
    expect(result.conditions).toHaveLength(1);
    expect(result.toc).toHaveLength(2);
  });

  it("topics contain variableToken nodes for MadCap:variable", () => {
    const result = parseFlareProject(syntheticProject);
    const welcome = result.topics.find((t) => t.title === "Welcome")!;
    const vars = findNodes(welcome.doc as TipTapNode, "variableToken");
    expect(vars).toHaveLength(2);
    expect(vars.map((v) => v.attrs?.key)).toEqual(["ProductName", "Version"]);
  });

  it("topics contain componentRef nodes for MadCap:snippetBlock", () => {
    const result = parseFlareProject(syntheticProject);
    const welcome = result.topics.find((t) => t.title === "Welcome")!;
    const refs = findNodes(welcome.doc as TipTapNode, "componentRef");
    expect(refs).toHaveLength(1);
    expect(refs[0].attrs?._flarePath).toContain("copyrightnotice.flsnp");
  });

  it("topics contain inlineComponentRef nodes for MadCap:snippetText", () => {
    const result = parseFlareProject(syntheticProject);
    const gs = result.topics.find((t) => t.title === "Getting Started")!;
    const refs = findNodes(gs.doc as TipTapNode, "inlineComponentRef");
    expect(refs).toHaveLength(1);
    expect(refs[0].attrs?._flarePath).toContain("supportcontact.flsnp");
  });

  it("rewriteComponentPaths wires up all references", () => {
    const result = parseFlareProject(syntheticProject);
    const pathToId = new Map(
      result.components.map((c) => [c.path, `id-${c.title.toLowerCase()}`]),
    );

    for (const topic of result.topics) {
      const rewritten = rewriteComponentPaths(
        topic.doc as unknown as Record<string, unknown>,
        pathToId,
      ) as TipTapNode;

      const blockRefs = findNodes(rewritten, "componentRef");
      const inlineRefs = findNodes(rewritten, "inlineComponentRef");

      for (const ref of [...blockRefs, ...inlineRefs]) {
        expect(ref.attrs?._flarePath).toBeUndefined();
        // Either matched or null — no leftover _flarePath
        expect(typeof ref.attrs?.componentId === "string" || ref.attrs?.componentId === null).toBe(true);
      }
    }

    // Welcome topic's componentRef should map to CopyrightNotice
    const welcome = result.topics.find((t) => t.title === "Welcome")!;
    const rewritten = rewriteComponentPaths(
      welcome.doc as unknown as Record<string, unknown>,
      pathToId,
    ) as TipTapNode;
    const refs = findNodes(rewritten, "componentRef");
    expect(refs[0].attrs?.componentId).toBe("id-copyrightnotice");
  });

  it("TOC structure has correct nesting", () => {
    const result = parseFlareProject(syntheticProject);
    expect(result.toc[0].title).toBe("Welcome");
    expect(result.toc[0].children).toHaveLength(0);
    expect(result.toc[1].title).toBe("Getting Started");
    expect(result.toc[1].children).toHaveLength(1);
    expect(result.toc[1].children[0].title).toBe("Admin Guide");
  });
});

// --- Real Flare Project (copperqa1/madcap-flare-demo from GitHub) ---

describe("Real Flare project — madcap-flare-demo", () => {
  const fixtureDir = path.resolve(__dirname, "../fixtures/flare-demo");

  function loadFixture(): Map<string, string> {
    const files = new Map<string, string>();
    function walk(dir: string, prefix: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else {
          files.set(rel, fs.readFileSync(path.join(dir, entry.name), "utf-8"));
        }
      }
    }
    walk(fixtureDir, "");
    return files;
  }

  let result: ReturnType<typeof parseFlareProject>;

  it("loads the fixture and parses without error", () => {
    const files = loadFixture();
    expect(files.size).toBeGreaterThan(20);
    result = parseFlareProject(files);
  });

  it("parses all 21 topic .htm files", () => {
    expect(result.topics.length).toBe(21);
  });

  it("parses the variable set with 10 variables", () => {
    expect(result.variableSets).toHaveLength(1);
    expect(result.variableSets[0].name).toBe("General");
    expect(result.variableSets[0].variables.length).toBe(10);

    const keys = result.variableSets[0].variables.map((v) => v.key);
    expect(keys).toContain("CompanyName");
    expect(keys).toContain("ProductName");
    expect(keys).toContain("Phone");
    expect(keys).toContain("Title");
  });

  it("parses variable values correctly", () => {
    const vars = result.variableSets[0].variables;
    const company = vars.find((v) => v.key === "CompanyName");
    expect(company?.value).toBe("My Company Name, LLC");
    const product = vars.find((v) => v.key === "ProductName");
    expect(product?.value).toBe("FictionSoft Pro");
  });

  it("parses the flat TOC with 21 entries", () => {
    expect(result.toc.length).toBe(21);
  });

  it("TOC entries have correct hrefs linking to content paths", () => {
    const hrefs = result.toc.map((e) => e.href);
    expect(hrefs).toContain("/Content/Chapters/Chapter1.htm");
    expect(hrefs).toContain("/Content/Frontmatter/Copyright.htm");
    expect(hrefs).toContain("/Content/Backmatter/Glossary.htm");
  });

  it("converts MadCap:variable in Copyright page to variableToken nodes", () => {
    const copyright = result.topics.find((t) =>
      t.path.includes("Copyright.htm"),
    );
    expect(copyright).toBeDefined();
    const vars = findNodes(copyright!.doc as TipTapNode, "variableToken");
    // Copyright.htm has 7 MadCap:variable refs (Year, CompanyName x3, StreetAddress, CityStateZip, Phone)
    expect(vars.length).toBe(7);
    const varKeys = vars.map((v) => v.attrs?.key);
    expect(varKeys).toContain("CompanyName");
    expect(varKeys).toContain("Phone");
    expect(varKeys).toContain("StreetAddress");
    expect(varKeys).toContain("Year");
  });

  it("every topic produces a valid TipTap doc with content", () => {
    for (const topic of result.topics) {
      expect(topic.doc.type).toBe("doc");
      expect(Array.isArray(topic.doc.content)).toBe(true);
      expect(topic.doc.content.length).toBeGreaterThan(0);
    }
  });

  it("no topics have raw MadCap marker text left in content", () => {
    for (const topic of result.topics) {
      const json = JSON.stringify(topic.doc);
      expect(json).not.toContain("%%FLARE_VAR:");
      expect(json).not.toContain("%%FLARE_SNIPPET:");
      expect(json).not.toContain("%%FLARE_ISNIPPET:");
    }
  });

  it("has no components (this project has no .flsnp files)", () => {
    expect(result.components).toHaveLength(0);
  });

  it("total variable tokens across all topics matches expected count", () => {
    let totalVars = 0;
    for (const topic of result.topics) {
      totalVars += findNodes(topic.doc as TipTapNode, "variableToken").length;
    }
    // 7 in Copyright + 2 in Title = 9 total
    expect(totalVars).toBe(9);
  });
});
