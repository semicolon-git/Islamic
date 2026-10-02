"use client";
import { GitMerge } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { diffChars } from "../../text";
import { plainText, type Tok } from "../../tokens";
import type { LineDTO, LineVersionDTO, PageDetail } from "../../types";
import { LineCrop, type ImageFilter } from "../line-crop";
import { TokenText } from "../token-view";

/** 409 conflict: theirs vs mine with the line image on top, and a character diff. Nothing is lost either way. */
export function MergeDialog({ open, detail, line, theirs, mine, filter, onTheirs, onMine, onCombine, onClose }: {
  open: boolean; detail: PageDetail; line: LineDTO; theirs: LineVersionDTO; mine: Tok[]; filter: ImageFilter;
  onTheirs: () => void; onMine: () => void; onCombine: () => void; onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const name = (locale === "ar" ? theirs.author_name_ar : theirs.author_name_en) ?? t("manuscripts.hist.kind.machine");
  const diff = diffChars(plainText(theirs.tokens), plainText(mine));
  return (
    <Sheet open={open} onClose={onClose} side="center" title={<span className="inline-flex items-center gap-2"><GitMerge className="size-5 text-warn" />{t("manuscripts.merge.title")}</span>}
      description={t("manuscripts.merge.desc", { name, v: theirs.version })} closeLabel={t("action.close")}
      footer={
        <div className="flex flex-wrap gap-2 justify-end w-full" data-testid="merge-actions">
          <Button variant="ghost" onClick={onCombine}>{t("manuscripts.merge.combine")}</Button>
          <Button variant="secondary" onClick={onTheirs}>{t("manuscripts.merge.useTheirs")}</Button>
          <Button onClick={onMine}>{t("manuscripts.merge.useMine")}</Button>
        </div>
      }>
      <div className="flex flex-col gap-4" data-testid="merge-dialog">
        <LineCrop src={detail.page.image_path} width={detail.page.width} height={detail.page.height} polygon={line.polygon} filter={filter} label={t("manuscripts.ed.crop", { n: line.n })} />
        <section className="flex flex-col gap-1.5 rounded-[12px] border border-line p-3">
          <h3 className="text-xs font-semibold text-ink-3 inline-flex items-center gap-2">
            {theirs.author_id && <Avatar name={name} hue={theirs.author_hue ?? 200} size={20} />}
            {t("manuscripts.merge.theirs", { v: theirs.version })} · {name}
          </h3>
          <TokenText tokens={theirs.tokens} />
        </section>
        <section className="flex flex-col gap-1.5 rounded-[12px] border border-violet/50 bg-violet-soft/40 p-3">
          <h3 className="text-xs font-semibold text-ink-3">{t("manuscripts.merge.mine")}</h3>
          <TokenText tokens={mine} />
        </section>
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-ink-3">{t("manuscripts.merge.diff")}</h3>
          <p dir="rtl" className="ms-text rounded-[10px] bg-surface-2 px-3 py-1">
            {diff.map((d, i) =>
              d.op === "equal" ? <span key={i}>{d.text}</span>
                : d.op === "delete" ? <del key={i} className="bg-bad-soft text-bad decoration-bad">{d.text}</del>
                : <ins key={i} className="bg-ok-soft text-ok no-underline">{d.text}</ins>,
            )}
          </p>
        </section>
      </div>
    </Sheet>
  );
}
