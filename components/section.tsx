/** A page section with a serif heading, an optional note and a top rule. */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-ink border-t py-10">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id={id}
          className="font-serif text-[26px] leading-tight tracking-[-0.01em]"
        >
          {title}
        </h2>
        {note && <p className="text-muted text-[13px]">{note}</p>}
      </div>
      {children}
    </section>
  );
}
