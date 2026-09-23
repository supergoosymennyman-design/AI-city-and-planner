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
  const t = await getTranslations({ locale, namespace: "Pricing" });
  return { title: t("meta:title"), description: t("meta:description") };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pricing");
  const tiers = t.raw("tiers") as {
    name: string;
    highlight: boolean;
    recurrence: string;
    points: string[];
  }[];

  return (
    <>
      <PageHeader title={t("heading")} intro={t("intro")} />
      <div className="mx-auto max-w-6xl px-4 section-md sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier, i) => (
            <article
              key={i}
              className={`flex flex-col gap-5 rounded-2xl border p-6 ${
                tier.highlight
                  ? "border-teal bg-teal/[0.08] shadow-lg"
                  : "border-body/10 bg-body/[0.03]"
              }`}
            >
              <div className="flex flex-col gap-1">
                <h2 className="font-heading text-xl font-bold text-body">
                  {tier.name}
                </h2>
                <p className="text-sm font-bold uppercase tracking-wider text-teal">
                  {tier.recurrence}
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {tier.points.map((point, j) => (
                  <li key={j} className="flex gap-2 text-sm text-body/85">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current text-teal" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-body/10 bg-body/[0.03] p-8 text-center">
          <h2 className="font-heading text-2xl font-bold text-body">
            {t("partnershipHeading")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-body/70">
            {t("partnershipBody")}
          </p>
          <Link
            href={{ pathname: "/", query: {}, hash: "demo-form" }}
            className="mt-6 inline-flex h-14 items-center justify-center rounded-full bg-teal px-8 text-base font-bold text-navy transition-transform hover:-translate-y-0.5 hover:bg-teal/90"
          >
            {t("enquire")}
          </Link>
        </div>
      </div>
    </>
  );
}
