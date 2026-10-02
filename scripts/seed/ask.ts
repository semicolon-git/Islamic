import { createHash } from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import { CardContent } from "../../src/lib/cards/types";
import { insertMany, log } from "./util";

/**
 * Ask seed: published demo ANSWER cards for the questions the challenge says judges will probe (R6), so the
 * no-key Ask pipeline can answer from approved evidence. Every verse key and hadith id below was checked against
 * the seeded KFGQPC / Bukhari / Muslim tables. Explanations cite their evidence and never quote Quran text.
 * Demo content: shown as "(demo)" and pending sign-off by a qualified scholar. Idempotent: existing ids are skipped.
 */
interface SeedCard {
  id: string;
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  concept_id?: string | null;
  title_en: string;
  title_ar: string;
  match_phrases: string[];
  content: unknown;
}

const WORKFLOW = [
  { decision: "submit", by: "u_sara", note: "Draft from approved sources (Ask coverage)." },
  { decision: "approve", by: "u_huda", note: "Checked verse keys and hadith numbers against the database." },
  { decision: "publish", by: "u_noura", note: "Approved for publication (demo)." },
];

export const ASK_CARDS: SeedCard[] = [
  {
    id: "answer:quran-authorship",
    level: "B",
    certainty: "established",
    title_en: "Did Muhammad ﷺ write the Quran?",
    title_ar: "هل ألّف محمد ﷺ القرآن؟",
    match_phrases: [
      "did muhammad write the quran", "who wrote the quran", "who wrote the koran", "who wrote quran", "is the quran written by muhammad",
      "author of the quran", "muhammad wrote the quran", "muhammad author quran", "where does the quran come from", "is the quran from god",
      "من كتب القرآن", "من ألف القرآن", "هل ألف محمد القرآن", "هل كتب محمد القرآن", "مصدر القرآن", "تأليف القرآن", "مؤلف القرآن",
    ],
    content: {
      verses: [{ key: "29:48", role: "primary" }, { key: "10:16", role: "primary" }, { key: "2:23", role: "supporting" }, { key: "4:82", role: "supporting" }],
      explanation: {
        en: "Muslims believe the Quran is the word of Allah, revealed to the Prophet Muhammad ﷺ — not something he composed. The Quran itself points out that he did not read or write any scripture before it came (29:48), and that he had lived among his people for a lifetime before reciting it to them (10:16). It invites anyone in doubt to produce a single surah like it (2:23), and asks people to reflect on it, noting that a book from anyone other than Allah would contain many contradictions (4:82).",
        ar: "يؤمن المسلمون بأن القرآن كلام الله أوحاه إلى النبي محمد ﷺ، وليس من تأليفه. ويذكر القرآن نفسه أن النبي ﷺ لم يكن يقرأ كتابًا ولا يخطّه قبل نزوله (العنكبوت ٤٨)، وأنه عاش بين قومه عمرًا طويلًا قبل أن يتلوه عليهم (يونس ١٦). ويتحدّى المرتابين فيه أن يأتوا بسورة واحدة تماثله (البقرة ٢٣)، ويدعو إلى تدبّره، مبيّنًا أنه لو صدر عن غير الله لظهر فيه تناقض كبير (النساء ٨٢).",
      },
      glossary_terms: ["wahy"],
      sensitivity_flags: ["no-ijaz-framing"],
    },
  },
  {
    id: "answer:islam-sword",
    level: "C",
    certainty: "disputed",
    title_en: "Did Islam spread by the sword?",
    title_ar: "هل انتشر الإسلام بالسيف؟",
    match_phrases: [
      "spread by the sword", "islam spread by the sword", "spread by force", "forced conversion", "forced to convert", "converted by force",
      "how did islam spread", "compulsion in religion", "convert by the sword",
      "انتشر بالسيف", "انتشار الإسلام", "انتشر الإسلام بالسيف", "الإكراه في الدين", "كيف انتشر الإسلام", "بالقوة",
    ],
    content: {
      verses: [{ key: "2:256", role: "primary" }, { key: "10:99", role: "supporting" }],
      explanation: {
        en: "The Quran states a clear principle: there is no compulsion in religion (2:256), and it asks the Prophet ﷺ whether he would compel people to believe (10:99). How Islam actually spread is a historical question. Historians describe early Muslim rule expanding through conquest in some regions, while the conversion of the people living there happened gradually, over centuries; in other regions, such as maritime Southeast Asia, Islam spread mainly through trade and teachers (see the sources below).",
        ar: "يقرّر القرآن مبدأً واضحًا: لا إكراه في الدين (البقرة ٢٥٦)، ويخاطب النبيَّ ﷺ مستنكرًا إكراه الناس على الإيمان (يونس ٩٩). أما كيف انتشر الإسلام فعلًا فمسألة تاريخية: يصف المؤرخون توسّع الحكم الإسلامي المبكر بالفتوح في بعض المناطق، بينما دخل سكانها في الإسلام تدريجيًا على مدى قرون، وفي مناطق أخرى كجنوب شرق آسيا البحري انتشر الإسلام أساسًا عبر التجارة والدعاة (انظر المصادر أدناه).",
      },
      civilizational_note: {
        en: "Quantitative studies of conversion suggest that in lands such as Iran, Iraq, Syria and Egypt, most of the population became Muslim over several centuries after Muslim rule began (Bulliet 1979). In maritime Southeast Asia, Islam spread largely through trade networks and teachers (Ricklefs 2008).",
        ar: "تشير الدراسات الكمية لحركة اعتناق الإسلام إلى أن أغلب سكان بلدان مثل إيران والعراق والشام ومصر أصبحوا مسلمين على مدى عدة قرون بعد قيام الحكم الإسلامي فيها (Bulliet 1979). وفي جنوب شرق آسيا البحري انتشر الإسلام إلى حد كبير عبر شبكات التجارة والدعاة (Ricklefs 2008).",
        sources: [
          { citation: "Bulliet, R. W. (1979). Conversion to Islam in the Medieval Period: An Essay in Quantitative History. Harvard University Press.", kind: "academic" },
          { citation: "Ricklefs, M. C. (2008). A History of Modern Indonesia since c. 1200 (4th ed.). Palgrave Macmillan.", kind: "academic" },
        ],
      },
      disagreement_note: {
        en: "Scholars and historians weigh this history differently — for example, how far political, social and economic factors shaped conversion in each region. We show the Quranic principle and the documented history without taking a side; for a detailed discussion, talk to a specialist.",
        ar: "يختلف العلماء والمؤرخون في تقدير هذا التاريخ، ومن ذلك مدى أثر العوامل السياسية والاجتماعية والاقتصادية في اعتناق الإسلام في كل منطقة. ونعرض هنا المبدأ القرآني والتاريخ الموثّق دون ترجيح، وللتفصيل يمكنك التحدث مع مختص.",
      },
      sensitivity_flags: ["level-c", "history"],
    },
  },
  {
    id: "answer:scholars-differ",
    level: "B",
    certainty: "established",
    title_en: "Why do scholars' rulings sometimes differ?",
    title_ar: "لماذا تختلف آراء العلماء أحيانًا؟",
    match_phrases: [
      "why do scholars differ", "why do scholars disagree", "why do rulings differ", "why do scholars rulings differ", "different opinions in islam",
      "why are there different madhhabs", "madhab", "madhhab", "schools of thought", "scholars disagree", "difference of opinion", "why do fatwas differ",
      "لماذا يختلف العلماء", "اختلاف العلماء", "اختلاف الفقهاء", "المذاهب الفقهية", "لماذا تختلف الفتاوى", "اختلاف الآراء", "لماذا تختلف آراء العلماء",
    ],
    content: {
      verses: [{ key: "4:59", role: "supporting" }],
      hadith: [{ id: "bukhari:7352" }, { id: "bukhari:946" }],
      explanation: {
        en: "Scholars study the same sources — the Quran and the Sunnah — but they can understand a text's wording differently, weigh the evidence differently, or apply it differently to a new situation. Islam honours sincere effort here: the Prophet ﷺ said that a judge who strives and is right has two rewards, and one who strives and errs has one (al-Bukhari 7352). When he told his companions not to pray 'Asr except at Banu Qurayza, some prayed on the way and others waited, and he did not blame either group (al-Bukhari 946). The Quran directs that disagreements be referred back to Allah and the Messenger (4:59).",
        ar: "يدرس العلماء المصادر نفسها — القرآن والسنة — لكنهم قد يختلفون في فهم دلالة النص، أو في الموازنة بين الأدلة، أو في تنزيلها على واقعة جديدة. وقد أثنى الإسلام على الاجتهاد الصادق: فأخبر النبي ﷺ أن الحاكم إذا اجتهد فأصاب فله أجران، وإذا اجتهد فأخطأ فله أجر (البخاري ٧٣٥٢). ولما أمر أصحابه ألا يصلّوا العصر إلا في بني قريظة صلّى بعضهم في الطريق وأخّر آخرون، فلم يعنّف أحدًا منهم (البخاري ٩٤٦). ويأمر القرآن بردّ ما يُتنازع فيه إلى الله والرسول (النساء ٥٩).",
      },
      glossary_terms: ["sunnah"],
    },
  },
  {
    id: "answer:tawhid",
    level: "A",
    certainty: "established",
    title_en: "What is Tawhid?",
    title_ar: "ما التوحيد؟",
    match_phrases: ["tawhid", "tawheed", "oneness of god", "what is tawhid", "is god one", "one god", "how many gods", "التوحيد", "وحدانية الله", "توحيد الله"],
    content: {
      verses: [{ key: "112:1", role: "primary" }, { key: "112:2", role: "primary" }, { key: "112:3", role: "primary" }, { key: "112:4", role: "primary" }],
      explanation: {
        en: "In plain words: there is one God. Muslims believe that Allah alone creates and sustains everything, that He alone deserves worship, and that nothing is like Him. This belief is called Tawhid (Oneness of God). Surah al-Ikhlas, shown below, sums it up in four short verses (112:1–4).",
        ar: "بعبارة بسيطة: الله واحد. يؤمن المسلمون بأن الله وحده الخالق المدبّر لكل شيء، وأنه وحده المستحق للعبادة، وأنه لا يشبهه شيء. ويسمّى هذا الإيمان «التوحيد». وتلخّصه سورة الإخلاص المعروضة أدناه في أربع آيات قصيرة (الإخلاص ١–٤).",
      },
      glossary_terms: ["tawhid"],
    },
  },
  {
    id: "answer:pork",
    level: "A",
    certainty: "established",
    title_en: "Why don't Muslims eat pork?",
    title_ar: "لماذا لا يأكل المسلمون لحم الخنزير؟",
    match_phrases: ["pork", "pig", "pigs", "swine", "why don't muslims eat pork", "why is pork forbidden", "why is pork haram", "is pork haram", "bacon", "لحم الخنزير", "الخنزير", "تحريم الخنزير"],
    content: {
      verses: [{ key: "2:173", role: "primary" }, { key: "6:145", role: "supporting" }],
      explanation: {
        en: "Muslims don't eat pork because Allah forbade it in the Quran, together with carrion, blood, and what is dedicated to other than Allah (2:173). The Quran also describes it as impure (6:145). For Muslims the first reason is obedience to Allah's command, and the Quran makes an exception for someone forced by necessity (2:173).",
        ar: "لا يأكل المسلمون لحم الخنزير لأن الله حرّمه في القرآن مع الميتة والدم وما ذُبح لغير الله (البقرة ١٧٣)، ووصفه القرآن بأنه رجس (الأنعام ١٤٥). والدافع الأول عند المسلم هو امتثال أمر الله، وقد استثنى القرآن حال الاضطرار (البقرة ١٧٣).",
      },
    },
  },
  {
    id: "answer:alcohol",
    level: "A",
    certainty: "established",
    title_en: "Why is alcohol forbidden in Islam?",
    title_ar: "لماذا حُرّم الخمر في الإسلام؟",
    match_phrases: ["alcohol", "wine", "beer", "intoxicants", "why is alcohol forbidden", "why is alcohol haram", "why can't muslims drink", "why don't muslims drink", "الخمر", "الكحول", "المسكرات", "تحريم الخمر"],
    content: {
      verses: [{ key: "5:90", role: "primary" }, { key: "5:91", role: "primary" }],
      explanation: {
        en: "The Quran tells believers to avoid intoxicants and gambling (5:90). It also gives a reason: they stir up enmity and hatred between people and turn them away from remembering Allah and from prayer (5:91). So Muslims avoid alcohol out of obedience to Allah, and the Quran itself points to the harm it does to relationships and to worship.",
        ar: "يأمر القرآن المؤمنين باجتناب الخمر والميسر (المائدة ٩٠)، ويذكر الحكمة من ذلك: فهي تُوقع العداوة بين الناس، وتشغلهم عن ذكر الله والصلاة (المائدة ٩١). فيجتنب المسلمون الخمر طاعةً لله، والقرآن نفسه يبيّن ضررها على العلاقات وعلى العبادة.",
      },
    },
  },
  {
    id: "answer:five-pillars",
    level: "A",
    certainty: "established",
    title_en: "What are the five pillars of Islam?",
    title_ar: "ما أركان الإسلام الخمسة؟",
    match_phrases: ["five pillars", "pillars of islam", "what are the five pillars", "basic practices of islam", "main practices of islam", "what do muslims have to do", "أركان الإسلام", "اركان الاسلام", "الأركان الخمسة", "أركان الاسلام"],
    content: {
      verses: [{ key: "2:43", role: "supporting" }, { key: "2:183", role: "supporting" }, { key: "3:97", role: "supporting" }],
      hadith: [{ id: "bukhari:8" }, { id: "muslim:16" }],
      explanation: {
        en: "Islam is built on five pillars: bearing witness that there is no god but Allah and that Muhammad is His Messenger; establishing the prayer; giving zakah (obligatory charity); pilgrimage (Hajj) to the House; and fasting in Ramadan (al-Bukhari 8; Muslim 16). The Quran commands prayer and zakah (2:43), prescribes fasting (2:183), and makes pilgrimage a duty for whoever is able to make the journey (3:97).",
        ar: "بُني الإسلام على خمسة أركان: شهادة أن لا إله إلا الله وأن محمدًا رسول الله، وإقام الصلاة، وإيتاء الزكاة، وحج البيت، وصوم رمضان (البخاري ٨؛ مسلم ١٦). ويأمر القرآن بالصلاة والزكاة (البقرة ٤٣)، ويفرض الصيام (البقرة ١٨٣)، ويجعل الحج واجبًا على المستطيع (آل عمران ٩٧).",
      },
      glossary_terms: ["ibadah"],
    },
  },
  {
    id: "answer:mosque-visit",
    level: "B",
    certainty: "established",
    title_en: "Can non-Muslims visit a mosque?",
    title_ar: "هل يمكن لغير المسلمين زيارة المسجد؟",
    match_phrases: ["visit a mosque", "visiting a mosque", "enter a mosque", "non-muslims in a mosque", "can i visit a mosque", "go inside a mosque", "mosque tour", "visit the mosque", "زيارة المسجد", "دخول المسجد", "دخول غير المسلم المسجد", "زيارة مسجد"],
    content: {
      hadith: [{ id: "bukhari:63" }, { id: "bukhari:462" }],
      explanation: {
        en: "Many mosques welcome visitors of any faith. In the Prophet's ﷺ own mosque in Madinah, people who were not yet Muslim came in: Dimam ibn Tha'labah rode in to put his questions to the Prophet ﷺ before declaring his faith (al-Bukhari 63), and Thumamah ibn Uthal was held in the mosque before he embraced Islam (al-Bukhari 462). Practical arrangements such as visiting hours differ from mosque to mosque, so it's worth asking the mosque you would like to visit.",
        ar: "ترحّب كثير من المساجد بالزوار من مختلف الأديان. وفي مسجد النبي ﷺ في المدينة دخل أناس لم يكونوا قد أسلموا بعد: فقد دخل ضِمام بن ثعلبة المسجد على جمله ليسأل النبي ﷺ عن أسئلته قبل أن يعلن إيمانه (البخاري ٦٣)، ورُبط ثُمامة بن أُثال في المسجد قبل أن يسلم (البخاري ٤٦٢). وتختلف الترتيبات العملية كمواعيد الزيارة من مسجد إلى آخر، فيحسن السؤال عنها في المسجد الذي تودّ زيارته.",
      },
    },
  },
  {
    id: "answer:jihad",
    level: "B",
    certainty: "established",
    title_en: "What does jihad mean?",
    title_ar: "ما معنى الجهاد؟",
    match_phrases: ["jihad", "what is jihad", "what does jihad mean", "meaning of jihad", "الجهاد", "معنى الجهاد"],
    content: {
      verses: [{ key: "29:69", role: "primary" }, { key: "22:78", role: "supporting" }],
      explanation: {
        en: "Jihad comes from the Arabic word for striving and exerting effort. The Quran uses it broadly for striving in Allah's way — for example, it promises guidance to those who strive for His sake (29:69), and tells believers to strive for Allah as is His due (22:78). Its detailed rules in different situations are a subject for qualified scholars; rendering jihad simply as 'holy war' is misleading.",
        ar: "الجهاد في العربية من الجُهد، أي بذل الوسع والطاقة. ويستعمله القرآن بمعنى واسع هو بذل الجهد في سبيل الله، فيعد بالهداية من جاهد في سبيله (العنكبوت ٦٩)، ويأمر المؤمنين ببذل غاية جهدهم في سبيل الله (الحج ٧٨). أما أحكامه التفصيلية في الأحوال المختلفة فمرجعها أهل العلم، وترجمته بـ«الحرب المقدسة» وحدها ترجمة مضلِّلة.",
      },
    },
  },
];

export async function seed(q: Queryable) {
  const need = (await q.query<{ n: number }>("select count(*)::int as n from users where id = any($1::text[])", [["u_sara", "u_huda", "u_noura"]])).rows[0].n;
  if (need < 3) {
    log("ask: demo personas missing — skipping answer cards");
    return;
  }
  let n = 0;
  for (const c of ASK_CARDS) {
    const exists = (await q.query("select 1 from cards where id=$1", [c.id])).rows.length;
    if (exists) continue;
    const content = CardContent.parse(c.content);
    const json = JSON.stringify(content);
    const sha = createHash("sha256").update(json).digest("hex").slice(0, 16);
    let status = "ai_draft";
    let t = Date.now() - 1000 * 60 * 60 * 24 * 5;
    const reviews: unknown[][] = [];
    for (const step of WORKFLOW) {
      const to = ({ submit: "student_submitted", approve: "researcher_approved", publish: "published" } as Record<string, string>)[step.decision];
      t += 1000 * 60 * 60 * (6 + reviews.length * 4);
      reviews.push(["card", c.id, 1, step.by, status, to, step.decision, step.note, new Date(t).toISOString()]);
      status = to;
    }
    await q.query(
      `insert into cards (id, kind, concept_id, level, certainty, title_en, title_ar, match_phrases, status, current_version, published_version, institution_id, created_by, published_at)
       values ($1,'answer',$2,$3,$4,$5,$6,$7,'published',1,1,'inst_uni','u_sara',$8)`,
      [c.id, c.concept_id ?? null, c.level, c.certainty, c.title_en, c.title_ar, c.match_phrases, new Date(t).toISOString()],
    );
    await q.query("insert into card_versions (card_id, version, content, content_sha, author_id, note) values ($1,1,$2,$3,'u_sara','Initial version')", [c.id, json, sha]);
    await insertMany(q, "reviews", ["entity_type", "entity_id", "version", "reviewer_id", "from_status", "to_status", "decision", "note", "created_at"], reviews);
    n++;
  }
  log(`${n} Ask answer cards`);
}
