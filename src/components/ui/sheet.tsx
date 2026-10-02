"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * Accessible modal built on <dialog>: bottom sheet on phones, side drawer (side="end") or centered dialog on larger screens.
 * Escape and backdrop click close it; focus is trapped by the browser.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "bottom",
  className,
  closeLabel = "Close",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "bottom" | "end" | "center";
  className?: string;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "bg-transparent p-0 m-0 max-w-none max-h-none backdrop:bg-[rgb(8_10_30/0.5)] backdrop:backdrop-blur-[2px] open:animate-pop",
        side === "bottom" && "fixed inset-x-0 bottom-0 top-auto w-full sm:inset-0 sm:m-auto sm:w-[min(560px,92vw)] sm:h-fit",
        side === "end" && "fixed inset-y-0 end-0 start-auto h-full w-[min(480px,100vw)]",
        side === "center" && "fixed inset-0 m-auto w-[min(520px,92vw)] h-fit",
      )}
    >
      <div
        className={cn(
          "bg-surface text-ink flex flex-col shadow-pop border border-line",
          side === "bottom" && "rounded-t-[24px] sm:rounded-[20px] max-h-[88dvh]",
          side === "end" && "h-full",
          side === "center" && "rounded-[20px] max-h-[88dvh]",
          className,
        )}
      >
        {side === "bottom" && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />}
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="text-sm text-ink-2 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} aria-label={closeLabel} className="size-10 -me-2 -mt-1 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </header>
        <div className="px-5 pb-5 overflow-y-auto scrollbar-thin flex-1">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex gap-2 justify-end safe-area-pb">{footer}</footer>}
      </div>
    </dialog>
  );
}
