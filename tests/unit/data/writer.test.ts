import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";

import { Client } from "pg";

import {
  WRITER_ENV_FILES,
  copyBatch,
  destroyCopySocket,
  loadEnv,
  withTimeout,
  writerConnectionString,
} from "@/data/writer";

const WRITERS = [
  "data/seed.ts",
  "data/build-fines.ts",
  "data/build-city-county.ts",
] as const;

function isolatedKey(name: string): string {
  return `WRITER_TEST_${name}_${process.pid}_${Date.now()}`;
}

test("seed and builders share writer.ts and do not redefine loadEnv/COPY helpers", () => {
  assert.deepEqual([...WRITER_ENV_FILES], [".env.local", ".env"]);
  for (const file of WRITERS) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /from ["']\.\/writer["']/);
    assert.doesNotMatch(src, /function loadEnv\(/);
    assert.doesNotMatch(src, /function copyBatch\(/);
    assert.doesNotMatch(src, /function withTimeout\(/);
    assert.doesNotMatch(src, /as any\)\.connection/);
  }
});

test("loadEnv prefers .env.local, then .env, and never overwrites process.env", () => {
  const cwd = mkdtempSync(join(tmpdir(), "writer-env-"));
  const localKey = isolatedKey("LOCAL");
  const sharedKey = isolatedKey("SHARED");
  const baseKey = isolatedKey("BASE");
  const presetKey = isolatedKey("PRESET");
  writeFileSync(
    join(cwd, ".env.local"),
    [
      "# comment",
      `export ${localKey}=from-local`,
      `${sharedKey}="from-local"`,
      `${presetKey}=should-not-win`,
    ].join("\n"),
  );
  writeFileSync(
    join(cwd, ".env"),
    [
      `${sharedKey}=from-base`,
      `${baseKey}='from-base'`,
      `${presetKey}=from-base`,
    ].join("\n"),
  );

  process.env[presetKey] = "already-set";
  try {
    loadEnv(cwd);
    assert.equal(process.env[localKey], "from-local");
    assert.equal(process.env[sharedKey], "from-local");
    assert.equal(process.env[baseKey], "from-base");
    assert.equal(process.env[presetKey], "already-set");
  } finally {
    delete process.env[localKey];
    delete process.env[sharedKey];
    delete process.env[baseKey];
    delete process.env[presetKey];
  }
});

test("writerConnectionString prefers DIRECT_URL and names both env files", () => {
  const direct = isolatedKey("DIRECT");
  const database = isolatedKey("DATABASE");
  const prevDirect = process.env.DIRECT_URL;
  const prevDatabase = process.env.DATABASE_URL;
  try {
    delete process.env.DIRECT_URL;
    delete process.env.DATABASE_URL;
    assert.throws(writerConnectionString, /\.env\.local \/ \.env/);

    process.env.DATABASE_URL = `postgres://db/${database}`;
    assert.equal(writerConnectionString(), `postgres://db/${database}`);

    process.env.DIRECT_URL = `postgres://direct/${direct}`;
    assert.equal(writerConnectionString(), `postgres://direct/${direct}`);
  } finally {
    if (prevDirect === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = prevDirect;
    if (prevDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDatabase;
  }
});

test("withTimeout resolves, then rejects and runs onTimeout", async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50, "fast"), 7);

  let timedOut = false;
  await assert.rejects(
    withTimeout(new Promise(() => {}), 15, "watchdog", () => {
      timedOut = true;
    }),
    /watchdog timed out after 15ms \(stalled COPY\/load\)/,
  );
  assert.equal(timedOut, true);
});

test("copyBatch no-ops empty lines and destroys the typed socket on timeout", async () => {
  const idle = { query() { throw new Error("should not COPY"); } } as unknown as Client;
  await copyBatch(idle, "COPY t FROM STDIN", []);

  const destroyed: Error[] = [];
  const hung = new Writable({
    write() {
      /* never ack — hang until the watchdog destroys the socket */
    },
  });
  const client = {
    query: () => hung,
    connection: {
      stream: {
        destroy(err?: Error) {
          if (err) destroyed.push(err);
          hung.destroy(err);
        },
      },
    },
  } as unknown as Client;

  destroyCopySocket({
    connection: {
      stream: {
        destroy(err?: Error) {
          if (err) destroyed.push(err);
        },
      },
    },
  } as unknown as Client);
  assert.equal(destroyed[0]?.message, "COPY watchdog timeout");

  await assert.rejects(
    copyBatch(client, "COPY t FROM STDIN", ["a\n"], 20),
    /COPY batch \(1 rows\) timed out/,
  );
  assert.equal(destroyed.at(-1)?.message, "COPY watchdog timeout");
});
