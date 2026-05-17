export function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker?: string;
  title: string;
  description?: string;
}) {
  return (
    <header>
      {kicker ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{kicker}</p>
      ) : null}
      <h2 className={`${kicker ? "mt-1" : ""} text-lg font-semibold text-zinc-900`}>{title}</h2>
      {description ? <p className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</p> : null}
    </header>
  );
}
