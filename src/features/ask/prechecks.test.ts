import { describe, expect, it } from "vitest";
import {
  arabicSpans,
  asksIfVerse,
  detectCSignal,
  detectFloorD,
  detectFraming,
  detectGlossaryQuestion,
  detectKnownSaying,
  detectLoadedTerm,
  detectOutOfScope,
  hadithClaim,
  isContextDependent,
  isHadithRequest,
  isRulingQuestion,
  subSpans,
} from "./prechecks";
import { fixture } from "./__fixtures__/deps";

describe("level-D floors (narrow, first-person / personal case)", () => {
  it.each([
    "Is it haram for me to work in a bank?",
    "is it permissible for us to delay the prayer?",
    "Is it allowed for my wife to travel alone?",
    "Am I allowed to eat gelatin?",
    "Do I have to fast if I'm diabetic?",
    "Is my marriage valid if my father did not attend?",
    "My fast — does it still count if I used an inhaler?",
    "Does this break my fast?",
    "Should I divorce my husband?",
    "Asking for a friend: is drinking haram?",
    "My brother wants to know if his nikah is valid",
    "Give me a fatwa about my inheritance",
    "Just answer yes or no: is it haram?",
    "هل يجوز لي أن أصلي في البيت؟",
    "هل يحل لي هذا المال؟",
    "هل علي قضاء الصيام؟",
    "هل زواجي صحيح؟",
    "طلقت زوجتي، هل يقع الطلاق؟",
    "أسأل عن صديقي: هل يجوز ذلك؟",
    "أفتني في مسألتي",
  ])("fires on %s", (q) => {
    expect(detectFloorD(q)).not.toBeNull();
  });

  it.each([
    "Why do Muslims fast?",
    "Can I visit a mosque as a non-Muslim?",
    "What are the five pillars of Islam?",
    "Is pork haram?",
    "Why is alcohol forbidden in Islam?",
    "Do Muslims worship the Kaaba?",
    "What does the Quran say about marriage?",
    "هل يعبد المسلمون الكعبة؟",
    "لماذا يصوم المسلمون؟",
    "ما معنى التوحيد؟",
    "هل يمكنني زيارة مسجد وأنا غير مسلم؟",
  ])("does not fire on %s (no over-refusal)", (q) => {
    expect(detectFloorD(q)).toBeNull();
  });
});

describe("X: out of scope", () => {
  it.each([
    ["Will my Christian neighbour go to hell?", "fate"],
    ["Is my uncle a kafir because he stopped praying?", "judge_person"],
    ["Are Shias really Muslims?", "judge_group"],
    ["Do non-Muslims go to hell?", "fate"],
    ["My wife and I argue about money. Who is right?", "private_dispute"],
    ["هل الشيعة كفار؟", "judge_person"],
    ["هل سيدخل جاري المسيحي النار؟", "fate"],
    ["خلاف بيني وبين أخي على الميراث", "private_dispute"],
  ])("declines %s", (q, kind) => {
    expect(detectOutOfScope(q)?.kind).toBe(kind);
  });

  it.each(["What is a kafir?", "Is there a hell in Islam?", "What do Muslims believe about paradise?", "ما هي الجنة؟", "Why do Muslims pray?", "Is the Quran a book?"])(
    "answers concept questions: %s",
    (q) => {
      expect(detectOutOfScope(q)).toBeNull();
    },
  );
});

describe("hadith requests", () => {
  it.each([
    "Give me a hadith that says smoking is haram",
    "Is there a hadith about patience?",
    "Did the Prophet say 'seek knowledge even in China'?",
    "Is this a hadith?",
    "أعطني حديثا عن الصبر",
    "هل قال النبي اطلبوا العلم ولو بالصين؟",
    "هل يوجد حديث في فضل الصدقة؟",
  ])("detects %s", (q) => expect(isHadithRequest(q)).toBe(true));

  it.each(["What is a hadith?", "Why do Muslims fast?", "ما معنى الحديث النبوي"])("ignores %s", (q) => expect(isHadithRequest(q)).toBe(false));

  it("extracts the claim", () => {
    expect(hadithClaim("Give me a hadith that says smoking is haram?")).toBe("smoking is haram");
    expect(hadithClaim("Did the Prophet really say that patience is light?")).toBe("patience is light");
  });

  it("knows sayings that are not in Bukhari/Muslim", () => {
    expect(detectKnownSaying("اطلبوا العلم ولو بالصين")?.id).toBe("seek-knowledge-china");
    expect(detectKnownSaying("Seek knowledge even if it is in China")?.id).toBe("seek-knowledge-china");
    expect(detectKnownSaying("النظافة من الإيمان")?.id).toBe("cleanliness-from-faith");
    expect(detectKnownSaying("cleanliness is half of faith")).toBeNull(); // that wording IS in Sahih Muslim (223)
  });
});

describe("quote auditor helpers", () => {
  it("finds quoted and long unquoted Arabic spans", () => {
    expect(arabicSpans("Is «النظافة من الإيمان» a verse?")).toEqual([{ text: "النظافة من الإيمان", quoted: true }]);
    const s = arabicSpans("Is this a verse: هو الذي جعل القمر ضياء والشمس نورا");
    expect(s[0]).toMatchObject({ quoted: false });
    expect(s[0].text).toContain("هو الذي جعل");
    expect(arabicSpans("ما معنى التوحيد")).toEqual([]); // 3 words: not a quote candidate
  });
  it("trims framing words from unquoted runs", () => {
    const subs = subSpans({ text: "هل النظافة من الإيمان آية في القرآن", quoted: false });
    expect(subs).toContain("النظافة من الإيمان");
  });
  it("recognises 'is this a verse?' intents", () => {
    expect(asksIfVerse("Is this a verse: …")).toBe(true);
    expect(asksIfVerse("Which surah says this?")).toBe(true);
    expect(asksIfVerse("هل هذه آية؟")).toBe(true);
    expect(asksIfVerse("Why do Muslims fast?")).toBe(false);
  });
});

describe("glossary questions", () => {
  const { glossary } = fixture().catalogue;
  it.each([
    ["What does tawhid mean?", "tawhid", "meaning"],
    ["Translate tawhid", "tawhid", "translate"],
    ["How do you translate Tawhid into English?", "tawhid", "translate"],
    ["I'm new to Islam — what is Tawhid?", "tawhid", "meaning"],
    ["What is the meaning of sunnah?", "sunnah", "meaning"],
    ["define fatwa", "fatwa", "meaning"],
    ["ما معنى التوحيد؟", "tawhid", "meaning"],
    ["كيف أترجم كلمة التوحيد إلى الإنجليزية؟", "tawhid", "translate"],
    ["ماذا تعني كلمة الشريعة؟", "shariah", "meaning"],
  ])("%s → %s", (q, id, mode) => {
    const r = detectGlossaryQuestion(q, glossary);
    expect(r?.term.id).toBe(id);
    expect(r?.mode).toBe(mode);
  });
  it.each(["Why do Muslims believe in tawhid so strongly and pray five times?", "What is the moon in the Quran?", "Why do Muslims fast?"])("ignores %s", (q) => {
    expect(detectGlossaryQuestion(q, glossary)).toBeNull();
  });
});

describe("loaded terms, framing, C-signals, rulings", () => {
  it("term-locks culturally loaded words", () => {
    expect(detectLoadedTerm("Why do Muslims worship a moon god?")?.id).toBe("moon-god");
    expect(detectLoadedTerm("هل يعبد المسلمون إله القمر؟")?.id).toBe("moon-god");
    expect(detectLoadedTerm("Is jihad a holy war?")?.id).toBe("holy-war");
    expect(detectLoadedTerm("Do Muslims call us infidels?")?.id).toBe("infidel");
    expect(detectLoadedTerm("What does the moon mean in Islam?")).toBeNull();
  });
  it("loaded-term corrections never contain Quran text in ornate brackets", () => {
    expect(JSON.stringify(detectLoadedTerm("moon god"))).not.toMatch(/﴿/);
  });
  it("detects science-miracle and number-pattern bait", () => {
    expect(detectFraming("NASA confirmed the moon split")).toBe("framing_science");
    expect(detectFraming("Is it a scientific miracle?")).toBe("framing_science");
    expect(detectFraming("Is 'day' mentioned 365 times a miracle?")).toBe("framing_numbers");
    expect(detectFraming("هل هذا إعجاز علمي؟")).toBe("framing_science");
    expect(detectFraming("Why do Muslims fast?")).toBeNull();
  });
  it("detects level-C signals and context-dependent follow-ups", () => {
    expect(detectCSignal("Do all Muslims agree on this?")).toBe(true);
    expect(detectCSignal("Which view is correct?")).toBe(true);
    expect(detectCSignal("هل يتفق جميع المسلمين على ذلك؟")).toBe(true);
    expect(detectCSignal("What is the strongest opinion?")).toBe(true);
    expect(detectCSignal("Why do scholars differ?")).toBe(false);
    expect(isContextDependent("Do all Muslims agree on this?")).toBe(true);
    expect(isContextDependent("Do all Muslims agree that music is forbidden?")).toBe(false);
  });
  it("detects generic ruling questions", () => {
    expect(isRulingQuestion("Is it permissible to take a mortgage?")).toBe(true);
    expect(isRulingQuestion("Is music haram?")).toBe(true);
    expect(isRulingQuestion("ما حكم الموسيقى؟")).toBe(true);
    expect(isRulingQuestion("Why do Muslims fast?")).toBe(false);
  });
});
