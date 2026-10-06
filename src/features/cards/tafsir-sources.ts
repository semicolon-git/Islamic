import type { CardContent } from "@/lib/cards/types";

type Excerpt = CardContent["tafsir"][number];

/** Classical tafsir works most often cited; picking one fills the labels (still editable). */
export const TAFSIR_SOURCES: Record<string, Pick<Excerpt, "book_ar" | "book_en" | "author_ar" | "author_en">> = {
  muyassar: { book_ar: "التفسير الميسر", book_en: "al-Tafsir al-Muyassar", author_ar: "مجمع الملك فهد لطباعة المصحف الشريف", author_en: "King Fahd Glorious Quran Printing Complex" },
  tabari: { book_ar: "جامع البيان عن تأويل آي القرآن", book_en: "Jami' al-Bayan", author_ar: "ابن جرير الطبري (ت ٣١٠هـ)", author_en: "al-Tabari (d. 310 AH)" },
  ibn_kathir: { book_ar: "تفسير القرآن العظيم", book_en: "Tafsir al-Qur'an al-'Azim", author_ar: "ابن كثير (ت ٧٧٤هـ)", author_en: "Ibn Kathir (d. 774 AH)" },
  saadi: { book_ar: "تيسير الكريم الرحمن في تفسير كلام المنان", book_en: "Taysir al-Karim al-Rahman", author_ar: "عبد الرحمن السعدي (ت ١٣٧٦هـ)", author_en: "al-Sa'di (d. 1376 AH)" },
  qurtubi: { book_ar: "الجامع لأحكام القرآن", book_en: "al-Jami' li-Ahkam al-Qur'an", author_ar: "القرطبي (ت ٦٧١هـ)", author_en: "al-Qurtubi (d. 671 AH)" },
  baghawi: { book_ar: "معالم التنزيل", book_en: "Ma'alim al-Tanzil", author_ar: "البغوي (ت ٥١٦هـ)", author_en: "al-Baghawi (d. 516 AH)" },
};
