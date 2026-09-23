import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AnnouncementBar() {
  const t = await getTranslations("Announcement");

  return (
    <div className="border-b border-amber/30 bg-amber/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4 py-3 text-center sm:px-6">
        <p className="text-sm font-semibold text-amber">{t("text")}</p>
        <Link
          href={`${t("grantHref")}`}
          className="text-sm font-bold text-amber underline underline-offset-2 hover:text-body"
        >
          {t("details")} →
        </Link>
      </div>
    </div>
  );
}
