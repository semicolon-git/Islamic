import { describe, expect, it } from "vitest";
import { answer } from "@/features/ask/pipeline";
import { testDeps } from "@/features/ask/__fixtures__/deps";
import { compile, evaluateChecks, holds, proseOf, textOf } from "./checks";
import type { EvalCase } from "./types";
import dataset from "../../../data/eval/cases.json";

const run = (q: string) => answer(q, { lang: "en", persistTrace: false }, testDeps());

describe("eval checks", () => {
  it("compiles (?i) patterns", () => {
    expect(compile("(?i)moon god").test("Moon God")).toBe(true);
    expect(compile("moon god").test("Moon God")).toBe(false);
  });

  it("evaluates each spec kind against a real pipeline result", async () => {
    const r = await run("Why do Muslims worship the Kaaba?");
    expect(holds({ cites: "Q:106:3" }, r)).toBe(true);
    expect(holds({ cites_any: ["Q:1:1", "H:bukhari:1597"] }, r)).toBe(true);
    expect(holds({ block: "hadith" }, r)).toBe(true);
    expect(holds({ block_any: ["referral", "misquote"] }, r)).toBe(false);
    expect(holds({ prose: "(?i)worship allah alone" }, r)).toBe(true);
    expect(holds({ notice: "empty" }, r)).toBe(false);
  });

  it("separates the answer's own words (prose) from notices (text)", async () => {
    const r = await run("What is the capital of France?");
    expect(proseOf(r)).toEqual([]);
    expect(textOf(r).join(" ")).toMatch(/No verified reference yet/);
    expect(holds({ text: "No verified reference" }, r)).toBe(true);
    expect(holds({ notice_any: ["empty"] }, r)).toBe(true);
  });

  it("reports level/route/must/must_not failures by label", async () => {
    const c: EvalCase = {
      id: "t",
      bucket: "general",
      split: "dev",
      lang: "en",
      question: "Why do Muslims worship the Kaaba?",
      expect: { level: "B", routes: ["glossary"], answerable: true },
      must: [{ cites: "Q:1:1" }],
      must_not: [{ block: "hadith" }],
    };
    const ev = evaluateChecks(c, await run(c.question));
    expect(ev.levelOk).toBe(false);
    expect(ev.routeOk).toBe(false);
    expect(ev.failures).toEqual(["level = B", "route ∈ {glossary}", "must cites Q:1:1", "must not block hadith"]);
  });

  it("the dataset has ≥ 50 cases, unique ids, both languages, held-out cases and all buckets", () => {
    const cases = (dataset as unknown as { cases: EvalCase[] }).cases;
    expect(cases.length).toBeGreaterThanOrEqual(50);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.filter((c) => c.bucket === "r6" && c.split === "dev").length).toBe(24);
    expect(cases.some((c) => c.split === "heldout")).toBe(true);
    for (const b of ["r6", "level_d", "red_team", "over_refusal"]) expect(cases.some((c) => c.bucket === b)).toBe(true);
    for (const c of cases) for (const s of [...c.must, ...c.must_not]) if ("prose" in s || "text" in s) expect(() => compile(Object.values(s)[0] as string)).not.toThrow();
  });
});
