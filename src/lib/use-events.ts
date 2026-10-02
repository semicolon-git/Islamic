"use client";
import { useEffect, useRef } from "react";
import type { AppEvent } from "@/lib/events";

/**
 * Subscribe to realtime events for the given scopes. Uses SSE with automatic reconnect
 * (resuming from the last seen id) and falls back to polling if EventSource is unavailable.
 */
export function useEvents(scopes: string[], onEvent: (ev: AppEvent) => void, enabled = true) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const key = scopes.join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    let last: number | null = null;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const handle = (ev: AppEvent) => {
      if (last !== null && ev.id <= last) return;
      last = ev.id;
      cb.current(ev);
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/events?poll=1&scopes=${encodeURIComponent(key)}&after=${last ?? 0}`);
        const json = await res.json();
        if (json.ok) {
          if (last === null) last = json.data.last;
          else for (const ev of json.data.events as AppEvent[]) handle(ev);
        }
      } catch {
        /* offline: retry */
      }
      timer = setTimeout(poll, 2500);
    };

    const connect = () => {
      if (stopped) return;
      if (typeof EventSource === "undefined") return void poll();
      const after = last !== null ? `&after=${last}` : "";
      es = new EventSource(`/api/events?scopes=${encodeURIComponent(key)}${after}`);
      es.addEventListener("hello", (e) => {
        if (last === null) last = JSON.parse((e as MessageEvent).data).after;
      });
      es.addEventListener("app", (e) => handle(JSON.parse((e as MessageEvent).data)));
      es.onerror = () => {
        es?.close();
        es = null;
        if (!stopped) timer = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stopped = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [key, enabled]);
}
