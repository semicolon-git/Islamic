"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Keyboard, Cloud, CloudOff, Loader2, AlertTriangle, Lock, Eye, PencilLine, Send, CheckCheck, CornerUpLeft, BadgeCheck, Archive, ShieldCheck,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber, type Locale } from "@/i18n/core";
import { useEvents } from "@/lib/use-events";
import { availableDecisions, type Decision, type Status } from "@/lib/workflow";
import type { Role } from "@/lib/auth";
import type { CardContent } from "@/lib/cards/types";
import type { GlossaryTerm } from "@/lib/glossary";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/chip";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Callout, Kbd } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { api, isTyping } from "@/features/portal/client";
import { lintCard } from "../lint";
import { validateCard, checklistPasses } from "../validate";
import { workflowSteps } from "../stages";
import { stableStringify, serializeVersion, type VersionMeta } from "../version";
import type { VersionDoc } from "../diff";
import type { CardDetail, HadithHit, ResolvedDraft, TransitionResult } from "../server";
import { CardPreview } from "../preview";
import { BilingualText, SectionCard, TagInput } from "./fields";
import { VersePicker } from "./verse-picker";
import { HadithPicker } from "./hadith-picker";
import { TafsirEditor } from "./tafsir-editor";
import { WorkflowBar } from "./workflow-bar";
import { ChecklistPanel } from "./checklist-panel";
import { HistoryTab } from "./history";

export interface EditorProps {
  detail: CardDetail;
  user: { id: string; role: Role; display_name_en: string; display_name_ar: string };
  canEdit: boolean;
  concepts: { id: string; track: string; label_en: string; label_ar: string }[];
  glossary: GlossaryTerm[];
  published: { id: string; title_en: string; title_ar: string }[];
  resolved: ResolvedDraft;
  demo: boolean;
}

type SaveState = "saved" | "dirty" | "saving" | "offline" | "error";
const AUTOSAVE_MS = 1200;
const DECISION_ORDER: Decision[] = ["submit", "approve", "publish", "return", "archive"];
const DECISION_ICON: Record<Decision, React.ElementType> = { submit: Send, approve: CheckCheck, return: CornerUpLeft, publish: BadgeCheck, archive: Archive };
const json = (d: VersionDoc) => stableStringify(serializeVersion(d));
const backupKey = (id: string) => `say.card.${id}`;

function readBackup(id: string): { base: number; doc: VersionDoc; at: number } | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Glossary detection (client copy of lib/glossary detectTerms, which is server-bound). */
function detect(text: string, terms: GlossaryTerm[]) {
  const low = text.toLowerCase();
  return terms.filter((g) =>
    [g.term_ar, g.term_en.toLowerCase(), ...g.variants.map((v) => v.toLowerCase())].some((n) =>
      n && (/[؀-ۿ]/.test(n) ? text.includes(n) : new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low)),
    ),
  );
}

export function CardEditor(props: EditorProps) {
  const { detail, user, canEdit } = props;
  const { card } = detail;
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [doc, setDoc] = useState<VersionDoc>(detail.doc);
  const [base, setBase] = useState(card.current_version);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ current_version: number; doc: VersionDoc; author: { display_name_en: string; display_name_ar: string } | null } | null>(null);
  const [locked, setLocked] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<{ base: number; doc: VersionDoc } | null>(null);
  const [elsewhere, setElsewhere] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [pvLocale, setPvLocale] = useState<Locale>(locale);
  const [ack, setAck] = useState(false);
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const [kb, setKb] = useState(false);

  // resolved references (verses / hadith from the DB), merged as the author searches and edits
  const [verses, setVerses] = useState(() => new Map(props.resolved.verses.map((v) => [v.key, v])));
  const [hadith, setHadith] = useState(() => new Map(props.resolved.hadith.map((h) => [h.id, h])));
  const [extra, setExtra] = useState<{ terms: GlossaryTerm[]; count: ResolvedDraft["count"]; concept: ResolvedDraft["concept"]; missing: ResolvedDraft["missing"] }>({
    terms: props.resolved.terms,
    count: props.resolved.count,
    concept: props.resolved.concept,
    missing: props.resolved.missing,
  });

  const editable = canEdit && !locked;
  const docRef = useRef(doc);
  docRef.current = doc;
  const baseRef = useRef(base);
  const savedJson = useRef(json(detail.doc));
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── autosave ─────────────────────────────────────────── */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) {
      again.current = true;
      return false;
    }
    const snap = docRef.current;
    const snapJson = json(snap);
    if (snapJson === savedJson.current) {
      setSaveState("saved");
      return true;
    }
    saving.current = true;
    setSaveState("saving");
    const r = await api<{ version: number; unchanged: boolean; stage: Status }>(`/api/cards/${encodeURIComponent(card.id)}`, {
      method: "PUT",
      json: { base_version: baseRef.current, meta: snap.meta, content: snap.content },
    });
    saving.current = false;
    let ok = false;
    if (r.ok) {
      baseRef.current = r.data.version;
      setBase(r.data.version);
      savedJson.current = snapJson;
      setSaveError(null);
      ok = true;
      if (json(docRef.current) === snapJson) {
        setSaveState("saved");
        try {
          localStorage.removeItem(backupKey(card.id));
        } catch {}
      } else setSaveState("dirty");
      if (r.data.stage !== detail.stage && !r.data.unchanged) router.refresh();
    } else if (r.status === 0) {
      setSaveState("offline");
      timer.current = setTimeout(() => void saveNow(), 5000);
    } else if (r.error.code === "conflict") {
      setConflict(r.error.data as typeof conflict);
      setSaveState("error");
    } else if (r.error.code === "locked") {
      setLocked(true);
      setSaveState("error");
    } else {
      setSaveState("error");
      setSaveError(r.error.message);
    }
    if (again.current) {
      again.current = false;
      void saveNow();
    }
    return ok;
  }, [card.id, detail.stage, router]);

  useEffect(() => {
    if (!editable) return;
    const j = json(doc);
    if (j === savedJson.current) return;
    setSaveState((s) => (s === "offline" ? s : "dirty"));
    try {
      localStorage.setItem(backupKey(card.id), JSON.stringify({ base: baseRef.current, doc, at: Date.now() }));
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), AUTOSAVE_MS);
  }, [doc, editable, card.id, saveNow]);

  // restore unsaved work from this device (never lose work)
  useEffect(() => {
    if (!canEdit) return;
    const b = readBackup(card.id);
    if (!b || json(b.doc) === savedJson.current) return;
    if (b.base === card.current_version) {
      setDoc(b.doc);
      toast({ tone: "info", text: t("cards.restored") });
    } else setRestoreOffer({ base: b.base, doc: b.doc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const online = () => {
      if (json(docRef.current) !== savedJson.current) void saveNow();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (json(docRef.current) !== savedJson.current) e.preventDefault();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [saveNow]);

  /* ── reference resolution for preview + checklist ─────── */
  const refKey = JSON.stringify([doc.content.verses.map((v) => v.key), doc.content.hadith.map((h) => h.id), doc.content.glossary_terms, doc.meta.concept_id, doc.content.show_count]);
  useEffect(() => {
    const id = setTimeout(async () => {
      const r = await api<ResolvedDraft>("/api/cards/resolve", {
        method: "POST",
        json: { verses: doc.content.verses.map((v) => v.key), hadith: doc.content.hadith.map((h) => h.id), glossary_terms: doc.content.glossary_terms, concept_id: doc.meta.concept_id, show_count: doc.content.show_count },
      });
      if (!r.ok) return;
      setVerses((m) => new Map([...m, ...r.data.verses.map((v) => [v.key, v] as const)]));
      setHadith((m) => new Map([...m, ...r.data.hadith.map((h) => [h.id, h] as const)]));
      setExtra({ terms: r.data.terms, count: r.data.count, concept: r.data.concept, missing: r.data.missing });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  /* ── derived: lint + checklist ────────────────────────── */
  const banned = useMemo(() => props.glossary.flatMap((g) => g.banned_renderings.map((b) => ({ term: g.id, rendering: b }))), [props.glossary]);
  const lint = useMemo(
    () =>
      lintCard({
        level: doc.meta.level,
        certainty: doc.meta.certainty,
        hadithIds: doc.content.hadith.map((h) => h.id),
        explanation: doc.content.explanation,
        civilizational_note: doc.content.civilizational_note,
        disagreement_note: doc.content.disagreement_note,
        bannedRenderings: banned,
      }),
    [doc, banned],
  );
  const pendingRefs = doc.content.verses.some((v) => !verses.has(v.key) && !extra.missing.verses.includes(v.key)) || doc.content.hadith.some((h) => !hadith.has(h.id) && !extra.missing.hadith.includes(h.id));
  const checklist = useMemo(
    () =>
      validateCard({
        meta: { ...doc.meta, kind: card.kind },
        content: doc.content,
        knownVerseKeys: verses.keys(),
        knownHadithIds: hadith.keys(),
        lint,
        lintAcknowledged: ack,
      }),
    [doc, card.kind, verses, hadith, lint, ack],
  );
  const ready = checklistPasses(checklist) && !pendingRefs;
  const detectedTerms = useMemo(() => new Set(detect(`${doc.content.explanation.en}\n${doc.content.explanation.ar}`, props.glossary).map((g) => g.id)), [doc.content.explanation, props.glossary]);

  /* ── workflow ─────────────────────────────────────────── */
  const stage = detail.stage;
  const decisions = DECISION_ORDER.filter((d) => availableDecisions(user.role, stage).includes(d));
  const primary = decisions[0] ?? null;
  const { steps, returnedBy } = workflowSteps(stage, detail.reviews, { at: card.created_at, who_en: detail.author?.name_en ?? null, who_ar: detail.author?.name_ar ?? null });
  const approverOfCurrent = [...detail.reviews].reverse().find((r) => r.decision === "approve" && r.version === card.current_version);
  const inst = detail.institution ? (locale === "ar" ? detail.institution.name_ar : detail.institution.name_en) : "";

  const openDialog = (d: Decision) => {
    setNote("");
    setActError(null);
    setDialog(d);
  };
  const runDecision = async () => {
    if (!dialog) return;
    setBusy(true);
    setActError(null);
    if (editable && json(docRef.current) !== savedJson.current) {
      const ok = await saveNow();
      if (!ok) {
        setBusy(false);
        setActError(t("cards.save.error"));
        return;
      }
    }
    const r = await api<TransitionResult>(`/api/cards/${encodeURIComponent(card.id)}/transition`, {
      method: "POST",
      json: { decision: dialog, note: note.trim() || null, ack_lint: ack, version: baseRef.current },
    });
    setBusy(false);
    if (!r.ok) {
      setActError(r.error.message);
      return;
    }
    const done = dialog;
    setDialog(null);
    toast({ tone: "ok", text: t(`cards.act.done.${done}`) });
    if (r.data.awarded) toast({ tone: "info", text: t("cards.act.points", { n: r.data.awarded.delta, name: (locale === "ar" ? r.data.awarded.name_ar : r.data.awarded.name_en) ?? "" }) });
    if (r.data.fulfilled) toast({ tone: "info", text: t("cards.act.fulfilled", { n: fmtNumber(r.data.fulfilled, locale) }) });
    router.refresh();
  };

  /* ── realtime: others editing or reviewing this card ──── */
  useEvents([`card:${card.id}`], (ev) => {
    if (ev.actor_id === user.id) return;
    if (ev.type === "saved") {
      if (json(docRef.current) === savedJson.current) router.refresh();
      else setElsewhere(String(ev.payload.author_id ?? ""));
    } else router.refresh();
  });

  /* ── keyboard ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editable) void saveNow();
      } else if (mod && e.key === "Enter" && primary) {
        e.preventDefault();
        openDialog(primary);
      } else if (e.key === "?" && !isTyping(e)) {
        e.preventDefault();
        setKb(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, primary, saveNow]);

  /* ── helpers to update the doc ────────────────────────── */
  const setMeta = (patch: Partial<VersionMeta>) => setDoc((d) => ({ ...d, meta: { ...d.meta, ...patch } }));
  const setContent = (patch: Partial<CardContent>) => setDoc((d) => ({ ...d, content: { ...d.content, ...patch } }));
  const civ = doc.content.civilizational_note ?? { en: "", ar: "", sources: [] };
  const dis = doc.content.disagreement_note ?? { en: "", ar: "" };
  const title = (locale === "ar" ? doc.meta.title_ar || doc.meta.title_en : doc.meta.title_en || doc.meta.title_ar) || t("cards.untitled");
  const relatedOpts = props.published.filter((p) => p.id !== card.id);
  const related = doc.content.related_cards.map((id) => props.published.find((p) => p.id === id) ?? { id, title_en: id, title_ar: id });
  const isRevision = card.status === "published" && stage !== "published";

  const preview = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink flex items-center gap-2"><Eye className="size-4" aria-hidden />{t("cards.pv.title")}</h2>
          <p className="text-xs text-ink-3">{t("cards.pv.hint")}</p>
        </div>
        <Segmented size="sm" label={t("cards.pv.lang")} value={pvLocale} onChange={setPvLocale} options={[{ value: "en", label: "EN" }, { value: "ar", label: "ع" }]} />
      </div>
      <CardPreview
        locale={pvLocale}
        meta={doc.meta}
        content={doc.content}
        verses={verses}
        hadith={hadith}
        terms={extra.terms}
        count={extra.count}
        concept={extra.concept}
        institution={detail.institution}
        related={related}
        demo={props.demo}
        published={stage === "published" && json(doc) === savedJson.current}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5 pb-24 lg:pb-6">
      {/* header */}
      <div className="flex flex-col gap-3">
        <Link href="/portal/cards" className="text-sm text-ink-2 hover:text-ink inline-flex items-center gap-1.5 self-start">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("cards.back")}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[240px]">
            <h1 className="text-2xl font-semibold leading-tight" dir="auto" data-testid="card-title">{title}</h1>
            <p className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-ink-2">
              <StatusPill status={stage} label={t(`status.${stage}`)} />
              {card.published_version && card.status === "published" && <Badge tone="ok" title={t("cards.liveHint", { v: card.published_version })}>{t("cards.live", { v: card.published_version })}</Badge>}
              <span>{t(`cards.kind.${card.kind}`)}</span>
              <span className="mono text-xs text-ink-3" dir="ltr">{card.id}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator state={saveState} version={base} editable={editable} onSave={() => void saveNow()} />
            <button type="button" onClick={() => setKb(true)} className="size-10 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label={t("cards.kb.open")} title={t("cards.kb.open")}>
              <Keyboard className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* workflow */}
      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-line bg-surface p-3 sm:p-4 shadow-card" aria-label={t("cards.wf.label")}>
        <WorkflowBar steps={steps} />
        {returnedBy && (
          <Callout tone="warn" icon={<CornerUpLeft className="size-4" />}>
            <span data-testid="returned-note">{t("cards.wf.returnedNote", { name: (locale === "ar" ? returnedBy.reviewer_ar : returnedBy.reviewer_en) ?? "", note: returnedBy.note ?? "" })}</span>
          </Callout>
        )}
        {decisions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" data-testid="workflow-actions">
            {decisions.map((d) => {
              const Icon = DECISION_ICON[d];
              const forward = d === "submit" || d === "approve" || d === "publish";
              return (
                <Button key={d} variant={d === primary ? "primary" : d === "archive" ? "ghost" : "secondary"} onClick={() => openDialog(d)} data-decision={d} aria-keyshortcuts={d === primary ? "Control+Enter" : undefined}>
                  <Icon className="size-4" aria-hidden />
                  {t(`cards.act.${d}`)}
                  {forward && !ready && <span className="sr-only"> — {t("cards.act.fixFirst")}</span>}
                </Button>
              );
            })}
            {decisions.includes("publish") && <p className="text-xs text-ink-3 flex items-center gap-1.5 basis-full"><ShieldCheck className="size-3.5" aria-hidden />{t("cards.wf.fourEyes")}</p>}
          </div>
        )}
      </section>

      {/* banners */}
      {restoreOffer && (
        <Callout tone="accent" title={t("cards.restoreOffer", { v: restoreOffer.base })}>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => { setDoc(restoreOffer.doc); setRestoreOffer(null); }}>{t("cards.restore")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem(backupKey(card.id)); } catch {} setRestoreOffer(null); }}>{t("cards.discard")}</Button>
          </div>
        </Callout>
      )}
      {conflict && (
        <Callout tone="bad" title={t("cards.conflict.title")}>
          <p>{t("cards.conflict.body", { name: (locale === "ar" ? conflict.author?.display_name_ar : conflict.author?.display_name_en) ?? "—", v: conflict.current_version })}</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => { baseRef.current = conflict.current_version; setBase(conflict.current_version); setConflict(null); void saveNow(); }}>{t("cards.conflict.keepMine")}</Button>
            <Button size="sm" variant="secondary" onClick={() => { savedJson.current = json(conflict.doc); baseRef.current = conflict.current_version; setBase(conflict.current_version); setDoc(conflict.doc); setConflict(null); setSaveState("saved"); }}>{t("cards.conflict.loadTheirs")}</Button>
          </div>
        </Callout>
      )}
      {elsewhere !== null && (
        <Callout tone="neutral" title={t("cards.updatedElsewhere")}>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => router.refresh()}>{t("cards.reload")}</Button>
        </Callout>
      )}
      {saveError && <Callout tone="bad">{saveError}</Callout>}
      {!canEdit && ["student_submitted", "researcher_approved"].includes(stage) && (
        decisions.length > 0 ? (
          <Callout tone="violet" icon={<Eye className="size-4" />} title={t("cards.review.title", { v: base })}>{t("cards.review.body")}</Callout>
        ) : (
          <Callout tone="violet" icon={<Lock className="size-4" />} title={t("cards.locked.title")}>{t("cards.locked.body")}</Callout>
        )
      )}
      {locked && <Callout tone="violet" icon={<Lock className="size-4" />} title={t("cards.locked.title")}>{t("cards.locked.body")}</Callout>}
      {stage === "archived" && <Callout tone="neutral" icon={<Archive className="size-4" />}>{t("cards.archived.body")}</Callout>}
      {isRevision && card.published_version && <Callout tone="accent" title={t("cards.revision")}>{t("cards.revisionBody", { v: card.published_version })}</Callout>}

      {/* tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label={t("cards.tabsLabel")} value={tab} onChange={setTab} options={[{ value: "edit", label: t("cards.tab.edit") }, { value: "history", label: t("cards.tab.history"), count: detail.versions.length }]} />
        {tab === "edit" && (
          <div className="lg:hidden">
            <Segmented size="sm" label={t("cards.tab.preview")} value={mobileView} onChange={setMobileView} options={[{ value: "form", label: <span className="inline-flex items-center gap-1.5"><PencilLine className="size-3.5" aria-hidden />{t("cards.tab.form")}</span> }, { value: "preview", label: <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5" aria-hidden />{t("cards.tab.preview")}</span> }]} />
          </div>
        )}
      </div>

      {tab === "history" ? (
        <HistoryTab
          cardId={card.id}
          versions={detail.versions}
          reviews={detail.reviews}
          currentVersion={base}
          publishedVersion={card.published_version}
          canRestore={editable}
          onRestore={(d, v) => {
            setDoc(d);
            setTab("edit");
            toast({ tone: "ok", text: t("cards.hist.restored", { v }) });
          }}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)] items-start">
          <div className={cn("flex flex-col gap-5 min-w-0", mobileView === "preview" && "hidden lg:flex")}>
            <nav aria-label={t("cards.sectionsNav")} className="hidden md:flex flex-wrap gap-1.5 text-sm">
              {[["sec-basics", "cards.sec.basics"], ["sec-verses", "cards.sec.verses"], ["sec-hadith", "cards.sec.hadith"], ["sec-tafsir", "cards.sec.tafsir"], ["sec-explanation", "cards.sec.explanation"], ["sec-civ", "cards.sec.civ"], ["sec-disagreement", "cards.sec.disagreement"], ["sec-extras", "cards.sec.extras"]].map(([id, k]) => (
                <a key={id} href={`#${id}`} className="rounded-full px-3 py-1.5 bg-surface border border-line text-ink-2 hover:text-ink hover:border-line-strong">{t(k)}</a>
              ))}
            </nav>

            <fieldset disabled={!editable} className="contents">
              <SectionCard id="sec-basics" title={t("cards.sec.basics")}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={t("cards.f.titleEn")} htmlFor="f-title-en"><Input id="f-title-en" dir="ltr" lang="en" value={doc.meta.title_en} onChange={(e) => setMeta({ title_en: e.target.value })} maxLength={200} /></Field>
                  <Field label={t("cards.f.titleAr")} htmlFor="f-title-ar"><Input id="f-title-ar" dir="rtl" lang="ar" value={doc.meta.title_ar} onChange={(e) => setMeta({ title_ar: e.target.value })} maxLength={200} /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={t("cards.f.concept")} htmlFor="f-concept">
                    <Select id="f-concept" value={doc.meta.concept_id ?? ""} onChange={(e) => setMeta({ concept_id: e.target.value || null })}>
                      <option value="">{t("cards.newConceptNone")}</option>
                      {props.concepts.map((c) => <option key={c.id} value={c.id}>{locale === "ar" ? c.label_ar : c.label_en}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("cards.f.certainty")} htmlFor="f-certainty" hint={t("cards.certainty.hint")}>
                    <Select id="f-certainty" value={doc.meta.certainty} onChange={(e) => setMeta({ certainty: e.target.value as VersionMeta["certainty"] })}>
                      {(["established", "disputed", "ijma"] as const).map((c) => <option key={c} value={c}>{t(`cards.certainty.${c}`)}</option>)}
                    </Select>
                  </Field>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-ink mb-1.5">{t("cards.f.level")}</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {(["A", "B", "C", "D"] as const).map((l) => (
                      <label key={l} className={cn("flex items-start gap-2.5 rounded-[12px] border p-3 cursor-pointer text-sm transition-colors focus-within:ring-2 focus-within:ring-violet/40", doc.meta.level === l ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")}>
                        <input type="radio" name="level" value={l} checked={doc.meta.level === l} onChange={() => setMeta({ level: l })} className="mt-1 accent-[var(--accent)]" />
                        <span>{t(`cards.level.${l}`)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </SectionCard>

              <SectionCard id="sec-verses" title={t("cards.sec.verses")} hint={t("cards.verses.hint")} tag={<Badge tone="neutral" className="tabular">{fmtNumber(doc.content.verses.length, locale)}</Badge>}>
                <VersePicker value={doc.content.verses} onChange={(v) => setContent({ verses: v })} resolved={verses} onHits={(hs) => setVerses((m) => new Map([...m, ...hs.map((h) => [h.key, h] as const)]))} disabled={!editable} missing={extra.missing.verses} />
              </SectionCard>

              <SectionCard id="sec-hadith" title={t("cards.sec.hadith")} hint={t("cards.hadith.hint")} tag={<Badge tone="neutral" className="tabular">{fmtNumber(doc.content.hadith.length, locale)}</Badge>}>
                <HadithPicker value={doc.content.hadith} onChange={(v) => setContent({ hadith: v })} resolved={hadith} onHits={(hs: HadithHit[]) => setHadith((m) => new Map([...m, ...hs.map((h) => [h.id, h] as const)]))} disabled={!editable} missing={extra.missing.hadith} />
              </SectionCard>

              <SectionCard id="sec-tafsir" title={t("cards.sec.tafsir")} tag={<Badge tone="neutral">{t("cards.sec.optional")}</Badge>}>
                <TafsirEditor value={doc.content.tafsir} onChange={(v) => setContent({ tafsir: v })} verseKeys={doc.content.verses.map((v) => v.key)} disabled={!editable} />
              </SectionCard>

              <SectionCard id="sec-explanation" title={t("cards.exp.label")} hint={t("cards.exp.hint")}>
                <BilingualText idBase="f-exp" value={doc.content.explanation} onChange={(v) => setContent({ explanation: v })} lint={lint} field="explanation" disabled={!editable} rows={7} required />
              </SectionCard>

              <SectionCard id="sec-civ" title={t("cards.sec.civ")} hint={t("cards.civ.hint")} tag={<Badge tone="neutral">{t("cards.sec.optional")}</Badge>}>
                <BilingualText idBase="f-civ" value={{ en: civ.en, ar: civ.ar }} onChange={(v) => setContent({ civilizational_note: { ...civ, ...v } })} lint={lint} field="civilizational_note" disabled={!editable} rows={3} />
                <SourcesEditor sources={civ.sources} onChange={(s) => setContent({ civilizational_note: { ...civ, sources: s } })} disabled={!editable} />
              </SectionCard>

              <SectionCard id="sec-disagreement" title={t("cards.sec.disagreement")} hint={doc.meta.level === "C" ? t("cards.dis.hint") : t("cards.dis.hintOptional")} tag={<Badge tone={doc.meta.level === "C" ? "warn" : "neutral"}>{doc.meta.level === "C" ? t("cards.sec.required") : t("cards.sec.optional")}</Badge>}>
                <BilingualText idBase="f-dis" value={dis} onChange={(v) => setContent({ disagreement_note: v })} lint={lint} field="disagreement_note" disabled={!editable} rows={3} required={doc.meta.level === "C"} />
              </SectionCard>

              <SectionCard id="sec-extras" title={t("cards.sec.extras")}>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-ink">{t("cards.glossary")}</legend>
                  <p className="text-sm text-ink-3">{t("cards.glossary.hint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {props.glossary.map((g) => {
                      const on = doc.content.glossary_terms.includes(g.id);
                      return (
                        <label key={g.id} className={cn("inline-flex items-center gap-2 rounded-full border h-10 px-3 text-sm cursor-pointer focus-within:ring-2 focus-within:ring-violet/40", on ? "bg-accent-soft border-accent" : "border-line hover:border-line-strong")}>
                          <input type="checkbox" className="accent-[var(--accent)]" checked={on} onChange={(e) => setContent({ glossary_terms: e.target.checked ? [...doc.content.glossary_terms, g.id] : doc.content.glossary_terms.filter((x) => x !== g.id) })} />
                          <span><bdi>{locale === "ar" ? g.term_ar : g.term_en}</bdi></span>
                          {detectedTerms.has(g.id) && <span className="text-[0.7rem] text-accent font-medium">· {t("cards.glossary.detected")}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="flex items-start gap-3 rounded-[12px] border border-line p-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={doc.content.show_count} onChange={(e) => setContent({ show_count: e.target.checked })} />
                  <span className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium text-ink">{t("cards.count.label")}</span>
                    <span className="text-ink-3">{t("cards.count.hint")}</span>
                    {doc.content.show_count && (
                      <span className="text-ink-2 mono text-xs">
                        {extra.count ? t("cards.count.preview", { tokens: extra.count.tokens, verses: extra.count.verses, rule: extra.count.rule }) : t("cards.count.none")}
                      </span>
                    )}
                  </span>
                </label>
                {(card.kind === "answer" || doc.meta.match_phrases.length > 0) && (
                  <TagInput label={t("cards.match")} hint={t("cards.match.hint")} values={doc.meta.match_phrases} onChange={(v) => setMeta({ match_phrases: v })} disabled={!editable} />
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="f-related" className="text-sm font-medium text-ink">{t("cards.related")}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {related.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 ps-3 pe-1 h-9 text-sm">
                        {locale === "ar" ? r.title_ar : r.title_en}
                        {editable && <button type="button" onClick={() => setContent({ related_cards: doc.content.related_cards.filter((x) => x !== r.id) })} aria-label={`${t("cards.related.remove")}: ${r.title_en}`} className="size-7 grid place-items-center rounded-full hover:bg-surface-3">×</button>}
                      </span>
                    ))}
                  </div>
                  {editable && (
                    <Select id="f-related" value="" onChange={(e) => e.target.value && setContent({ related_cards: [...doc.content.related_cards, e.target.value] })}>
                      <option value="">{t("cards.related.add")}</option>
                      {relatedOpts.filter((p) => !doc.content.related_cards.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{locale === "ar" ? p.title_ar : p.title_en}</option>)}
                    </Select>
                  )}
                </div>
              </SectionCard>
            </fieldset>
          </div>

          <aside className={cn("flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto scrollbar-thin lg:pe-1", mobileView === "form" && "hidden lg:flex")} aria-label={t("cards.pv.title")}>
            <ChecklistPanel items={checklist} pending={pendingRefs} lint={lint} ack={ack} onAck={setAck} title={["student_submitted", "researcher_approved", "published"].includes(stage) ? t("cards.check.titleReview") : undefined} />
            {preview}
          </aside>
        </div>
      )}

      {/* action dialog */}
      <Sheet
        open={!!dialog}
        onClose={() => setDialog(null)}
        side="center"
        closeLabel={t("action.close")}
        title={dialog ? t(`cards.act.${dialog}`) : ""}
        footer={
          dialog && (
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>{t("action.cancel")}</Button>
              <Button
                variant={dialog === "archive" ? "danger" : "primary"}
                loading={busy}
                onClick={runDecision}
                disabled={(dialog === "return" && note.trim().length < 3) || ((dialog === "submit" || dialog === "approve" || dialog === "publish") && !ready)}
                data-testid="confirm-decision"
              >
                {t(`cards.act.${dialog}`)}
              </Button>
            </>
          )
        }
      >
        {dialog && (
          <div className="flex flex-col gap-4">
            <p className="text-ink-2">{t(`cards.act.confirm.${dialog}`, { v: base, institution: inst })}</p>
            {dialog === "publish" && (
              <Callout tone={approverOfCurrent?.reviewer_id === user.id ? "warn" : "neutral"} icon={<ShieldCheck className="size-4" />}>{t("cards.wf.fourEyes")}</Callout>
            )}
            {(dialog === "submit" || dialog === "approve" || dialog === "publish") && !ready && (
              <Callout tone="warn" icon={<AlertTriangle className="size-4" />} title={t("cards.act.fixFirst")}>
                <ul className="list-disc ps-5">
                  {checklist.filter((c) => !c.ok).map((c) => <li key={c.id}>{t(`cards.check.${c.id}`)}</li>)}
                </ul>
                {lint.length > 0 && !ack && (
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                    <span>{t("cards.lint.ack")}</span>
                  </label>
                )}
              </Callout>
            )}
            {dialog !== "archive" && (
              <Field label={dialog === "return" ? t("cards.act.noteRequired") : t("cards.act.noteOptional")} htmlFor="decision-note">
                <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} dir="auto" autoFocus={dialog === "return"} data-testid="decision-note" />
              </Field>
            )}
            {actError && <Callout tone="bad">{actError}</Callout>}
          </div>
        )}
      </Sheet>

      <Sheet open={kb} onClose={() => setKb(false)} side="center" title={t("cards.kb.title")} closeLabel={t("action.close")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt><Kbd>Ctrl</Kbd> + <Kbd>S</Kbd></dt><dd>{t("cards.kb.save")}</dd>
          <dt><Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></dt><dd>{t("cards.kb.action")}</dd>
          <dt><Kbd>?</Kbd></dt><dd>{t("cards.kb.help")}</dd>
          <dt><Kbd>Esc</Kbd></dt><dd>{t("cards.kb.close")}</dd>
          <dt><Kbd>/</Kbd></dt><dd>{t("cards.kb.search")}</dd>
          <dt><Kbd>N</Kbd></dt><dd>{t("cards.kb.new")}</dd>
        </dl>
      </Sheet>
    </div>
  );
}

function SaveIndicator({ state, version, editable, onSave }: { state: SaveState; version: number; editable: boolean; onSave: () => void }) {
  const { t } = useI18n();
  if (!editable) return null;
  const map = {
    saved: { icon: Cloud, text: t("cards.save.saved", { v: version }), cls: "text-ok" },
    dirty: { icon: PencilLine, text: t("cards.save.dirty"), cls: "text-ink-2" },
    saving: { icon: Loader2, text: t("cards.save.saving"), cls: "text-ink-2" },
    offline: { icon: CloudOff, text: t("cards.save.offline"), cls: "text-warn" },
    error: { icon: AlertTriangle, text: t("cards.save.error"), cls: "text-bad" },
  }[state];
  const Icon = map.icon;
  return (
    <span className="inline-flex items-center gap-2">
      <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-sm font-medium", map.cls)} data-testid="save-state" data-state={state}>
        <Icon className={cn("size-4", state === "saving" && "animate-spin")} aria-hidden />
        {map.text}
      </span>
      {(state === "dirty" || state === "offline" || state === "error") && (
        <Button size="sm" variant="ghost" onClick={onSave} aria-keyshortcuts="Control+S">{t("cards.save.now")}</Button>
      )}
    </span>
  );
}

function SourcesEditor({ sources, onChange, disabled }: { sources: NonNullable<CardContent["civilizational_note"]>["sources"]; onChange: (s: NonNullable<CardContent["civilizational_note"]>["sources"]) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const set = (i: number, patch: Partial<(typeof sources)[number]>) => onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">{t("cards.civ.sources")}</p>
      {sources.map((s, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_180px_140px_auto] items-end rounded-[12px] border border-line p-3">
          <Field label={t("cards.civ.citation")} htmlFor={`src-c-${i}`}><Input id={`src-c-${i}`} dir="auto" value={s.citation} onChange={(e) => set(i, { citation: e.target.value })} /></Field>
          <Field label={t("cards.civ.url")} htmlFor={`src-u-${i}`}><Input id={`src-u-${i}`} dir="ltr" value={s.url ?? ""} onChange={(e) => set(i, { url: e.target.value || undefined })} /></Field>
          <Field label={t("cards.civ.kind")} htmlFor={`src-k-${i}`}>
            <Select id={`src-k-${i}`} value={s.kind} onChange={(e) => set(i, { kind: e.target.value as typeof s.kind })}>
              {(["academic", "sharia", "museum", "dataset"] as const).map((k) => <option key={k} value={k}>{t(`cards.civ.kind.${k}`)}</option>)}
            </Select>
          </Field>
          {!disabled && <Button type="button" variant="ghost" size="md" onClick={() => onChange(sources.filter((_, j) => j !== i))} aria-label={t("cards.civ.removeSource")}>×</Button>}
        </div>
      ))}
      {!disabled && (
        <div><Button type="button" size="sm" variant="secondary" onClick={() => onChange([...sources, { citation: "", kind: "academic" }])}>+ {t("cards.civ.addSource")}</Button></div>
      )}
    </div>
  );
}

