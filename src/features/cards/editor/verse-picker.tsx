"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2, AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber } from "@/i18n/core";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import type { CardContent } from "@/lib/cards/types";
import { api } from "@/features/portal/client";
import type { VerseHit } from "../server";

type Refs = CardContent["verses"];
const QURAN_FONT = { fontFamily: '"KFGQPC Hafs", "Amiri", serif' } as const;
type SearchRes = { mode: "key" | "arabic" | "english"; status?: string; hits: VerseHit[] };

export function move<T>(xs: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function VersePicker({ value, onChange, resolved, onHits, disabled, missing }: { value: Refs; onChange: (v: Refs) => void; resolved: Map<string, VerseHit>; onHits: (h: VerseHit[]) => void; disabled?: boolean; missing: string[] }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SearchRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const keys = new Set(value.map((v) => v.key));

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api<SearchRes>(`/api/cards/verses?q=${encodeURIComponent(q.trim())}`);
    setBusy(false);
    if (r.ok) {
      setRes(r.data);
      onHits(r.data.hits);
    } else setErr(r.error.message);
  };
  const add = (h: VerseHit) => {
    if (keys.has(h.key)) return;
    onChange([...value, { key: h.key, role: value.some((v) => v.role === "primary") ? "supporting" : "primary" }]);
  };
  const addAll = () => {
    if (!res) return;
    let next = [...value];
    for (const h of res.hits) if (!next.some((v) => v.key === h.key)) next = [...next, { key: h.key, role: next.some((v) => v.role === "primary") ? "supporting" : "primary" }];
    onChange(next);
  };
  const sura = (h: VerseHit) => (locale === "ar" ? `سورة ${h.sura_name_ar}` : h.sura_name_en);

  return (
    <div className="flex flex-col gap-4">
      {/* selected */}
      {value.length === 0 ? (
        <p className="text-sm text-ink-3 rounded-[12px] border border-dashed border-line-strong p-4">{t("cards.verses.none")}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="selected-verses">
          {value.map((v, i) => {
            const h = resolved.get(v.key);
            const bad = missing.includes(v.key);
            return (
              <li key={v.key} className={cn("rounded-[12px] border p-3 flex flex-col gap-2", bad ? "border-bad bg-bad-soft" : "border-line bg-surface-2/50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-sm font-medium text-ink" dir="ltr">{v.key}</span>
                  {h && <span className="text-sm text-ink-2">{sura(h)}</span>}
                  {bad && <span className="text-sm text-bad inline-flex items-center gap-1"><AlertCircle className="size-4" aria-hidden />{t("cards.verses.missing")}</span>}
                  <span className="ms-auto flex items-center gap-1">
                    <Select
                      aria-label={`${t("cards.verses.role")} ${v.key}`}
                      value={v.role}
                      disabled={disabled}
                      onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, role: e.target.value as "primary" | "supporting" } : x)))}
                      className="h-9 w-auto text-sm py-0"
                    >
                      <option value="primary">{t("cards.verses.role.primary")}</option>
                      <option value="supporting">{t("cards.verses.role.supporting")}</option>
                    </Select>
                    {!disabled && (
                      <>
                        <IconButton size="sm" label={`${t("cards.moveUp")} ${v.key}`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}><ArrowUp className="size-4" /></IconButton>
                        <IconButton size="sm" label={`${t("cards.moveDown")} ${v.key}`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}><ArrowDown className="size-4" /></IconButton>
                        <IconButton size="sm" label={`${t("cards.remove")} ${v.key}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
                      </>
                    )}
                  </span>
                </div>
                {h && <p lang="ar" dir="rtl" style={QURAN_FONT} className="text-[1.25rem] leading-[2] text-ink line-clamp-2">{h.text_uthmani}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {/* search */}
      {!disabled && (
        <form onSubmit={search} className="flex flex-col gap-3" role="search">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cards.verses.search")} aria-label={t("cards.verses.searchLabel")} className="ps-10" dir="auto" data-testid="verse-search" />
            </div>
            <Button type="submit" variant="secondary" loading={busy}>{t("cards.verses.find")}</Button>
          </div>
          <div aria-live="polite">
            {busy && <Spinner label={t("state.loading")} />}
            {err && <p className="text-sm text-bad">{err}</p>}
            {res && !busy && (
              res.hits.length === 0 ? (
                <p className="text-sm text-ink-2">{res.status === "too_short" ? t("cards.verses.tooShort") : t("cards.verses.noResults")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-ink-3">
                    <span>{t("cards.verses.results", { n: fmtNumber(res.hits.length, locale) })}</span>
                    {res.mode === "key" && res.hits.length > 1 && <button type="button" onClick={addAll} className="font-medium text-accent hover:underline">{t("cards.verses.add")} ({fmtNumber(res.hits.length, locale)})</button>}
                  </div>
                  <ul className="flex flex-col gap-2 max-h-[420px] overflow-y-auto scrollbar-thin pe-1">
                    {res.hits.map((h) => {
                      const added = keys.has(h.key);
                      return (
                        <li key={h.key} className="rounded-[12px] border border-line p-3 flex flex-col gap-1.5 bg-surface">
                          <div className="flex items-center gap-2">
                            <span className="mono text-sm font-medium" dir="ltr">{h.key}</span>
                            <span className="text-sm text-ink-2 truncate">{sura(h)}</span>
                            {h.match && <Badge tone={h.match === "exact" || h.match === "key" ? "ok" : "neutral"}>{t(`cards.verses.match.${h.match}`)}{h.similarity ? ` ${Math.round(h.similarity * 100)}%` : ""}</Badge>}
                            <Button type="button" size="sm" variant={added ? "ghost" : "soft"} className="ms-auto" disabled={added} onClick={() => add(h)} aria-label={`${added ? t("cards.verses.added") : t("cards.verses.add")} ${h.key}`}>
                              {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                              {added ? t("cards.verses.added") : t("cards.verses.add")}
                            </Button>
                          </div>
                          <p lang="ar" dir="rtl" style={QURAN_FONT} className="text-[1.2rem] leading-[2] text-ink line-clamp-2">{h.text_uthmani}</p>
                          {h.translation && <p className="text-sm text-ink-2 line-clamp-2" dir="ltr" lang="en">{h.translation}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            )}
          </div>
        </form>
      )}
    </div>
  );
}
