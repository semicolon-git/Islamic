/**
 * The library's built-in books (verbatim, by reference). Shared by scripts/library/fetch.mjs and the seed.
 * Tier 1 (Quran KFGQPC, Sahih al-Bukhari, Sahih Muslim) live in their own tables; these are tier 2.
 * Hadith grades: the Sunan carry graders' verdicts from the source; public answers only use hadith that
 * al-Albani graded sahih or hasan (see src/features/library/grades.ts), and the grade is always shown.
 */
export const TAFSIR_COMMIT = "eb82bb6294efe30ad5c135c03b1864afaa70e855"; // spa5k/tafsir_api
export const HADITH_COMMIT = "df57907be35291c91ad6a6691180e22ca9920784"; // fawazahmed0/hadith-api

export const CATALOGUE = [
  // Tafsir — ordered for display (concise first).
  { id: "tafsir-muyassar", kind: "tafsir", edition: "ar-tafsir-muyassar", lang: "ar", core: true,
    title_en: "al-Tafsir al-Muyassar", title_ar: "التفسير الميسر",
    author_en: "King Fahd Glorious Quran Printing Complex (committee of scholars)", author_ar: "مجمع الملك فهد لطباعة المصحف الشريف (نخبة من العلماء)",
    note_en: "Concise modern tafsir by the publisher of the Quran text used on this platform.", note_ar: "تفسير معاصر موجز من إصدار مجمع الملك فهد، ناشر نص المصحف المعتمد في المنصة.",
    source_url: "https://qul.tarteel.ai/resources/tafsir/38" },
  { id: "tafsir-saadi", kind: "tafsir", edition: "ar-tafseer-al-saddi", lang: "ar",
    title_en: "Taysir al-Karim al-Rahman (Tafsir al-Saʿdi)", title_ar: "تيسير الكريم الرحمن (تفسير السعدي)",
    author_en: "ʿAbd al-Rahman ibn Nasir al-Saʿdi (d. 1376 AH / 1956 CE)", author_ar: "عبد الرحمن بن ناصر السعدي (ت ١٣٧٦هـ)",
    note_en: "Widely taught, accessible classical-style tafsir.", note_ar: "تفسير ميسر العبارة واسع الانتشار في التعليم.",
    source_url: "https://qul.tarteel.ai/resources/tafsir/24" },
  { id: "tafsir-ibn-kathir", kind: "tafsir", edition: "ar-tafsir-ibn-kathir", lang: "ar",
    title_en: "Tafsir al-Quran al-ʿAzim (Tafsir Ibn Kathir)", title_ar: "تفسير القرآن العظيم (تفسير ابن كثير)",
    author_en: "Ismaʿil ibn ʿUmar ibn Kathir (d. 774 AH / 1373 CE)", author_ar: "إسماعيل بن عمر بن كثير (ت ٧٧٤هـ)",
    note_en: "Classical tafsir that explains the Quran by the Quran, the Sunnah and the reports of the early generations.", note_ar: "تفسير بالمأثور: يفسر القرآن بالقرآن والسنة وأقوال السلف.",
    source_url: "https://qul.tarteel.ai/resources/tafsir/22" },
  { id: "tafsir-ibn-kathir-en", kind: "tafsir", edition: "en-tafisr-ibn-kathir", lang: "en",
    title_en: "Tafsir Ibn Kathir (abridged English)", title_ar: "تفسير ابن كثير (مختصر بالإنجليزية)",
    author_en: "Ibn Kathir; abridged translation (Darussalam)", author_ar: "ابن كثير؛ ترجمة مختصرة (دار السلام)",
    note_en: "Abridged English translation of Ibn Kathir.", note_ar: "ترجمة إنجليزية مختصرة لتفسير ابن كثير.",
    source_url: "https://qul.tarteel.ai/resources/tafsir/35" },
  { id: "tafsir-tabari", kind: "tafsir", edition: "ar-tafsir-al-tabari", lang: "ar",
    title_en: "Jamiʿ al-Bayan (Tafsir al-Tabari)", title_ar: "جامع البيان عن تأويل آي القرآن (تفسير الطبري)",
    author_en: "Muhammad ibn Jarir al-Tabari (d. 310 AH / 923 CE)", author_ar: "محمد بن جرير الطبري (ت ٣١٠هـ)",
    note_en: "The foundational tafsir of the reports of the Companions and their Successors.", note_ar: "أصل كتب التفسير بالمأثور، يجمع أقوال الصحابة والتابعين.",
    source_url: "https://qul.tarteel.ai/resources/tafsir/37" },
  // Hadith collections beyond the two Sahihs (which live in the `hadith` table).
  { id: "hadith-abudawud", kind: "hadith", edition: "abudawud", lang: "ar",
    title_en: "Sunan Abi Dawud", title_ar: "سنن أبي داود", author_en: "Abu Dawud al-Sijistani (d. 275 AH)", author_ar: "أبو داود السجستاني (ت ٢٧٥هـ)",
    note_en: "One of the six canonical collections; grades vary per hadith.", note_ar: "أحد الكتب الستة؛ تتفاوت درجات أحاديثه.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-tirmidhi", kind: "hadith", edition: "tirmidhi", lang: "ar",
    title_en: "Jamiʿ al-Tirmidhi", title_ar: "جامع الترمذي", author_en: "Abu ʿIsa al-Tirmidhi (d. 279 AH)", author_ar: "أبو عيسى الترمذي (ت ٢٧٩هـ)",
    note_en: "One of the six canonical collections; grades vary per hadith.", note_ar: "أحد الكتب الستة؛ تتفاوت درجات أحاديثه.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-nasai", kind: "hadith", edition: "nasai", lang: "ar",
    title_en: "Sunan al-Nasaʾi", title_ar: "سنن النسائي", author_en: "Ahmad ibn Shuʿayb al-Nasaʾi (d. 303 AH)", author_ar: "أحمد بن شعيب النسائي (ت ٣٠٣هـ)",
    note_en: "One of the six canonical collections; grades vary per hadith.", note_ar: "أحد الكتب الستة؛ تتفاوت درجات أحاديثه.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-ibnmajah", kind: "hadith", edition: "ibnmajah", lang: "ar",
    title_en: "Sunan Ibn Majah", title_ar: "سنن ابن ماجه", author_en: "Ibn Majah al-Qazwini (d. 273 AH)", author_ar: "ابن ماجه القزويني (ت ٢٧٣هـ)",
    note_en: "One of the six canonical collections; grades vary per hadith.", note_ar: "أحد الكتب الستة؛ تتفاوت درجات أحاديثه.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-malik", kind: "hadith", edition: "malik", lang: "ar",
    title_en: "al-Muwattaʾ of Imam Malik", title_ar: "موطأ الإمام مالك", author_en: "Malik ibn Anas (d. 179 AH)", author_ar: "مالك بن أنس (ت ١٧٩هـ)",
    note_en: "The earliest surviving compiled collection of hadith and legal practice of Madinah.", note_ar: "من أقدم مصنفات الحديث، يجمع الحديث وعمل أهل المدينة.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-nawawi", kind: "hadith", edition: "nawawi", lang: "ar", core: true,
    title_en: "al-Nawawi's Forty Hadith", title_ar: "الأربعون النووية", author_en: "Yahya ibn Sharaf al-Nawawi (d. 676 AH)", author_ar: "يحيى بن شرف النووي (ت ٦٧٦هـ)",
    note_en: "Forty-two foundational hadith with their sources.", note_ar: "اثنان وأربعون حديثاً جامعاً مع مصادرها.", source_url: "https://github.com/fawazahmed0/hadith-api" },
  { id: "hadith-qudsi", kind: "hadith", edition: "qudsi", lang: "ar", core: true,
    title_en: "Forty Hadith Qudsi", title_ar: "الأربعون القدسية", author_en: "Compiled selection", author_ar: "مجموعة مختارة",
    note_en: "Forty hadith qudsi with their sources.", note_ar: "أربعون حديثاً قدسياً مع مصادرها.", source_url: "https://github.com/fawazahmed0/hadith-api" },
];
