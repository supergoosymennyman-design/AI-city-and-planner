import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import PageHeader from "@/components/PageHeader";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Grant" });
  return { title: t("meta:title"), description: t("meta:description") };
}

export default async function GrantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Grant");
  const points = t.raw("points") as string[];

  return (
    <>
      <PageHeader title={t("heading")} intro={t("intro")} />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 section-md sm:px-6">
        <p className="max-w-3xl text-base text-body/80">{t("body")}</p>

        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl font-bold text-body">
            {t("pointsTitle")}
          </h2>
          <ul className="flex flex-col gap-3">
            {points.map((point, i) => (
              <li key={i} className="flex gap-3 text-base text-body/85">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href={{ pathname: "/", query: {}, hash: "demo-form" }}
          className="flex h-14 w-fit items-center justify-center rounded-full bg-teal px-8 text-base font-bold text-navy transition-transform hover:-translate-y-0.5 hover:bg-teal/90"
        >
          {t("cta")}
        </Link>
      </div>
    </>
  );
}
