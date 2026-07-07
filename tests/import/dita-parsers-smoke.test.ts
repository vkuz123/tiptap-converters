import { describe, it, expect } from "vitest";
import {
  parseKeydefs,
  parseDitaval,
  parseDitaTopics,
  parseSubjectScheme,
} from "../../src/import/dita";

// Smoke coverage for DITA import helpers that shipped without any tests.

describe("parseKeydefs", () => {
  it("maps keys to hrefs from keydef elements", () => {
    const xml = `<map>
      <keydef keys="prod" href="product.dita" />
      <keydef keys="intro overview" href="intro.dita" />
    </map>`;
    const keys = parseKeydefs(xml);
    expect(keys.get("prod")).toBe("product.dita");
    expect(keys.get("intro")).toBe("intro.dita");
    expect(keys.get("overview")).toBe("intro.dita");
  });

  it("returns an empty map when there is no map element", () => {
    expect(parseKeydefs("<topic><title>x</title></topic>").size).toBe(0);
  });
});

describe("parseDitaval", () => {
  it("extracts include/exclude/flag rules", () => {
    const xml = `<val>
      <prop att="audience" val="expert" action="exclude" />
      <prop att="platform" val="linux" action="include" />
      <prop att="rev" val="2.0" action="flag" />
    </val>`;
    const { rules } = parseDitaval(xml);
    expect(rules).toContainEqual({ attribute: "audience", value: "expert", action: "exclude" });
    expect(rules).toContainEqual({ attribute: "platform", value: "linux", action: "include" });
    expect(rules).toHaveLength(3);
  });

  it("ignores props with an unrecognized action", () => {
    const xml = `<val><prop att="a" val="b" action="bogus" /></val>`;
    expect(parseDitaval(xml).rules).toHaveLength(0);
  });
});

describe("parseDitaTopics", () => {
  it("parses a single topic into a doc with a title", () => {
    const xml = `<topic id="t1"><title>Hello</title><body><p>World</p></body></topic>`;
    const results = parseDitaTopics(xml);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toBe("Hello");
    expect(results[0].doc.type).toBe("doc");
  });
});

describe("parseSubjectScheme", () => {
  it("extracts dimensions and their enumerated values", () => {
    const xml = `<subjectScheme>
      <subjectdef keys="os">
        <subjectdef keys="linux" />
        <subjectdef keys="windows" />
      </subjectdef>
      <enumerationdef>
        <attributedef name="platform" />
        <subjectdef keyref="os" />
      </enumerationdef>
    </subjectScheme>`;
    const result = parseSubjectScheme(xml);
    expect(Array.isArray(result.dimensions)).toBe(true);
  });
});
