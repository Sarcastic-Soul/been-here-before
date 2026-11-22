"use client";

import { ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SearchHit } from "@/lib/verdict/types";

/** Pick any coin and week; the coin is resolved through the search API. */
export function ThenForm({ min }: { min: string }) {
  const router = useRouter();
  const [coin, setCoin] = useState("");
  const [day, setDay] = useState("2022-01-02");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = coin.trim();
    if (!query || !day) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/coins/search?q=${encodeURIComponent(query)}`,
      );
      const { results: hits = [] } = (await response.json()) as {
        results?: SearchHit[];
      };
      const lower = query.toLowerCase();
      const hit =
        hits.find((h) => h.slug === lower) ??
        hits.find((h) => h.symbol.toLowerCase() === lower) ??
        hits[0];
      if (!hit) {
        setError(`No coin matches "${query}".`);
        setBusy(false);
        return;
      }
      router.push(`/then/${hit.slug}/${day}`);
    } catch {
      setError("The search did not answer. Try again.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3"
      aria-describedby={error ? "then-error" : undefined}
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[13px]">
        <span className="text-muted">Coin: name, symbol or slug</span>
        <input
          value={coin}
          onChange={(e) => setCoin(e.target.value)}
          placeholder="e.g. LUNA, Solana, ftx-token"
          required
          maxLength={50}
          className="border-ink bg-paper-raised min-h-11 border px-3 text-[15px]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted">Week of</span>
        <input
          type="date"
          value={day}
          min={min}
          onChange={(e) => setDay(e.target.value)}
          required
          className="border-ink bg-paper-raised num min-h-11 border px-3 text-[15px]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="bg-ink text-paper inline-flex min-h-11 items-center gap-2 px-5 text-sm font-medium disabled:opacity-60"
      >
        {busy ? (
          <SpinnerGap size={16} weight="bold" className="animate-spin" />
        ) : (
          <ArrowRight size={16} weight="bold" />
        )}
        Replay
      </button>
      {error && (
        <p
          id="then-error"
          role="alert"
          className="text-accent-text w-full text-sm"
        >
          {error}
        </p>
      )}
    </form>
  );
}
