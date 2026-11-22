import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/** Local, gitignored store for raw CMC responses. Never committed. */
export const DATA_DIR = join(process.cwd(), "data");
export const LISTINGS_DIR = join(DATA_DIR, "raw", "listings");

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeJsonGz(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, gzipSync(JSON.stringify(value)));
}

export async function readJsonGz<T>(path: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(path)).toString("utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}
