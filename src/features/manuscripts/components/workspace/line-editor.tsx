"use client";
/**
 * Reusable line editor for the transcription token model (SPEC §4, research memo §4.10/§7.3).
 *
 * - One plain RTL <textarea> per line (no contenteditable: correct bidi caret, native IME, Arabic keyboards).
 * - A mirrored backdrop draws the markup (dashed underline for uncertain words, gap pills, mark badges …) behind the
 *   transparent textarea, so the transcriber sees the markup while typing plain text.
 * - Markup is applied to the selection with the toolbar or Ctrl+Shift+<physical key>; it never rewrites letters.
 * - Controlled: `tokens` in, `onChange(tokens)` out. Saving, locking and merging live in the caller (LineSession),
 *   so the same editor can serve suggestions or blind double-keying later.
 */
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Brackets, CircleQuestionMark, Eraser, Highlighter, Keyboard, Redo2, Stamp, Strikethrough, Superscript, TriangleAlert, Undo2, X,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Kbd } from "@/components/ui/feedback";
import { useI18n } from "@/i18n/client";
import { suggestExpansions, type Genre, type Zone } from "../../abbreviations";
import { MARKS, SPECIAL_CHARS, markInfo, type MarkKind } from "../../marks";
import { detectTypedMarks, stripDiacritics } from "../../text";
import {
  GAP_TEXT, applyMarkup, applyTextEdit, editorString, insertAt, readingText, removeToken, replaceWithGap, segments, tokenAt, updateToken, wordAt,
  acceptAlternative, type AddPlace, type DelRend, type GapReason, type HiRend, type MarkupOp, type Tok,
} from "../../tokens";
import { TokenText } from "../token-view";
import { EDITOR_KEYS, digitOf, mod } from "./keys";

export type EditorCommand = "save" | "saveNext" | "next" | "prev" | "leave" | "zoomLine" | "help";
type Panel = "gap" | "del" | "add" | "abbr" | "marks" | "hi" | "chars" | null;

export interface LineEditorProps {
  id: string;
  tokens: Tok[];
  onChange: (tokens: Tok[]) => void;
  genre: Genre;
  zone: Zone;
  label: string;
  readOnly?: boolean;
  normalizedText?: string | null;
  onNormalizedChange?: (s: string | null) => void;
  onCommand?: (c: EditorCommand) => void;
  autoFocus?: boolean;
  /** Token index to put the caret on when opening (e.g. the uncertain word the user clicked). */
  focusToken?: number;
  extras?: React.ReactNode;
  className?: string;
}

export interface LineEditorHandle {
  focus: () => void;
}

/** Identical text metrics for the textarea and its backdrop (they must wrap at the same points). */
const EDITOR_TEXT = "font-ms text-[1.45rem] leading-[2.3] px-4 pt-3 pb-2 m-0 border-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-spacing:0.02em] text-start";

const MARK_OF_WORD: Record<string, MarkKind> = { "صح": "sahh", "كذا": "sic", "بلغ": "balagha" };

export const LineEditor = forwardRef<LineEditorHandle, LineEditorProps>(function LineEditor(props, ref) {
  const { id, tokens, onChange, genre, zone, label, readOnly, normalizedText, onNormalizedChange, onCommand, autoFocus, focusToken, extras, className } = props;
  const { t, locale } = useI18n();
  const ta = useRef<HTMLTextAreaElement>(null);
  const str = useMemo(() => editorString(tokens), [tokens]);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [panel, setPanel] = useState<Panel>(null);
  const [panelByKey, setPanelByKey] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newAlt, setNewAlt] = useState("");
  const pendingSel = useRef<[number, number] | null>(null);
  const undo = useRef<{ toks: Tok[]; sel: [number, number] }[]>([]);
  const redo = useRef<{ toks: Tok[]; sel: [number, number] }[]>([]);
  const lastType = useRef(0);

  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);

  // Initial caret: on the clicked token, else at the end.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    let pos = str.length;
    if (focusToken !== undefined && focusToken >= 0) {
      const s = segments(tokens)[focusToken];
      if (s) pos = s.end;
    }
    if (autoFocus && !readOnly) el.focus({ preventScroll: true });
    el.setSelectionRange(pos, pos);
    setSel([pos, pos]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Caret moves that React does not report as "select" (programmatic, IME): follow document selectionchange.
  useEffect(() => {
    const onSel = () => {
      const el = ta.current;
      if (el && document.activeElement === el) setSel((cur) => (cur[0] === el.selectionStart && cur[1] === el.selectionEnd ? cur : [el.selectionStart, el.selectionEnd]));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // Restore the selection after a programmatic edit (markup, undo) re-rendered the textarea value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (pendingSel.current && ta.current) {
      const [a, b] = pendingSel.current;
      pendingSel.current = null;
      ta.current.setSelectionRange(a, b);
      setSel([a, b]);
    }
  });

  const commit = (next: Tok[], nextSel?: [number, number], kind: "type" | "op" = "op") => {
    const now = Date.now();
    if (!(kind === "type" && now - lastType.current < 900 && undo.current.length)) undo.current.push({ toks: tokens, sel });
    if (undo.current.length > 200) undo.current.shift();
    lastType.current = kind === "type" ? now : 0;
    redo.current = [];
    if (nextSel) pendingSel.current = nextSel;
    onChange(next);
  };

  const focus = () => requestAnimationFrame(() => ta.current?.focus());
  const currentSel = (): [number, number] => {
    const el = ta.current;
    return el ? [el.selectionStart, el.selectionEnd] : sel;
  };
  const wordRange = (): [number, number] => {
    const [a, b] = currentSel();
    return a === b ? wordAt(str, a) : [a, b];
  };

  const markup = (op: MarkupOp) => {
    if (readOnly) return;
    const [a, b] = wordRange();
    const r = applyMarkup(tokens, a, b, op);
    if (!r.ok) {
      setMsg(t(r.reason === "contains_gap" ? "manuscripts.ed.containsGap" : "manuscripts.ed.selectFirst"));
      return;
    }
    setMsg(null);
    setPanel(null);
    commit(r.tokens, r.range);
    focus();
  };

  const caretIdx = tokenAt(tokens, sel[1]);
  const caretTok = caretIdx >= 0 ? tokens[caretIdx] : null;
  const unclearAtCaret = caretTok?.t === "unclear" ? (caretTok as Extract<Tok, { t: "unclear" }>) : null;

  const cycleUnclear = () => {
    if (readOnly) return;
    if (unclearAtCaret) {
      const s = segments(tokens)[caretIdx];
      if (unclearAtCaret.cert === "low") {
        const r = applyMarkup(tokens, s.start, s.end, { op: "clear" });
        if (r.ok) commit(r.tokens, [s.end, s.end]);
      } else commit(updateToken(tokens, caretIdx, { cert: "low" } as Partial<Tok>), [s.end, s.end]);
      focus();
      return;
    }
    markup({ op: "unclear" });
  };

  const acceptAlt = (alt: string) => {
    if (readOnly || !unclearAtCaret) return;
    const s = segments(tokens)[caretIdx];
    const next = acceptAlternative(tokens, caretIdx, alt);
    commit(next, [s.start + alt.length, s.start + alt.length]);
    focus();
  };

  const addAlt = () => {
    const v = newAlt.trim();
    if (!v || !unclearAtCaret) return;
    commit(updateToken(tokens, caretIdx, { alts: [...new Set([...(unclearAtCaret.alts ?? []), v])].slice(0, 9) } as Partial<Tok>));
    setNewAlt("");
  };

  const insertGap = (reason: GapReason, extent?: number, unit: "word" | "char" = "word") => {
    const [a, b] = currentSel();
    const next = replaceWithGap(tokens, a, b, { t: "gap", reason, ...(extent ? { extent, unit } : {}) });
    setPanel(null);
    commit(next, [a + GAP_TEXT.length, a + GAP_TEXT.length]);
    focus();
  };

  const insertMark = (kind: MarkKind, glyph?: string, note?: string) => {
    const [, b] = currentSel();
    const info = markInfo(kind);
    const next = insertAt(tokens, b, { t: "mark", kind, v: glyph?.trim() || info.glyph, ...(note?.trim() ? { note: note.trim() } : {}) });
    setPanel(null);
    commit(next);
    focus();
  };

  const insertChar = (ch: string) => {
    if (readOnly) return;
    const [a, b] = currentSel();
    const ns = str.slice(0, a) + ch + str.slice(b);
    commit(applyTextEdit(tokens, str, ns, a + ch.length), [a + ch.length, a + ch.length], "type");
    focus();
  };

  const typedMarks = useMemo(() => (readOnly ? [] : detectTypedMarks(str.replace(/\[…\]/g, " "))), [str, readOnly]);
  const convertTypedMark = (w: string) => {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str))) {
      if (stripDiacritics(m[0]) !== w) continue;
      const s0 = m.index > 0 && str[m.index - 1] === " " ? m.index - 1 : m.index;
      const e = m.index + m[0].length;
      const removed = applyTextEdit(tokens, str, str.slice(0, s0) + str.slice(e), s0);
      commit(insertAt(removed, s0, { t: "mark", kind: MARK_OF_WORD[w], v: m[0] }), [s0, s0]);
      focus();
      return;
    }
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push({ toks: tokens, sel });
    pendingSel.current = prev.sel;
    onChange(prev.toks);
  };
  const doRedo = () => {
    const nx = redo.current.pop();
    if (!nx) return;
    undo.current.push({ toks: tokens, sel });
    pendingSel.current = nx.sel;
    onChange(nx.toks);
  };

  const openPanel = (p: Panel, byKey = false) => {
    setPanel((cur) => (cur === p ? null : p));
    setPanelByKey(byKey);
    setMsg(null);
  };

  // Abbreviation panel state
  const [abbrRange, setAbbrRange] = useState<[number, number]>([0, 0]);
  const abbrWritten = str.slice(abbrRange[0], abbrRange[1]).trim();
  const suggestions = useMemo(() => (panel === "abbr" ? suggestExpansions(abbrWritten, genre, zone) : []), [panel, abbrWritten, genre, zone]);
  const [abbrExpan, setAbbrExpan] = useState("");
  const openAbbr = (byKey = false) => {
    const r = wordRange();
    setAbbrRange(r);
    const w = str.slice(r[0], r[1]).trim();
    const s = suggestExpansions(w, genre, zone);
    setAbbrExpan(s.find((x) => x.fits)?.expan ?? "");
    openPanel("abbr", byKey);
  };
  const confirmAbbr = (expan: string) => {
    if (!expan.trim()) return;
    const r = applyMarkup(tokens, abbrRange[0], abbrRange[1], { op: "abbr", expan: expan.trim(), confirmed: true });
    if (!r.ok) {
      setMsg(t(r.reason === "contains_gap" ? "manuscripts.ed.containsGap" : "manuscripts.ed.selectFirst"));
      return;
    }
    setPanel(null);
    commit(r.tokens, r.range);
    focus();
  };

  // Gap / marks panel state
  const [gapReason, setGapReason] = useState<GapReason>("illegible");
  const [gapExtent, setGapExtent] = useState<string>("");
  const [gapUnit, setGapUnit] = useState<"word" | "char">("word");
  const [markKind, setMarkKind] = useState<MarkKind | null>(null);
  const [markGlyph, setMarkGlyph] = useState("");
  const [markNote, setMarkNote] = useState("");
  const pickMark = (k: MarkKind) => {
    const info = markInfo(k);
    if (info.note) {
      setMarkKind(k);
      setMarkGlyph(info.glyph);
      setMarkNote("");
    } else insertMark(k);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    // Marks palette opened from the keyboard: next physical letter picks the mark.
    if (panel === "marks" && panelByKey && !mod(e) && !e.altKey && !markKind) {
      const m = MARKS.find((x) => x.key === e.code);
      if (m) { e.preventDefault(); pickMark(m.kind); return; }
    }
    if (panel === "abbr" && !mod(e) && !e.altKey && panelByKey) {
      const d = digitOf(e);
      if (d && suggestions[d - 1]) { e.preventDefault(); confirmAbbr(suggestions[d - 1].expan); return; }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (panel) setPanel(null);
      else onCommand?.("leave");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCommand?.(mod(e) || !e.altKey ? "saveNext" : "save");
      return;
    }
    if (mod(e) && !e.shiftKey && (e.code === "ArrowDown" || e.code === "ArrowUp")) {
      e.preventDefault();
      onCommand?.(e.code === "ArrowDown" ? "next" : "prev");
      return;
    }
    if (mod(e) && !e.shiftKey && e.code === "KeyS") { e.preventDefault(); onCommand?.("save"); return; }
    if (mod(e) && !e.shiftKey && e.code === "KeyZ") { e.preventDefault(); doUndo(); return; }
    if ((mod(e) && e.shiftKey && e.code === "KeyZ") || (mod(e) && !e.shiftKey && e.code === "KeyY")) { e.preventDefault(); doRedo(); return; }
    if (mod(e) && e.shiftKey) {
      const d = digitOf(e);
      if (d) {
        if (unclearAtCaret?.alts?.[d - 1]) { e.preventDefault(); acceptAlt(unclearAtCaret.alts[d - 1]); }
        return;
      }
      const act: Record<string, () => void> = {
        [EDITOR_KEYS.unclear]: cycleUnclear,
        [EDITOR_KEYS.gap]: () => openPanel("gap", true),
        [EDITOR_KEYS.supplied]: () => markup({ op: "supplied", reason: "omitted" }),
        [EDITOR_KEYS.del]: () => openPanel("del", true),
        [EDITOR_KEYS.add]: () => openPanel("add", true),
        [EDITOR_KEYS.abbr]: () => openAbbr(true),
        [EDITOR_KEYS.marks]: () => { setMarkKind(null); openPanel("marks", true); },
        [EDITOR_KEYS.hi]: () => openPanel("hi", true),
        [EDITOR_KEYS.clear]: () => markup({ op: "clear" }),
        [EDITOR_KEYS.chars]: () => openPanel("chars", true),
        [EDITOR_KEYS.zoomLine]: () => onCommand?.("zoomLine"),
      };
      if (act[e.code] && !readOnly) { e.preventDefault(); act[e.code](); }
      return;
    }
    if (e.key === "?" && e.shiftKey && !str.length) { e.preventDefault(); onCommand?.("help"); }
  };

  const readingSame = normalizedText == null && !tokens.some((k) => k.t === "abbr" || k.t === "del" || k.t === "supplied");
  const marks = tokens.map((k, i) => [k, i] as const).filter(([k]) => k.t === "mark") as [Extract<Tok, { t: "mark" }>, number][];

  const tool = (key: string, icon: React.ReactNode, onClick: () => void, opts: { label?: boolean; active?: boolean; kbd?: string } = {}) => (
    <button type="button" onClick={onClick} disabled={readOnly} aria-pressed={opts.active}
      title={`${t(`manuscripts.tool.${key}Desc`) !== `manuscripts.tool.${key}Desc` ? t(`manuscripts.tool.${key}Desc`) : t(`manuscripts.tool.${key}`)}${opts.kbd ? ` (Ctrl+Shift+${opts.kbd})` : ""}`}
      aria-label={t(`manuscripts.tool.${key}`)}
      className={cn("inline-flex items-center gap-1.5 h-9 rounded-[9px] text-sm font-medium transition-colors disabled:opacity-40",
        opts.label ? "px-2.5 min-w-9 justify-center" : "w-9 justify-center",
        opts.active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      {icon}
      {opts.label && <span className="hidden min-[1600px]:inline">{t(`manuscripts.tool.${key}`)}</span>}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {!readOnly && (
        <div role="toolbar" aria-label={t("manuscripts.text.label")} className="flex flex-wrap items-center gap-0.5 rounded-[12px] bg-surface-2 p-1">
          {tool("unclear", <CircleQuestionMark className="size-4" />, cycleUnclear, { label: true, kbd: "U" })}
          {tool("gap", <span className="font-ms text-[0.95rem] leading-none">[…]</span>, () => openPanel("gap"), { label: true, active: panel === "gap", kbd: "G" })}
          {tool("abbr", <span className="font-ms text-[1rem] leading-none">ع</span>, () => openAbbr(), { label: true, active: panel === "abbr", kbd: "E" })}
          {tool("marks", <Stamp className="size-4" />, () => { setMarkKind(null); openPanel("marks"); }, { label: true, active: panel === "marks", kbd: "M" })}
          <span className="w-px h-5 bg-line-strong mx-1" aria-hidden />
          {tool("supplied", <Brackets className="size-4" />, () => markup({ op: "supplied", reason: "omitted" }), { kbd: "S" })}
          {tool("del", <Strikethrough className="size-4" />, () => openPanel("del"), { active: panel === "del", kbd: "D" })}
          {tool("add", <Superscript className="size-4" />, () => openPanel("add"), { active: panel === "add", kbd: "A" })}
          {tool("hi", <Highlighter className="size-4" />, () => openPanel("hi"), { active: panel === "hi", kbd: "H" })}
          {tool("clear", <Eraser className="size-4" />, () => markup({ op: "clear" }), { kbd: "X" })}
          <span className="w-px h-5 bg-line-strong mx-1" aria-hidden />
          {tool("chars", <Keyboard className="size-4" />, () => openPanel("chars"), { active: panel === "chars", kbd: "K" })}
          <span className="ms-auto flex items-center">
            <button type="button" onClick={doUndo} className="size-9 grid place-items-center rounded-[9px] text-ink-2 hover:bg-surface hover:text-ink" aria-label={t("manuscripts.ed.undo")} title={`${t("manuscripts.ed.undo")} (Ctrl+Z)`}><Undo2 className="size-4 rtl:-scale-x-100" /></button>
            <button type="button" onClick={doRedo} className="size-9 grid place-items-center rounded-[9px] text-ink-2 hover:bg-surface hover:text-ink" aria-label={t("manuscripts.ed.redo")} title={`${t("manuscripts.ed.redo")} (Ctrl+Shift+Z)`}><Redo2 className="size-4 rtl:-scale-x-100" /></button>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-3" id={`${id}-layer`}>{t("manuscripts.ed.layerLabel")}</span>
        {readOnly && <span className="text-[0.72rem] text-ink-3">{t("manuscripts.ed.readonly")}</span>}
      </div>
      <div className={cn("relative grid rounded-[12px] border bg-surface transition-colors", readOnly ? "border-line" : "border-line-strong focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/25")}>
        <Backdrop tokens={tokens} />
        <textarea
          ref={ta}
          id={id}
          dir="rtl"
          lang="ar"
          rows={1}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          readOnly={readOnly}
          aria-label={label}
          aria-describedby={`${id}-layer`}
          value={str}
          onChange={(e) => {
            const raw = e.target.value.replace(/[\r\n]+/g, " ");
            commit(applyTextEdit(tokens, str, raw, e.target.selectionEnd), undefined, "type");
          }}
          onSelect={(e) => setSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onKeyUp={(e) => setSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onMouseUp={(e) => setSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onKeyDown={onKeyDown}
          className={cn(EDITOR_TEXT, "[grid-area:1/1] relative w-full h-full resize-none overflow-hidden bg-transparent text-ink caret-ink outline-none")}
        />
      </div>

      {panel && !readOnly && (
        <div className="rounded-[12px] border border-line bg-surface p-3 animate-pop flex flex-col gap-3" role="group" aria-label={t(`manuscripts.tool.${panel}`)}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{panel === "marks" ? t("manuscripts.marks.title") : t(`manuscripts.tool.${panel}`)}</h4>
            <button type="button" onClick={() => { setPanel(null); focus(); }} className="size-8 grid place-items-center rounded-full text-ink-3 hover:bg-surface-2" aria-label={t("manuscripts.tool.cancel")}><X className="size-4" /></button>
          </div>
          {panel === "gap" && (
            <div className="flex flex-wrap items-end gap-3">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs text-ink-3 mb-1">{t("manuscripts.gap.reason")}</legend>
                <div className="flex gap-1">
                  {(["illegible", "damage", "lacuna"] as GapReason[]).map((r) => (
                    <button key={r} type="button" onClick={() => setGapReason(r)} aria-pressed={gapReason === r}
                      className={cn("h-9 px-3 rounded-full text-sm border", gapReason === r ? "bg-ink text-bg border-ink" : "border-line-strong hover:bg-surface-2")}>{t(`manuscripts.gap.${r}`)}</button>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                {t("manuscripts.gap.extent")}
                <span className="flex gap-1">
                  <input type="number" min={1} max={99} value={gapExtent} onChange={(e) => setGapExtent(e.target.value)} className="w-16 h-9 rounded-[10px] border border-line-strong bg-surface px-2 text-ink text-sm" aria-label={t("manuscripts.gap.extent")} />
                  <select value={gapUnit} onChange={(e) => setGapUnit(e.target.value as "word" | "char")} className="h-9 rounded-[10px] border border-line-strong bg-surface px-2 text-ink text-sm" aria-label={t("manuscripts.gap.extent")}>
                    <option value="word">{t("manuscripts.gap.unit.word")}</option>
                    <option value="char">{t("manuscripts.gap.unit.char")}</option>
                  </select>
                </span>
              </label>
              <button type="button" onClick={() => insertGap(gapReason, gapExtent ? Number(gapExtent) : undefined, gapUnit)} className="h-9 px-4 rounded-[10px] bg-accent text-accent-ink text-sm font-medium">{t("manuscripts.tool.insert")}</button>
              <p className="basis-full text-xs text-ink-3">{t("manuscripts.tool.gapDesc")}</p>
            </div>
          )}
          {panel === "del" && (
            <div className="flex flex-wrap gap-1.5">
              {(["strike", "la_ila", "bracket", "zaid"] as DelRend[]).map((r) => (
                <button key={r} type="button" onClick={() => markup({ op: "del", rend: r })} className="h-9 px-3 rounded-full text-sm border border-line-strong hover:bg-surface-2">{t(`manuscripts.del.${r}`)}</button>
              ))}
            </div>
          )}
          {panel === "add" && (
            <div className="flex flex-wrap gap-1.5">
              {(["margin", "above", "below", "inline"] as AddPlace[]).map((p) => (
                <button key={p} type="button" onClick={() => markup({ op: "add", place: p })} className="h-9 px-3 rounded-full text-sm border border-line-strong hover:bg-surface-2">{t(`manuscripts.add.${p}`)}</button>
              ))}
            </div>
          )}
          {panel === "hi" && (
            <div className="flex flex-wrap gap-1.5">
              {(["red", "gold", "overline", "large"] as HiRend[]).map((r) => (
                <button key={r} type="button" onClick={() => markup({ op: "hi", rend: r })} className={cn("h-9 px-3 rounded-full text-sm border border-line-strong hover:bg-surface-2", r === "red" && "text-bad", r === "gold" && "text-warn")}>{t(`manuscripts.hi.${r}`)}</button>
              ))}
            </div>
          )}
          {panel === "abbr" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-3">{t("manuscripts.abbr.written")}</span>
                <span className="font-ms text-xl px-2 rounded-md bg-violet-soft" dir="rtl">{abbrWritten || "—"}</span>
                <span className="ms-auto text-xs text-ink-3">{t("manuscripts.abbr.genre", { g: t(`manuscripts.genre.${genre}`) })}</span>
              </div>
              {abbrWritten && suggestions.length === 0 && <p className="text-sm text-ink-3">{t("manuscripts.abbr.none")}</p>}
              {suggestions.length > 0 && (
                <ol className="flex flex-col gap-1.5">
                  {suggestions.map((s, i) => (
                    <li key={`${s.expan}-${i}`}>
                      {i === suggestions.findIndex((x) => !x.fits) && <p className="text-xs text-ink-3 mt-1 mb-1.5">{t("manuscripts.abbr.other")}</p>}
                      {i === 0 && s.fits && <p className="text-xs text-ink-3 mb-1.5">{t("manuscripts.abbr.suggestions")}</p>}
                      <button type="button" onClick={() => setAbbrExpan(s.expan)} aria-pressed={abbrExpan === s.expan}
                        className={cn("w-full text-start flex items-start gap-3 rounded-[10px] border px-3 py-2 transition-colors",
                          abbrExpan === s.expan ? "border-violet bg-violet-soft" : "border-line hover:bg-surface-2", !s.fits && "opacity-80")}>
                        <Kbd>{i + 1}</Kbd>
                        <span className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-ms text-lg leading-snug" dir="rtl">{s.expan}</span>
                          <span className="text-xs text-ink-3" dir="auto">{locale === "ar" ? s.noteAr : s.noteEn}</span>
                        </span>
                        {s.warn && <span className="ms-auto shrink-0 inline-flex items-center gap-1 text-xs text-warn"><TriangleAlert className="size-3.5" />{t("manuscripts.abbr.warn")}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                {t("manuscripts.abbr.custom")}
                <input value={abbrExpan} onChange={(e) => setAbbrExpan(e.target.value)} dir="rtl" lang="ar"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAbbr(abbrExpan); } }}
                  className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-ink font-ms text-lg" />
              </label>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-ink-3">{abbrWritten ? t("manuscripts.abbr.confirmHint", { w: abbrWritten }) : t("manuscripts.ed.selectFirst")}</p>
                <button type="button" disabled={!abbrExpan.trim() || !abbrWritten} onClick={() => confirmAbbr(abbrExpan)} className="h-9 px-4 rounded-[10px] bg-accent text-accent-ink text-sm font-medium disabled:opacity-40 shrink-0">{t("manuscripts.abbr.confirm")}</button>
              </div>
            </div>
          )}
          {panel === "marks" && (
            <div className="flex flex-col gap-3">
              {!markKind ? (
                <>
                  <ul className="grid grid-cols-3 gap-1.5">
                    {MARKS.map((m) => (
                      <li key={m.kind}>
                        <button type="button" onClick={() => pickMark(m.kind)} data-mark={m.kind}
                          className="w-full h-full flex flex-col items-center gap-0.5 rounded-[10px] border border-line px-2 py-2 hover:bg-violet-soft hover:border-violet transition-colors">
                          <span className="font-ms text-xl leading-snug text-violet">{m.glyph}</span>
                          <span className="text-[0.72rem] font-medium leading-tight text-center">{m.term}</span>
                          <span className="text-[0.68rem] text-ink-3 leading-tight text-center">{t(`manuscripts.mark.${m.kind}`)}</span>
                          {panelByKey && <Kbd>{m.key.replace("Key", "")}</Kbd>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-ink-3">{t("manuscripts.marks.hint")}</p>
                </>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs text-ink-3">
                    {t("manuscripts.marks.glyph")}
                    <input value={markGlyph} onChange={(e) => setMarkGlyph(e.target.value)} dir="rtl" className="w-24 h-10 rounded-[10px] border border-line-strong bg-surface px-2 text-ink font-ms text-lg" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-ink-3 flex-1 min-w-48">
                    {t(`manuscripts.marks.note.${markInfo(markKind).note ?? "free"}`)}
                    <input value={markNote} onChange={(e) => setMarkNote(e.target.value)} dir="auto" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertMark(markKind, markGlyph, markNote); setMarkKind(null); } }}
                      className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-ink font-ms text-lg" />
                  </label>
                  <button type="button" onClick={() => { insertMark(markKind, markGlyph, markNote); setMarkKind(null); }} className="h-10 px-4 rounded-[10px] bg-accent text-accent-ink text-sm font-medium">{t("manuscripts.tool.insert")}</button>
                </div>
              )}
            </div>
          )}
          {panel === "chars" && (
            <div className="flex flex-col gap-2.5">
              {SPECIAL_CHARS.map((g) => (
                <div key={g.group} className="flex flex-col gap-1">
                  <span className="text-xs text-ink-3">{t(`manuscripts.chars.${g.group}`)}</span>
                  <div className="flex flex-wrap gap-1">
                    {g.chars.map((c) => (
                      <button key={c.ch} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertChar(c.ch)} title={c.name} aria-label={c.name}
                        className="size-10 grid place-items-center rounded-[9px] border border-line hover:bg-surface-2 font-ms text-xl leading-none">
                        {/[ؐ-ًؚ-ٰٟۖ-ۭ]/.test(c.ch) ? `ـ${c.ch}ـ` : c.ch === "‌" ? "ZWNJ" : c.ch}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && <p role="status" className="text-sm text-warn">{msg}</p>}

      {typedMarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-violet-soft px-3 py-2 text-sm" role="status">
          <Stamp className="size-4 text-violet" />
          <span>{t("manuscripts.ed.typedMark", { w: typedMarks[0] })}</span>
          <button type="button" onClick={() => convertTypedMark(typedMarks[0])} className="ms-auto h-8 px-3 rounded-full bg-violet text-white text-xs font-medium">{t("manuscripts.ed.makeMark")}</button>
        </div>
      )}

      {unclearAtCaret && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-warn/40 bg-warn-soft/60 px-3 py-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-warn">{t("manuscripts.ed.alts")}</span>
            <span className="font-ms text-lg px-1 rounded bg-surface/70" dir="rtl">{unclearAtCaret.v}</span>
            {unclearAtCaret.conf !== undefined && (
              <span className="text-[0.7rem] text-ink-3 inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-12 rounded-full bg-surface-3 overflow-hidden" aria-hidden><span className="block h-full bg-warn" style={{ width: `${unclearAtCaret.conf}%` }} /></span>
                {t("manuscripts.ed.modelScore", { n: unclearAtCaret.conf })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(unclearAtCaret.alts ?? []).map((a, i) => (
              <button key={a} type="button" onClick={() => acceptAlt(a)} disabled={readOnly} title={t("manuscripts.ed.accept", { w: a })} aria-label={t("manuscripts.ed.accept", { w: a })}
                className="inline-flex items-center gap-1.5 h-9 ps-1.5 pe-3 rounded-full border border-line-strong bg-surface hover:border-accent hover:bg-accent-soft transition-colors">
                <Kbd>{i + 1}</Kbd><span className="font-ms text-lg leading-none" dir="rtl">{a}</span>
              </button>
            ))}
            {!readOnly && (
              <input value={newAlt} onChange={(e) => setNewAlt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlt(); } }}
                placeholder="+" aria-label={t("manuscripts.unclear.alts")} dir="rtl" className="h-9 w-28 rounded-full border border-dashed border-line-strong bg-surface/80 px-3 font-ms text-base" />
            )}
          </div>
          <p className="text-[0.7rem] text-ink-3">{t("manuscripts.ed.altsHint")}</p>
        </div>
      )}

      {marks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-3">{t("manuscripts.ed.marksHere")}</span>
          {marks.map(([m, i]) => (
            <span key={i} className="inline-flex items-center gap-1.5 h-8 ps-2.5 pe-1 rounded-full bg-violet-soft text-sm">
              <span className="font-ms text-violet text-base">{m.v}</span>
              <span className="text-xs">{t(`manuscripts.mark.${m.kind}`)}{m.note ? `: ${m.note}` : ""}</span>
              {!readOnly && (
                <button type="button" onClick={() => commit(removeToken(tokens, i))} className="size-6 grid place-items-center rounded-full hover:bg-surface" aria-label={`${t("manuscripts.ed.remove")} ${m.v}`}><X className="size-3.5" /></button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-[10px] bg-surface-2/70 px-3 py-2" data-testid="reading-layer">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-3">
            {t("manuscripts.ed.readingPreview")}
            {readingSame && <span className="normal-case font-normal tracking-normal"> · {t("manuscripts.ed.readingSame")}</span>}
          </span>
          {onNormalizedChange && !readOnly && (
            normalizedText == null ? (
              <button type="button" onClick={() => onNormalizedChange(readingText(tokens))} className="text-xs text-accent hover:underline">{t("manuscripts.ed.readingEdit")}</button>
            ) : (
              <button type="button" onClick={() => onNormalizedChange(null)} className="text-xs text-accent hover:underline">{t("manuscripts.ed.readingReset")}</button>
            )
          )}
        </div>
        {normalizedText != null && onNormalizedChange && !readOnly ? (
          <>
            <textarea value={normalizedText} onChange={(e) => onNormalizedChange(e.target.value.replace(/[\r\n]+/g, " "))} dir="rtl" lang="ar" rows={1} aria-label={t("manuscripts.ed.readingCustom")}
              className="ms-text w-full resize-none rounded-[8px] border border-line-strong bg-surface px-3 [field-sizing:content]" />
            <span className="text-[0.7rem] text-ink-3">{t("manuscripts.ed.readingCustom")}</span>
          </>
        ) : !readingSame ? (
          <>
            <p className="ms-text text-ink-2 min-h-[2em]">{normalizedText != null ? normalizedText : <TokenText tokens={tokens} layer="reading" />}</p>
            {!readOnly && <span className="text-[0.7rem] text-ink-3">{t("manuscripts.ed.readingAuto")}</span>}
          </>
        ) : null}
      </div>
      {extras}
    </div>
  );
});

/** Mirrors the textarea's text with markup styling; transparent glyphs, visible decorations. */
function Backdrop({ tokens }: { tokens: Tok[] }) {
  return (
    <div aria-hidden dir="rtl" className={cn(EDITOR_TEXT, "[grid-area:1/1] pointer-events-none select-none text-transparent")}>
      {segments(tokens).map((s) => {
        const k = s.tok;
        switch (k.t) {
          case "text": return <span key={s.index}>{k.v}</span>;
          case "unclear": return <span key={s.index} className="underline decoration-dashed decoration-warn decoration-2 underline-offset-[0.5em] bg-warn-soft rounded-[3px]">{k.v}</span>;
          case "gap": return <span key={s.index} className="bg-surface-3 rounded-[4px] outline outline-1 outline-dashed outline-ink-3/60">{GAP_TEXT}</span>;
          case "supplied": return <span key={s.index} className="bg-violet-soft rounded-[3px] underline decoration-violet decoration-double underline-offset-[0.5em]">{k.v}</span>;
          case "del": return <span key={s.index} className="line-through decoration-bad decoration-2">{k.v}</span>;
          case "add": return <span key={s.index} className="bg-accent-soft rounded-[3px] underline decoration-dotted decoration-accent decoration-2 underline-offset-[0.5em]">{k.v}</span>;
          case "abbr": return <span key={s.index} className="underline decoration-dotted decoration-violet decoration-2 underline-offset-[0.5em] bg-violet-soft/60 rounded-[3px]">{k.v}</span>;
          case "hi": return <span key={s.index} className={cn("rounded-[3px]", k.rend === "red" ? "bg-bad-soft" : k.rend === "gold" ? "bg-warn-soft" : k.rend === "overline" ? "overline decoration-ink-2" : "bg-surface-3")}>{k.v}</span>;
          case "mark":
            return (
              <span key={s.index} className="relative inline-block w-0 align-top">
                <span className="absolute -top-[0.55em] start-0 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-full bg-violet px-1.5 font-ms text-[0.55em] leading-[1.6] text-white">{k.v}</span>
              </span>
            );
        }
      })}
      <span>{"​"}</span>
    </div>
  );
}
