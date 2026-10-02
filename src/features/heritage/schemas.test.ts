import { describe, expect, it } from "vitest";
import { InscribeInput, InscriptionAction, ItemInput } from "./schemas";

const base = { title_en: "Lamp", title_ar: "قنديل", kind: "lamp" };
const img = { src: "/api/items/files/img_abc123.webp", credit: "Photo © Al-Noor Library", license: "CC BY 4.0" };

describe("ItemInput", () => {
  it("accepts a minimal item and normalises empty optional fields to null", () => {
    const v = ItemInput.parse({ ...base, venue_id: "", date_text: "  " });
    expect(v.venue_id).toBeNull();
    expect(v.date_text).toBeNull();
    expect(v.images).toEqual([]);
  });
  it("requires a licence and a credit line on every image", () => {
    expect(ItemInput.safeParse({ ...base, images: [img] }).success).toBe(true);
    expect(ItemInput.safeParse({ ...base, images: [{ ...img, credit: "" }] }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, images: [{ ...img, license: " " }] }).success).toBe(false);
  });
  it("only accepts images we serve (or https / bundled images)", () => {
    expect(ItemInput.safeParse({ ...base, images: [{ ...img, src: "/api/items/files/../../etc/passwd" }] }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, images: [{ ...img, src: "javascript:alert(1)" }] }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, images: [{ ...img, src: "https://cdn.example/x.png" }] }).success).toBe(true);
  });
  it("rejects unknown kinds and missing titles", () => {
    expect(ItemInput.safeParse({ ...base, kind: "spaceship" }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, title_ar: "" }).success).toBe(false);
  });
});

describe("inscription inputs", () => {
  it("needs text or an image", () => {
    expect(InscribeInput.safeParse({}).success).toBe(false);
    expect(InscribeInput.safeParse({ text: "الله نور" }).success).toBe(true);
    expect(InscribeInput.safeParse({ image: { mediaType: "image/gif", base64: "x".repeat(20) } }).success).toBe(false);
  });
  it("validates verse keys on link", () => {
    expect(InscriptionAction.safeParse({ action: "link", verse_keys: ["24:35"] }).success).toBe(true);
    expect(InscriptionAction.safeParse({ action: "link", verse_keys: ["Q24"] }).success).toBe(false);
    expect(InscriptionAction.safeParse({ action: "confirm" }).success).toBe(true);
  });
});
