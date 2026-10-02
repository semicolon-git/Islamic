"use client";
/**
 * A line being edited: soft lock (60 s, renewed every 20 s), save with optimistic concurrency (409 → merge dialog),
 * autosave on blur and before switching lines, Ctrl/Cmd+S, visible "Saved", undo of the last save.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, CircleAlert, History, Lock, RotateCcw, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout, Kbd } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import type { Genre, Zone } from "../../abbreviations";
import { plainText, sameTokens, type Tok } from "../../tokens";
import type { LineDTO, LineVersionDTO, PageDetail } from "../../types";
import { api, ApiError, num } from "../api";
import { LineCrop, type ImageFilter } from "../line-crop";
import { TokenText } from "../token-view";
import { LineEditor, type EditorCommand, type LineEditorHandle } from "./line-editor";
import { MergeDialog } from "./merge-dialog";

export interface SessionHandle {
  /** Save if there are unsaved changes. Resolves false if the save could not complete (conflict, error). */
  flush: () => Promise<boolean>;
  dirty: () => boolean;
  focus: () => void;
}

interface Props {
  detail: PageDetail;
  line: LineDTO;
  filter: ImageFilter;
  focusToken?: number;
  onSaved: (v: LineVersionDTO) => void;
  onCommand: (c: EditorCommand) => void;
  onHistory: () => void;
  onClose: () => void;
  extras?: (tokens: Tok[], setTokens: (t: Tok[]) => void) => React.ReactNode;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const LineSession = forwardRef<SessionHandle, Props>(function LineSession(p, ref) {
  const { detail, line, filter, focusToken, onSaved, onCommand, onHistory, onClose, extras } = p;
  const { t, locale } = useI18n();
  const toast = useToast();
  const me = detail.viewer;
  const [tokens, setTokensState] = useState<Tok[]>(line.version?.tokens ?? []);
  const [normalized, setNormalized] = useState<string | null>(line.version?.normalized_text ?? null);
  const [base, setBase] = useState(line.current_version);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<"pending" | "mine" | "other" | "none">(me.canEdit ? "pending" : "none");
  const [holder, setHolder] = useState<{ name_en: string; name_ar: string; hue: number } | null>(null);
  const [conflict, setConflict] = useState<{ theirs: LineVersionDTO } | null>(null);
  const [reference, setReference] = useState<LineVersionDTO | null>(null);
  const [lastSave, setLastSave] = useState<{ tokens: Tok[]; normalized: string | null } | null>(null);
  const [context, setContext] = useState(false);
  const editor = useRef<LineEditorHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const stateRef = useRef({ tokens, normalized, base });
  stateRef.current = { tokens, normalized, base };

  const zone: Zone = detail.regions.find((r) => r.id === line.region_id)?.type === "margin" ? "margin" : "main";
  const genre = (detail.manuscript.genre ?? "general") as Genre;
  const readOnly = !me.canEdit || lock === "other";

  const setTokens = useCallback((next: Tok[]) => {
    setTokensState(next);
    dirtyRef.current = true;
    setState("dirty");
  }, []);
  const setNorm = useCallback((s: string | null) => {
    setNormalized(s);
    dirtyRef.current = true;
    setState("dirty");
  }, []);

  // Someone else saved this line while it was open and we have nothing unsaved: take their version.
  useEffect(() => {
    if (line.current_version !== stateRef.current.base && !dirtyRef.current && line.version) {
      setTokensState(line.version.tokens);
      setNormalized(line.version.normalized_text);
      setBase(line.current_version);
    }
  }, [line.current_version, line.version]);

  // Soft lock
  useEffect(() => {
    if (!me.canEdit) return;
    let alive = true;
    const call = async (action: "acquire" | "renew") => {
      try {
        await api(`/api/ms/lines/${line.id}/lock`, { method: "POST", json: { action } });
        if (alive) { setLock("mine"); setHolder(null); }
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 423) {
          const d = e.data as { holder?: { name_en: string; name_ar: string; hue: number } } | undefined;
          setLock("other");
          setHolder(d?.holder ?? null);
        } else if (e instanceof ApiError && e.status === 403) setLock("none");
      }
    };
    call("acquire");
    const timer = setInterval(() => call("renew"), 20_000);
    const release = () => navigator.sendBeacon?.(`/api/ms/lines/${line.id}/lock`, new Blob([JSON.stringify({ action: "release" })], { type: "application/json" }));
    window.addEventListener("pagehide", release);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      fetch(`/api/ms/lines/${line.id}/lock`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "release" }) }).catch(() => {});
    };
  }, [line.id, me.canEdit]);

  const doSave = useCallback(async (override?: { tokens: Tok[]; normalized: string | null; base: number }): Promise<boolean> => {
    const cur = override ?? stateRef.current;
    if (!override && !dirtyRef.current) return true;
    if (!me.canEdit || lock === "other") return false;
    setState("saving");
    setError(null);
    const prev = line.version ? { tokens: line.version.tokens, normalized: line.version.normalized_text } : { tokens: [], normalized: null };
    try {
      const r = await api<{ version: LineVersionDTO; normalized: string[] }>(`/api/ms/lines/${line.id}`, {
        method: "PUT",
        json: { base_version: cur.base, tokens: cur.tokens, normalized_text: cur.normalized },
      });
      dirtyRef.current = false;
      setBase(r.version.version);
      setTokensState(r.version.tokens);
      setNormalized(r.version.normalized_text);
      setState("saved");
      setReference(null);
      setLastSave(prev);
      onSaved(r.version);
      if (r.normalized.length)
        toast({ tone: "info", text: t("manuscripts.ed.normalized", { n: r.normalized.length, what: r.normalized.map((c) => t(`manuscripts.ed.norm.${c}`)).join("، ") }) });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.data as { theirs: LineVersionDTO };
        setConflict({ theirs: d.theirs });
        setState("dirty");
        return false;
      }
      setState("error");
      setError(e instanceof ApiError ? e.message : t("manuscripts.error.generic"));
      return false;
    }
  }, [line.id, line.version, lock, me.canEdit, onSaved, t, toast]);

  const save = useCallback(() => {
    if (!savingRef.current) savingRef.current = doSave().finally(() => { savingRef.current = null; });
    return savingRef.current;
  }, [doSave]);

  useImperativeHandle(ref, () => ({ flush: save, dirty: () => dirtyRef.current, focus: () => editor.current?.focus() }), [save]);

  const undoSave = async () => {
    if (!lastSave) return;
    const ok = await doSave({ tokens: lastSave.tokens, normalized: lastSave.normalized, base: stateRef.current.base });
    if (ok) {
      setLastSave(null);
      toast({ tone: "ok", text: t("manuscripts.ed.undone") });
    }
  };

  const command = async (c: EditorCommand) => {
    if (c === "save") { await save(); return; }
    if (c === "saveNext" || c === "next" || c === "prev") {
      const ok = await save();
      if (ok) onCommand(c === "prev" ? "prev" : "next");
      return;
    }
    if (c === "leave") { const ok = await save(); if (ok) onClose(); return; }
    onCommand(c);
  };

  const holderName = holder ? (locale === "ar" ? holder.name_ar : holder.name_en) : "";
  const theirsNewer = dirtyRef.current && line.current_version > base && !conflict;

  return (
    <div ref={box} className="flex flex-col gap-3"
      onBlur={(e) => {
        if (box.current && !box.current.contains(e.relatedTarget as Node | null) && dirtyRef.current && !conflict) save();
      }}>
      <LineCrop src={detail.page.image_path} width={detail.page.width} height={detail.page.height} polygon={line.polygon} context={context ? 1.2 : 0} filter={filter}
        label={t("manuscripts.ed.crop", { n: num(line.n, locale) })} maxHeight={context ? 240 : 120} legible />
      <div className="flex items-center justify-between gap-2 -mt-1">
        <label className="inline-flex items-center gap-2 text-xs text-ink-3 cursor-pointer">
          <input type="checkbox" checked={context} onChange={(e) => setContext(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
          {t("manuscripts.ed.cropContext")}
        </label>
        {line.version?.kind === "machine" && !dirtyRef.current && (
          <span className="text-xs text-ink-3">{t("manuscripts.text.machineHint")}</span>
        )}
      </div>

      {lock === "other" && (
        <Callout tone="warn" icon={holder ? <Avatar name={holderName} hue={holder.hue} size={22} /> : <Lock className="size-4" />}>
          <span data-testid="lock-notice">{t("manuscripts.ed.locked", { name: holderName || "—" })}</span>
        </Callout>
      )}
      {!me.canEdit && <p className="text-sm text-ink-3">{t("manuscripts.ed.noEdit")}</p>}
      {theirsNewer && <Callout tone="warn">{t("manuscripts.ed.theirsChanged", { name: "—" })}</Callout>}

      {reference && (
        <div className="rounded-[10px] border border-dashed border-line-strong px-3 py-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-3">{t("manuscripts.merge.reference")} · v{reference.version}</span>
            <button type="button" onClick={() => setReference(null)} className="size-7 grid place-items-center rounded-full hover:bg-surface-2" aria-label={t("manuscripts.close")}><X className="size-3.5" /></button>
          </div>
          <TokenText tokens={reference.tokens} />
        </div>
      )}

      <LineEditor
        ref={editor}
        id={`ed-${line.id}`}
        tokens={tokens}
        onChange={setTokens}
        genre={genre}
        zone={zone}
        label={t("manuscripts.ed.label", { n: num(line.n, locale) })}
        readOnly={readOnly}
        normalizedText={normalized}
        onNormalizedChange={setNorm}
        onCommand={command}
        autoFocus
        focusToken={focusToken}
        extras={extras?.(tokens, setTokens)}
      />

      {error && <Callout tone="bad" icon={<CircleAlert className="size-4 text-bad" />}>{t("manuscripts.error.save", { msg: error })}</Callout>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span aria-live="polite" className={cn("text-sm inline-flex items-center gap-1.5 me-auto", state === "saved" ? "text-ok" : state === "error" ? "text-bad" : "text-ink-3")} data-testid="save-state">
          {state === "saving" && <><span className="size-3 rounded-full border-2 border-current border-e-transparent animate-spin" />{t("manuscripts.ed.saving")}</>}
          {state === "saved" && <><Check className="size-4" />{t("manuscripts.ed.savedV", { v: num(base, locale) })}</>}
          {state === "dirty" && <><span className="size-2 rounded-full bg-warn" />{t("manuscripts.ed.unsaved")}</>}
          {state === "idle" && line.version && <span className="tabular">v{num(line.current_version, locale)}</span>}
        </span>
        {lastSave && state === "saved" && (
          <Button size="sm" variant="ghost" onClick={undoSave}><RotateCcw className="size-4" />{t("manuscripts.ed.undoSave")}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={onHistory}><History className="size-4" />{t("manuscripts.ed.history")}</Button>
        {!readOnly && (
          <>
            <Button size="sm" variant="secondary" onClick={() => command("save")} disabled={state === "saving"} title="Ctrl+S">{t("manuscripts.ed.save")} <Kbd>Ctrl S</Kbd></Button>
            <Button size="sm" onClick={() => command("saveNext")} disabled={state === "saving"} title="Enter">{t("manuscripts.ed.saveNext")} <Kbd>↵</Kbd></Button>
          </>
        )}
      </div>

      {conflict && (
        <MergeDialog
          open
          detail={detail}
          line={line}
          theirs={conflict.theirs}
          mine={tokens}
          filter={filter}
          onTheirs={() => {
            dirtyRef.current = false;
            setTokensState(conflict.theirs.tokens);
            setNormalized(conflict.theirs.normalized_text);
            setBase(conflict.theirs.version);
            setState("idle");
            setConflict(null);
          }}
          onMine={async () => {
            const theirs = conflict.theirs;
            setConflict(null);
            await doSave({ tokens: stateRef.current.tokens, normalized: stateRef.current.normalized, base: theirs.version });
          }}
          onCombine={() => {
            setBase(conflict.theirs.version);
            setReference(conflict.theirs);
            setConflict(null);
            toast({ tone: "info", text: t("manuscripts.merge.combineHint") });
            editor.current?.focus();
          }}
          onClose={() => setConflict(null)}
        />
      )}
      <p className="sr-only" aria-live="polite">{plainText(tokens) === "" ? t("manuscripts.text.emptyLine") : ""}</p>
    </div>
  );
});

export { sameTokens };
