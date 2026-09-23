import { getTranslations } from "next-intl/server";
import LeadForm from "./LeadForm";

export default async function CtaSection() {
  const t = await getTranslations("Cta");
  return (
    <section id="demo-form" className="enquiry-section scroll-mt-24" aria-labelledby="enquiry-heading">
      <div className="enquiry-intro">
        <p className="section-kicker">{t("eyebrow")}</p>
        <h2 id="enquiry-heading">{t("heading")}</h2>
        <p>{t("body")}</p>
        <div className="delivery-options">
          {(["teacherConfidence", "passionaEducators"] as const).map((item) => (
            <article key={item}><h3>{t(`delivery.${item}.title`)}</h3><p>{t(`delivery.${item}.body`)}</p></article>
          ))}
        </div>
      </div>
      <div className="enquiry-form-shell"><LeadForm /></div>
    </section>
  );
}
