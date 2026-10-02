"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { isPlausibleCode, normalizeCode } from "../codes";

/** Inline "try another code" form for the item not-found state. */
export function CodeRetry({ initial }: { initial: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-2 w-full max-w-sm"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!isPlausibleCode(code)) return setError(t("heritage.code.invalid"));
        setBusy(true);
        setError(null);
        try {
          const r = await fetch(`/api/heritage/lookup?code=${encodeURIComponent(normalizeCode(code))}`);
          const j = await r.json();
          if (j.ok && j.data.type === "item") router.push(`/heritage/item/${encodeURIComponent(j.data.code)}`);
          else if (j.ok && j.data.type === "venue") router.push(`/heritage?venue=${encodeURIComponent(j.data.venue.code)}`);
          else setError(t("heritage.code.notFound", { code: code.trim().toUpperCase() }));
        } catch {
          setError(t("heritage.code.offline"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="retry-code" className="sr-only">{t("heritage.code.label")}</label>
      <div className="flex gap-2">
        <input
          id="retry-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={t("heritage.code.placeholder")}
          className="min-w-0 flex-1 h-12 rounded-[12px] border border-line-strong bg-surface px-3.5 mono text-lg tracking-[0.15em] uppercase text-ink placeholder:text-ink-3 placeholder:tracking-normal placeholder:normal-case placeholder:text-sm focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
          aria-describedby="retry-error"
        />
        <Button type="submit" size="lg" loading={busy}>
          {t("heritage.code.submit")}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Button>
      </div>
      <p id="retry-error" aria-live="polite" className="text-sm text-bad min-h-5">{error}</p>
    </form>
  );
}
