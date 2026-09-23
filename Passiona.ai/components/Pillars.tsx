import { getTranslations } from "next-intl/server";
import CitySystemFeed from "./CitySystemFeed";
import WorkshopCanvas from "./scenes/WorkshopCanvas";
import CityRender from "./scenes/CityRender";
import ChampionFigure from "./scenes/ChampionFigure";
import Reveal from "./Reveal";

export default async function Pillars() {
  const t = await getTranslations("Pillars");
  const cityLog = await getTranslations("CityLog");

  return (
    <div className="section-panel">
      <Reveal>
        <h2 className="mb-12 max-w-3xl font-heading text-body" style={{ fontSize: "var(--text-title)" }}>
          {t("heading")}
        </h2>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Workshop — node-graph canvas mock */}
        <Reveal as="article" id="workshop" className="group flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-ink/10 bg-surface p-6">
          <span className="w-fit rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
            {t("workshop.kicker")}
          </span>
          <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
            {t("workshop.title")}
          </h3>
          <div className="relative overflow-hidden rounded-xl border border-teal/20 bg-[#EAF3FB]">
            <div className="aspect-video transition-all duration-300 ease-out group-hover:scale-105 group-hover:opacity-0">
              <WorkshopCanvas className="h-full w-full" />
            </div>
            <div className="absolute inset-0 flex flex-col items-end justify-center gap-1 pr-6 bg-gradient-to-t from-surface/80 to-surface/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="translate-y-3 transition-transform duration-300 group-hover:translate-y-0">
                <p className="text-2xl font-black tracking-wide text-teal">{t("workshop.hoverVerb")}</p>
                <p className="px-6 text-center text-sm font-bold text-ink">{t("workshop.hoverText")}</p>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {(t.raw("workshop.points") as string[]).map((point, j) => (
              <li key={j} className="flex gap-2 text-small leading-relaxed text-body/85">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* City — city scene thumb + through-line */}
        <Reveal as="article" id="city-sim" delay={120} className="group flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-ink/10 bg-surface p-6">
          <span className="w-fit rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            {t("city.kicker")}
          </span>
          <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
            {t("city.title")}
          </h3>
          <div className="relative overflow-hidden rounded-xl border border-success/20 bg-[#EAF7F1]">
            <div className="aspect-video transition-all duration-300 ease-out group-hover:scale-105 group-hover:opacity-0">
              <CityRender className="h-full w-full" />
            </div>
            <div className="absolute inset-0 flex flex-col items-end justify-center gap-1 pr-6 bg-gradient-to-t from-surface/80 to-surface/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="translate-y-3 transition-transform duration-300 group-hover:translate-y-0">
                <p className="text-2xl font-black tracking-wide text-success">{t("city.hoverVerb")}</p>
                <p className="px-6 text-center text-sm font-bold text-ink">{t("city.hoverText")}</p>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {(t.raw("city.points") as string[]).map((point, j) => (
              <li key={j} className="flex gap-2 text-small leading-relaxed text-body/85">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Champion — figure + tagline */}
        <Reveal as="article" id="champion" delay={240} className="group flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-ink/10 bg-surface p-6">
          <span className="w-fit rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-bold text-amber">
            {t("champion.kicker")}
          </span>
          <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
            {t("champion.title")}
          </h3>
          <div className="relative overflow-hidden rounded-xl border border-amber/20 bg-[#FDF3E7]">
            <div className="aspect-video transition-all duration-300 ease-out group-hover:scale-105 group-hover:opacity-0">
              <ChampionFigure className="h-full w-full" />
            </div>
            <div className="absolute inset-0 flex flex-col items-end justify-center gap-1 pr-6 bg-gradient-to-t from-surface/80 to-surface/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="translate-y-3 transition-transform duration-300 group-hover:translate-y-0">
                <p className="text-2xl font-black tracking-wide text-amber">{t("champion.hoverVerb")}</p>
                <p className="px-6 text-center text-sm font-bold text-ink">{t("champion.hoverText")}</p>
              </div>
            </div>
          </div>
          <p className="text-small font-semibold text-teal">{t("champion.tagline")}</p>
          <ul className="flex flex-col gap-3">
            {(t.raw("champion.points") as string[]).map((point, j) => (
              <li key={j} className="flex gap-2 text-small leading-relaxed text-body/85">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      {/* Through-line band with the live system feed */}
      <Reveal delay={120} className="mt-10 grid gap-6 rounded-2xl border border-teal/25 bg-teal/10 p-6 sm:p-8 md:grid-cols-2 md:items-center">
        <div className="flex flex-col gap-4">
          <h3 className="font-heading text-body" style={{ fontSize: "var(--text-section)" }}>
            {t("city.points.2")}
          </h3>
          <p className="max-w-xl text-small leading-relaxed text-body/70">
            {cityLog("throughline")}
          </p>
        </div>
        <CitySystemFeed />
      </Reveal>
    </div>
  );
}
