"use client";

import { MagnifyingGlass, SpinnerGap } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { SearchHit } from "@/lib/verdict/types";

type Status = "idle" | "loading" | "done" | "error";

/**
 * Combobox over /api/coins/search. Without JavaScript the form still works:
 * it submits to /search?q=, which picks the best match on the server.
 */
export function CoinSearch({
  autoFocus = false,
  size = "lg",
}: {
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const router = useRouter();
  const listId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `/api/coins/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { results: SearchHit[] };
        setHits(body.results);
        setActive(body.results.length ? 0 : -1);
        setStatus("done");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setStatus("error");
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(`/coin/${hit.slug}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && hits.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hits.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const q = query.trim();
    if (!q) {
      event.preventDefault();
      return;
    }
    const hit = open && active >= 0 ? hits[active] : undefined;
    if (hit) {
      event.preventDefault();
      go(hit);
    } else {
      // Let the browser submit to /search, or route there without a full reload.
      event.preventDefault();
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  const showList =
    open &&
    query.trim().length > 0 &&
    (status === "done" || status === "error");
  const big = size === "lg";

  return (
    <div ref={boxRef} className="relative w-full max-w-[540px]">
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={onSubmit}
        className="border-ink bg-paper-raised has-[input:focus-visible]:outline-accent flex border-[1.5px] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-3"
      >
        <label htmlFor={inputId} className="text-muted flex items-center pl-4">
          <span className="sr-only">Coin name or symbol</span>
          {status === "loading" ? (
            <SpinnerGap
              size={20}
              className="motion-safe:animate-spin"
              aria-hidden
            />
          ) : (
            <MagnifyingGlass size={20} aria-hidden />
          )}
        </label>
        <input
          id={inputId}
          name="q"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={50}
          placeholder="Filecoin or FIL"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (!event.target.value.trim()) {
              setHits([]);
              setStatus("idle");
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent px-3 font-medium outline-none ${big ? "py-4 text-lg" : "py-3 text-base"}`}
        />
        <button
          type="submit"
          className={`bg-ink text-paper hover:bg-accent px-5 font-medium transition-colors duration-150 active:scale-[0.98] ${big ? "min-h-14 text-[15px] sm:px-6" : "min-h-12 text-sm"}`}
        >
          Look it up
        </button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching coins"
          className="border-ink bg-paper-raised absolute inset-x-0 top-full z-20 mt-1 max-h-[360px] overflow-auto border-[1.5px] py-1 shadow-[0_8px_24px_rgb(0_0_0/0.08)]"
        >
          {status === "error" && (
            <li className="text-muted px-4 py-3 text-sm">
              Search failed. Try again.
            </li>
          )}
          {status === "done" && hits.length === 0 && (
            <li className="text-muted px-4 py-3 text-sm">
              No coin matches “{query.trim()}”.
            </li>
          )}
          {hits.map((hit, i) => (
            <li
              key={hit.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(event) => {
                event.preventDefault();
                go(hit);
              }}
              className={`flex cursor-pointer items-baseline justify-between gap-4 px-4 py-2.5 ${i === active ? "bg-grid" : ""}`}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{hit.name}</span>{" "}
                <span className="num text-muted text-sm">{hit.symbol}</span>
              </span>
              <span className="num text-muted shrink-0 text-xs">
                {hit.excluded
                  ? "stablecoin or wrapper"
                  : hit.live
                    ? `rank ${hit.rankAdj}`
                    : "not in top 2,000 today"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
