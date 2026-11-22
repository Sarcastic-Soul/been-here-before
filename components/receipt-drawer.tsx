"use client";

import { Receipt as ReceiptIcon, X } from "@phosphor-icons/react";
import { useRef } from "react";

import { longDate } from "@/lib/format";
import type { Evidence, Receipt } from "@/lib/verdict/types";

const HISTORY_LIMIT = 5000;

function weeksBetween(first: string, last: string) {
  return (
    Math.round((Date.parse(last) - Date.parse(first)) / (7 * 86_400_000)) + 1
  );
}

export interface ReceiptTwin {
  name: string;
  symbol: string;
  start: string;
}

/** Side drawer with the raw CMC calls behind the page. Native <dialog>: focus trap and Esc for free. */
export function ReceiptDrawer({
  slug,
  coinName,
  evidence,
  receipt,
  saved = false,
  twins,
}: {
  slug: string;
  coinName: string;
  evidence: Evidence;
  receipt: Receipt | null;
  /** True when the page shows a saved copy because the database did not answer. */
  saved?: boolean;
  twins: ReceiptTwin[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const snapshots = weeksBetween(evidence.firstWeek, evidence.lastWeek);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium transition-colors duration-150"
      >
        <ReceiptIcon size={18} aria-hidden />
        Receipts
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="receipt-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="drawer border-ink bg-paper text-ink m-0 ml-auto h-dvh max-h-dvh w-full max-w-[640px] border-l p-0"
      >
        <div className="flex h-full flex-col">
          <div className="border-ink flex items-center justify-between border-b px-5 py-4 sm:px-7">
            <h2 id="receipt-title" className="font-serif text-2xl">
              Receipts for {coinName}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="hover:bg-grid inline-flex size-11 items-center justify-center"
              aria-label="Close receipts"
            >
              <X size={20} aria-hidden />
            </button>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6 text-sm sm:px-7">
            <p className="text-ink-body">
              Pages never call CoinMarketCap. One cron job calls{" "}
              <code className="num">listings/latest</code> once a day; the
              weekly history was pulled once and stored. These are the calls
              behind this page.
            </p>

            <section>
              <h3 className="label mb-2">Today’s numbers</h3>
              {receipt ? (
                <>
                  <p className="num bg-paper-raised mb-3 rounded-[2px] px-3 py-2 text-xs break-all">
                    GET {receipt.requestUrl}
                  </p>
                  <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                    <dt className="text-muted">Fetched</dt>
                    <dd className="num">
                      {new Date(receipt.fetchedAt).toUTCString()}
                    </dd>
                    <dt className="text-muted">HTTP status</dt>
                    <dd className="num">{receipt.httpStatus}</dd>
                    <dt className="text-muted">Credits used</dt>
                    <dd className="num">
                      {receipt.creditCount ?? "not reported"}
                    </dd>
                  </dl>
                  {receipt.row ? (
                    <>
                      <p className="text-muted mb-2">
                        {coinName}’s row, exactly as CoinMarketCap returned it:
                      </p>
                      <pre className="num border-rule bg-paper-raised max-h-[340px] overflow-auto border p-3 text-[11px] leading-relaxed">
                        {JSON.stringify(receipt.row, null, 2)}
                      </pre>
                    </>
                  ) : (
                    <p className="text-muted">
                      {coinName} was not in that call, so today’s state comes
                      from the last weekly snapshot.
                    </p>
                  )}
                </>
              ) : saved ? (
                <p className="text-muted">
                  The daily call is stored in the database, which did not
                  answer, so it cannot be shown with this saved copy.
                </p>
              ) : (
                <p className="text-muted">
                  No daily call stored yet. Today’s state comes from the last
                  weekly snapshot.
                </p>
              )}
            </section>

            <section>
              <h3 className="label mb-2">Past episodes</h3>
              <p className="text-ink-body mb-3">
                {snapshots.toLocaleString("en-US")} weekly snapshots from{" "}
                {longDate(evidence.firstWeek)} to {longDate(evidence.lastWeek)},
                top {HISTORY_LIMIT.toLocaleString("en-US")} each week, dead
                coins included. Episodes must start by{" "}
                {longDate(evidence.lastCompleteStart)} so their 2 years are
                complete. The closest twins came from these calls:
              </p>
              <ul className="space-y-2">
                {twins.map((twin) => (
                  <li key={`${twin.symbol}-${twin.start}`}>
                    <span className="font-medium">{twin.name}</span>{" "}
                    <span className="text-muted">
                      entered on {longDate(twin.start)}
                    </span>
                    <p className="num bg-paper-raised mt-1 px-3 py-1.5 text-xs break-all">
                      GET {evidence.historyEndpoint}?date={twin.start}
                      &amp;limit={HISTORY_LIMIT}&amp;convert=USD
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="label mb-2">The full answer as data</h3>
              <a
                href={`/api/verdict?slug=${encodeURIComponent(slug)}`}
                className="link num text-xs"
              >
                /api/verdict?slug={slug}
              </a>
            </section>
          </div>
        </div>
      </dialog>
    </>
  );
}
