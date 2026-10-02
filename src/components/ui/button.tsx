import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand" | "soft";
type Size = "sm" | "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2 font-medium select-none transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-card",
  brand: "bg-brand text-brand-ink hover:opacity-90 shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  soft: "bg-accent-soft text-ink hover:brightness-95",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad text-white hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-[10px]",
  md: "h-11 px-4 text-[0.95rem] rounded-[12px]",
  lg: "h-12 px-5 text-base rounded-[14px]",
  xl: "h-14 px-6 text-lg rounded-[18px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], full && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  full,
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; full?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], full && "w-full", className)} {...rest}>
      {children}
    </Link>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md"; variant?: "ghost" | "secondary" | "brand" }>(
  function IconButton({ label, size = "md", variant = "ghost", className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors shrink-0",
          size === "sm" ? "size-9" : "size-11",
          variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
          variant === "secondary" && "bg-surface border border-line text-ink hover:bg-surface-2",
          variant === "brand" && "bg-brand text-brand-ink",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
