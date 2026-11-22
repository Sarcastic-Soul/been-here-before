import { CoinSearch } from "@/components/coin-search";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1360px] px-4 py-16 sm:px-8 lg:px-12">
      <p className="num text-muted text-sm">404</p>
      <h1 className="mt-2 mb-4 font-serif text-[clamp(36px,4.4vw,56px)] leading-[1.05] tracking-[-0.02em]">
        No coin by that name.
      </h1>
      <p className="text-ink-body mb-8 max-w-[34em] text-[17px]">
        Coin pages use the CoinMarketCap slug, like /coin/filecoin. Search by
        name or symbol instead:
      </p>
      <CoinSearch size="md" />
    </div>
  );
}
