"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import type { ChainDecision, ChainReviewState } from "../review";

/** Review buttons for one chain: researcher approve/return, institution sign-off (four-eyes is enforced by the server). */
export function ChainReviewActions({ id, state, role }: { id: string; state: ChainReviewState; role: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ChainDecision | null>(null);
  const researcher = role === "researcher" || role === "platform_admin";
  const admin = role === "institution_admin" || role === "platform_admin";
  if (state === "reviewed") return null;

  const send = async (decision: ChainDecision) => {
    setBusy(decision);
    const r = await fetch(`/api/science/chains/${encodeURIComponent(id)}/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: note.trim() || null }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return toast({ tone: "bad", text: r?.error?.message ?? t("chainReview.failed") });
    toast({ tone: "ok", text: t(`chainReview.done.${decision}`) });
    setNote("");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4" data-testid="chain-review-actions">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {t("chainReview.note")}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="rounded-[12px] border border-line-strong bg-surface p-3 text-sm font-normal" placeholder={t("chainReview.notePlaceholder")} />
      </label>
      <div className="flex flex-wrap gap-2">
        {researcher && state !== "approved" && <Button onClick={() => send("approve")} disabled={!!busy} data-testid="chain-approve">{t("chainReview.approve")}</Button>}
        {researcher && <Button variant="secondary" onClick={() => send("return")} disabled={!!busy || !note.trim()}>{t("chainReview.return")}</Button>}
        {admin && state === "approved" && <Button onClick={() => send("publish")} disabled={!!busy} data-testid="chain-publish">{t("chainReview.publish")}</Button>}
      </div>
      <p className="text-xs text-ink-3">{t("chainReview.fourEyes")}</p>
    </div>
  );
}
