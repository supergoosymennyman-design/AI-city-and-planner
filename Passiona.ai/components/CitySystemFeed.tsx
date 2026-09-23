import { getTranslations } from "next-intl/server";

export default async function CitySystemFeed() {
  const t = await getTranslations("CityLog");
  const entries = t.raw("entries") as string[];

  return (
    <div
      aria-label={t("label")}
      role="log"
      className="on-dark overflow-hidden rounded-xl border border-teal/30 bg-navy/90"
    >
      <div className="flex items-center justify-between border-b border-teal/20 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-teal">
          {t("label")}
        </p>
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-teal/50" />
          <span className="h-2 w-2 rounded-full bg-teal/50" />
          <span className="h-2 w-2 rounded-full bg-teal/50" />
        </span>
      </div>
      <div className="relative h-48 overflow-hidden">
        <div className="feed-scroll flex flex-col gap-2 px-4 py-3">
          {[...entries, ...entries].map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-sm text-body/85"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success/70"
              />
              <span className="font-mono text-[13px] leading-relaxed">
                {entry}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
