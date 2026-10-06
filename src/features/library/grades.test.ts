import { describe, expect, it } from "vitest";
import { gradeAr, gradeOk, primaryGrade } from "./grades";

describe("hadith grades", () => {
  const g = (name: string, grade: string) => ({ name, grade });
  it("uses the collection's primary grader", () => {
    expect(primaryGrade("abudawud", [g("Zubair Ali Zai", "Daif"), g("Al-Albani", "Sahih")])?.grade).toBe("Sahih");
    expect(primaryGrade("malik", [g("Salim al-Hilali", "Hasan")])?.grade).toBe("Hasan");
  });
  it.each([
    ["Sahih", true], ["Hasan Sahih", true], ["Hasan", true], ["Sahih Lighairihi", true],
    ["Daif", false], ["Daif Isnaad", false], ["Sahih Isnaad", false], ["Sahih Maqtu", false], ["Munkar", false], ["Shadh", false],
  ])("%s → %s", (grade, ok) => {
    expect(gradeOk("tirmidhi", [g("Al-Albani", grade as string)])).toBe(ok);
  });
  it("ungraded or unknown collections never pass", () => {
    expect(gradeOk("nawawi", [])).toBe(false);
    expect(gradeOk("abudawud", [g("Zubair Ali Zai", "Sahih")])).toBe(false);
  });
  it("labels grades in Arabic", () => {
    expect(gradeAr("Hasan Sahih")).toBe("حسن صحيح");
    expect(gradeAr("Daif")).toBe("ضعيف");
  });
});
