"use client";
import { useCallback, useEffect, useState } from "react";
import { VENUE_STORAGE_KEY, type StoredVenue } from "../types";

const EVENT = "say:venue";

function read(): StoredVenue | null {
  try {
    const raw = localStorage.getItem(VENUE_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredVenue;
    return v && typeof v.code === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * The venue a visitor scanned at the entrance, remembered on this device only (localStorage).
 * No location, no account: clearing it is one tap.
 */
export function useVenue() {
  const [venue, setVenueState] = useState<StoredVenue | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setVenueState(read());
    setReady(true);
    const sync = () => setVenueState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setVenue = useCallback((v: StoredVenue | null) => {
    try {
      if (v) localStorage.setItem(VENUE_STORAGE_KEY, JSON.stringify(v));
      else localStorage.removeItem(VENUE_STORAGE_KEY);
    } catch {
      /* private mode: keep it for this page only */
    }
    setVenueState(v);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { venue, setVenue, ready };
}
