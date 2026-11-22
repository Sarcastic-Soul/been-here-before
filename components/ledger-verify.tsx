"use client";

import {
  CheckCircle,
  ShieldCheck,
  SpinnerGap,
  XCircle,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  verifyChain,
  type ChainCheck,
  type LedgerDay,
} from "@/lib/ledger/chain";

type State =
  | { kind: "idle" }
  | { kind: "busy"; done: number; total: number }
  | { kind: "done"; check: ChainCheck }
  | { kind: "error" };

/** Downloads every ledger day and recomputes the whole hash chain locally. */
export function LedgerVerify() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    try {
      const list = (await (await fetch("/api/ledger")).json()) as {
        days: LedgerDay[];
      };
      const oldest = [...list.days].reverse();
      setState({ kind: "busy", done: 0, total: oldest.length });
      const full: (LedgerDay & { lines: string[] })[] = [];
      for (const day of oldest) {
        const response = await fetch(`/api/ledger?day=${day.day}`);
        if (!response.ok) throw new Error(String(response.status));
        full.push((await response.json()) as LedgerDay & { lines: string[] });
        setState({ kind: "busy", done: full.length, total: oldest.length });
      }
      const check = await verifyChain(full);
      setState({ kind: "done", check });
    } catch {
      setState({ kind: "error" });
    }
  }

  return (
    <div className="border-ink border-t pt-4">
      <button
        type="button"
        onClick={run}
        disabled={state.kind === "busy"}
        className="bg-ink text-paper inline-flex min-h-11 items-center gap-2 px-5 text-sm font-medium disabled:opacity-60"
      >
        {state.kind === "busy" ? (
          <SpinnerGap size={16} weight="bold" className="animate-spin" />
        ) : (
          <ShieldCheck size={16} weight="bold" />
        )}
        Check the whole chain in your browser
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-[15px]">
        {state.kind === "busy" && (
          <span className="text-muted num">
            Downloaded {state.done} of {state.total} days…
          </span>
        )}
        {state.kind === "done" && state.check.ok && (
          <span className="text-ink-body flex items-start gap-2">
            <CheckCircle
              size={20}
              weight="bold"
              aria-hidden
              className="text-ink mt-0.5 shrink-0"
            />
            <span>
              {state.check.days === 1
                ? `The 1 day and its ${state.check.lines} lines match their hashes.`
                : `All ${state.check.days} days and ${state.check.lines} lines match their hashes, and each day links to the one before.`}
            </span>
          </span>
        )}
        {state.kind === "done" && !state.check.ok && (
          <span className="text-accent-text flex items-start gap-2">
            <XCircle
              size={20}
              weight="bold"
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            <span>
              {state.check.day}: {state.check.reason}.
            </span>
          </span>
        )}
        {state.kind === "error" && (
          <span className="text-accent-text">
            The ledger did not download. Try again.
          </span>
        )}
      </p>
    </div>
  );
}
