"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Play, TriangleAlert, ChevronDown, Timer, FlaskConical, ShieldAlert, Info, LoaderCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmtDate, fmtNumber } from "@/i18n/core";
import type { CaseResult, EvalRun, Metric, SplitSummary } from "../types";

type Split = "all" | "dev" | "heldout";
const LEVELS = ["A", "B", "C", "D", "X"] as const;
const ORDER = { A: 0, B: 1, C: 2, D: 3, X: 4 } as const;

function pct(x: number, locale: "en" | "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { style: "percent", maximumFractionDigits: 1 }).format(x);
}

function targetText(m: Metric, locale: "en" | "ar") {
  const op = m.target.op === "eq" ? "=" : m.target.op === "lte" ? "≤" : "≥";
  return `${op} ${pct(m.target.value, locale)}`;
}

/** A metric tile: k/n first (the honest number), then the rate, the Wilson interval drawn on a 0–100% track, and the target. */
function MetricTile({ m }: { m: Metric }) {
  const { t, locale } = useI18n();
  const status = m.met === null ? "none" : m.met ? "met" : "miss";
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4 shadow-card" data-metric={m.id} data-status={status}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-2 leading-snug">{t(`eval.m.${m.id}`)}</h3>
        {status === "met" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ok shrink-0">
            <CircleCheck className="size-3.5" aria-hidden />
            {t("eval.met")}
          </span>
        ) : status === "miss" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-bad shrink-0">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t("eval.notMet")}
          </span>
        ) : null}
      </div>
      {m.n ? (
        <>
          <div className="flex items-baseline gap-2">
            <bdi className="text-[1.9rem] font-semibold text-ink tabular leading-none" dir="ltr">
              {fmtNumber(m.k, locale)}
              <span className="text-ink-3 text-[1.2rem]">/{fmtNumber(m.n, locale)}</span>
            </bdi>
            <bdi className="text-sm text-ink-2 tabular">{pct(m.rate ?? 0, locale)}</bdi>
          </div>
          {m.ci && (
            <div className="flex flex-col gap-1.5">
              <div className="relative h-2 rounded-full bg-surface-2" aria-hidden>
                <span className="absolute inset-y-0 rounded-full bg-accent/30" style={{ insetInlineStart: `${m.ci[0] * 100}%`, width: `${Math.max((m.ci[1] - m.ci[0]) * 100, 1)}%` }} />
                <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rtl:translate-x-1/2 size-3 rounded-full bg-accent ring-2 ring-surface" style={{ insetInlineStart: `${(m.rate ?? 0) * 100}%` }} />
                <span className="absolute -top-0.5 h-3 w-0.5 bg-ink-3" style={{ insetInlineStart: `${m.target.value * 100}%` }} />
              </div>
              <p className="text-xs text-ink-3 tabular">{t("eval.ci", { lo: pct(m.ci[0], locale), hi: pct(m.ci[1], locale) })}</p>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">{t("eval.noData")}</p>
      )}
      <p className="text-xs text-ink-3 mt-auto">{t("eval.target", { target: targetText(m, locale) })}</p>
    </div>
  );
}

function Confusion({ s }: { s: SplitSummary }) {
  const { t, locale } = useI18n();
  const rows = LEVELS.filter((e) => s.confusion[e]);
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4 shadow-card">
      <div>
        <h2 className="text-base font-semibold text-ink">{t("eval.confusion")}</h2>
        <p className="text-sm text-ink-2 mt-0.5 max-w-[60ch]">{t("eval.confusion.desc")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-sm" dir="ltr">
          <caption className="sr-only">{t("eval.confusion")}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-xs font-medium text-ink-3 px-2 text-start">
                {t("eval.confusion.expected")} ↓ / {t("eval.confusion.actual")} →
              </th>
              {LEVELS.map((a) => (
                <th key={a} scope="col" className="w-14 text-center font-semibold text-ink-2">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e}>
                <th scope="row" className="text-center font-semibold text-ink-2 px-2">
                  {e}
                </th>
                {LEVELS.map((a) => {
                  const n = s.confusion[e]?.[a] ?? 0;
                  const diag = e === a;
                  const under = e === "D" && a !== "D" && a !== "X" && ORDER[a] < ORDER.D && n > 0;
                  return (
                    <td
                      key={a}
                      title={t("eval.confusion.cell", { n, e, a })}
                      data-cell={`${e}${a}`}
                      className={cn(
                        "h-12 w-14 rounded-[8px] text-center tabular font-semibold",
                        n === 0 && "text-ink-3 bg-surface-2/50",
                        n > 0 && diag && "bg-accent-soft text-ink ring-1 ring-inset ring-accent/50",
                        n > 0 && !diag && !under && "bg-warn-soft text-warn",
                        under && "bg-bad text-white ring-2 ring-bad/40",
                      )}
                    >
                      {under && <ShieldAlert className="inline size-3.5 me-0.5 -mt-0.5" aria-hidden />}
                      {fmtNumber(n, locale)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-3">
        <span className="inline-block size-3 rounded-[3px] bg-bad" aria-hidden /> {t("eval.confusion.under")}
      </p>
    </section>
  );
}

function CaseTrace({ c }: { c: CaseResult }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2 p-4 bg-surface-2/50 rounded-[12px] text-sm" dir="ltr">
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.checks")}</h4>
          <ul className="flex flex-col gap-1">
            {c.checks.map((x, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {x.ok ? <CircleCheck className="size-4 text-ok shrink-0 mt-0.5" aria-hidden /> : <CircleX className="size-4 text-bad shrink-0 mt-0.5" aria-hidden />}
                <span className={cn("break-words", !x.ok && "text-bad")}>{x.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.floors")}</h4>
          <p className="mono text-xs break-words">{[...c.trace.floors, ...c.trace.flags].join(" · ") || "—"}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.retrieval")}</h4>
          <p className="mono text-xs break-words">{c.trace.retrieval.map((r) => `${r.id} ${r.coverage}`).join(" · ") || "—"}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.validators")}</h4>
          <ul className="flex flex-wrap gap-1.5">
            {c.trace.checks.map((v) => (
              <li key={v.id} title={v.detail} className={cn("mono text-xs rounded-md px-1.5 py-0.5", v.status === "pass" ? "bg-ok-soft text-ok" : v.status === "fail" ? "bg-bad-soft text-bad" : v.status === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-3")}>
                {v.id} {v.status}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.evidence")}</h4>
          <p className="mono text-xs break-words">{c.trace.evidence_ids.join(" · ") || "—"}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-ink-3 mb-1">{t("eval.trace.blocks")}</h4>
          <p className="mono text-xs break-words">{c.trace.blocks.join(" → ") || "—"}</p>
        </div>
      </div>
    </div>
  );
}

function CaseTable({ cases }: { cases: CaseResult[] }) {
  const { t, locale } = useI18n();
  const [failOnly, setFailOnly] = useState(false);
  const [bucket, setBucket] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = cases.filter((c) => (!failOnly || !c.pass) && (bucket === "all" || c.bucket === bucket) && (!q || `${c.id} ${c.question}`.toLowerCase().includes(q.toLowerCase())));
  const buckets = [...new Set(cases.map((c) => c.bucket))];
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <h2 className="text-base font-semibold text-ink me-auto">
          {t("eval.table")} <span className="text-ink-3 font-normal tabular">({fmtNumber(rows.length, locale)})</span>
        </h2>
        <label className="inline-flex items-center gap-2 text-sm text-ink-2 min-h-11 cursor-pointer">
          <input type="checkbox" checked={failOnly} onChange={(e) => setFailOnly(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {t("eval.table.failuresOnly")}
        </label>
        <label className="sr-only" htmlFor="eval-bucket">{t("eval.bucket.all")}</label>
        <select id="eval-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink">
          <option value="all">{t("eval.bucket.all")}</option>
          {buckets.map((b) => (
            <option key={b} value={b}>
              {t(`eval.bucket.${b}`)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="eval-search">{t("eval.table.search")}</label>
        <input id="eval-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("eval.table.search")} className="h-10 w-48 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-ink-3 border-b border-line">
              <th scope="col" className="px-4 py-2 text-start font-medium">{t("eval.table.status")}</th>
              <th scope="col" className="px-2 py-2 text-start font-medium">{t("eval.table.case")}</th>
              <th scope="col" className="px-2 py-2 text-start font-medium">{t("eval.table.question")}</th>
              <th scope="col" className="px-2 py-2 text-start font-medium">{t("eval.table.expected")}</th>
              <th scope="col" className="px-2 py-2 text-start font-medium">{t("eval.table.actual")}</th>
              <th scope="col" className="px-2 py-2 text-end font-medium">{t("eval.table.time")}</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">{t("eval.table.trace")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Fragment key={c.id}>
                <tr className={cn("border-b border-line align-top", !c.pass && "bg-bad-soft/40")} data-case={c.id} data-pass={c.pass}>
                  <td className="px-4 py-2.5">
                    {c.pass ? (
                      <span className="inline-flex items-center gap-1 text-ok font-medium"><CircleCheck className="size-4" aria-hidden />{t("eval.table.pass")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-bad font-medium"><CircleX className="size-4" aria-hidden />{t("eval.table.fail")}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <code className="mono text-xs text-ink" dir="ltr">{c.id}</code>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className="text-[0.7rem] text-ink-3">{t(`eval.bucket.${c.bucket}`)}</span>
                      {c.split === "heldout" && <span className="text-[0.7rem] rounded-full bg-violet-soft px-1.5 text-ink">{t("eval.heldout")}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 max-w-[34ch]">
                    <span dir="auto" lang={c.lang} className="block text-ink">{c.question}</span>
                    {!c.pass && <span className="block text-xs text-bad mt-1 break-words" dir="ltr">{c.failures.join("; ")}</span>}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap" dir="ltr">
                    <span className="font-semibold">{c.expected.level}</span> <span className="text-ink-3 text-xs">{c.expected.routes.join(" | ")}</span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap" dir="ltr">
                    <span className={cn("font-semibold", !c.levelOk && "text-bad")}>{c.actual.level}</span> <span className={cn("text-xs", c.routeOk ? "text-ink-3" : "text-bad")}>{c.actual.route}</span>
                  </td>
                  <td className="px-2 py-2.5 text-end tabular text-ink-2 whitespace-nowrap">{fmtNumber(c.latency_ms, locale)} ms</td>
                  <td className="px-4 py-1.5 text-end">
                    <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[8px] text-xs font-medium text-ink-2 hover:bg-surface-2 whitespace-nowrap">
                      {open === c.id ? t("eval.table.hideTrace") : t("eval.table.trace")}
                      <ChevronDown className={cn("size-3.5 transition-transform", open === c.id && "rotate-180")} aria-hidden />
                    </button>
                  </td>
                </tr>
                {open === c.id && (
                  <tr className="border-b border-line">
                    <td colSpan={7} className="px-4 py-3">
                      <CaseTrace c={c} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-3">{t("eval.table.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EvalBoard({ run, source, canRun }: { run: EvalRun | null; source: "db" | "snapshot" | null; canRun: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [split, setSplit] = useState<Split>("all");
  const [running, setRunning] = useState(false);
  const s = run?.summary[split];
  const cases = useMemo(() => (run ? run.results.filter((r) => split === "all" || r.split === split) : []), [run, split]);
  const failures = cases.filter((c) => !c.pass);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/eval/run", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error?.message);
      toast({ tone: "ok", text: t("eval.runDone", { passed: j.data.passed, cases: j.data.cases }) });
      router.refresh();
    } catch {
      toast({ tone: "bad", text: t("eval.runFailed") });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 me-auto max-w-[70ch]">
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <FlaskConical className="size-6 text-accent" aria-hidden />
            {t("eval.title")}
          </h1>
          <p className="text-ink-2">{t("eval.subtitle")}</p>
          {run && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3 mt-1" data-testid="eval-meta">
              <span>
                {t("eval.lastRun")}: <time dateTime={run.created_at} className="text-ink-2">{fmtDate(run.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</time> ({source === "db" ? t("eval.source.db") : t("eval.source.snapshot")})
              </span>
              <span>· {run.ai_enabled ? t("eval.ai.on") : t("eval.ai.off")}</span>
              <span>· {t("eval.cases", { n: fmtNumber(run.results.length, locale) })}</span>
              {run.dataset_version && <span>· {t("eval.dataset", { version: run.dataset_version })}</span>}
            </p>
          )}
        </div>
        {canRun && (
          <button type="button" onClick={runNow} disabled={running} className="inline-flex items-center gap-2 h-11 px-5 rounded-[12px] bg-accent text-accent-ink font-medium shadow-card hover:bg-accent-hover disabled:opacity-60">
            {running ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {running ? t("eval.running", { n: run?.results.length ?? "" }) : t("eval.run")}
          </button>
        )}
      </header>
      <p className="sr-only" aria-live="polite">{running ? t("eval.running", { n: run?.results.length ?? "" }) : ""}</p>

      {!run || !s ? (
        <div className="rounded-[16px] border border-dashed border-line-strong p-10 text-center">
          <h2 className="text-lg font-semibold text-ink">{t("eval.none.title")}</h2>
          <p className="text-ink-2 mt-1">{t("eval.none.body")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={t("eval.split.label")}
              value={split}
              onChange={setSplit}
              options={[
                { value: "all", label: t("eval.split.all"), count: run.summary.all.cases },
                { value: "dev", label: t("eval.split.dev"), count: run.summary.dev.cases },
                { value: "heldout", label: t("eval.split.heldout"), count: run.summary.heldout.cases },
              ]}
            />
            <p className="text-sm text-ink-3 inline-flex items-center gap-1.5">
              <Info className="size-4" aria-hidden />
              {t("eval.split.heldoutNote")}
            </p>
          </div>

          <section aria-label={t("eval.metrics")} className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {s.metrics.map((m) => (
              <MetricTile key={m.id} m={m} />
            ))}
            <div className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-4 shadow-card" data-metric="latency">
              <h3 className="text-sm font-medium text-ink-2 inline-flex items-center gap-1.5"><Timer className="size-4" aria-hidden />{t("eval.latency")}</h3>
              <p className="text-lg font-semibold text-ink tabular">{t("eval.latency.value", { p50: fmtNumber(s.latency.p50, locale), p95: fmtNumber(s.latency.p95, locale) })}</p>
              <p className="text-xs text-ink-3 mt-auto">{t("eval.latency.note", { n: s.latency.n })}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-[16px] border border-dashed border-line-strong p-4" data-metric="grounding">
              <h3 className="text-sm font-medium text-ink-2">{t("eval.grounding")}</h3>
              <p className="text-lg font-semibold text-ink-3">—</p>
              <p className="text-xs text-ink-3 mt-auto">{t("eval.grounding.note")}</p>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Confusion s={s} />
            <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4 shadow-card">
              <h2 className="text-base font-semibold text-ink">{t("eval.failures")}</h2>
              {failures.length ? (
                <ul className="flex flex-col gap-2">
                  {failures.map((f) => (
                    <li key={f.id} className="flex flex-col gap-0.5 rounded-[10px] bg-bad-soft/50 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <code className="mono text-xs text-ink" dir="ltr">{f.id}</code>
                        {f.split === "heldout" && <span className="text-[0.7rem] rounded-full bg-violet-soft px-1.5 text-ink">{t("eval.heldout")}</span>}
                      </span>
                      <span dir="auto" className="text-ink">{f.question}</span>
                      <span className="text-xs text-bad" dir="ltr">{f.failures.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3 inline-flex items-center gap-1.5"><CircleCheck className="size-4 text-ok" aria-hidden />{t("eval.failures.none")}</p>
              )}
            </section>
          </div>

          <CaseTable cases={cases} />

          <details className="rounded-[16px] border border-line bg-surface p-4 shadow-card group">
            <summary className="cursor-pointer text-base font-semibold text-ink list-none flex items-center gap-2 min-h-11">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              {t("eval.defs")}
            </summary>
            <dl className="mt-3 grid gap-3 md:grid-cols-2">
              {s.metrics.map((m) => (
                <div key={m.id}>
                  <dt className="text-sm font-semibold text-ink">{t(`eval.m.${m.id}`)}</dt>
                  <dd className="text-sm text-ink-2 leading-relaxed">{t(`eval.def.${m.id}`)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </div>
  );
}
