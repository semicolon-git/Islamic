import { describe, expect, it } from "vitest";
import { isPlausibleCode, itemQrPayload, nextItemCode, normalizeCode, parseQrPayload, sameCode, venueQrPayload } from "./codes";

describe("normalizeCode", () => {
  it.each([
    ["ast7", "AST7"],
    ["AST-7", "AST7"],
    [" ast 7 ", "AST7"],
    ["ast–7", "AST7"], // en dash
    ["Ast_7", "AST7"],
    ["ast.7", "AST7"],
    ["AST-٧", "AST7"], // Arabic-Indic digit
    ["lmp-۳", "LMP3"], // Eastern Arabic-Indic digit
    ["ＡＳＴ７", "AST7"], // full-width
    ["", ""],
  ])("%s → %s", (input, out) => expect(normalizeCode(input)).toBe(out));

  it("treats differently typed codes as the same", () => {
    expect(sameCode("ast7", "AST-7")).toBe(true);
    expect(sameCode("ast71", "AST-7")).toBe(false);
  });

  it("checks plausibility (3–8 letters or numbers)", () => {
    expect(isPlausibleCode("ast7")).toBe(true);
    expect(isPlausibleCode("noor")).toBe(true);
    expect(isPlausibleCode("a7")).toBe(false);
    expect(isPlausibleCode("abcdefghi")).toBe(false);
    expect(isPlausibleCode("AB-CD-EF-GH")).toBe(true);
    expect(isPlausibleCode("AB-CD-EF-GH-I")).toBe(false);
    expect(isPlausibleCode("--")).toBe(false);
  });
});

describe("nextItemCode", () => {
  it("continues the sequence for a kind", () => {
    expect(nextItemCode("lamp", ["LMP-3", "AST-7"])).toBe("LMP-4");
    expect(nextItemCode("astrolabe", ["LMP-3", "AST-7"])).toBe("AST-8");
    expect(nextItemCode("tile", [])).toBe("TIL-1");
    expect(nextItemCode("unknown-kind", ["OBJ-1"])).toBe("OBJ-2");
  });
  it("never collides with an existing code written differently", () => {
    expect(nextItemCode("lamp", ["lmp 1", "LMP2"])).toBe("LMP-3");
  });
  it("keeps codes short enough to type", () => {
    expect(normalizeCode(nextItemCode("manuscript", ["QMS-999"])).length).toBeLessThanOrEqual(8);
  });
});

describe("QR payloads", () => {
  it("item labels encode an ordinary link to the item page", () => {
    expect(itemQrPayload("https://signs.example/", "AST-7")).toBe("https://signs.example/heritage/item/AST-7");
  });
  it("venue entrances encode venue:<code>", () => {
    expect(venueQrPayload("NOOR")).toBe("venue:NOOR");
  });
  it("round-trips through the parser", () => {
    expect(parseQrPayload(itemQrPayload("http://127.0.0.1:3005", "LMP-3"))).toEqual({ kind: "item", code: "LMP3" });
    expect(parseQrPayload(venueQrPayload("NOOR"))).toEqual({ kind: "venue", code: "NOOR" });
  });
  it("accepts venue links, bare codes and other hosts' item links (taking only the code)", () => {
    expect(parseQrPayload("https://other.host/heritage?venue=noor")).toEqual({ kind: "venue", code: "NOOR" });
    expect(parseQrPayload("VENUE: noor")).toEqual({ kind: "venue", code: "NOOR" });
    expect(parseQrPayload("ast-7")).toEqual({ kind: "item", code: "AST7" });
    expect(parseQrPayload("https://evil.example/heritage/item/AST-7?x=1")).toEqual({ kind: "item", code: "AST7" });
  });
  it("rejects unrelated QR codes", () => {
    expect(parseQrPayload("https://example.com/menu").kind).toBe("unknown");
    expect(parseQrPayload("WIFI:S:guest;T:WPA;P:secret;;").kind).toBe("unknown");
    expect(parseQrPayload("").kind).toBe("unknown");
    expect(parseQrPayload("https://x.y/heritage/item/../../etc").kind).toBe("unknown");
  });
});
