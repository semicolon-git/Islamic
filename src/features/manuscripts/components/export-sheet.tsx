"use client";
import { Download, FileCode2, FileJson, FileText, Rows3 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";

/** Export choices (TEI, plain text in both layers, JSON, JSONL training set) for a page or a whole manuscript. */
export function ExportSheet({ open, onClose, pageId, msId }: { open: boolean; onClose: () => void; pageId?: string; msId: string }) {
  const { t } = useI18n();
  const base = (scope: "page" | "ms") => (scope === "page" && pageId ? `/api/ms/pages/${pageId}/export` : `/api/ms/manuscripts/${msId}/export`);
  const items = [
    { f: "tei", label: t("manuscripts.export.tei"), desc: t("manuscripts.export.teiDesc"), icon: FileCode2 },
    { f: "txt&layer=diplomatic", label: t("manuscripts.export.txtDip"), icon: FileText },
    { f: "txt&layer=reading", label: t("manuscripts.export.txtRead"), icon: FileText },
    { f: "json", label: t("manuscripts.export.json"), icon: FileJson },
    { f: "jsonl", label: t("manuscripts.export.jsonl"), desc: t("manuscripts.export.jsonlDesc"), icon: Rows3 },
  ];
  const scopes: ("page" | "ms")[] = pageId ? ["page", "ms"] : ["ms"];
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("manuscripts.export.title")} description={t("manuscripts.export.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-6">
        {scopes.map((s) => (
          <section key={s} className="flex flex-col gap-2" aria-label={t(s === "page" ? "manuscripts.export.page" : "manuscripts.export.ms")}>
            <h3 className="text-sm font-semibold text-ink-2">{t(s === "page" ? "manuscripts.export.page" : "manuscripts.export.ms")}</h3>
            <ul className="flex flex-col gap-1.5">
              {items.map((it) => (
                <li key={it.f}>
                  <a href={`${base(s)}?format=${it.f}`} download data-export={`${s}-${it.f.replace(/&layer=/, "-")}`}
                    className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5 hover:bg-surface-2 transition-colors">
                    <it.icon className="size-5 text-ink-3 shrink-0" />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium text-sm">{it.label}</span>
                      {it.desc && <span className="text-xs text-ink-3">{it.desc}</span>}
                    </span>
                    <Download className="size-4 text-ink-3 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
