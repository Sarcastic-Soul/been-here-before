"use client";

import { ArrowClockwise } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page cannot reach the database, usually a short network hiccup. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-16 sm:px-8 lg:px-12">
      <p className="num text-muted text-sm">
        Error{error.digest ? ` ${error.digest}` : ""}
      </p>
      <h1 className="mt-2 mb-4 font-serif text-[clamp(36px,4.4vw,56px)] leading-[1.05] tracking-[-0.02em]">
        The archive did not answer.
      </h1>
      <p className="text-ink-body mb-8 max-w-[34em] text-[17px]">
        The history lives in a database that sometimes takes a moment to wake
        up. Trying again usually works.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={reset}
          className="bg-ink text-paper hover:bg-ink-body inline-flex min-h-11 items-center gap-2 px-5 text-sm font-medium"
        >
          <ArrowClockwise size={16} weight="bold" aria-hidden />
          Try again
        </button>
        <Link href="/" className="link text-sm">
          Back to the start
        </Link>
      </div>
    </div>
  );
}
