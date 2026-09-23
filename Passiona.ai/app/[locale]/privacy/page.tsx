import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import LegalPage from "@/components/LegalPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("meta:title") };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Privacy");
  const sections = t.raw("sections") as { heading: string; paragraphs: string[]; bullets?: string[] }[];

  return (
    <LegalPage
      title={t("title")}
      lastUpdated={t("lastUpdated")}
      sections={sections}
    />
  );
}
