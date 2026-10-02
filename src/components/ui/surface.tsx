import { cn } from "./cn";

export function Card({ className, as: As = "div", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return <As className={cn("bg-surface rounded-[var(--radius)] border border-line shadow-card", className)} {...rest} />;
}

export function Section({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
