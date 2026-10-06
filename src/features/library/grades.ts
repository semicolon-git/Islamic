/**
 * Hadith grades for the collections beyond the two Sahihs. The source carries several graders' verdicts per hadith;
 * one primary grader per collection decides whether a hadith may appear in public answers. The grade is always shown.
 */
export interface Grade { name: string; grade: string }

/** Primary grader per collection (the most widely cited verdicts for that book). */
export const PRIMARY_GRADER: Record<string, string> = {
  abudawud: "Al-Albani",
  tirmidhi: "Al-Albani",
  nasai: "Al-Albani",
  ibnmajah: "Al-Albani",
  malik: "Salim al-Hilali",
};

/** Accepted verdicts: the hadith itself is sahih or hasan (chain-only, mawquf and maqtu verdicts are not enough). */
const ACCEPTED = /^(sahih|hasan|hasan sahih|sahih hadith|hasan hadith|sahih li ?ghairihi|hasan li ?ghairihi)$/;

export function normaliseGrade(g: string): string {
  return g.toLowerCase().replace(/[‘’ʿʾ'`]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** The primary grader's verdict, or null when that grader did not grade it. */
export function primaryGrade(collection: string, grades: Grade[] | null | undefined): Grade | null {
  const name = PRIMARY_GRADER[collection];
  if (!name || !grades?.length) return null;
  return grades.find((g) => g.name === name) ?? null;
}

/** True when the primary grader graded the hadith sahih or hasan. Ungraded or other verdicts → false. */
export function gradeOk(collection: string, grades: Grade[] | null | undefined): boolean {
  const p = primaryGrade(collection, grades);
  return !!p && ACCEPTED.test(normaliseGrade(p.grade));
}

/** Arabic label for common verdicts (display). */
export function gradeAr(grade: string): string {
  const g = normaliseGrade(grade);
  const map: Record<string, string> = {
    sahih: "صحيح", hasan: "حسن", "hasan sahih": "حسن صحيح", daif: "ضعيف", "daif jiddan": "ضعيف جداً", mawdu: "موضوع", munkar: "منكر", shadh: "شاذ",
    "sahih lighairihi": "صحيح لغيره", "hasan lighairihi": "حسن لغيره", "sahih isnaad": "إسناده صحيح", "hasan isnaad": "إسناده حسن", "daif isnaad": "إسناده ضعيف",
  };
  return map[g] ?? grade;
}
