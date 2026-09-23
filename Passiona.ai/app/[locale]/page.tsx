import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import Hero from "@/components/Hero";
import LearningOutcomes from "@/components/LearningOutcomes";
import ProductGallery from "@/components/ProductGallery";
import ProductVideoShowcase from "@/components/ProductVideoShowcase";
import CtaSection from "@/components/CtaSection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: t("ogType") as "website",
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Hero />
      <div className="homepage-stack">
        <ProductGallery />
        <ProductVideoShowcase />
        <LearningOutcomes />
        <CtaSection />
      </div>
    </>
  );
}
