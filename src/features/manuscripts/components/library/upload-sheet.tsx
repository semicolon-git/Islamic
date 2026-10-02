"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import type { MsSummary } from "../../types";
import { api, ApiError, num } from "../api";

/** Upload page images to a manuscript, with optional automatic line detection, then open the first new page. */
export function UploadSheet({ open, onClose, manuscripts, fixedMsId }: { open: boolean; onClose: () => void; manuscripts?: Pick<MsSummary, "id" | "title_ar" | "title_en" | "siglum" | "shelfmark">[]; fixedMsId?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [msId, setMsId] = useState(fixedMsId ?? manuscripts?.[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [segment, setSegment] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (!files.length || !msId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("segment", segment ? "1" : "0");
    try {
      const r = await api<{ pages: { id: string; lines: number; error?: string }[] }>(`/api/ms/manuscripts/${msId}/pages`, { method: "POST", body: fd });
      toast({ tone: "ok", text: t("manuscripts.upload.done", { n: num(r.pages.length, locale) }) });
      setFiles([]);
      onClose();
      if (r.pages[0]) router.push(`/portal/manuscripts/${msId}/pages/${r.pages[0].id}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("manuscripts.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} side="center" title={t("manuscripts.upload.title")} description={t("manuscripts.upload.desc")} closeLabel={t("action.close")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button><Button onClick={go} loading={busy} disabled={!files.length || !msId}>{busy ? t("manuscripts.upload.going") : t("manuscripts.upload.go")}</Button></>}>
      <div className="flex flex-col gap-4">
        {!fixedMsId && manuscripts && (
          <Field label={t("manuscripts.upload.target")} htmlFor="up-ms">
            <Select id="up-ms" value={msId} onChange={(e) => setMsId(e.target.value)}>
              {manuscripts.map((m) => <option key={m.id} value={m.id}>{`${m.siglum ? `(${m.siglum}) ` : ""}${locale === "ar" ? m.title_ar : m.title_en} · ${m.shelfmark ?? ""}`}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="up-files" className="text-sm font-medium">{t("manuscripts.upload.files")}</label>
          <button type="button" onClick={() => input.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-line-strong bg-sand/60 hover:bg-sand px-4 py-8 text-sand-ink transition-colors">
            <ImagePlus className="size-7" />
            <span className="font-medium">{files.length ? t("manuscripts.upload.selected", { n: num(files.length, locale) }) : t("manuscripts.upload.choose")}</span>
            {files.length > 0 && <span className="text-xs opacity-80 max-w-full truncate" dir="ltr">{files.map((f) => f.name).join(", ")}</span>}
          </button>
          <input ref={input} id="up-files" type="file" accept="image/jpeg,image/png,image/webp,image/tiff" multiple className="sr-only"
            onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </div>
        <label className="flex items-start gap-3 rounded-[12px] border border-line p-3 cursor-pointer">
          <input type="checkbox" checked={segment} onChange={(e) => setSegment(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
          <span className="flex flex-col">
            <span className="font-medium text-sm">{t("manuscripts.upload.segment")}</span>
            <span className="text-sm text-ink-3">{t("manuscripts.upload.segmentHint")}</span>
          </span>
        </label>
        {error && <Callout tone="bad">{error}</Callout>}
        <div aria-live="polite" className="sr-only">{busy ? t("manuscripts.upload.going") : ""}</div>
      </div>
    </Sheet>
  );
}
