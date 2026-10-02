"use client";
import { useEffect, useState } from "react";
import { BookMarked, CheckCircle2, Download, Share2, ShieldCheck, Sparkles, Circle } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { renderShareCard, type ShareCardData } from "./share-image";

/* ─────────────────────────────── Glossary chips → sheet with the approved rule */
export interface TermView {
  id: string;
  term_ar: string;
  term_en: string;
  rule: string;
  source: string;
}

export function GlossaryChips({ terms }: { terms: TermView[] }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<TermView | null>(null);
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <li key={term.id}>
            <button
              type="button"
              onClick={() => setOpen(term)}
              className="inline-flex items-center gap-2 h-11 ps-3 pe-4 rounded-full border border-line-strong bg-surface text-sm font-medium text-ink hover:bg-surface-2"
            >
              <BookMarked className="size-4 text-accent" aria-hidden />
              {locale === "ar" ? term.term_ar : <span>{term.term_en} <bdi lang="ar" className="text-ink-3 ms-1">{term.term_ar}</bdi></span>}
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? (locale === "ar" ? open.term_ar : open.term_en) : ""}
        description={t("beneficiary.card.glossaryApproved")}
        closeLabel={t("action.close")}
      >
        {open && (
          <div className="flex flex-col gap-4">
            <p lang="ar" dir="rtl" className="text-2xl font-semibold text-ink" style={{ fontFamily: "var(--font-arabic)" }}>{open.term_ar}</p>
            <p className="text-ink leading-relaxed">{open.rule}</p>
            <p className="text-xs text-ink-3">{t("beneficiary.card.source")}: {open.source}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ─────────────────────────────── "Why trust this?" provenance sheet */
export interface ProvenanceView {
  stages: { key: string; title: string; who: string | null; role: string | null; institution: string | null; demo: boolean; date: string | null; note: string | null; desc?: string | null; done: boolean }[];
  checks: string[];
  footer: string;
}

export const ACTION_TILE =
  "flex flex-col items-center justify-center gap-1.5 min-h-[4.25rem] rounded-[16px] border border-line bg-surface px-2 py-2.5 text-[0.8rem] font-medium leading-tight text-ink text-center hover:bg-surface-2 disabled:opacity-60";

export function ProvenanceButton({ data, variant = "chip" }: { data: ProvenanceView; variant?: "chip" | "link" | "tile" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "chip" && "inline-flex items-center gap-2 h-11 px-4 rounded-full bg-accent-soft text-ink text-sm font-medium hover:brightness-95",
          variant === "link" && "inline-flex items-center gap-1.5 min-h-11 text-sm font-medium text-accent underline-offset-4 hover:underline",
          variant === "tile" && cn(ACTION_TILE, "bg-accent-soft border-transparent hover:bg-accent-soft hover:brightness-95"),
        )}
      >
        <ShieldCheck className="size-5 text-accent" aria-hidden />
        {t("beneficiary.trust.open")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("beneficiary.trust.title")} description={t("beneficiary.trust.intro")} closeLabel={t("action.close")}>
        <ol className="relative flex flex-col gap-0 mt-1" aria-label={t("beneficiary.trust.timeline")}>
          {data.stages.map((s, i) => (
            <li key={s.key + i} className="relative flex gap-3 pb-5 last:pb-1">
              {i < data.stages.length - 1 && <span className="absolute start-[15px] top-8 bottom-0 w-0.5 bg-line" aria-hidden />}
              <span className={cn("relative z-10 size-8 shrink-0 rounded-full grid place-items-center", s.done ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3")}>
                {s.done ? <CheckCircle2 className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0 pt-1">
                <span className="text-sm font-semibold text-ink">{s.title}</span>
                {s.who && (
                  <span className="text-sm text-ink-2">
                    {s.who}
                    {s.role && <span className="text-ink-3"> · {s.role}</span>}
                    {s.demo && <span className="ms-1.5 text-[0.7rem] uppercase tracking-wider text-ink-3 border border-line rounded-full px-1.5 py-px align-middle">{t("badge.demo")}</span>}
                  </span>
                )}
                {s.institution && <span className="text-sm text-ink-3">{s.institution}</span>}
                {s.date && <span className="text-xs text-ink-3">{s.date}</span>}
                {s.desc && <span className="text-sm text-ink-2">{s.desc}</span>}
                {s.note && <span className="text-sm text-ink-2 italic mt-1">“{s.note}”</span>}
              </div>
            </li>
          ))}
        </ol>
        {data.checks.length > 0 && (
          <div className="mt-4 rounded-[14px] bg-surface-2 p-4">
            <h3 className="text-sm font-semibold text-ink mb-2">{t("beneficiary.trust.checks")}</h3>
            <ul className="flex flex-col gap-2">
              {data.checks.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-ink-2">
                  <CheckCircle2 className="size-4 text-ok shrink-0 mt-[3px]" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-3">{data.footer}</p>
      </Sheet>
    </>
  );
}

/* ─────────────────────────────── Share + Save as image */
export function CardActions({ path, title, share }: { path: string; title: string; share: Omit<ShareCardData, "url"> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const url = () => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString());

  const onShare = async () => {
    const data = { title, text: title, url: url() };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(data.url);
      toast({ tone: "ok", text: t("beneficiary.card.linkCopied") });
    } catch {
      toast({ tone: "info", text: data.url });
    }
  };

  const onSaveImage = async () => {
    setBusy(true);
    try {
      const host = typeof window === "undefined" ? "" : window.location.host;
      const blob = await renderShareCard({ ...share, url: host + path });
      const name = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "card"}.png`;
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title });
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast({ tone: "ok", text: t("beneficiary.card.imageSaved") });
    } catch {
      toast({ tone: "bad", text: t("beneficiary.card.imageFailed") });
    } finally {
      setBusy(false);
    }
  };

  const btn = ACTION_TILE;
  return (
    <>
      <button type="button" onClick={onShare} className={btn}>
        <Share2 className="size-5" aria-hidden />
        {t("action.share")}
      </button>
      <button type="button" onClick={onSaveImage} className={btn} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <span className="size-5 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden /> : <Download className="size-5" aria-hidden />}
        {t("beneficiary.card.saveImage")}
      </button>
    </>
  );
}

/* ─────────────────────────────── Long text that expands */
export function Expandable({ children, lines = 5, className, moreLabel, lessLabel }: { children: React.ReactNode; lines?: number; className?: string; moreLabel: string; lessLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 items-start">
      <div className={cn(className, !open && "overflow-hidden")} style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }}>
        {children}
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-11 text-sm font-medium text-accent hover:underline underline-offset-4">
        {open ? lessLabel : moreLabel}
      </button>
    </div>
  );
}

/* ─────────────────────────────── "Just approved by …" banner (after a live publish) */
export function JustApproved({ text }: { text: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has("approved")) {
      u.searchParams.delete("approved");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    }
    const id = setTimeout(() => setShow(false), 12000);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="animate-pop flex items-center gap-3 rounded-[16px] bg-brand text-brand-ink px-4 py-3 shadow-pop">
      <span className="size-9 rounded-full bg-accent text-accent-ink grid place-items-center shrink-0">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <span className="font-medium">{text}</span>
    </div>
  );
}
