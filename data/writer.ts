/**
 * Shared writer CLI helpers: env files, COPY batches, load timeouts, and
 * the cache download the seed and both builders use.
 *
 * Seed and both derived builders must use this module. Do not add another
 * `loadEnv`, COPY watchdog, or `.part` downloader. `tsx` does not auto-load
 * env files; dotenv-cli (`pnpm seed`, `pnpm build:*`) already sets
 * `process.env`, so this loader only fills missing keys and never overrides
 * `.env.prod` or the shell.
 */
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

/** Local fallbacks when a script is invoked without dotenv-cli. */
const WRITER_ENV_FILES = [".env.local", ".env"] as const;

/** Fail-fast on hung COPY; aggregates/joins set their own (disabled) timeout. */
export const LOAD_STATEMENT_TIMEOUT_MS = 45_000;
/** Client watchdog sits just above statement_timeout so PG can cancel first. */
export const LOAD_QUERY_TIMEOUT_MS = 90_000;

export function loadEnv(cwd = process.cwd()): void {
  for (const name of WRITER_ENV_FILES) {
    const envPath = resolve(cwd, name);
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      let key = line.slice(0, eq).trim();
      if (key.startsWith("export ")) key = key.slice("export ".length).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function writerConnectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DIRECT_URL / DATABASE_URL is not set (check your .env.local / .env)",
    );
  }
  return url;
}

/**
 * Download `url` to `dest` through a sibling `.part` file. An interrupted
 * download must not leave a truncated file that the next run treats as complete.
 */
export async function cacheDownload(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const tmp = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(tmp),
  );
  await rename(tmp, dest);
}

/** Reject if `promise` does not settle within `ms` (and run `onTimeout`). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout?.();
          } catch {
            /* ignore */
          }
          reject(
            new Error(`${label} timed out after ${ms}ms (stalled COPY/load)`),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Destroy the live pg socket so a hung COPY fails into the retry path. */
function destroyCopySocket(client: Client): void {
  client.connection.stream.destroy(new Error("COPY watchdog timeout"));
}

/** COPY one batch on the current connection, with a socket-level watchdog. */
export async function copyBatch(
  client: Client,
  sql: string,
  lines: string[],
  timeoutMs = LOAD_QUERY_TIMEOUT_MS,
): Promise<void> {
  if (lines.length === 0) return;
  const stream = client.query(copyFrom(sql));
  await withTimeout(
    pipeline(Readable.from(lines, { objectMode: false }), stream),
    timeoutMs,
    `COPY batch (${lines.length} rows)`,
    () => {
      try {
        destroyCopySocket(client);
      } catch {
        /* ignore */
      }
    },
  );
}
