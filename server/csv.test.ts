import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("spreadsheet-safe CSV fields", () => {
  it("quotes values and escapes embedded quotes", () => {
    expect(csvCell('A "quoted" title')).toBe('"A ""quoted"" title"');
  });

  it("neutralizes formula prefixes including leading whitespace", () => {
    for (const value of ["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1)", "\t=1+1"]) {
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    }
  });

  it("keeps ordinary values unchanged", () => {
    expect(csvCell("lesson plan")).toBe('"lesson plan"');
  });
});
