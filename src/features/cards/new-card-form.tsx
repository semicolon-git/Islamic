"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, MessageCircleQuestion } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber } from "@/i18n/core";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { Callout } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { api } from "@/features/portal/client";

export interface ConceptOption {
  id: string;
  track: string;
  label_en: string;
  label_ar: string;
  open_requests: number;
  cards: string[];
}

export function NewCardForm({ concepts, initialConcept, initialKind, initialTitle }: { concepts: ConceptOption[]; initialConcept: string | null; initialKind: "concept" | "answer"; initialTitle: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState<"concept" | "answer">(initialKind);
  const [conceptId, setConceptId] = useState<string>(initialConcept ?? "");
  const pre = concepts.find((c) => c.id === initialConcept);
  const [titleEn, setTitleEn] = useState(initialTitle || (pre ? pre.label_en : ""));
  const [titleAr, setTitleAr] = useState(pre ? pre.label_ar : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const concept = concepts.find((c) => c.id === conceptId);
  const groups = useMemo(() => {
    const by = new Map<string, ConceptOption[]>();
    for (const c of concepts) by.set(c.track, [...(by.get(c.track) ?? []), c]);
    return [...by.entries()];
  }, [concepts]);

  const pickConcept = (id: string) => {
    const prev = concepts.find((c) => c.id === conceptId);
    const next = concepts.find((c) => c.id === id);
    setConceptId(id);
    // follow the concept's labels unless the author already typed their own title
    if (next && (!titleEn || titleEn === prev?.label_en)) setTitleEn(next.label_en);
    if (next && (!titleAr || titleAr === prev?.label_ar)) setTitleAr(next.label_ar);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>("/api/cards", { method: "POST", json: { kind, concept_id: conceptId || null, title_en: titleEn, title_ar: titleAr } });
    if (r.ok) router.push(`/portal/cards/${encodeURIComponent(r.data.id)}`);
    else {
      setError(r.error.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">{t("cards.newTitle")}</h1>
        <p className="text-ink-2 mt-1">{t("cards.newSubtitle")}</p>
      </header>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">{t("cards.newKind")}</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {(["concept", "answer"] as const).map((k) => {
            const Icon = k === "concept" ? BookOpen : MessageCircleQuestion;
            return (
              <label key={k} className={cn("flex gap-3 rounded-[14px] border p-4 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-violet/40", kind === k ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                <Icon className={cn("size-5 mt-0.5 shrink-0", kind === k ? "text-accent" : "text-ink-3")} aria-hidden />
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-ink">{t(`cards.kind.${k}`)}</span>
                  <span className="text-sm text-ink-2">{t(`cards.newKind.${k}`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Card className="p-5 flex flex-col gap-4">
        <Field label={t("cards.newConcept")} htmlFor="concept" hint={t("cards.newConceptHint")}>
          <Select id="concept" value={conceptId} onChange={(e) => pickConcept(e.target.value)}>
            <option value="">{t("cards.newConceptNone")}</option>
            {groups.map(([track, list]) => (
              <optgroup key={track} label={t(`cards.track.${track}`)}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(locale === "ar" ? c.label_ar : c.label_en) + (c.open_requests ? ` · ${t("cards.newRequested", { n: fmtNumber(c.open_requests, locale) })}` : "")}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {concept && concept.cards.length > 0 && <Callout tone="neutral">{t("cards.newExisting", { list: concept.cards.join(", ") })}</Callout>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("cards.newTitleEn")} htmlFor="title_en">
            <Input id="title_en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" lang="en" maxLength={200} />
          </Field>
          <Field label={t("cards.newTitleAr")} htmlFor="title_ar">
            <Input id="title_ar" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" lang="ar" maxLength={200} />
          </Field>
        </div>
      </Card>

      {error && <Callout tone="bad">{error}</Callout>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={busy} disabled={!titleEn.trim() && !titleAr.trim()}>{t("cards.newCreate")}</Button>
        <ButtonLink href="/portal/cards" variant="ghost" size="lg">{t("action.cancel")}</ButtonLink>
      </div>
    </form>
  );
}
