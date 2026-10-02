"use client";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { markInfo } from "../marks";
import { toRenderSpans, type RenderSpan, type Tok } from "../tokens";

/** Classes for each span kind. Colour is never the only cue: every kind also has a line style, bracket or badge. */
export const SPAN_CLASS: Record<RenderSpan["kind"], string> = {
  text: "",
  unclear: "underline decoration-dashed decoration-warn decoration-[1.5px] underline-offset-[0.45em] bg-warn-soft/70 rounded-[3px]",
  gap: "inline-block align-baseline px-1 mx-0.5 rounded-md border border-dashed border-line-strong text-ink-3 font-ui text-[0.8em] leading-normal",
  supplied: "text-violet",
  del: "line-through decoration-bad decoration-2 text-ink-2",
  add: "underline decoration-dotted decoration-accent decoration-[1.5px] underline-offset-[0.45em]",
  abbr: "underline decoration-dotted decoration-violet decoration-[1.5px] underline-offset-[0.45em]",
  mark: "inline-flex items-center align-super mx-0.5 px-1.5 rounded-full bg-violet-soft text-violet font-ms text-[0.62em] leading-[1.6]",
  hi: "",
};

const HI_CLASS = { red: "text-bad", gold: "text-warn", overline: "overline decoration-ink-2", large: "text-[1.15em] font-bold" } as const;
const ADD_ICON = { margin: "⇥", above: "˄", below: "˅", inline: "" } as const;

/** Render a line's tokens (diplomatic or reading layer). `data-tok` carries the token index for click targeting. */
export function TokenText({ tokens, layer = "diplomatic", className, focusIndex }: { tokens: Tok[]; layer?: "diplomatic" | "reading"; className?: string; focusIndex?: number }) {
  const { t } = useI18n();
  const spans = toRenderSpans(tokens, layer);
  return (
    <span dir="rtl" className={cn("ms-text", className)}>
      {spans.map((s, i) => {
        const focus = focusIndex === s.index ? "ring-2 ring-warn/60" : "";
        switch (s.kind) {
          case "text":
            return <span key={i} data-tok={s.index}>{s.text}</span>;
          case "unclear":
            return (
              <span key={i} data-tok={s.index} data-kind="unclear" className={cn(SPAN_CLASS.unclear, s.rend && HI_CLASS[s.rend], focus)} title={`${t("manuscripts.tok.unclear")}${s.alts.length ? ` · ${s.alts.join(" / ")}` : ""}`}>
                {s.text}
              </span>
            );
          case "gap": {
            const reason = t(`manuscripts.gap.${s.reason}`);
            const title = s.extent ? t("manuscripts.gap.tooltipExtent", { reason, n: s.extent, unit: t(`manuscripts.gap.unit.${s.unit ?? "word"}`) }) : t("manuscripts.gap.tooltip", { reason });
            return <span key={i} data-tok={s.index} className={SPAN_CLASS.gap} title={title} aria-label={title}>[…]</span>;
          }
          case "supplied":
            return <span key={i} data-tok={s.index} className={SPAN_CLASS.supplied} title={t("manuscripts.tok.supplied")}>[{s.text}]</span>;
          case "del":
            return <del key={i} data-tok={s.index} className={SPAN_CLASS.del} title={t("manuscripts.tok.del")}>{s.text}</del>;
          case "add":
            return (
              <ins key={i} data-tok={s.index} className={cn(SPAN_CLASS.add, "no-underline")} title={t("manuscripts.tok.add", { place: t(`manuscripts.add.${s.place}`) })}>
                <span className={SPAN_CLASS.add}>{s.text}</span>
                {ADD_ICON[s.place] && <sup className="text-accent text-[0.6em] font-ui ms-0.5" aria-hidden>{ADD_ICON[s.place]}</sup>}
              </ins>
            );
          case "abbr":
            return (
              <abbr key={i} data-tok={s.index} className={cn(SPAN_CLASS.abbr, "no-underline")} title={t(s.confirmed ? "manuscripts.tok.abbr" : "manuscripts.tok.abbrUnconfirmed", { expan: s.expan })}>
                <span className={SPAN_CLASS.abbr}>{s.text}</span>
              </abbr>
            );
          case "mark": {
            const info = markInfo(s.mark);
            return (
              <span key={i} data-tok={s.index} className={SPAN_CLASS.mark} title={`«${info.term}» · ${t(`manuscripts.mark.${s.mark}`)}${s.note ? `: ${s.note}` : ""}`}>
                {s.text}
              </span>
            );
          }
          case "hi":
            return <span key={i} data-tok={s.index} className={HI_CLASS[s.rend]}>{s.text}</span>;
        }
      })}
    </span>
  );
}
