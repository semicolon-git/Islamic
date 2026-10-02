import { cn } from "./cn";

export function Avatar({ name, hue = 200, size = 32, className, title }: { name: string; hue?: number; size?: number; className?: string; title?: string }) {
  const initials = name
    .replace(/^(Dr\.?|د\.)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span
      title={title ?? name}
      className={cn("inline-grid place-items-center rounded-full font-semibold text-white shrink-0 ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `oklch(0.47 0.12 ${hue})` }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
