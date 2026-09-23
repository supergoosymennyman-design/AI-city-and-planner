import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import PageHeader from "@/components/PageHeader";
import ProductGallery from "@/components/ProductGallery";
import ProductVideoShowcase from "@/components/ProductVideoShowcase";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Demo" });
  return { title: t("meta:title"), description: t("meta:description") };
}

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Demo");

  return (
    <>
      <PageHeader title={t("heading")} intro={t("intro")} />
      <div className="mx-auto max-w-6xl px-4 section-lg sm:px-6">
        <ProductVideoShowcase />
        <div className="mt-20"><ProductGallery /></div>
      </div>
    </>
  );
}
