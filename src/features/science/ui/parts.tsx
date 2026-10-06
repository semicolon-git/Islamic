import Link from "next/link";
import { ExternalLink, FlaskConical, ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n/core";
import type { Source } from "../server";

/** Shared server-rendered pieces of the science pages. */

export const L = (locale: Locale, en?: string | null, ar?: string | null) => (locale === "ar" ? ar || en || "" : en || ar || "");

export function Chips({ items, href, locale }: { items: { id: string; name_en: string; name_ar: string }[]; href: (id: string) => string; locale: Locale }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={href(i.id)} className="inline-flex items-center gap-1 min-h-11 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink hover:bg-surface-3">
            {L(locale, i.name_en, i.name_ar)}
            <ChevronRight className="size-4 rtl:rotate-180 text-ink-3" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Sources({ sources, title }: { sources: Source[]; title: string }) {
  if (!sources?.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      <ol className="flex flex-col gap-1.5 text-sm text-ink-2 list-decimal ps-5">
        {sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 decoration-line-strong hover:text-ink" dir="auto">
              {s.citation}
            </a>{" "}
            <ExternalLink className="inline size-3.5 text-ink-3" aria-hidden />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="text-ink-2 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-ink">
      <FlaskConical className="size-3.5 text-accent" aria-hidden />
      {children}
    </span>
  );
}

/** IAU star name → Sky-mode star page slug. */
export const starHref = (iau: string) => `/sky/star/${iau.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
