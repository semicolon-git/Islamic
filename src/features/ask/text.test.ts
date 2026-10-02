import { describe, expect, it } from "vitest";
import { containsPhrase, detectLang, phraseNorm, redactPII, stemAr, stemEn, tokenize } from "./text";

describe("detectLang", () => {
  it("detects Arabic and English", () => {
    expect(detectLang("لماذا يصوم المسلمون؟")).toBe("ar");
    expect(detectLang("Why do Muslims fast?")).toBe("en");
  });
  it("keeps English when an Arabic quote is embedded in an English question", () => {
    expect(detectLang("Is this a verse: هو الذي جعل القمر ضياء والشمس نورا")).toBe("en");
    expect(detectLang("What does التوحيد mean?")).toBe("en");
  });
  it("keeps Arabic with a single English word", () => {
    expect(detectLang("ما معنى tawhid؟")).toBe("ar");
  });
  it("falls back when there are no letters", () => {
    expect(detectLang("10:5 ?", "ar")).toBe("ar");
  });
});

describe("redactPII", () => {
  it("redacts e-mails and phone numbers", () => {
    const r = redactPII("Email me at sara.h@example.com or call +966 55 123 4567");
    expect(r.text).toBe("Email me at [email] or call [phone]");
    expect(r.redacted).toEqual(["email", "phone"]);
  });
  it("redacts Eastern Arabic digits", () => {
    expect(redactPII("رقمي ٠٥٥١٢٣٤٥٦٧").text).toBe("رقمي [phone]");
  });
  it("keeps verse keys and short numbers", () => {
    expect(redactPII("What does 10:5 say about 27 moons?").text).toBe("What does 10:5 say about 27 moons?");
  });
});

describe("stemming and tokens", () => {
  it("stems English lightly", () => {
    expect(stemEn("fasting")).toBe("fast");
    expect(stemEn("fasts")).toBe("fast");
    expect(stemEn("pillars")).toBe("pillar");
    expect(stemEn("forbidden")).toBe("forbid");
    expect(stemEn("worshipping")).toBe("worship");
  });
  it("stems Arabic lightly", () => {
    expect(stemAr("الصيام")).toBe("صيام");
    expect(stemAr("والقمر")).toBe("قمر");
  });
  it("drops stop words and generic words from content", () => {
    const t = tokenize("Why do Muslims worship the Kaaba?");
    expect(t.content).toEqual(["worship", "kaaba"]);
    expect(tokenize("لماذا يعبد المسلمون الكعبة").content).toEqual(["يعبد", "كعب"]);
  });
  it("phrase containment works on word boundaries in both scripts", () => {
    expect(containsPhrase(phraseNorm("Why is pork forbidden?"), phraseNorm("pork"))).toBe(true);
    expect(containsPhrase(phraseNorm("porkchop"), phraseNorm("pork"))).toBe(false);
    expect(containsPhrase(phraseNorm("لماذا يحرم لحم الخنزير"), phraseNorm("لحم الخنزير"))).toBe(true);
  });
});
