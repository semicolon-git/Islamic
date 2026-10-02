import type { AskResult } from "@/features/ask/types";
import { makeT, messages } from "@/i18n";
import type { CheckOutcome, CheckSpec, EvalCase } from "./types";

/** Evaluate one case's must / must_not checks against an AskResult (pure). */

/** Compile a pattern; a leading "(?i)" means case-insensitive (JSON-friendly). */
export function compile(pattern: string): RegExp {
  const ci = pattern.startsWith("(?i)");
  return new RegExp(ci ? pattern.slice(4) : pattern, ci ? "iu" : "u");
}

/** The answer's own words: explanations, disagreement views and term-lock corrections (quoted sources excluded). */
export function proseOf(r: AskResult): string[] {
  const out: string[] = [];
  for (const b of r.blocks) {
    if (b.type === "explanation") out.push(b.text);
    if (b.type === "disagreement") {
      if (b.text) out.push(b.text);
      b.views.forEach((v) => out.push(v.text));
    }
    if (b.type === "term_lock") out.push(r.lang === "ar" ? b.correction_ar : b.correction_en);
  }
  return out;
}

/** Prose plus rendered notices and referral copy, in the answer's language. */
export function textOf(r: AskResult): string[] {
  const t = makeT(messages, r.lang);
  const out = proseOf(r);
  for (const b of r.blocks) {
    if (b.type === "notice") {
      const base = b.kind === "related_card" ? `ask.n.related_card.${b.vars?.related ?? "card"}` : `ask.n.${b.kind}`;
      out.push(t(`${base}.t`, b.vars), t(`${base}.b`, b.vars));
    }
    if (b.type === "referral") out.push(t(`ask.ref.${b.reason}.t`), t(`ask.ref.${b.reason}.b`));
  }
  return out;
}

function evidenceIds(r: AskResult): Set<string> {
  return new Set([...r.trace.evidence_ids, ...r.evidence.map((e) => e.id)]);
}
const noticeKinds = (r: AskResult) => new Set(r.blocks.flatMap((b) => (b.type === "notice" ? [b.kind] : [])));
const blockTypes = (r: AskResult) => new Set(r.blocks.map((b) => b.type));

export function describe(spec: CheckSpec): string {
  const [k, v] = Object.entries(spec)[0];
  return `${k} ${Array.isArray(v) ? v.join(" | ") : v}`;
}

/** Does the spec hold for this result? */
export function holds(spec: CheckSpec, r: AskResult): boolean {
  if ("cites" in spec) return evidenceIds(r).has(spec.cites);
  if ("cites_any" in spec) {
    const ids = evidenceIds(r);
    return spec.cites_any.some((c) => ids.has(c));
  }
  if ("block" in spec) return blockTypes(r).has(spec.block as never);
  if ("block_any" in spec) {
    const bt = blockTypes(r);
    return spec.block_any.some((b) => bt.has(b as never));
  }
  if ("notice" in spec) return noticeKinds(r).has(spec.notice as never);
  if ("notice_any" in spec) {
    const nk = noticeKinds(r);
    return spec.notice_any.some((n) => nk.has(n as never));
  }
  if ("prose" in spec) {
    const re = compile(spec.prose);
    return proseOf(r).some((p) => re.test(p));
  }
  if ("text" in spec) {
    const re = compile(spec.text);
    return textOf(r).some((p) => re.test(p));
  }
  return false;
}

export function evaluateChecks(c: EvalCase, r: AskResult): { levelOk: boolean; routeOk: boolean; checks: CheckOutcome[]; failures: string[] } {
  const checks: CheckOutcome[] = [];
  const levelOk = r.level === c.expect.level;
  const routeOk = c.expect.routes.includes(r.route);
  checks.push({ label: `level = ${c.expect.level}`, ok: levelOk });
  checks.push({ label: `route ∈ {${c.expect.routes.join(", ")}}`, ok: routeOk });
  for (const m of c.must) checks.push({ label: `must ${describe(m)}`, ok: holds(m, r) });
  for (const m of c.must_not) checks.push({ label: `must not ${describe(m)}`, ok: !holds(m, r) });
  if (c.expect.verse_top2) checks.push({ label: `verse ${c.expect.verse_top2} in top 2`, ok: misquoteTop2(r, c.expect.verse_top2) });
  return { levelOk, routeOk, checks, failures: checks.filter((x) => !x.ok).map((x) => x.label) };
}

/** Is the expected ayah among the top-2 candidates of a misquote block (or the exact verse found)? */
export function misquoteTop2(r: AskResult, key: string): boolean {
  for (const b of r.blocks) {
    if (b.type === "misquote" && b.candidates.slice(0, 2).some((c) => c.verses.includes(key))) return true;
  }
  return r.route === "verse" && r.blocks.some((b) => b.type === "verses" && b.verses.some((v) => v.key === key));
}
