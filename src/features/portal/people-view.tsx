"use client";
import { useState } from "react";
import { Award, Building2, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber, fmtRelative } from "@/i18n/core";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/chip";
import { Card } from "@/components/ui/surface";
import { cn } from "@/components/ui/cn";
import { api } from "./client";
import type { Contribution, PersonRow } from "./server";

interface Data {
  people: PersonRow[];
  contributions: Contribution[];
  institutions: { id: string; name_en: string; name_ar: string; kind: string; is_demo: boolean }[];
  ownOnly: boolean;
}

export function PeopleView({ initial, canReveal, demo }: { initial: Data; canReveal: boolean; demo: boolean }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState(initial);
  const [names, setNames] = useState(false);
  const toggle = async (on: boolean) => {
    setNames(on);
    const r = await api<Data>(`/api/people${on ? "?names=1" : ""}`);
    if (r.ok) setData(r.data);
  };
  const nm = (p: { display_name_en: string; display_name_ar: string }) => (locale === "ar" ? p.display_name_ar : p.display_name_en);
  const tag = (p: { is_demo?: boolean }) => (demo && p.is_demo ? ` (${t("badge.demo")})` : "");
  const max = Math.max(1, ...data.people.map((p) => p.points));

  if (data.ownOnly) {
    const me = data.people[0];
    return (
      <div className="flex flex-col gap-5 max-w-3xl">
        <header>
          <h1 className="text-2xl font-semibold">{t("portal.people.yourProgress")}</h1>
          <p className="text-ink-2 mt-1">{t("portal.people.yourProgressBody")}</p>
        </header>
        {me && (
          <Card className="p-6 flex flex-wrap items-center gap-6">
            <span className="size-16 rounded-2xl bg-accent-soft text-accent grid place-items-center"><Sparkles className="size-8" aria-hidden /></span>
            <div>
              <p className="text-4xl font-semibold tabular">{fmtNumber(me.points, locale)}</p>
              <p className="text-ink-2">{t("portal.dash.stat.points")}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge>{t("portal.people.cards", { n: fmtNumber(me.cards_created, locale) })}</Badge>
              <Badge tone="ok">{t("portal.people.accepted", { n: fmtNumber(me.approved_contributions, locale) })}</Badge>
            </div>
          </Card>
        )}
        <Contributions items={data.contributions} names nm={nm} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("portal.people.title")}</h1>
          <p className="text-ink-2 mt-0.5 max-w-[70ch]">{t("portal.people.subtitle")}</p>
        </div>
        {canReveal && (
          <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer rounded-full border border-line bg-surface h-11 px-4">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={names} onChange={(e) => void toggle(e.target.checked)} data-testid="show-names" />
            {t("portal.people.showNames")}
          </label>
        )}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <Card className="p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Award className="size-5 text-accent" aria-hidden />{t("portal.people.leaderboard")}</h2>
          <ol className="flex flex-col" data-testid="leaderboard">
            {data.people.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 py-3 border-b border-line last:border-0">
                <span className="w-6 text-center text-sm font-semibold text-ink-3 tabular">{fmtNumber(i + 1, locale)}</span>
                <Avatar name={nm(p)} hue={p.avatar_hue} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate" data-testid="person-name">{nm(p)}<span className="text-xs text-ink-3">{tag(p)}</span></p>
                  <p className="text-xs text-ink-3 truncate">{t(`role.${p.role}`)}{p.institution_en ? ` · ${locale === "ar" ? p.institution_ar : p.institution_en}` : ""}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(p.points / max) * 100}%` }} />
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-ink-3">
                  <span>{t("portal.people.cards", { n: fmtNumber(p.cards_created, locale) })} · {t("portal.people.reviews", { n: fmtNumber(p.reviews_done, locale) })}</span>
                </div>
                <span className={cn("min-w-16 text-end font-semibold tabular", p.points ? "text-ink" : "text-ink-3")}>{t("portal.people.points", { n: fmtNumber(p.points, locale) })}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-3 flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden />{t("portal.people.privacy")}</p>
        </Card>

        <div className="flex flex-col gap-5">
          <Contributions items={data.contributions} names={names} nm={nm} />
          <Card className="p-4 sm:p-5 flex flex-col gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="size-5 text-ink-2" aria-hidden />{t("portal.people.institutions")}</h2>
            <ul className="flex flex-col gap-3">
              {data.institutions.map((inst) => {
                const members = data.people.filter((p) => p.institution_id === inst.id);
                return (
                  <li key={inst.id} className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-ink">{locale === "ar" ? inst.name_ar : inst.name_en}{tag(inst)} <span className="text-ink-3 font-normal">· {t("portal.people.members", { n: fmtNumber(members.length, locale) })}</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 ps-1 pe-3 h-8 text-xs">
                          <Avatar name={nm(m)} hue={m.avatar_hue} size={24} />
                          <span className="text-ink">{nm(m)}</span>
                          <span className="text-ink-3">· {t(`role.${m.role}`)}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Contributions({ items, nm }: { items: Contribution[]; names: boolean; nm: (p: { display_name_en: string; display_name_ar: string }) => string }) {
  const { t, locale } = useI18n();
  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("portal.people.recent")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">{t("portal.people.recentEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-start gap-3 text-sm">
              <Badge tone="ok" className="tabular shrink-0">+{fmtNumber(c.delta, locale)}</Badge>
              <span className="flex-1 min-w-0">
                <span className="text-ink"><span className="font-medium">{nm(c)}</span> · {t(`portal.people.reason.${c.reason}`)}{c.title_en ? <> · <bdi>“{locale === "ar" ? c.title_ar : c.title_en}”</bdi></> : null}</span>
                <span className="block text-xs text-ink-3" suppressHydrationWarning>{fmtRelative(c.created_at, locale)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
