import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";

type Stage = { title: string; body: string };

export default async function ProgrammeJourney() {
  const t = await getTranslations("Journey");
  const stages = t.raw("stages") as Stage[];
  return (
    <section id="journey" className="section-panel journey scroll-mt-24">
      <Reveal>
        <p className="section-kicker">{t("eyebrow")}</p>
        <div className="max-w-3xl"><h2 className="font-heading text-body" style={{ fontSize: "var(--text-title)" }}>{t("title")}</h2><p className="mt-4 text-body/70" style={{ fontSize: "var(--text-prose)" }}>{t("intro")}</p></div>
      </Reveal>
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-5">
        {stages.map((stage, index) => <Reveal key={stage.title} delay={index * 70} className="bg-surface p-6"><h3 className="font-heading text-xl text-body">{stage.title}</h3><p className="mt-3 text-sm leading-relaxed text-body/70">{stage.body}</p></Reveal>)}
      </div>
    </section>
  );
}
