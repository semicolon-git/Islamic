"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2, AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/chip";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import type { CardContent } from "@/lib/cards/types";
import { api } from "@/features/portal/client";
import type { HadithHit } from "../server";
import { move } from "./verse-picker";

type Refs = CardContent["hadith"];

function HadithLine({ h }: { h: HadithHit }) {
  const { t, locale } = useI18n();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">{locale === "ar" ? h.collection_ar : h.collection_en}</span>
        <span className="mono text-ink-2" dir="ltr">{h.number}</span>
        <Badge tone="ok">{t("cards.hadith.grade", { grade: h.grade })}</Badge>
      </div>
      <p lang="ar" dir="rtl" className="text-[1rem] leading-[1.95] text-ink line-clamp-3">{h.text_ar}</p>
      {h.text_en && <p dir="ltr" lang="en" className="text-sm text-ink-2 line-clamp-2">{h.text_en}</p>}
    </>
  );
}

export function HadithPicker({ value, onChange, resolved, onHits, disabled, missing }: { value: Refs; onChange: (v: Refs) => void; resolved: Map<string, HadithHit>; onHits: (h: HadithHit[]) => void; disabled?: boolean; missing: string[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<HadithHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ids = new Set(value.map((v) => v.id));

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ mode: string; hits: HadithHit[] }>(`/api/cards/hadith?q=${encodeURIComponent(q.trim())}`);
    setBusy(false);
    if (r.ok) {
      setHits(r.data.hits);
      onHits(r.data.hits);
    } else setErr(r.error.message);
  };

  return (
    <div className="flex flex-col gap-4">
      {value.length === 0 ? (
        <p className="text-sm text-ink-3 rounded-[12px] border border-dashed border-line-strong p-4">{t("cards.hadith.none")}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="selected-hadith">
          {value.map((v, i) => {
            const h = resolved.get(v.id);
            const bad = missing.includes(v.id);
            return (
              <li key={v.id} className={cn("rounded-[12px] border p-3 flex flex-col gap-1.5", bad ? "border-bad bg-bad-soft" : "border-line bg-surface-2/50")}>
                <div className="flex items-center gap-2">
                  <span className="mono text-sm font-medium" dir="ltr">{v.id}</span>
                  {bad && <span className="text-sm text-bad inline-flex items-center gap-1"><AlertCircle className="size-4" aria-hidden />{t("cards.hadith.missing")}</span>}
                  {!disabled && (
                    <span className="ms-auto flex items-center gap-1">
                      <IconButton size="sm" label={`${t("cards.moveUp")} ${v.id}`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}><ArrowUp className="size-4" /></IconButton>
                      <IconButton size="sm" label={`${t("cards.moveDown")} ${v.id}`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}><ArrowDown className="size-4" /></IconButton>
                      <IconButton size="sm" label={`${t("cards.remove")} ${v.id}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
                    </span>
                  )}
                </div>
                {h && <HadithLine h={h} />}
              </li>
            );
          })}
        </ol>
      )}
      {!disabled && (
        <form onSubmit={search} className="flex flex-col gap-3" role="search">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cards.hadith.search")} aria-label={t("cards.hadith.searchLabel")} className="ps-10" dir="auto" data-testid="hadith-search" />
            </div>
            <Button type="submit" variant="secondary" loading={busy}>{t("cards.verses.find")}</Button>
          </div>
          <div aria-live="polite">
            {busy && <Spinner label={t("state.loading")} />}
            {err && <p className="text-sm text-bad">{err}</p>}
            {hits && !busy && (hits.length === 0 ? (
              <p className="text-sm text-ink-2">{t("cards.hadith.noResults")}</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-[420px] overflow-y-auto scrollbar-thin pe-1">
                {hits.map((h) => {
                  const added = ids.has(h.id);
                  return (
                    <li key={h.id} className="rounded-[12px] border border-line p-3 flex flex-col gap-1.5 bg-surface">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0"><HadithLine h={h} /></div>
                        <Button type="button" size="sm" variant={added ? "ghost" : "soft"} disabled={added} onClick={() => onChange([...value, { id: h.id }])} aria-label={`${added ? t("cards.verses.added") : t("cards.verses.add")} ${h.id}`}>
                          {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                          {added ? t("cards.verses.added") : t("cards.verses.add")}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
