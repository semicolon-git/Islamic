"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";

export interface Persona {
  id: string;
  role: string;
  display_name_en: string;
  display_name_ar: string;
  title_en: string | null;
  title_ar: string | null;
  avatar_hue: number;
  institution_en: string | null;
  institution_ar: string | null;
}

export function LoginForm({ personas, defaultPin, demo = false }: { personas: Persona[]; defaultPin: string; demo?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<string>(personas[0]?.id ?? "");
  const [pin, setPin] = useState(defaultPin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sel = personas.find((p) => p.id === selected);
  const nameOf = (p: Persona) => (locale === "ar" ? p.display_name_ar : p.display_name_en);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selected, pin }) });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.code === "bad_pin" ? t("login.badPin") : t("state.error"));
      setBusy(false);
      return;
    }
    router.push("/portal");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">{t("login.choose")}</legend>
        <div className="grid sm:grid-cols-2 gap-2" role="radiogroup">
          {personas.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex items-center gap-3 rounded-[14px] border p-3 min-h-[4.25rem] cursor-pointer transition-colors has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline has-[:focus-visible]:outline-[var(--focus)] has-[:focus-visible]:outline-offset-2",
                selected === p.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <input type="radio" name="persona" value={p.id} checked={selected === p.id} onChange={() => setSelected(p.id)} className="sr-only" />
              <Avatar name={nameOf(p)} hue={p.avatar_hue} size={40} />
              <span className="flex flex-col min-w-0">
                <span className="font-medium text-ink truncate">
                  {nameOf(p)}
                  {demo && <span className="ms-1.5 text-[0.7rem] font-normal text-ink-3">({t("badge.demo")})</span>}
                </span>
                <span className="text-xs text-ink-2 line-clamp-2">{[t(`role.${p.role}`), locale === "ar" ? p.institution_ar : p.institution_en].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t("login.pin")} htmlFor="pin" hint={defaultPin ? t("login.pinHint", { pin: defaultPin }) : undefined}>
        <Input id="pin" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} className="max-w-40 mono" />
      </Field>
      {error && <Callout tone="bad">{error}</Callout>}
      <Button type="submit" size="lg" loading={busy} disabled={!selected}>
        {sel ? t("login.signIn", { name: nameOf(sel) }) : t("action.continue")}
      </Button>
    </form>
  );
}
