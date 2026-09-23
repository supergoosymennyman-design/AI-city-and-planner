import { getTranslations } from "next-intl/server";
import Reveal from "./Reveal";

// ScenarioSteps — "How a challenge becomes a city": a 4-step strip that makes
// the build → step in → solve loop explicit. Sits after the pillars, before
// "See it in action".
export default async function ScenarioSteps() {
  const t = await getTranslations("ScenarioSteps");
  const steps = t.raw("steps") as { heading: string; text: string }[];

  return (
    <div className="section-panel">
      <Reveal>
        <h2 className="mb-10 font-heading text-body" style={{ fontSize: "var(--text-title)" }}>
          {t("title")}
        </h2>
      </Reveal>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <Reveal key={i} delay={i * 100}>
            <div className="flex h-full flex-col gap-3 rounded-xl border border-ink/10 bg-page/60 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 text-sm font-black text-teal">
                {i + 1}
              </span>
              <h3 className="font-heading text-base font-bold text-body">
                {step.heading}
              </h3>
              <p className="text-small leading-relaxed text-body/80">{step.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200}>
        <p className="mt-8 text-center font-heading text-lg font-bold text-teal">
          {t("closing")}
        </p>
      </Reveal>
    </div>
  );
}
