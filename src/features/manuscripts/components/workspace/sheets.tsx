"use client";
import { Fragment, useEffect, useState } from "react";
import { BadgeCheck, Bot, FlaskConical, RotateCcw, TriangleAlert, WandSparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, Kbd, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { fmtRelative } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { diffChars } from "../../text";
import type { LineDTO, LineVersionDTO, PageDetail } from "../../types";
import { api, ApiError, num, pct } from "../api";
import { TokenText } from "../token-view";
import { studioExtensions } from "../../studio-extensions";
import { MOD_LABEL } from "./keys";

// ───────────────────────────────────────────── History

export function HistorySheet({ open, onClose, line, detail, onRestore, onApproved }: {
  open: boolean; onClose: () => void; line: LineDTO | null; detail: PageDetail;
  onRestore: (v: LineVersionDTO) => void; onApproved: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [versions, setVersions] = useState<LineVersionDTO[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open || !line) return;
    setVersions(null);
    setError(false);
    api<{ versions: LineVersionDTO[] }>(`/api/ms/lines/${line.id}/versions`).then((r) => setVersions(r.versions)).catch(() => setError(true));
  }, [open, line, line?.current_version]);
  if (!line) return null;
  const canApprove = detail.viewer.role === "researcher" || detail.viewer.role === "platform_admin";
  const approve = async (approved: boolean) => {
    try {
      await api(`/api/ms/lines/${line.id}/approve`, { method: "POST", json: { approved } });
      await onApproved();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("manuscripts.error.generic") });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("manuscripts.hist.title", { n: num(line.n, locale) })} description={t("manuscripts.hist.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-3" data-testid="history">
        {canApprove && line.version && detail.page.status !== "published" && (
          <Button size="sm" variant={line.status === "approved" ? "secondary" : "soft"} onClick={() => approve(line.status !== "approved")} className="self-start">
            <BadgeCheck className="size-4" />{t(line.status === "approved" ? "manuscripts.line.unapprove" : "manuscripts.line.approve")}
          </Button>
        )}
        {error && <Callout tone="bad">{t("manuscripts.error.load")}</Callout>}
        {!versions && !error && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        {versions?.length === 0 && <p className="text-ink-3">{t("manuscripts.hist.empty")}</p>}
        <ol className="flex flex-col gap-2">
          {versions?.map((v) => {
            const name = locale === "ar" ? v.author_name_ar : v.author_name_en;
            const current = v.version === line.current_version;
            return (
              <li key={v.version} className={cn("rounded-[12px] border p-3 flex flex-col gap-1.5", current ? "border-accent/60 bg-accent-soft/30" : "border-line")} data-version={v.version}>
                <div className="flex items-center gap-2 text-sm">
                  {v.kind === "machine" ? <span className="size-6 rounded-full bg-surface-3 grid place-items-center"><Bot className="size-3.5 text-ink-2" /></span> : <Avatar name={name ?? "?"} hue={v.author_hue ?? 200} size={24} />}
                  <span className="font-medium">{t("manuscripts.hist.v", { v: num(v.version, locale) })}</span>
                  <Badge>{t(`manuscripts.hist.kind.${v.kind}`)}</Badge>
                  {current && <Badge tone="accent">{t("manuscripts.hist.current")}</Badge>}
                  <span className="ms-auto text-xs text-ink-3">{fmtRelative(v.created_at, locale)}</span>
                </div>
                <p className="text-xs text-ink-3">{v.kind === "machine" ? t("manuscripts.hist.machine", { engine: v.engine ?? "?" }) : name}</p>
                <TokenText tokens={v.tokens} className="text-[1.15rem]" />
                {!current && detail.viewer.canEdit && (
                  <Button size="sm" variant="ghost" className="self-start" onClick={() => onRestore(v)}><RotateCcw className="size-4" />{t("manuscripts.hist.restore")}</Button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Sheet>
  );
}

// ───────────────────────────────────────────── Evaluation (dataset ground truth)

interface EvalData {
  lines: { id: string; n: number; gt_text: string | null; gt_status: string | null; machine_text: string | null; machine_engine: string | null; current_text: string | null; current_kind: string | null; machine_cer: number | null; current_cer: number | null }[];
  page: { machine_cer: number | null; current_cer: number | null; machine_cer_folded: number | null; current_cer_folded: number | null; gt_lines: number; human_lines: number; gt_chars: number };
  stored_draft_cer: number | null;
  draft_engine: string | null;
  gt_reliability: string | null;
  gt_note: string | null;
}

export function EvalSheet({ open, onClose, detail, onPick }: { open: boolean; onClose: () => void; detail: PageDetail; onPick: (lineId: string) => void }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<EvalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState<{ id: string; vs: "current" | "machine" } | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    api<EvalData>(`/api/ms/pages/${detail.page.id}/eval`).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : t("manuscripts.error.load")));
  }, [open, detail.page.id, detail.lines, t]);
  const bar = (v: number | null) => (
    <span className="inline-flex items-center gap-1.5 tabular text-xs">
      <span className="h-1.5 w-14 rounded-full bg-surface-3 overflow-hidden" aria-hidden><span className={cn("block h-full", v == null ? "" : v < 0.1 ? "bg-ok" : v < 0.3 ? "bg-warn" : "bg-bad")} style={{ width: `${Math.min(100, (v ?? 0) * 100)}%` }} /></span>
      {pct(v, locale, 0)}
    </span>
  );
  return (
    <Sheet open={open} onClose={onClose} side="end" title={<span className="inline-flex items-center gap-2"><FlaskConical className="size-5 text-violet" />{t("manuscripts.eval.title")}</span>} description={t("manuscripts.eval.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-4" data-testid="eval">
        {detail.manuscript.gt_reliability === "low" && (
          <Callout tone="warn" icon={<TriangleAlert className="size-4 text-warn" />} title={t("manuscripts.meta.gtCaveatTitle")}>{t("manuscripts.meta.gtCaveat")}</Callout>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
        {!data && !error && <Skeleton className="h-28" />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[12px] border border-line p-3">
                <div className="text-xs text-ink-3">{t("manuscripts.eval.machine")}</div>
                <div className="text-2xl font-semibold tabular">{pct(data.page.machine_cer, locale)}</div>
                <div className="text-[0.7rem] text-ink-3">{t("manuscripts.eval.folded", { v: pct(data.page.machine_cer_folded, locale) })}</div>
                <div className="text-[0.7rem] text-ink-3">{t(`manuscripts.draft.engine.${data.draft_engine ?? "none"}`)}</div>
              </div>
              <div className="rounded-[12px] border border-accent/50 bg-accent-soft/30 p-3">
                <div className="text-xs text-ink-3">{t("manuscripts.eval.current")}</div>
                <div className="text-2xl font-semibold tabular">{pct(data.page.current_cer, locale)}</div>
                <div className="text-[0.7rem] text-ink-3">{t("manuscripts.eval.folded", { v: pct(data.page.current_cer_folded, locale) })}</div>
              </div>
            </div>
            <p className="text-xs text-ink-3">{t("manuscripts.eval.lines", { gt: num(data.page.gt_lines, locale), h: num(data.page.human_lines, locale) })}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-3 text-start">
                  <th className="text-start font-medium py-1">{t("manuscripts.eval.line")}</th>
                  <th className="text-start font-medium">{t("manuscripts.eval.machine")}</th>
                  <th className="text-start font-medium">{t("manuscripts.eval.current")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="border-t border-line">
                      <td className="py-1.5"><button type="button" className="text-accent hover:underline tabular" onClick={() => onPick(l.id)}>{num(l.n, locale)}</button></td>
                      <td>{l.gt_text ? bar(l.machine_cer) : <span className="text-xs text-ink-3">{t("manuscripts.eval.noRef")}</span>}</td>
                      <td>{l.gt_text ? bar(l.current_cer) : null}</td>
                      <td className="text-end">
                        {l.gt_text && (
                          <button type="button" className="text-xs text-accent hover:underline" aria-expanded={openDiff?.id === l.id}
                            onClick={() => setOpenDiff(openDiff?.id === l.id ? null : { id: l.id, vs: "current" })}>
                            {openDiff?.id === l.id ? t("manuscripts.eval.hide") : t("manuscripts.eval.diff")}
                          </button>
                        )}
                      </td>
                    </tr>
                    {openDiff?.id === l.id && l.gt_text && (
                      <tr>
                        <td colSpan={4} className="pb-3">
                          <div className="flex gap-1 mb-1.5">
                            {(["current", "machine"] as const).map((vs) => (
                              <button key={vs} type="button" onClick={() => setOpenDiff({ id: l.id, vs })} aria-pressed={openDiff.vs === vs}
                                className={cn("h-7 px-2.5 rounded-full text-xs border", openDiff.vs === vs ? "bg-ink text-bg border-ink" : "border-line-strong")}>
                                {t(vs === "current" ? "manuscripts.eval.vsCurrent" : "manuscripts.eval.vsMachine")}
                              </button>
                            ))}
                          </div>
                          <p dir="rtl" className="ms-text text-[1.1rem] rounded-[10px] bg-surface-2 px-3 py-1">
                            {diffChars(l.gt_text, (openDiff.vs === "current" ? l.current_text : l.machine_text) ?? "").map((d, i) =>
                              d.op === "equal" ? <span key={i}>{d.text}</span>
                                : d.op === "delete" ? <del key={i} className="bg-bad-soft text-bad">{d.text}</del>
                                : <ins key={i} className="bg-ok-soft text-ok no-underline">{d.text}</ins>)}
                          </p>
                          <p className="text-[0.7rem] text-ink-3 mt-1"><del className="bg-bad-soft text-bad px-1">ab</del> {t("manuscripts.eval.legendRef")} · <ins className="bg-ok-soft text-ok no-underline px-1">ab</ins> {t("manuscripts.eval.legendHyp")}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-3">{t("manuscripts.eval.how")}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────────────────────────── Machine draft

export function DraftSheet({ open, onClose, detail, onDone }: { open: boolean; onClose: () => void; detail: PageDetail; onDone: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ drafted: number; kept_human: number; note?: string }>(`/api/ms/pages/${detail.page.id}/draft`, { method: "POST", json: {} });
      toast({ tone: "ok", text: r.drafted ? t("manuscripts.draft.done", { n: num(r.drafted, locale), k: num(r.kept_human, locale) }) : t("manuscripts.draft.none") });
      if (r.note) toast({ tone: "info", text: r.note });
      onClose();
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("manuscripts.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} side="center" title={t("manuscripts.draft.title")} closeLabel={t("action.close")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button><Button onClick={go} loading={busy}><WandSparkles className="size-4" />{busy ? t("manuscripts.draft.going") : t("manuscripts.draft.go")}</Button></>}>
      <div className="flex flex-col gap-3">
        <Callout tone={detail.ai ? "violet" : "warn"} icon={<Bot className="size-4" />}>{detail.ai ? t("manuscripts.draft.ai") : t("manuscripts.draft.ocr")}</Callout>
        <p className="text-sm text-ink-2">{t("manuscripts.draft.keep")}</p>
        <p className="text-sm text-ink-3">{t("manuscripts.draft.honest")}</p>
        {error && <Callout tone="bad">{error}</Callout>}
        <p className="sr-only" aria-live="polite">{busy ? t("manuscripts.draft.going") : ""}</p>
      </div>
    </Sheet>
  );
}

// ───────────────────────────────────────────── Problematic flag

export function FlagSheet({ open, onClose, detail, onDone }: { open: boolean; onClose: () => void; detail: PageDetail; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/ms/pages/${detail.page.id}/flag`, { method: "POST", json: { flagged: true, reason } });
      setReason("");
      onClose();
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("manuscripts.error.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} side="center" title={t("manuscripts.flag.title")} description={t("manuscripts.flag.desc")} closeLabel={t("action.close")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("action.cancel")}</Button><Button onClick={go} loading={busy} disabled={!reason.trim()}>{t("manuscripts.flag.go")}</Button></>}>
      <Field label={t("manuscripts.flag.reason")} htmlFor="flag-reason">
        <Textarea id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <Callout tone="bad" className="mt-3">{error}</Callout>}
    </Sheet>
  );
}

// ───────────────────────────────────────────── Shortcuts

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const M = MOD_LABEL();
  const groups: { title: string; rows: [string[], string][] }[] = [
    { title: t("manuscripts.keys.nav"), rows: [[["J", "K"], t("manuscripts.keys.nextLine")], [[`${M} ↓`, `${M} ↑`], t("manuscripts.keys.nextLine")], [["Enter"], t("manuscripts.keys.openLine")], [["?"], t("manuscripts.keys.help")]] },
    { title: t("manuscripts.keys.edit"), rows: [[[`${M} S`], t("manuscripts.keys.save")], [["Enter"], t("manuscripts.keys.saveNext")], [[`${M} Z`, `${M} ⇧ Z`], t("manuscripts.keys.undo")], [[`${M} ⇧ 1…9`], t("manuscripts.keys.alt")], [["Esc"], t("manuscripts.keys.leave")]] },
    {
      title: t("manuscripts.keys.markup"),
      rows: [
        [[`${M} ⇧ U`], t("manuscripts.tool.unclearDesc")], [[`${M} ⇧ G`], t("manuscripts.tool.gapDesc")], [[`${M} ⇧ E`], t("manuscripts.tool.abbrDesc")],
        [[`${M} ⇧ M`], t("manuscripts.tool.marksDesc")], [[`${M} ⇧ S`], t("manuscripts.tool.suppliedDesc")], [[`${M} ⇧ D`], t("manuscripts.tool.delDesc")],
        [[`${M} ⇧ A`], t("manuscripts.tool.addDesc")], [[`${M} ⇧ H`], t("manuscripts.tool.hiDesc")], [[`${M} ⇧ X`], t("manuscripts.tool.clear")], [[`${M} ⇧ K`], t("manuscripts.tool.charsDesc")],
      ],
    },
    { title: t("manuscripts.keys.image"), rows: [[["+", "−"], t("manuscripts.keys.zoom")], [["0", "1"], t("manuscripts.keys.fit")], [["L", `${M} ⇧ L`], t("manuscripts.keys.zoomLine")], [["I"], t("manuscripts.keys.filter")], [["O"], t("manuscripts.keys.overlays")], [["R"], t("manuscripts.keys.reading")]] },
    ...studioExtensions.flatMap((x) => x.shortcuts ?? []).map((g) => ({ title: t(g.group), rows: g.rows.map(([k, l]) => [k.map((x) => x.replace("Ctrl", M)), t(l)] as [string[], string]) })),
  ];
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("manuscripts.keys.title")} description={t("manuscripts.keys.desc")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-5" data-testid="shortcuts">
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <dl className="flex flex-col">
              {g.rows.map(([keys, label], i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
                  <dt className="text-sm text-ink-2">{label}</dt>
                  <dd className="flex gap-1 shrink-0" dir="ltr">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
