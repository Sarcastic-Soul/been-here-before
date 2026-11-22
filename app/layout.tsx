import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";

import { SITE, SITE_NAME } from "@/lib/site";

import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION =
  "Type a coin. See every past coin that stood in the same spot, back to 2013 with dead coins included, and how many beat holding BTC over the next two years. Built on CoinMarketCap data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="focus:bg-ink focus:text-paper sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-ink border-b">
          <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-4 py-2 sm:px-8 lg:px-12">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-serif text-[22px] font-semibold tracking-[-0.01em]"
            >
              Been Here Before
            </Link>
            <nav aria-label="Main" className="flex gap-4 text-sm sm:gap-5">
              <Link
                href="/then"
                className="link inline-flex min-h-11 items-center"
              >
                Time machine
              </Link>
              <Link
                href="/method"
                className="link inline-flex min-h-11 items-center"
              >
                Method
              </Link>
              <Link
                href="/method#calibration"
                className="link hidden min-h-11 items-center sm:inline-flex"
              >
                Calibration
              </Link>
              <Link
                href="/ledger"
                className="link hidden min-h-11 items-center sm:inline-flex"
              >
                Ledger
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-rule border-t">
          <div className="text-muted mx-auto flex max-w-[1360px] flex-col gap-2 px-4 py-6 text-[13px] sm:flex-row sm:justify-between sm:px-8 lg:px-12">
            <p>
              Data provided by{" "}
              <a
                href="https://coinmarketcap.com"
                className="link text-ink"
                rel="noopener"
              >
                CoinMarketCap.com
              </a>
              . Weekly snapshots since April 2013, refreshed daily.
            </p>
            <p className="flex flex-wrap gap-x-4">
              <Link href="/ledger" className="link text-ink">
                Ledger
              </Link>
              <a href="/openapi.json" className="link text-ink">
                API
              </a>
              <a href="/llms.txt" className="link text-ink">
                llms.txt
              </a>
              <span>A base rate from past data. Not financial advice.</span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
