import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";

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

export const metadata: Metadata = {
  title: { default: "Been Here Before", template: "%s · Been Here Before" },
  description:
    "Type a coin. See every past coin that stood in the same spot, back to 2013 with dead coins included, and how many beat holding BTC over the next two years. Built on CoinMarketCap data.",
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
            <nav aria-label="Main" className="flex gap-5 text-sm">
              <Link
                href="/method"
                className="link inline-flex min-h-11 items-center"
              >
                Method
              </Link>
              <Link
                href="/method#calibration"
                className="link inline-flex min-h-11 items-center"
              >
                Calibration
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
            <p>A base rate from past data. Not financial advice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
