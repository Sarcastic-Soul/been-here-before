# Been Here Before: notes for agents

Next.js app for the CMC API Hackathon, Round 2. Live at https://been-here-before.vercel.app; Vercel deploys every push to `main`. The README explains the product, the rules and the API.

## Hard rules

- Never commit CoinMarketCap data: no raw responses, database dumps or fixtures copied from real responses. `data/` is gitignored. Tests use synthetic fixtures.
- Never commit or log the CMC key. It is read only in `lib/cmc/client.ts` (`server-only`) and sent only as a header. Receipts never store it.
- Page views must not call CoinMarketCap. Only `/api/cron/refresh` and `scripts/` do.
- No look-ahead: features for week W read only rows at or before W. Keep the "never looks ahead" test in `tests/engine/features.test.ts` passing.
- Matching bands, verdict thresholds and widening steps live in `lib/engine/`. Do not change them without recording why in the methodology notes.
- Icons: Phosphor only (`@phosphor-icons/react`, `/dist/ssr` in server components). No blue or purple gradients, no gradient text.
- TypeScript stays on 6.0.x until `typescript-eslint` supports 7.

## Where things are

- `lib/engine/`: pure statistics (universe, features, outcomes, matching, intervals, verdict rule). Unit tested.
- `lib/verdict/`: database reads and the cached results pages use (`get-verdict`, `get-past-verdict`, `get-stats`, ledger).
- `lib/cron/`: daily refresh and prewarm, called by the routes in `app/api/cron/`.
- `lib/og/card.tsx`: share cards (next/og). Satori needs `display: flex` on every div with more than one child.
- `components/`: hand-made SVG charts and page parts. Motion is CSS in `app/globals.css`, inside `prefers-reduced-motion: no-preference`.
- `scripts/`: one-time data pull, panel build, calibration, precompute, prewarm.

## Commands

```
pnpm dev | pnpm build | pnpm start
pnpm lint && pnpm typecheck && pnpm test   # run all three plus build before calling work done
pnpm test:e2e                              # Playwright smoke; starts its own server on port 3200
pnpm data:prewarm                          # fill the shared cache on the live site after a deploy
pnpm data:market                           # one global-metrics/quotes/latest call (1 credit), as the cron does
```

## Gotchas

- Results are cached with `"use cache: remote"` and tags (`daily`, `history`, `ledger`). Pages that read the database wrap that part in `Suspense` and call `await connection()`. A new deploy starts with an empty cache, so run `pnpm data:prewarm` after it goes live.
- The Prettier Tailwind plugin trims leading spaces inside class strings, so `` `a${x ? " b" : ""}` `` becomes `ab`. Use whole strings (`x ? "a b" : "a"`).
- Plain CSS classes in `globals.css` such as `.label` are not in a layer, so they beat Tailwind utilities on the same element. Put the utility on a child instead.
- Format only the files you touch (`pnpm exec prettier --write <files>`); a broad run rewrites unrelated files.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
