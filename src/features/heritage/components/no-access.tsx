import { Lock } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

/** Friendly state for portal personas whose role doesn't work on heritage items. */
export function NoAccess({ title, body, back }: { title: string; body: string; back: string }) {
  return (
    <EmptyState
      className="rounded-[var(--radius)] border border-line bg-surface"
      icon={<Lock className="size-7" aria-hidden />}
      title={title}
      body={body}
      action={<ButtonLink href="/portal" variant="secondary">{back}</ButtonLink>}
    />
  );
}
