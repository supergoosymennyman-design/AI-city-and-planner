import { getTranslations } from "next-intl/server";
import CitySystemFeed from "./CitySystemFeed";
import Reveal from "./Reveal";
import SlideShow from "./SlideShow";

export default async function UseCases() {
  const t = await getTranslations("UseCases");
  const buildSteps = t.raw("build.steps") as string[];
  const rows = t.raw("machines.rows") as {
    machine: string;
    idea: string;
  }[];
  const citySteps = t.raw("city.steps") as string[];
  const buildTitle = t("build.title");
  const cityTitle = t("city.title");

  return (
    <div id="use-cases" className="section-panel scroll-mt-24">
      <div className="flex flex-col gap-16">
        <Reveal>
          <h2 className="font-heading text-body" style={{ fontSize: "var(--text-title)" }}>
            {t("heading")}
          </h2>
        </Reveal>

        {/* Use case A — build, auto slider, text under the title */}
        <Reveal as="article" id="use-a" className="scroll-mt-24 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <span className="w-fit rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
              {t("build.kicker")}
            </span>
            <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
              {buildTitle}
            </h3>
          </div>
          <SlideShow
            ariaLabel={buildTitle}
            textPosition="aside"
            slides={buildSteps.map((step, i) => ({
              image: `/slide-${i + 1}.webp`,
              alt: step,
              text: step,
            }))}
          />
        </Reveal>

        {/* Use case B — six machines, 2×3 cards with amber tilt hover */}
        <Reveal as="article" id="use-b" className="scroll-mt-24 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="w-fit rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-bold text-success">
              {t("machines.kicker")}
            </span>
            <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
              {t("machines.title")}
            </h3>
            <p className="max-w-3xl text-small leading-relaxed text-body/70">
              {t("machines.lead")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-surface p-5 transition-all duration-300 ease-out hover:rotate-1 hover:border-amber hover:shadow-[0_0_20px_rgba(180,83,9,0.35)]"
              >
                <p className="font-heading text-base font-bold text-body">{row.machine}</p>
                <p className="text-small leading-relaxed text-body/80">{row.idea}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Use case C — bench to city, auto slider */}
        <Reveal as="article" id="use-c" className="scroll-mt-24 grid gap-6 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-3 md:order-2">
            <span className="w-fit rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-bold text-amber">
              {t("city.kicker")}
            </span>
            <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
              {cityTitle}
            </h3>
            <div className="mt-2">
              <CitySystemFeed />
            </div>
          </div>
          <div className="md:order-1">
            <SlideShow
              ariaLabel={cityTitle}
              textPosition="aside"
              slides={citySteps.map((step, i) => ({
                image: `/slide-${i + 1}.webp`,
                alt: step,
                text: step,
              }))}
            />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
