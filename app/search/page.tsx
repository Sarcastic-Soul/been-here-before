import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CoinSearch } from "@/components/coin-search";
import { searchCoins } from "@/lib/verdict/get-verdict";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

/** Target of the search form when Enter is pressed without picking a match. */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-[1360px] px-4 py-12 sm:px-8 lg:px-12">
      <h1 className="mb-6 font-serif text-[40px] leading-tight tracking-[-0.02em]">
        Find a coin
      </h1>
      <CoinSearch size="md" />
      <Suspense
        fallback={<div className="skeleton mt-8 h-40 w-full max-w-[540px]" />}
      >
        {searchParams.then(({ q }) => (
          <Results query={typeof q === "string" ? q.trim().slice(0, 50) : ""} />
        ))}
      </Suspense>
    </div>
  );
}

async function Results({ query }: { query: string }) {
  if (!query) return null;
  const hits = await searchCoins(query);
  const q = query.toLowerCase();
  const exact = hits.filter(
    (hit) => hit.live && (hit.symbol.toLowerCase() === q || hit.slug === q),
  );
  // One clear answer: go straight to it. Never on one letter, which is
  // nearly always a search still being typed.
  if (q.length >= 2 && (hits.length === 1 || exact.length === 1))
    redirect(`/coin/${(exact[0] ?? hits[0]).slug}`);

  return (
    <section aria-label="Results" className="mt-10 max-w-[540px]">
      {hits.length === 0 ? (
        <p className="text-ink-body">
          No coin matches “{query}”. Try the symbol (FIL) or the full name
          (Filecoin).
        </p>
      ) : (
        <>
          <h2 className="label mb-2">
            {hits.length} matches for “{query}”
          </h2>
          <ul className="border-rule border-t">
            {hits.map((hit) => (
              <li key={hit.id} className="border-rule border-b">
                <Link
                  href={`/coin/${hit.slug}`}
                  className="hover:text-accent-text flex min-h-12 items-baseline justify-between gap-4 py-3"
                >
                  <span>
                    <span className="font-medium">{hit.name}</span>{" "}
                    <span className="num text-muted text-sm">{hit.symbol}</span>
                  </span>
                  <span className="num text-muted text-xs">
                    {hit.excluded
                      ? "stablecoin or wrapper"
                      : hit.live
                        ? `rank ${hit.rankAdj}`
                        : "not in top 2,000 today"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
