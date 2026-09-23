import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

export default async function Hero() {
  const t = await getTranslations("Hero");
  const proof = t.raw("proof") as string[];

  return (
    <section id="programme" className="hero-shell">
      <Image src="/product/ai-city-hero.v1.avif" alt={t("imageAlt")} fill preload unoptimized sizes="100vw" className="hero-image" />
      <div className="hero-shade" />
      <div className="hero-content">
        <div className="hero-copy">
          <p className="hero-eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="hero-subtitle">{t("subtitle")}</p>
          <div className="hero-actions"><Link href={{ pathname: "/", query: {}, hash: "demo-form" }} className="hero-primary">{t("ctaPrimary")}</Link><Link href={{ pathname: "/", query: {}, hash: "tools" }} className="hero-secondary">{t("ctaSecondary")}</Link></div>
          <ul className="hero-trust" aria-label={t("proofLabel")}>{proof.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
