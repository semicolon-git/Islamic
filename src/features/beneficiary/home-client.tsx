"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, ChevronRight, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { getDeviceToken, readFlag, readList, writeFlag, SEEN_APPROVED_KEY, WELCOMED_KEY } from "./device";
import { conceptHref } from "./labels";

/**
 * First visit → /welcome (once). Never traps: `?welcome=0` skips and remembers, and the welcome itself is skippable.
 */
export function FirstVisitGate() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    if (sp.get("welcome") === "0") {
      writeFlag(WELCOMED_KEY, "1");
      return;
    }
    if (readFlag(WELCOMED_KEY)) return;
    // If storage is unavailable we can't remember, so don't redirect (avoid loops).
    writeFlag("say.probe", "1");
    if (readFlag("say.probe") !== "1") return;
    router.replace("/welcome");
  }, [router, sp]);
  return null;
}

/** "Approved since you asked": cards published for concepts this device asked about. */
export function ApprovedSinceYouAsked({ labels }: { labels: Record<string, string> }) {
  const { t } = useI18n();
  const [items, setItems] = useState<{ id: string; concept_id: string }[]>([]);
  useEffect(() => {
    const token = getDeviceToken(false);
    if (!token) return;
    const seen = new Set(readList(SEEN_APPROVED_KEY));
    fetch("/api/requests", { headers: { "x-device-token": token } })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        const ready = (j.data as { id: string; concept_id: string | null; card_id: string | null }[])
          .filter((r) => r.concept_id && r.card_id && !seen.has(r.id) && labels[r.concept_id])
          .map((r) => ({ id: r.id, concept_id: r.concept_id! }));
        setItems(ready.slice(0, 3));
      })
      .catch(() => {});
  }, [labels]);
  if (!items.length) return null;
  const dismiss = (id: string) => {
    writeFlag(SEEN_APPROVED_KEY, JSON.stringify([...readList(SEEN_APPROVED_KEY), id].slice(-200)));
    setItems((s) => s.filter((x) => x.id !== id));
  };
  return (
    <section aria-label={t("beneficiary.home.sinceAsked")} aria-live="polite" className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.id} className="animate-rise flex items-center gap-3 rounded-[16px] bg-accent-soft ps-4 pe-2 py-2">
          <BellRing className="size-5 text-accent shrink-0" aria-hidden />
          <Link href={conceptHref(it.concept_id)} onClick={() => dismiss(it.id)} className="flex-1 min-h-11 flex items-center gap-1 text-sm font-medium text-ink">
            {t("beneficiary.home.sinceAskedItem", { label: labels[it.concept_id] })}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <button type="button" onClick={() => dismiss(it.id)} aria-label={t("action.close")} className="size-11 grid place-items-center rounded-full text-ink-2 hover:bg-surface/60">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}
