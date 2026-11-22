import "server-only";

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

/**
 * Network errors raised while opening the connection, before any request
 * bytes are sent. Retrying these is safe even for writes.
 */
const CONNECT_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function connectErrorCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code && CONNECT_ERRORS.has(cause.code) ? cause.code : undefined;
}

/** fetch with up to two retries when the connection to Neon cannot be opened. */
async function fetchWithRetry(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (attempt >= 2 || !connectErrorCode(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  neonConfig.fetchFunction = fetchWithRetry;
  return drizzle(neon(url), { schema });
}

let instance: ReturnType<typeof create> | undefined;

/** Drizzle over Neon's HTTP driver (pooled URL). Created on first use. */
export function db() {
  return (instance ??= create());
}
