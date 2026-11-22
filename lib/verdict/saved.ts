import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { getVerdict } from "./get-verdict";
import type { VerdictOk, VerdictResponse } from "./types";

const SLUG = /^[a-z0-9-]{1,100}$/;

/** One file in public/precomputed/, written by scripts/precompute.ts. */
export interface SavedFile {
  savedAt: string;
  note: string;
  verdict: VerdictOk;
}

/** The saved copy for a slug, or null when there is none. */
export async function readSaved(slug: string): Promise<SavedFile | null> {
  if (!SLUG.test(slug)) return null;
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "precomputed",
      `${slug}.json`,
    );
    return JSON.parse(await readFile(file, "utf8")) as SavedFile;
  } catch {
    return null;
  }
}

/**
 * How long to wait for the database before serving a saved copy. A warm
 * verdict takes about half a second; a cold Neon start can take 5 to 20.
 */
export const DB_WAIT_MS = 4000;

const TIMED_OUT = Symbol("timed out");

function timer(ms: number): {
  done: Promise<typeof TIMED_OUT>;
  clear: () => void;
} {
  let id: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<typeof TIMED_OUT>((resolve) => {
    id = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return { done, clear: () => clearTimeout(id) };
}

/**
 * The live verdict, or the saved copy for one of the precomputed coins when
 * the database fails or does not answer within DB_WAIT_MS. Coins without a
 * saved copy keep waiting for the database. `savedAt` is set only for a saved
 * copy. Wrapped in React `cache` so the page and its metadata share one call
 * per request.
 */
export const getVerdictOrSaved = cache(
  async (
    slug: string,
  ): Promise<{ data: VerdictResponse; savedAt: string | null }> => {
    const live = getVerdict(slug);
    const wait = timer(DB_WAIT_MS);
    try {
      const first = await Promise.race([live, wait.done]);
      if (first !== TIMED_OUT) return { data: first, savedAt: null };
      const saved = await readSaved(slug);
      if (saved) {
        // Let the live call finish in the background; it fills the cache.
        live.catch(() => {});
        console.error(`verdict for ${slug}: database slow, saved copy served`);
        return { data: saved.verdict, savedAt: saved.savedAt };
      }
      return { data: await live, savedAt: null };
    } catch (error) {
      unstable_rethrow(error);
      const saved = await readSaved(slug);
      if (!saved) throw error;
      console.error(`verdict for ${slug} served from the saved copy`, error);
      return { data: saved.verdict, savedAt: saved.savedAt };
    } finally {
      wait.clear();
    }
  },
);
