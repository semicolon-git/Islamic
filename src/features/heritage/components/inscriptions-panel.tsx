"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Plus, ScanText, Search, X } from "lucide-react";
import { Badge, Button, Callout, Card, Chip, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/lib/auth";
import type { InscriptionView } from "../inscription-view";
import { loc, num } from "../l10n";
import type { InscriptionRow } from "../types";

const MATCH_LABEL: Record<string, string> = {
  exact: "heritage.task.matchExact",
  near: "heritage.task.matchNear",
  none: "heritage.task.matchNone",
  too_short: "heritage.task.matchShort",
};
const STATUS_TONE = { suggested: "violet", confirmed: "ok", rejected: "neutral" } as const;

/** Keys the matcher proposed for an inscription (all exact locations, or the near candidates). */
function proposals(match: unknown): string[][] {
  const m = match as { status?: string; locations?: { verses: string[] }[]; candidates?: { verses: string[] }[] } | null;
  if (m?.status === "exact") return (m.locations ?? []).map((l) => l.verses);
  if (m?.status === "near") return (m.candidates ?? []).map((c) => c.verses);
  return [];
}
const ref = (keys: string[]) => (keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1].split(":")[1]}` : keys[0]);

/**
 * The "Read the inscription" task: a student types the inscription as written, the matcher proposes verses,
 * the student links them, and a researcher (not the reader) confirms.
 */
export function InscriptionsPanel({
  itemId,
  rows,
  user,
  demo,
}: {
  itemId: string;
  rows: InscriptionRow[];
  user: { id: string; role: Role };
  demo: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(rows.length === 0);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<InscriptionView | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const researcher = user.role === "researcher" || user.role === "platform_admin";
  const d = (flag: boolean | null) => (demo && flag ? ` (${t("badge.demo")})` : "");

  const call = async (key: string, url: string, init: RequestInit) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error?.message);
      router.refresh();
      return j.data;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("state.error"));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const find = async () => {
    if (!text.trim()) return;
    const data = await call("find", "/api/inscribe", { method: "POST", body: JSON.stringify({ text }) });
    if (!data) return;
    const v = data.view as InscriptionView;
    setPreview(v);
    setPicked(v.status === "exact" ? [...new Set(v.locations.flatMap((l) => l.keys))] : []);
  };
  const save = async () => {
    const data = await call("save", `/api/items/${itemId}/inscriptions`, { method: "POST", body: JSON.stringify({ transcription: text, verse_keys: picked }) });
    if (data) {
      setText("");
      setPreview(null);
      setPicked([]);
      setAdding(false);
      toast({ tone: "ok", text: t("heritage.task.status.suggested") });
    }
  };
  const groups = preview?.status === "exact" ? preview.locations.map((l) => l.keys) : preview?.status === "near" ? preview.candidates.map((c) => c.keys) : [];

  return (
    <Card className="p-5 flex flex-col gap-4" data-testid="inscriptions-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <ScanText className="size-5 text-accent" aria-hidden />
            {t("heritage.task.title")}
          </h2>
          <p className="text-sm text-ink-2 max-w-[70ch]">{t("heritage.task.body")}</p>
        </div>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)} data-testid="add-inscription">
            <Plus className="size-4" aria-hidden />
            {t("heritage.task.add")}
          </Button>
        )}
      </div>

      {rows.length === 0 && !adding && <p className="text-sm text-ink-3">{t("heritage.task.empty")}</p>}

      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const prop = proposals(r.match);
          const canLink = r.status === "suggested" && (researcher || r.author_id === user.id);
          const canConfirm = r.status === "suggested" && researcher && r.author_id !== user.id;
          return (
            <li key={r.id} className="rounded-[14px] border border-line overflow-hidden" data-testid="inscription-row" data-status={r.status}>
              <div className="bg-sand/70 px-4 py-3">
                <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-xl leading-[2] text-sand-ink">{r.transcription}</p>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={STATUS_TONE[r.status]}>{t(`heritage.task.status.${r.status}`)}</Badge>
                  {r.match_status && <Badge tone="neutral">{t(MATCH_LABEL[r.match_status])}</Badge>}
                  {r.author_name_en && <span className="text-ink-3">{t("heritage.task.by", { name: loc(locale, r.author_name_en, r.author_name_ar) + d(r.author_is_demo) })}</span>}
                  {r.verifier_name_en && r.status !== "suggested" && <span className="text-ink-3">· {t("heritage.task.confirmedBy", { name: loc(locale, r.verifier_name_en, r.verifier_name_ar) + d(r.verifier_is_demo) })}</span>}
                </div>
                {prop.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("heritage.task.proposed")}</span>
                    {prop.map((keys) => {
                      const on = keys.every((k) => r.verse_keys.includes(k));
                      const next = on ? r.verse_keys.filter((k) => !keys.includes(k)) : [...new Set([...r.verse_keys, ...keys])];
                      return canLink ? (
                        <Chip key={keys.join()} selected={on} onClick={() => call(`link-${r.id}`, `/api/items/inscriptions/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: "link", verse_keys: next }) })} disabled={!!busy}>
                          {on ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
                          <span className="mono" dir="ltr">{ref(keys)}</span>
                        </Chip>
                      ) : (
                        <Badge key={keys.join()} tone={on ? "ok" : "neutral"}>
                          <span className="mono" dir="ltr">{ref(keys)}</span>
                          {on && <Check className="size-3" aria-hidden />}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">{t("heritage.task.noVerse")}</p>
                )}
                {r.status === "suggested" && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {canConfirm ? (
                      <>
                        <Button size="sm" onClick={() => call(`c-${r.id}`, `/api/items/inscriptions/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) }).then((x) => x && toast({ tone: "ok", text: t("heritage.task.points", { n: num(locale, 10) }) }))} loading={busy === `c-${r.id}`} disabled={!!busy} data-testid="confirm-inscription">
                          <Check className="size-4" aria-hidden />
                          {t("heritage.task.confirm")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => call(`r-${r.id}`, `/api/items/inscriptions/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: "reject" }) })} loading={busy === `r-${r.id}`} disabled={!!busy}>
                          <X className="size-4" aria-hidden />
                          {t("heritage.task.reject")}
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-ink-3">{t("heritage.task.selfConfirm")}</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line-strong p-4" data-testid="inscription-task">
          <label htmlFor="ins-task-text" className="text-sm font-medium text-ink">{t("heritage.task.transcription")}</label>
          <textarea
            id="ins-task-text"
            lang="ar"
            dir="rtl"
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            className="w-full rounded-[12px] border border-line-strong bg-sand/40 px-4 py-2.5 font-[family-name:var(--font-ms)] text-xl leading-[2] text-ink focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={find} loading={busy === "find"} disabled={!text.trim() || !!busy} data-testid="find-verses">
              <Search className="size-4" aria-hidden />
              {t("heritage.task.find")}
            </Button>
            {rows.length > 0 && (
              <Button variant="ghost" onClick={() => setAdding(false)}>
                {t("action.cancel")}
              </Button>
            )}
          </div>
          {preview && (
            <div className="flex flex-col gap-3 animate-rise" aria-live="polite" data-testid="task-preview" data-status={preview.status}>
              <Badge tone={preview.status === "exact" ? "ok" : preview.status === "near" ? "warn" : "neutral"} className="self-start">
                {t(MATCH_LABEL[preview.status])}
              </Badge>
              {groups.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("heritage.task.proposed")}</span>
                  {groups.map((keys) => {
                    const on = keys.every((k) => picked.includes(k));
                    return (
                      <Chip key={keys.join()} selected={on} onClick={() => setPicked((p) => (on ? p.filter((k) => !keys.includes(k)) : [...new Set([...p, ...keys])]))}>
                        {on ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
                        <span className="mono" dir="ltr">{ref(keys)}</span>
                      </Chip>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-ink-2">{t("heritage.task.noVerse")}</p>
              )}
              <Button onClick={save} loading={busy === "save"} disabled={!!busy} className={cn("self-start")} data-testid="save-inscription">
                {t("heritage.task.save")}
              </Button>
            </div>
          )}
        </div>
      )}
      <div aria-live="polite">{error && <Callout tone="bad">{error}</Callout>}</div>
    </Card>
  );
}
