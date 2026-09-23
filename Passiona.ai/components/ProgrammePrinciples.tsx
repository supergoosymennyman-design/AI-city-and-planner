import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";

type Item = { title: string; body: string };

function List({ items }: { items: Item[] }) {
  return <div className="mt-8 grid gap-4 sm:grid-cols-2">{items.map((item) => <article key={item.title} className="principle-card"><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>;
}

export default async function ProgrammePrinciples() {
  const t = await getTranslations("ProgrammePrinciples");
  const progression = t.raw("progression") as Item[];
  const evidence = t.raw("evidence") as Item[];
  const privacy = t.raw("privacy") as Item[];

  return (
    <section className="space-y-8" aria-label={t("label")}>
      <Reveal className="section-panel">
        <p className="section-kicker">{t("progressionEyebrow")}</p>
        <h2 className="max-w-3xl font-heading text-body" style={{ fontSize: "var(--text-title)" }}>{t("progressionTitle")}</h2>
        <p className="mt-4 max-w-3xl text-body/70" style={{ fontSize: "var(--text-prose)" }}>{t("progressionIntro")}</p>
        <List items={progression} />
      </Reveal>
      <Reveal className="evidence-band" delay={80}>
        <p className="section-kicker">{t("evidenceEyebrow")}</p>
        <h2 className="max-w-3xl font-heading text-body" style={{ fontSize: "var(--text-title)" }}>{t("evidenceTitle")}</h2>
        <p className="mt-4 max-w-3xl text-body/70" style={{ fontSize: "var(--text-prose)" }}>{t("evidenceIntro")}</p>
        <List items={evidence} />
      </Reveal>
      <Reveal className="section-panel" delay={160}>
        <p className="section-kicker">{t("privacyEyebrow")}</p>
        <h2 className="max-w-3xl font-heading text-body" style={{ fontSize: "var(--text-title)" }}>{t("privacyTitle")}</h2>
        <List items={privacy} />
      </Reveal>
    </section>
  );
}
