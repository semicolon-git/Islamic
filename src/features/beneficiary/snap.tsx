"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, BookOpen, CameraOff, Check, ImagePlus, LayoutGrid, RefreshCw, ScanText, UserX, WifiOff, X, Info, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ConceptImage } from "@/components/ui/concept-image";
import { useI18n } from "@/i18n/client";
import { fileToJpeg, toJpeg } from "./image";
import { ConceptPicker } from "./picker";
import { conceptHref, conceptHue, conceptLabel, type ConceptSummary, type Track } from "./labels";
import { discoverHref } from "@/features/discover/link";

type Blocked = "denied" | "nocamera" | "unsupported";
type Flags = { person: boolean; inscription: boolean; other_religious_symbol: boolean; text_instructions: boolean };
type Candidate = { concept_id: string; tier: "confident" | "possible" };
type Subject = { label_en: string; label_ar: string; category: string; search_terms_en: string[]; search_terms_ar: string[]; sensitive: boolean };
type Outcome =
  | { kind: "match"; candidates: Candidate[]; flags: Flags; subject?: Subject | null }
  | { kind: "nothing"; unsure: boolean; flags: Flags; subject?: Subject | null }
  | { kind: "error"; offline: boolean };

const SLOW_MS = 6000;
const TIMEOUT_MS = 30000;

/** Immersive camera → recognition → approved card. Every path ends at a card, the picker, or a person. */
export function Snap({ concepts, samples, aiOn, startWithPicker, initialTrack }: { concepts: ConceptSummary[]; samples: ConceptSummary[]; aiOn: boolean; startWithPicker: boolean; initialTrack: Track | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [camera, setCamera] = useState<"idle" | "starting" | "live" | Blocked>("idle");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; note: string | null }>({ open: startWithPicker, note: null });
  const [online, setOnline] = useState(true);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera("unsupported");
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      stopCamera();
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCamera("live");
    } catch (e) {
      const name = (e as DOMException)?.name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "nocamera");
    }
  }, [stopCamera]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      abortRef.current?.abort();
      stopCamera();
    };
  }, [stopCamera]);

  // Ask for the camera only when the visitor came to point it (not when they asked to choose from the list).
  const started = useRef(false);
  useEffect(() => {
    if (started.current || picker.open) return;
    started.current = true;
    void startCamera();
  }, [picker.open, startCamera]);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo)), [photo]);

  const openPicker = (note: string | null = null) => setPicker({ open: true, note });

  const analyze = useCallback(
    async (blob: Blob) => {
      setOutcome(null);
      setPhoto(URL.createObjectURL(blob));
      if (!navigator.onLine) {
        setOutcome({ kind: "error", offline: true });
        return;
      }
      setBusy(true);
      setSlow(false);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
      const killTimer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const fd = new FormData();
        fd.append("image", blob, "photo.jpg");
        const res = await fetch("/api/snap", { method: "POST", body: fd, signal: ctrl.signal });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error?.code || "error");
        const d = j.data as { mode: "manual"; reason: string } | { mode: "ai"; status: "match" | "none" | "unsure"; candidates: Candidate[]; flags: Flags; subject?: Subject | null };
        if (d.mode === "manual") {
          openPicker(d.reason === "no_key" ? t("beneficiary.snap.manualNoKey") : t("beneficiary.snap.manualFailed"));
        } else if (d.status === "match" && d.candidates.length) {
          setOutcome({ kind: "match", candidates: d.candidates.filter((c) => byId.has(c.concept_id)), flags: d.flags, subject: d.subject });
        } else {
          setOutcome({ kind: "nothing", unsure: d.status === "unsure", flags: d.flags, subject: d.subject });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError" && !ctrl.signal.reason) {
          /* cancelled by the visitor */
        }
        if (abortRef.current === ctrl) setOutcome({ kind: "error", offline: !navigator.onLine });
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(killTimer);
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setBusy(false);
          setSlow(false);
        }
      }
    },
    [byId, t],
  );

  const capture = async () => {
    const v = videoRef.current;
    if (!v || camera !== "live" || !v.videoWidth) return;
    try {
      await analyze(await toJpeg(v));
    } catch {
      setOutcome({ kind: "error", offline: false });
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      await analyze(await fileToJpeg(f));
    } catch {
      setOutcome({ kind: "error", offline: false });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const chooseInstead = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setSlow(false);
    openPicker(photo ? t("beneficiary.picker.photoNote") : null);
  };

  const reset = () => {
    setOutcome(null);
    setPhoto(null);
  };

  const label = (id: string) => {
    const c = byId.get(id);
    return c ? conceptLabel(c, locale) : id;
  };

  const blocked = camera === "denied" || camera === "nocamera" || camera === "unsupported";
  const frozen = !!photo && (busy || !!outcome);

  return (
    <div className="fixed inset-0 z-30 bg-[#05060f] text-white flex flex-col select-none">
      <style>{`@keyframes say-scan{0%{transform:translateY(-10%);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(110%);opacity:0}}`}</style>

      {/* Viewfinder */}
      <div className="absolute inset-0">
        <video ref={videoRef} playsInline muted autoPlay className={cn("absolute inset-0 size-full object-cover transition-opacity", camera === "live" && !frozen ? "opacity-100" : "opacity-0")} aria-hidden />
        {frozen && photo && <img src={photo} alt={t("beneficiary.snap.yourPhoto")} className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80 pointer-events-none" aria-hidden />
        {busy && (
          <div className="absolute inset-x-8 top-[18%] bottom-[34%] overflow-hidden rounded-[28px] pointer-events-none" aria-hidden>
            <div className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#36dcb8]/35 to-transparent motion-safe:animate-[say-scan_1.8s_ease-in-out_infinite]" />
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),12px)] h-16">
        <Link href="/" aria-label={t("action.close")} className="size-11 grid place-items-center rounded-full bg-black/35 backdrop-blur hover:bg-black/50">
          <X className="size-5" aria-hidden />
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold">{t("beneficiary.snap.title")}</h1>
        <button type="button" onClick={() => openPicker(null)} className="h-11 px-3.5 rounded-full bg-black/35 backdrop-blur hover:bg-black/50 inline-flex items-center gap-1.5 text-sm font-medium">
          <LayoutGrid className="size-4" aria-hidden />
          {t("beneficiary.snap.choose")}
        </button>
      </div>

      {/* Middle */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        {!blocked && !frozen && camera !== "idle" && (
          <>
            <div className="relative w-[min(78vw,340px)] aspect-[4/5]" aria-hidden>
              {["top-0 start-0 border-t-[3px] border-s-[3px] rounded-ss-[22px]", "top-0 end-0 border-t-[3px] border-e-[3px] rounded-se-[22px]", "bottom-0 start-0 border-b-[3px] border-s-[3px] rounded-es-[22px]", "bottom-0 end-0 border-b-[3px] border-e-[3px] rounded-ee-[22px]"].map((c) => (
                <span key={c} className={cn("absolute size-10 border-white/85", c)} />
              ))}
            </div>
            <p className="mt-5 rounded-full bg-black/40 backdrop-blur px-4 py-2 text-sm text-white/90 text-center" aria-live="polite">
              {camera === "starting" ? t("beneficiary.snap.starting") : t("beneficiary.snap.hint")}
            </p>
          </>
        )}

        {blocked && !frozen && (
          <div className="w-full max-w-sm flex flex-col items-center text-center gap-3 animate-rise" role="status" data-testid="camera-blocked">
            <span className="size-16 rounded-[20px] bg-white/10 grid place-items-center"><CameraOff className="size-8 text-white/85" aria-hidden /></span>
            <h2 className="text-xl font-semibold">{t(`beneficiary.snap.${camera}.title`)}</h2>
            <p className="text-white/75 leading-relaxed">{t(`beneficiary.snap.${camera}.body`)}</p>
            <div className="w-full flex flex-col gap-2 mt-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="h-13 min-h-12 rounded-[16px] bg-[#36dcb8] text-[#052a22] font-semibold inline-flex items-center justify-center gap-2">
                <ImagePlus className="size-5" aria-hidden />
                {t("beneficiary.snap.upload")}
              </button>
              <button type="button" onClick={() => openPicker(null)} className="min-h-12 rounded-[16px] bg-white/10 hover:bg-white/15 font-medium inline-flex items-center justify-center gap-2">
                <LayoutGrid className="size-5" aria-hidden />
                {t("beneficiary.snap.chooseLong")}
              </button>
              {camera === "denied" && (
                <button type="button" onClick={startCamera} className="min-h-11 text-sm text-white/80 underline underline-offset-4">
                  {t("beneficiary.snap.retryCamera")}
                </button>
              )}
            </div>
          </div>
        )}

        {busy && (
          <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
            <span className="rounded-full bg-black/55 backdrop-blur px-4 py-2 text-sm font-medium inline-flex items-center gap-2">
              <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />
              {aiOn ? t("beneficiary.snap.looking") : t("beneficiary.snap.preparing")}
            </span>
            {slow && (
              <button type="button" onClick={chooseInstead} className="animate-rise rounded-full bg-white text-[#0b0e29] px-5 h-11 text-sm font-semibold">
                {t("beneficiary.snap.slow")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom: result panel or controls */}
      <div className="relative z-10 pb-[max(env(safe-area-inset-bottom),16px)]">
        {outcome ? (
          <ResultPanel outcome={outcome} label={label} byId={byId} onChange={() => openPicker(t("beneficiary.picker.photoNote"))} onRetake={reset} onRetry={() => (photo ? fetch(photo).then((r) => r.blob()).then(analyze) : reset())} />
        ) : (
          <div className="flex flex-col gap-4">
            {!online && (
              <p className="mx-4 rounded-[14px] bg-black/55 backdrop-blur px-4 py-2.5 text-sm inline-flex items-center gap-2 self-center" role="status">
                <WifiOff className="size-4" aria-hidden />
                {t("beneficiary.snap.offline")}
              </p>
            )}
            {!aiOn && !blocked && (
              <p className="mx-6 text-center text-xs text-white/70">{t("beneficiary.snap.aiOff")}</p>
            )}
            {!blocked && <div className="flex items-center justify-around px-6">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="size-14 rounded-full bg-white/12 bg-white/10 backdrop-blur grid place-items-center hover:bg-white/20 disabled:opacity-50" aria-label={t("beneficiary.snap.upload")}>
                <ImagePlus className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={capture}
                disabled={camera !== "live" || busy}
                aria-label={t("beneficiary.snap.shutter")}
                className="size-[84px] rounded-full grid place-items-center ring-4 ring-white/90 disabled:opacity-40 transition-transform active:scale-95"
              >
                <span className="size-[68px] rounded-full bg-white" />
              </button>
              <button type="button" onClick={() => openPicker(null)} disabled={busy} className="size-14 rounded-full bg-white/10 backdrop-blur grid place-items-center hover:bg-white/20 disabled:opacity-50" aria-label={t("beneficiary.snap.chooseLong")}>
                <LayoutGrid className="size-6" aria-hidden />
              </button>
            </div>}
            {samples.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="px-5 text-xs font-medium uppercase tracking-[0.08em] text-white/60 sm:text-center" id="samples-h">{t("beneficiary.snap.samples")}</p>
                <ul className="flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-auto sm:max-w-full sm:w-fit" aria-labelledby="samples-h">
                  {samples.map((s) => (
                    <li key={s.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => router.push(conceptHref(s.id))}
                        className="flex items-center gap-2 h-12 ps-1.5 pe-3.5 rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
                      >
                        <ConceptImage src={s.image} alt="" hue={conceptHue(s.id, s.track)} className="size-9 rounded-full" rounded={false} />
                        <span className="text-sm font-medium whitespace-nowrap">{t("beneficiary.snap.sample", { label: conceptLabel(s, locale) })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={t("beneficiary.snap.upload")} onChange={(e) => onFile(e.target.files?.[0])} data-testid="snap-file" />

      <ConceptPicker
        open={picker.open}
        onClose={() => setPicker({ open: false, note: null })}
        concepts={concepts}
        photo={photo}
        note={picker.note}
        initialTrack={initialTrack}
      />
    </div>
  );
}

const subjectLabel = (s: Subject, locale: "en" | "ar") => (locale === "ar" ? s.label_ar || s.label_en : s.label_en || s.label_ar);

function FlagNotes({ flags }: { flags: Flags }) {
  const { t } = useI18n();
  const notes: React.ReactNode[] = [];
  if (flags.person)
    notes.push(
      <li key="p" className="flex gap-2"><UserX className="size-4 shrink-0 mt-[3px]" aria-hidden />{t("beneficiary.snap.flag.person")}</li>,
    );
  if (flags.inscription)
    notes.push(
      <li key="i" className="flex gap-2 items-start">
        <ScanText className="size-4 shrink-0 mt-[3px]" aria-hidden />
        <span>
          {t("beneficiary.snap.flag.inscription")}{" "}
          <Link href="/inscription" className="font-semibold underline underline-offset-4 inline-flex items-center min-h-11">{t("beneficiary.snap.readInscription")}</Link>
        </span>
      </li>,
    );
  if (flags.other_religious_symbol)
    notes.push(<li key="o" className="flex gap-2"><Info className="size-4 shrink-0 mt-[3px]" aria-hidden />{t("beneficiary.snap.flag.other")}</li>);
  if (flags.text_instructions)
    notes.push(<li key="t" className="flex gap-2"><Info className="size-4 shrink-0 mt-[3px]" aria-hidden />{t("beneficiary.snap.flag.text")}</li>);
  if (!notes.length) return null;
  return <ul className="flex flex-col gap-1.5 rounded-[14px] bg-surface-2 p-3 text-sm text-ink-2">{notes}</ul>;
}

function ResultPanel({
  outcome,
  label,
  byId,
  onChange,
  onRetake,
  onRetry,
}: {
  outcome: Outcome;
  label: (id: string) => string;
  byId: Map<string, ConceptSummary>;
  onChange: () => void;
  onRetake: () => void;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="mx-3 mb-1 rounded-[24px] bg-surface text-ink p-5 shadow-pop animate-rise flex flex-col gap-4" aria-live="polite" aria-labelledby="result-h" data-testid="snap-result">
      {outcome.kind === "match" && (
        <>
          <div className="flex flex-col gap-2">
            <h2 id="result-h" className="text-sm font-medium text-ink-3">
              {outcome.candidates[0]?.tier === "confident" ? t("beneficiary.snap.looksLike") : t("beneficiary.snap.mightBe")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {outcome.candidates.map((c, i) => {
                const has = byId.get(c.concept_id)?.has_card;
                return (
                  <Link
                    key={c.concept_id}
                    href={conceptHref(c.concept_id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full font-semibold transition-colors",
                      i === 0 ? "h-12 ps-4 pe-5 bg-accent text-accent-ink text-lg hover:bg-accent-hover" : "h-11 px-4 bg-surface-2 text-ink text-sm hover:bg-surface-3",
                    )}
                  >
                    {i === 0 && <Check className="size-5" aria-hidden />}
                    {label(c.concept_id)}
                    {has && <BadgeCheck className={cn("size-4", i === 0 ? "" : "text-ok")} aria-label={t("beneficiary.tile.approved")} />}
                  </Link>
                );
              })}
            </div>
          </div>
          {outcome.subject && outcome.subject.category !== "person" && !(outcome.candidates[0]?.tier === "confident" && byId.get(outcome.candidates[0].concept_id)?.has_card) && (
            <Link href={discoverHref(outcome.subject)} className="h-11 rounded-[12px] bg-surface-2 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-surface-3" data-testid="snap-discover">
              <BookOpen className="size-4" aria-hidden />{t("discover.fromSnapCta")}: <bdi>{subjectLabel(outcome.subject, locale)}</bdi>
            </Link>
          )}
          <FlagNotes flags={outcome.flags} />
          <div className="flex gap-2">
            <button type="button" onClick={onChange} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("beneficiary.snap.change")}</button>
            <button type="button" onClick={onRetake} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2 inline-flex items-center justify-center gap-1.5"><RefreshCw className="size-4" aria-hidden />{t("beneficiary.snap.retake")}</button>
          </div>
        </>
      )}
      {outcome.kind === "nothing" && outcome.subject && outcome.subject.category !== "person" && !outcome.unsure && (
        <>
          <div className="flex flex-col gap-1">
            <h2 id="result-h" className="text-sm font-medium text-ink-3">{t("discover.looksLike")}</h2>
            <p className="text-2xl font-semibold first-letter:uppercase" data-testid="snap-subject">{subjectLabel(outcome.subject, locale)}</p>
            <p className="text-sm text-ink-2">{t("discover.fromSnapBody")}</p>
          </div>
          <FlagNotes flags={outcome.flags} />
          <div className="flex flex-col gap-2">
            <Link href={discoverHref(outcome.subject)} className="h-12 rounded-[14px] bg-accent text-accent-ink font-semibold inline-flex items-center justify-center gap-2" data-testid="snap-discover"><BookOpen className="size-5" aria-hidden />{t("discover.fromSnapCta")}</Link>
            <div className="flex gap-2">
              <button type="button" onClick={onChange} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("beneficiary.snap.change")}</button>
              <button type="button" onClick={onRetake} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("beneficiary.snap.retake")}</button>
            </div>
          </div>
        </>
      )}
      {outcome.kind === "nothing" && !(outcome.subject && outcome.subject.category !== "person" && !outcome.unsure) && (
        <>
          <div className="flex flex-col gap-1">
            <h2 id="result-h" className="text-lg font-semibold">{outcome.unsure ? t("beneficiary.snap.unsure") : t("beneficiary.snap.none")}</h2>
            <p className="text-sm text-ink-2">{t("beneficiary.snap.noneBody")}</p>
          </div>
          <FlagNotes flags={outcome.flags} />
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onChange} className="h-12 rounded-[14px] bg-accent text-accent-ink font-semibold inline-flex items-center justify-center gap-2"><LayoutGrid className="size-5" aria-hidden />{t("beneficiary.snap.chooseLong")}</button>
            <div className="flex gap-2">
              <button type="button" onClick={onRetake} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("beneficiary.snap.retake")}</button>
              <Link href="/talk" className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2 inline-flex items-center justify-center gap-1">{t("beneficiary.card.talk")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Link>
            </div>
          </div>
        </>
      )}
      {outcome.kind === "error" && (
        <>
          <div className="flex flex-col gap-1">
            <h2 id="result-h" className="text-lg font-semibold inline-flex items-center gap-2">
              {outcome.offline && <WifiOff className="size-5" aria-hidden />}
              {outcome.offline ? t("beneficiary.snap.offlineTitle") : t("beneficiary.snap.errorTitle")}
            </h2>
            <p className="text-sm text-ink-2">{outcome.offline ? t("beneficiary.snap.offlineBody") : t("beneficiary.snap.errorBody")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onChange} className="h-12 rounded-[14px] bg-accent text-accent-ink font-semibold inline-flex items-center justify-center gap-2"><LayoutGrid className="size-5" aria-hidden />{t("beneficiary.snap.chooseLong")}</button>
            <div className="flex gap-2">
              <button type="button" onClick={onRetry} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("action.retry")}</button>
              <button type="button" onClick={onRetake} className="flex-1 h-11 rounded-[12px] border border-line-strong text-sm font-medium hover:bg-surface-2">{t("beneficiary.snap.retake")}</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
