"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Back affordance: goes back in history when we came from inside the app, otherwise home. */
export function BackLink({ label, fallback = "/" }: { label: string; fallback?: string }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      onClick={(e) => {
        const internal = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
        if (internal && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="-ms-2 mb-2 inline-flex items-center gap-1 h-11 ps-1 pe-3 rounded-full text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
      {label}
    </a>
  );
}
