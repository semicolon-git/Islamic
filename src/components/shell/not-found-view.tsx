import { Compass, LayoutGrid, MessageCircleQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Khatam } from "@/components/ui/khatam";

/** Friendly 404 with next steps (SPEC §7.3: never a dead end). Rendered inside the visitor shell or on its own. */
export function NotFoundView({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-6">
      <title>{`${t("notFound.title")} · ${t("app.name")}`}</title>
      <span className="size-16 rounded-2xl bg-accent-soft text-accent grid place-items-center" aria-hidden>
        <Khatam size={34} />
      </span>
      <p className="mono text-sm text-ink-3" aria-hidden>
        404
      </p>
      <h1 className="text-2xl font-semibold text-ink max-w-[24ch]">{t("notFound.title")}</h1>
      <p className="text-ink-2 max-w-[40ch]">{t("notFound.body")}</p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2 w-full sm:w-auto max-w-sm sm:max-w-none">
        <ButtonLink href="/" size="lg">
          <Compass className="size-5" aria-hidden />
          {t("notFound.home")}
        </ButtonLink>
        <ButtonLink href="/snap?pick=1" size="lg" variant="secondary">
          <LayoutGrid className="size-5" aria-hidden />
          {t("notFound.choose")}
        </ButtonLink>
        <ButtonLink href="/ask" size="lg" variant="ghost">
          <MessageCircleQuestion className="size-5" aria-hidden />
          {t("notFound.ask")}
        </ButtonLink>
      </div>
    </div>
  );
}
