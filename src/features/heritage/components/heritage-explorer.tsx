"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Landmark, MapPin, QrCode, X } from "lucide-react";
import { Button, EmptyState, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { CODE_MAX, isPlausibleCode, normalizeCode, type QrTarget } from "../codes";
import { loc } from "../l10n";
import type { StoredVenue } from "../types";
import { ItemTile, type ItemSummary } from "./item-tile";
import { QrScanner } from "./qr-scanner";
import { useVenue } from "./use-venue";

type Lookup =
  | { type: "item"; code: string; title_en: string; title_ar: string }
  | { type: "venue"; venue: StoredVenue };

/** Code entry + QR scan + venue scoping + the objects grid of the heritage home. */
export function HeritageExplorer({ items }: { items: ItemSummary[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { venue, setVenue, ready } = useVenue();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const enterVenue = useCallback(
    (v: StoredVenue) => {
      setVenue(v);
      toast({ tone: "ok", text: t("heritage.venue.welcome", { venue: loc(locale, v.name_en, v.name_ar) }) });
    },
    [setVenue, toast, t, locale],
  );

  const lookup = useCallback(
    async (raw: string): Promise<boolean> => {
      setError(null);
      if (!isPlausibleCode(raw)) {
        setError(t("heritage.code.invalid"));
        return false;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/heritage/lookup?code=${encodeURIComponent(normalizeCode(raw))}`);
        const j = (await res.json()) as { ok: boolean; data?: Lookup };
        if (!j.ok || !j.data) {
          setError(t("heritage.code.notFound", { code: raw.trim().toUpperCase() }));
          return false;
        }
        if (j.data.type === "venue") {
          enterVenue(j.data.venue);
          setCode("");
        } else {
          router.push(`/heritage/item/${encodeURIComponent(j.data.code)}`);
        }
        return true;
      } catch {
        setError(t("heritage.code.offline"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, t, enterVenue],
  );

  // Venue links (/heritage?venue=NOOR) scope the visit, then clean the URL.
  const venueParam = params.get("venue");
  useEffect(() => {
    if (!venueParam) return;
    void lookup(venueParam).then(() => router.replace("/heritage", { scroll: false }));
  }, [venueParam, lookup, router]);

  const onScan = useCallback(
    (target: QrTarget) => {
      setScan(false);
      if (target.kind === "item") {
        setCode(target.code);
        void lookup(target.code);
      } else if (target.kind === "venue") {
        void lookup(target.code);
      }
    },
    [lookup],
  );

  const shown = ready && venue ? items.filter((i) => i.venue_code && normalizeCode(i.venue_code) === normalizeCode(venue.code)) : items;
  const venueName = venue ? loc(locale, venue.name_en, venue.name_ar) : "";

  return (
    <>
      <section className="relative z-10 -mt-14 mx-1 sm:mx-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-6 shadow-pop animate-rise">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(code);
          }}
          className="flex flex-col gap-2.5"
          noValidate
        >
          <label id="code-label" htmlFor="item-code" className="text-[0.95rem] font-semibold text-ink">
            {t("heritage.code.label")}
          </label>
          <div className="flex gap-2">
            <input
              id="item-code"
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t("heritage.code.placeholder")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={CODE_MAX + 6}
              dir="ltr"
              aria-invalid={!!error}
              aria-describedby="code-hint code-error"
              className="min-w-0 flex-1 h-14 rounded-[14px] border border-line-strong bg-surface-2/60 px-4 mono text-[1.45rem] tracking-[0.18em] uppercase text-ink placeholder:text-ink-3 placeholder:tracking-normal placeholder:text-base placeholder:normal-case focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
              data-testid="code-input"
            />
            <Button type="submit" size="xl" loading={busy} className="px-5" aria-label={t("heritage.code.submit")}>
              <span className="hidden sm:inline">{t("heritage.code.submit")}</span>
              <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden />
            </Button>
          </div>
          <div aria-live="polite" className="min-h-5">
            {error ? (
              <p id="code-error" className="text-sm text-bad" data-testid="code-error">{error}</p>
            ) : (
              <p id="code-hint" className="text-sm text-ink-3">{busy ? t("heritage.code.checking") : t("heritage.code.hint")}</p>
            )}
          </div>
        </form>
        <div className="mt-1 flex items-center gap-3 text-ink-3 text-xs" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="uppercase tracking-widest">{locale === "ar" ? "أو" : "or"}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button variant="secondary" size="lg" full className="mt-3" onClick={() => setScan(true)} data-testid="scan-button">
          <QrCode className="size-5" aria-hidden />
          {t("heritage.scan.button")}
        </Button>
      </section>

      <div aria-live="polite">
        {ready && venue ? (
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-accent/30 bg-accent-soft px-4 py-3 animate-rise" data-testid="venue-banner">
            <span className="size-10 shrink-0 rounded-full bg-surface grid place-items-center text-accent">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink leading-snug">{t("heritage.venue.at", { venue: venueName })}</p>
              <p className="text-xs text-ink-2">{t("heritage.venue.privacy")}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setVenue(null);
                toast({ tone: "info", text: t("heritage.venue.left") });
              }}
              data-testid="leave-venue"
            >
              <X className="size-4" aria-hidden />
              {t("heritage.venue.leave")}
            </Button>
          </div>
        ) : (
          <p className="flex items-start gap-2 px-1 text-sm text-ink-2">
            <MapPin className="size-4 mt-0.5 shrink-0 text-ink-3" aria-hidden />
            {t("heritage.venue.hint")}
          </p>
        )}
      </div>

      <section aria-labelledby="objects-h" className="flex flex-col gap-3">
        <SectionHead id="objects-h" title={t("heritage.objects.title")} subtitle={venue ? t("heritage.venue.showing") : t("heritage.objects.subtitle")} />
        {shown.length ? (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" data-testid="objects-grid">
            {shown.map((i, n) => (
              <li key={i.code} className={cn("animate-rise")} style={{ animationDelay: `${Math.min(n, 6) * 40}ms` }}>
                <ItemTile item={i} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="rounded-[var(--radius-lg)] border border-dashed border-line-strong"
            icon={<Landmark className="size-7" aria-hidden />}
            title={venue ? t("heritage.objects.emptyVenueTitle") : t("heritage.objects.emptyTitle")}
            body={venue ? t("heritage.objects.emptyVenueBody") : t("heritage.objects.emptyBody")}
            action={
              venue ? (
                <Button variant="secondary" onClick={() => setVenue(null)}>{t("heritage.objects.showAll")}</Button>
              ) : undefined
            }
          />
        )}
      </section>

      <QrScanner
        open={scan}
        onClose={() => setScan(false)}
        onResult={onScan}
        onTypeInstead={() => {
          setScan(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      />
    </>
  );
}

export function SectionHead({ id, title, subtitle, action }: { id?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[1.35rem] font-semibold text-ink tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
