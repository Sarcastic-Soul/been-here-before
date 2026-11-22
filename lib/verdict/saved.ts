import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { unstable_rethrow } from "next/navigation";

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
 * The live verdict, or the saved copy for one of the precomputed coins when
 * the database cannot be reached. `savedAt` is set only for a saved copy.
 */
export async function getVerdictOrSaved(
  slug: string,
): Promise<{ data: VerdictResponse; savedAt: string | null }> {
  try {
    return { data: await getVerdict(slug), savedAt: null };
  } catch (error) {
    unstable_rethrow(error);
    const saved = await readSaved(slug);
    if (!saved) throw error;
    console.error(`verdict for ${slug} served from the saved copy`, error);
    return { data: saved.verdict, savedAt: saved.savedAt };
  }
}
