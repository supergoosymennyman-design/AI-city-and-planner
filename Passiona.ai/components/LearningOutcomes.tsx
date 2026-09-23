import { getTranslations } from "next-intl/server";

type Outcome = { number: string; title: string; body: string };
type TrustItem = { title: string; body: string };

export default async function LearningOutcomes() {
  const t = await getTranslations("Outcomes");
  const trust = await getTranslations("ProgrammePrinciples");
  const outcomes = t.raw("items") as Outcome[];
  const privacy = trust.raw("privacy") as TrustItem[];
  return (
    <section id="outcomes" className="editorial-section outcomes-section scroll-mt-24" aria-labelledby="outcomes-title">
      <div className="outcomes-intro">
        <div className="section-heading">
          <p className="section-kicker">{t("eyebrow")}</p>
          <h2 id="outcomes-title">{t("title")}</h2>
          <p>{t("intro")}</p>
        </div>
        <div className="outcome-list">
          {outcomes.map((outcome) => (
            <article key={outcome.number}>
              <span>{outcome.number}</span>
              <div><h3>{outcome.title}</h3><p>{outcome.body}</p></div>
            </article>
          ))}
        </div>
      </div>
      <aside className="trust-panel">
        <p className="section-kicker">{trust("privacyEyebrow")}</p>
        <h2>{trust("trustTitle")}</h2>
        <p className="trust-lede">{trust("trustIntro")}</p>
        <div className="trust-points">
          {privacy.map((item) => <article key={item.title}><span aria-hidden="true">✓</span><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}
        </div>
      </aside>
    </section>
  );
}
