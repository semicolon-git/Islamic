import { getI18n } from "@/i18n/server";
import { NotFoundView } from "@/components/shell/not-found-view";

/** notFound() inside the visitor app (e.g. an unknown concept) keeps the app's header and tab bar. */
export default async function PublicNotFound() {
  const { t } = await getI18n();
  return <NotFoundView t={t} />;
}
