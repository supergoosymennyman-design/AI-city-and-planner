import PageHeader from "./PageHeader";

type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export default function LegalPage({
  title,
  lastUpdated,
  sections,
}: {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 section-md sm:px-6">
        <p className="text-sm text-body/50">{lastUpdated}</p>
        {sections.map((section, i) => (
          <section key={i} className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-bold text-body">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph} className="text-base leading-relaxed text-body/80">{paragraph}</p>)}
            {section.bullets && <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-body/80">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
          </section>
        ))}
      </div>
    </>
  );
}
