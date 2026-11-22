import "server-only";

import type { z } from "zod";

const BASE_URL = "https://pro-api.coinmarketcap.com";
const MAX_RETRIES = 4;

export type CmcParams = Record<string, string | number | boolean | undefined>;

/** What we keep as evidence of a real API call. Never contains the key. */
export interface CmcReceipt {
  endpoint: string;
  requestUrl: string;
  fetchedAt: string;
  httpStatus: number;
  creditCount: number | null;
  errorCode: number | null;
  errorMessage: string | null;
}

export interface CmcResult<T> {
  data: T;
  /** The full parsed body (status + data), for saving locally. */
  body: unknown;
  receipt: CmcReceipt;
}

export class CmcError extends Error {
  constructor(
    message: string,
    readonly receipt: CmcReceipt,
  ) {
    super(message);
    this.name = "CmcError";
  }
}

interface CmcStatus {
  error_code?: number | string | null;
  error_message?: string | null;
  credit_count?: number | null;
}

function apiKey(): string {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error("CMC_API_KEY is not set");
  return key;
}

function buildUrl(endpoint: string, params: CmcParams): string {
  const url = new URL(endpoint, BASE_URL);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url.toString();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a CMC Pro API endpoint. The key goes in a header only, so the URL in the
 * receipt is safe to show. Retries 429 and 5xx with backoff.
 */
export async function cmcGet<T = unknown>(
  endpoint: string,
  params: CmcParams = {},
  schema?: z.ZodType<T>,
): Promise<CmcResult<T>> {
  const requestUrl = buildUrl(endpoint, params);

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json", "X-CMC_PRO_API_KEY": apiKey() },
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      status?: CmcStatus;
      data?: unknown;
    } | null;
    const status = body?.status ?? {};
    const errorCode =
      status.error_code === undefined || status.error_code === null
        ? null
        : Number(status.error_code);

    const receipt: CmcReceipt = {
      endpoint,
      requestUrl,
      fetchedAt: new Date().toISOString(),
      httpStatus: response.status,
      creditCount: status.credit_count ?? null,
      errorCode,
      errorMessage: status.error_message ?? null,
    };

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 2000);
      continue;
    }

    if (!response.ok || (errorCode !== null && errorCode !== 0)) {
      throw new CmcError(
        `CMC ${endpoint} failed: HTTP ${response.status}, code ${errorCode}, ${receipt.errorMessage ?? "no message"}`,
        receipt,
      );
    }

    const data = schema ? schema.parse(body?.data) : (body?.data as T);
    return { data, body, receipt };
  }
}
