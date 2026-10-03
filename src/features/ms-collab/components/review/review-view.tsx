"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, CircleQuestionMark, ClipboardCheck, CornerDownLeft, ExternalLink, Flag, GitPullRequestArrow, MessageSquare, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num, pct } from "../../../manuscripts/components/api";
import { isTyping } from "../../../manuscripts/components/workspace/keys";
import { PageStatus } from "../../../manuscripts/components/status";
import { toPoints } from "../../../manuscripts/geometry";
import type { ReviewLine, ReviewPage } from "../../types";
import { DiffLegend, DiffText, FirstTip, KeysSheet, Siglum } from "../bits";

/** Researcher review of a submitted page: line-by-line character diff with CER; decide per line or for the page. */
export function ReviewView({ initial }: { initial: ReviewPage }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [against, setAgainst] = useState(initial.against);
  const [onlyChanged, setOnlyChanged] = useState(initial.changed > 0);
  const [sel, setSel] = useState<string | null>(null);
  const [revert, setRevert] = useState<{ id: string; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "return" | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState(false);
  const pageUrl = `/portal/manuscripts/${data.ms_id}/pages/${data.page_id}`;

  const load = useCallback(async (a: "approved" | "machine") => {
    setLoading(true);
    try {
      setData(await api<ReviewPage>(`/api/ms-collab/pages/${initial.page_id}/review?against=${a}`));
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.load") });
    } finally {
      setLoading(false);
    }
  }, [initial.page_id, t, toast]);

  const lines = useMemo(() => data.lines.filter((l) => !onlyChanged || l.changed), [data.lines, onlyChanged]);
  const selected = data.lines.find((l) => l.id === sel) ?? null;
  const reviewing = data.status === "student_submitted";

  const accept = useCallback(async (l: ReviewLine) => {
    setBusy(`a${l.id}`);
    try {
      await api(`/api/ms-collab/lines/${l.id}/review`, { method: "POST", json: { decision: "accept" } });
      setData((d) => ({ ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, status: "approved" } : x)) }));
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  }, [t, toast]);
  const doRevert = async () => {
    if (!revert) return;
    const l = data.lines.find((x) => x.id === revert.id);
    if (!l?.base) return;
    setBusy(`r${l.id}`);
    try {
      await api(`/api/ms-collab/lines/${l.id}/review`, { method: "POST", json: { decision: "revert", base_version: l.base.version, note: revert.note } });
      toast({ tone: "ok", text: t("collab.review.reverted", { n: num(l.n, locale) }) });
      setRevert(null);
      await load(against);
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  };
  const decidePage = async () => {
    if (!decision) return;
    setBusy("page");
    try {
      await api(`/api/ms-collab/pages/${data.page_id}/review`, { method: "POST", json: { decision, note: note.trim() || undefined } });
      toast({ tone: "ok", text: t(`collab.review.done.${decision}`) });
      router.push("/portal/manuscripts/queue");
      router.refresh();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      const i = lines.findIndex((l) => l.id === sel);
      if (e.code === "KeyJ" || e.code === "KeyK") {
        e.preventDefault();
        const n = lines[Math.max(0, Math.min(lines.length - 1, i + (e.code === "KeyJ" ? 1 : -1)))] ?? lines[0];
        if (n) { setSel(n.id); document.getElementById(`rv-${n.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      }
      if (e.code === "KeyA" && selected && reviewing && data.can_decide && selected.status !== "approved") { e.preventDefault(); void accept(selected); }
      if (e.code === "KeyR" && selected?.changed && reviewing && data.can_decide) { e.preventDefault(); setRevert({ id: selected.id, note: "" }); }
      if (e.key === "?") { e.preventDefault(); setKeys(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines, sel, selected, reviewing, data.can_decide, accept]);

  const W = data.image.width, H = data.image.height;
  return (
    <div className="flex flex-col gap-5 animate-rise" data-testid="review">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5 min-w-0">
          <nav aria-label="breadcrumb"><Link href="/portal/manuscripts/queue" className="text-sm text-ink-2 hover:text-ink">{t("collab.queue.title")}</Link></nav>
          <h1 className="text-[1.6rem] font-semibold tracking-tight flex flex-wrap items-center gap-3">
            <span className="size-10 rounded-[12px] bg-accent-soft text-accent grid place-items-center"><ClipboardCheck className="size-5" /></span>
            {t("collab.review.title")}
            <Siglum s={data.siglum} />
            <span className="text-ink-2 text-lg font-normal">{t("collab.pageN", { n: num(data.page_seq, locale) })}</span>
            <PageStatus status={data.status} />
          </h1>
          <p className="text-ink-2"><span className="font-ms" dir="rtl" lang="ar">{locale === "ar" ? data.ms_title_ar : data.ms_title_en}</span>{data.submitted_by && <> · {t("collab.review.submittedBy", { name: locale === "ar" ? data.submitted_by.name_ar : data.submitted_by.name_en })}</>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label={t("collab.review.against")} value={against} onChange={(v) => { setAgainst(v); void load(v); }} size="sm"
            options={[{ value: "approved", label: t("collab.review.vsApproved") }, { value: "machine", label: t("collab.review.vsMachine") }]} />
          <Button variant="ghost" size="sm" onClick={() => setKeys(true)}><CircleQuestionMark className="size-4" />{t("collab.keys.title")}</Button>
        </div>
      </header>
      <FirstTip id="review" title={t("collab.tip.review.title")}>{t("collab.tip.review.body")}</FirstTip>
      {against === "approved" && !data.has_approved && <Callout tone="neutral">{t("collab.review.noApproved")}</Callout>}
      {data.flagged && <Callout tone="warn" icon={<Flag className="size-4 text-warn" />}>{t("collab.review.flagged")}</Callout>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="rv-lines">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="rv-lines" className="text-lg font-semibold">{t("collab.review.lines")}</h2>
            <span className="text-sm text-ink-3 tabular">{t("collab.review.summary", { c: num(data.changed, locale), n: num(data.lines.length, locale), cer: pct(data.page_cer, locale) })}</span>
            <label className="ms-auto inline-flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="size-4 accent-[var(--accent)]" />{t("collab.review.onlyChanged")}
            </label>
          </div>
          <DiffLegend />
          {loading && <Skeleton className="h-40" />}
          {!loading && lines.length === 0 && <Callout tone="neutral">{t("collab.review.noneChanged")}</Callout>}
          <ol className="flex flex-col gap-2">
            {lines.map((l) => (
              <li key={l.id} id={`rv-${l.id}`} onClick={() => setSel(l.id)} onFocus={() => setSel(l.id)} tabIndex={0} aria-current={sel === l.id ? "true" : undefined}
                className={cn("rounded-[14px] border bg-surface p-3 flex flex-col gap-2 cursor-pointer transition-colors", sel === l.id ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong")} data-review-line={l.id} data-changed={l.changed ? "1" : "0"}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="min-w-7 h-6 px-1.5 rounded-full bg-surface-2 grid place-items-center font-semibold tabular">{num(l.n, locale)}</span>
                  {l.zone && l.zone !== "main" && <Badge tone="violet">{t(`manuscripts.region.${l.zone}`)}</Badge>}
                  {l.changed ? <Badge tone="warn">{t("collab.review.changed", { cer: pct(l.cer, locale, 0) })}</Badge> : <Badge>{t("collab.review.unchanged")}</Badge>}
                  {l.status === "approved" && <Badge tone="ok"><Check className="size-3" />{t("manuscripts.line.approved")}</Badge>}
                  {l.open_suggestions > 0 && <Badge tone="violet"><GitPullRequestArrow className="size-3" />{num(l.open_suggestions, locale)}</Badge>}
                  {l.open_comments > 0 && <Badge tone="violet"><MessageSquare className="size-3" />{num(l.open_comments, locale)}</Badge>}
                  {l.current && <span className="text-ink-3 ms-auto">{t(`manuscripts.hist.kind.${l.current.kind}`)}{l.current.author_en ? ` · ${locale === "ar" ? l.current.author_ar : l.current.author_en}` : ""} · v{num(l.current.version, locale)}</span>}
                </div>
                {l.changed && l.base ? <DiffText from={l.base.text} to={l.current?.text ?? ""} className="text-[1.25rem] leading-[2.1]" /> : <p className="ms-text text-[1.2rem] text-ink-2" dir="rtl">{l.current?.text || "—"}</p>}
                {sel === l.id && reviewing && data.can_decide && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
                    {l.status !== "approved" && <Button size="sm" onClick={() => accept(l)} loading={busy === `a${l.id}`} data-testid="line-accept"><Check className="size-4" />{t("collab.review.accept")} <span className="text-[0.7rem] opacity-80">A</span></Button>}
                    {l.changed && <Button size="sm" variant="secondary" onClick={() => setRevert({ id: l.id, note: "" })}><Undo2 className="size-4" />{t("collab.review.revert")} <span className="text-[0.7rem] opacity-80">R</span></Button>}
                    <Link href={`${pageUrl}?line=${encodeURIComponent(l.id)}`} className="ms-auto inline-flex items-center gap-1 text-sm text-accent underline underline-offset-2">{t("collab.review.openLine")}<ExternalLink className="size-3.5" /></Link>
                  </div>
                )}
                {revert?.id === l.id && (
                  <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea autoFocus value={revert.note} onChange={(e) => setRevert({ id: l.id, note: e.target.value })} placeholder={t("collab.review.revertWhy")} aria-label={t("collab.review.revertWhy")} className="min-h-16" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={doRevert} disabled={!revert.note.trim()} loading={busy === `r${l.id}`}>{t("collab.review.revertConfirm", { v: num(l.base?.version ?? 0, locale) })}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRevert(null)}>{t("action.cancel")}</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20" aria-label={t("collab.review.decide")}>
          <div className="rounded-[var(--radius)] border border-line bg-sand overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto max-h-[52vh]" role="img" aria-label={t("collab.review.image")}>
              <image href={data.image.src} x={0} y={0} width={W} height={H} />
              {Object.entries(data.polygons).map(([id, poly]) => {
                const l = data.lines.find((x) => x.id === id);
                return <polygon key={id} points={toPoints(poly)} onClick={() => { setSel(id); setOnlyChanged(false); requestAnimationFrame(() => document.getElementById(`rv-${id}`)?.scrollIntoView({ block: "nearest" })); }}
                  fill={sel === id ? "#36dcb8" : l?.changed ? "#f2c45a" : "transparent"} fillOpacity={sel === id ? 0.3 : 0.18} stroke={sel === id ? "#0a8c77" : "transparent"} strokeWidth={3} vectorEffect="non-scaling-stroke" className="cursor-pointer" />;
              })}
            </svg>
          </div>
          <section className="rounded-[var(--radius)] border border-line bg-surface p-4 flex flex-col gap-3 shadow-card">
            <h2 className="font-semibold">{t("collab.review.decide")}</h2>
            {!reviewing ? <p className="text-sm text-ink-2">{t("collab.review.notSubmitted")}</p> : !data.can_decide ? (
              <Callout tone="warn">{data.decide_block}</Callout>
            ) : decision ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-2">{t(`collab.review.${decision}Desc`)}</p>
                <Field label={t("collab.review.note")} htmlFor="rv-note">
                  <Textarea id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(decision === "return" ? "collab.review.returnPlaceholder" : "collab.review.notePlaceholder")} />
                </Field>
                <div className="flex gap-2">
                  <Button onClick={decidePage} loading={busy === "page"} disabled={decision === "return" && !note.trim()} data-testid="review-confirm">{t("collab.review.confirm")}</Button>
                  <Button variant="ghost" onClick={() => setDecision(null)}>{t("action.cancel")}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="lg" onClick={() => setDecision("approve")} data-testid="review-approve"><BadgeCheck className="size-4" />{t("collab.review.approve")}</Button>
                <Button variant="secondary" onClick={() => setDecision("return")} data-testid="review-return"><CornerDownLeft className="size-4" />{t("collab.review.return")}</Button>
                <p className="text-xs text-ink-3">{t("collab.review.approveHint")}</p>
              </div>
            )}
            <Link href={pageUrl} className="text-sm text-accent underline underline-offset-2 inline-flex items-center gap-1">{t("collab.review.openWorkspace")}<ExternalLink className="size-3.5" /></Link>
          </section>
        </aside>
      </div>
      <KeysSheet open={keys} onClose={() => setKeys(false)} rows={[
        [["J", "K"], t("collab.keys.reviewNav")],
        [["A"], t("collab.keys.reviewAccept")],
        [["R"], t("collab.keys.reviewRevert")],
        [["?"], t("collab.keys.help")],
      ]} />
    </div>
  );
}
