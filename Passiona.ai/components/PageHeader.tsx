export default function PageHeader({
  kicker,
  title,
  intro,
}: {
  kicker?: string;
  title: string;
  intro?: string;
}) {
  return (
    <section className="border-b border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 section-md sm:px-6">
        {kicker && (
          <span className="w-fit rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
            {kicker}
          </span>
        )}
        <h1 className="font-heading text-body" style={{ fontSize: "var(--text-title)" }}>
          {title}
        </h1>
        {intro && (
          <p className="max-w-2xl text-body/70" style={{ fontSize: "var(--text-prose)" }}>
            {intro}
          </p>
        )}
      </div>
    </section>
  );
}
