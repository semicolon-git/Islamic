"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Send, UserRound, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { api, ApiError, num } from "../../../manuscripts/components/api";
import { PageStatus } from "../../../manuscripts/components/status";
import type { AssignData, Priority, TaskKind } from "../../types";
import { FirstTip, Siglum } from "../bits";
import { DueChip } from "./task-card";

const EDITABLE = new Set(["ai_draft", "returned"]);

/** Researchers and institution admins assign pages to a student: who, which pages, what to do, by when. */
export function AssignPanel() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<AssignData | null>(null);
  const [error, setError] = useState(false);
  const [student, setStudent] = useState<string | null>(null);
  const [pages, setPages] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<TaskKind>("transcribe");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<AssignData>("/api/ms-collab/assign"));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = (id: string) => setPages((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const who = data?.students.find((s) => s.id === student);
  const submit = async () => {
    if (!student || !pages.size) return;
    setBusy(true);
    try {
      await api("/api/ms-collab/assign", { method: "POST", json: { page_ids: [...pages], assignee_id: student, kind, priority, due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null, note: note || undefined } });
      toast({ tone: "ok", text: t("collab.assign.done", { n: num(pages.size, locale), name: who ? (locale === "ar" ? who.name_ar : who.name_en) : "" }) });
      setPages(new Set());
      setNote("");
      await load();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    try {
      await api(`/api/ms-collab/tasks/${id}`, { method: "POST", json: { action: "cancel" } });
      await load();
    } catch (e) {
      toast({ tone: "bad", text: e instanceof ApiError ? e.message : t("collab.error.generic") });
    }
  };
  if (error) return <Callout tone="bad">{t("collab.error.load")} <button type="button" className="underline" onClick={() => void load()}>{t("collab.retry")}</button></Callout>;
  if (!data) return <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  return (
    <div className="flex flex-col gap-6" data-testid="assign-panel">
      <FirstTip id="assign" title={t("collab.tip.assign.title")}>{t("collab.tip.assign.body")}</FirstTip>
      <section className="flex flex-col gap-2" aria-labelledby="as-who">
        <h3 id="as-who" className="text-sm font-semibold">{t("collab.assign.step1")}</h3>
        {data.students.length === 0 ? <p className="text-sm text-ink-3">{t("collab.assign.noStudents")}</p> : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="as-who">
            {data.students.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={student === s.id} onClick={() => setStudent(s.id)} data-student={s.id}
                className={cn("flex items-center gap-2.5 rounded-[14px] border px-3 py-2 text-start min-h-12 transition-colors", student === s.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2")}>
                <Avatar name={locale === "ar" ? s.name_ar : s.name_en} hue={s.hue} size={30} />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{locale === "ar" ? s.name_ar : s.name_en}</span>
                  <span className="text-xs text-ink-3">{t("collab.assign.openTasks", { n: num(s.open_tasks, locale) })}</span>
                </span>
                {student === s.id && <Check className="size-4 text-accent" />}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="as-pages">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="as-pages" className="text-sm font-semibold">{t("collab.assign.step2")}</h3>
          {pages.size > 0 && <button type="button" className="text-xs text-accent hover:underline" onClick={() => setPages(new Set())}>{t("collab.assign.clear", { n: num(pages.size, locale) })}</button>}
        </div>
        {data.manuscripts.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm"><Siglum s={m.siglum} size="sm" /><span className="font-ms text-base" dir="rtl" lang="ar">{locale === "ar" ? m.title_ar : m.title_en}</span><span className="text-ink-3"><bdi>{m.shelfmark}</bdi></span></p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {m.pages.map((p) => {
                const ok = EDITABLE.has(p.status) || kind === "review";
                const on = pages.has(p.id);
                return (
                  <li key={p.id}>
                    <label className={cn("flex gap-2.5 rounded-[12px] border p-2 h-full transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet", !ok ? "opacity-55 border-line bg-surface-2/60" : on ? "border-accent bg-accent-soft cursor-pointer" : "border-line bg-surface hover:bg-surface-2 cursor-pointer")} data-assign-page={p.id}>
                      <input type="checkbox" className="sr-only" checked={on} disabled={!ok} onChange={() => toggle(p.id)} aria-label={`${t("collab.pageN", { n: num(p.seq, locale) })} · ${t(`manuscripts.status.${p.status}`)}`} />
                      <span className="w-10 h-14 shrink-0 rounded-[8px] bg-sand overflow-hidden">{p.thumb && <img src={p.thumb} alt="" className="size-full object-cover object-top" loading="lazy" />}</span>
                      <span className="flex flex-col gap-1 min-w-0">
                        <span className="text-sm font-medium flex items-center gap-1.5">{t("collab.pageN", { n: num(p.seq, locale) })}{on && <Check className="size-3.5 text-accent" />}</span>
                        <PageStatus status={p.status} />
                        {p.owner && <span className="text-[0.7rem] text-ink-3 inline-flex items-center gap-1 truncate"><UserRound className="size-3" />{locale === "ar" ? p.owner.name_ar : p.owner.name_en}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-labelledby="as-what">
        <h3 id="as-what" className="text-sm font-semibold md:col-span-2">{t("collab.assign.step3")}</h3>
        <Field label={t("collab.assign.kind")} htmlFor="as-kind">
          <Select id="as-kind" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            {(["transcribe", "verify", "double_key"] as TaskKind[]).map((k) => <option key={k} value={k}>{t(`collab.task.kind.${k}`)}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("collab.assign.priority")}</span>
          <Segmented label={t("collab.assign.priority")} value={priority} onChange={setPriority} className="self-start"
            options={(["low", "normal", "high"] as Priority[]).map((p) => ({ value: p, label: t(`collab.task.priority.${p}`) }))} />
        </div>
        <Field label={t("collab.assign.due")} hint={t("collab.assign.dueHint")} htmlFor="as-due">
          <Input id="as-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label={t("collab.assign.note")} hint={t("collab.assign.noteHint")} htmlFor="as-note">
          <Textarea id="as-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-11" />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-bg/95 backdrop-blur py-3 border-t border-line">
        <Button size="lg" onClick={submit} loading={busy} disabled={!student || !pages.size} data-testid="assign-submit">
          <Send className="size-4" />
          {who && pages.size ? t("collab.assign.go", { n: num(pages.size, locale), name: locale === "ar" ? who.name_ar : who.name_en }) : t("collab.assign.goEmpty")}
        </Button>
        {!student && <span className="text-sm text-ink-3">{t("collab.assign.pickStudent")}</span>}
        {student && !pages.size && <span className="text-sm text-ink-3">{t("collab.assign.pickPages")}</span>}
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="as-open">
        <h3 id="as-open" className="text-sm font-semibold">{t("collab.assign.open")}</h3>
        {data.open.length === 0 ? <EmptyState className="py-6" title={t("collab.assign.noneOpen")} /> : (
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {data.open.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                {task.assignee && <Avatar name={locale === "ar" ? task.assignee.name_ar : task.assignee.name_en} hue={task.assignee.hue} size={28} />}
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-medium">{task.assignee ? (locale === "ar" ? task.assignee.name_ar : task.assignee.name_en) : "—"} · {t(`collab.task.kind.${task.kind}`)}</span>
                  <span className="text-xs text-ink-3">{task.siglum ? `(${task.siglum}) ` : ""}{t("collab.pageN", { n: num(task.page_seq, locale) })} · {t("collab.task.progress", { done: num(task.touched, locale), total: num(task.total, locale) })}</span>
                </span>
                <DueChip due={task.due_at} locale={locale} />
                {task.priority === "high" && <Badge tone="bad">{t("collab.task.priority.high")}</Badge>}
                <Button size="sm" variant="ghost" className="ms-auto" onClick={() => cancel(task.id)}><X className="size-4" />{t("collab.assign.cancel")}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
