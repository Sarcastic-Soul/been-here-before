"use client";

import { Check, LinkSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/**
 * Copies the page link (or opens the phone's share sheet where there is one).
 * The link unfurls into a card with the verdict, from the route's
 * opengraph-image.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(timer);
  }, [state]);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // The person closed the share sheet: nothing to do.
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        className="border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 min-w-[9.5rem] items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-150"
      >
        {state === "copied" ? (
          <Check size={18} weight="bold" aria-hidden />
        ) : (
          <LinkSimple size={18} aria-hidden />
        )}
        {state === "copied" ? "Link copied" : "Copy link"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copied to the clipboard." : ""}
      </span>
      {state === "failed" && (
        <span className="text-accent-text text-[13px]">
          Could not copy. The address bar has the link.
        </span>
      )}
    </>
  );
}
