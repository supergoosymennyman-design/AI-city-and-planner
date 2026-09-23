import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// GoalsPanel — "School goals → how we help" matching block. Two display
// variants: `variant="dark"` sits inside the Hero (on-dark island); the
// default light variant renders as a section panel on small screens.
export default async function GoalsPanel({
  variant = "light",
}: {
  variant?: "dark" | "light";
}) {
  const t = await getTranslations("Goals");
  const goals = t.raw("goals") as string[];
  const help = t.raw("help") as string[];

  const dark = variant === "dark";

  const shell = dark
    ? "flex flex-col gap-6 rounded-2xl border border-body/20 bg-navy/80 p-6"
    : "section-panel flex flex-col gap-8";

  const groupTitle = dark ? "text-body" : "text-ink";

  return (
    <div className={shell}>
      <div className="flex flex-col gap-3">
        <h3
          className={`font-heading text-body ${groupTitle}`}
          style={{ fontSize: "var(--text-section)" }}
        >
          {t("goalsTitle")}
        </h3>
        <ul className="flex flex-col gap-2.5">
          {goals.map((goal, i) => (
            <li key={i} className="flex items-start gap-2.5 text-small text-body/90">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal`}
              />
              <span>{goal}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3
          className={`font-heading ${groupTitle}`}
          style={{ fontSize: "var(--text-section)" }}
        >
          {t("helpTitle")}
        </h3>
        <ul className="flex flex-col gap-2.5">
          {help.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-small text-body/90">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success`}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={{ pathname: "/", query: {}, hash: "demo-form" }}
        className={`flex h-12 items-center justify-center rounded-full bg-teal px-6 text-sm font-bold text-navy shadow-md transition-transform hover:-translate-y-0.5 hover:bg-teal/90 ${
          dark ? "" : "mt-2"
        }`}
      >
        {t("cta")}
      </Link>
    </div>
  );
}
