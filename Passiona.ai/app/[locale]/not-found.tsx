import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFoundPage() {
  const t = await getTranslations("NotFound");

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <h1 className="font-heading text-4xl font-bold text-body">
        {t("title")}
      </h1>
      <p className="text-lg text-body/70">{t("text")}</p>
      <Link
        href="/"
        className="flex h-14 items-center justify-center rounded-full bg-teal px-8 text-base font-bold text-navy transition-transform hover:-translate-y-0.5 hover:bg-teal/90"
      >
        {t("home")}
      </Link>
    </section>
  );
}
