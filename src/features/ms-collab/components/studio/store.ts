"use client";
/**
 * Per-page collaboration state for the workspace extension (badges on line rows, presence, counts). One small store
 * per page id, shared by every slot (row extras, editor extras, toolbar, panels), refreshed on realtime events.
 */
import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../../manuscripts/components/api";
import type { CollabOverview, PresenceUser } from "../../types";

type Listener = () => void;

interface PageStore {
  data: CollabOverview | null;
  error: boolean;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | null;
  loading: boolean;
  /** Bumped on every comment/suggestion/annotation event so open panels can re-fetch their own lists. */
  rev: number;
  /** Snapshot version for useSyncExternalStore. */
  ver: number;
  again: boolean;
}

const stores = new Map<string, PageStore>();

function get(pageId: string): PageStore {
  let s = stores.get(pageId);
  if (!s) {
    s = { data: null, error: false, listeners: new Set(), timer: null, loading: false, rev: 0, ver: 0, again: false };
    stores.set(pageId, s);
  }
  return s;
}

const notify = (s: PageStore) => {
  s.ver++;
  s.listeners.forEach((l) => l());
};

export async function loadOverview(pageId: string) {
  const s = get(pageId);
  if (s.loading) {
    s.again = true;
    return;
  }
  s.loading = true;
  try {
    s.data = await api<CollabOverview>(`/api/ms-collab/pages/${pageId}/overview`);
    s.error = false;
  } catch {
    s.error = true;
  } finally {
    s.loading = false;
    notify(s);
    if (s.again) {
      s.again = false;
      void loadOverview(pageId);
    }
  }
}

/** Debounced refresh after a realtime event (several events often arrive together). */
export function refreshSoon(pageId: string, bump = true) {
  const s = get(pageId);
  if (bump) {
    s.rev++;
    notify(s);
  }
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => void loadOverview(pageId), 200);
}

/** Merge a presence change without a round trip. */
export function updatePresence(pageId: string, fn: (p: PresenceUser[]) => PresenceUser[]) {
  const s = get(pageId);
  if (!s.data) return;
  s.data = { ...s.data, presence: fn(s.data.presence) };
  notify(s);
}

export function useOverview(pageId: string): { data: CollabOverview | null; error: boolean; rev: number } {
  const s = get(pageId);
  useSyncExternalStore(
    (l) => {
      s.listeners.add(l);
      return () => s.listeners.delete(l);
    },
    () => s.ver,
    () => 0,
  );
  useEffect(() => {
    if (!s.data && !s.loading) void loadOverview(pageId);
  }, [pageId, s]);
  return { data: s.data, error: s.error, rev: s.rev };
}
