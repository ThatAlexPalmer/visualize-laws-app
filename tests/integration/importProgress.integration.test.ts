import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ParquetSchema, ParquetWriter } from "@dsnp/parquetjs";
import { Client } from "pg";
import { loadShard } from "@/data/seed";
import { buildFinesTable } from "@/data/build-fines";
import { contentSha1 } from "@/data/fines";
import {
  connectWriter, fingerprintFile, getProgress, ImportStateError,
  resetCorpus, verifyCorpusProgress,
} from "@/data/importProgress";

const docker = (...args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const loopback = [127, 0, 0, 1].join(".");

// Never consumes DATABASE_URL, .env files, the Compose network, or existing volumes.
test("PG18 fixture ingestion recovery", { timeout: 180_000 }, async (t) => {
  const name = `laws-import-test-${process.pid}-${Date.now()}`;
  const directory = await mkdtemp(join(tmpdir(), "laws-import-"));
  const clients: Client[] = [];
  let started = false;
  t.after(async () => {
    await Promise.all(clients.map((c) => c.end().catch(() => {})));
    if (started) docker("rm", "-f", name);
    await rm(directory, { recursive: true, force: true });
  });
  docker("run", "-d", "--name", name, "--tmpfs", "/var/lib/postgresql",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-p", `${loopback}::5432`, "pgvector/pgvector:pg18");
  started = true;
  for (let i = 0; ; i++) {
    try { docker("exec", name, "pg_isready", "-U", "postgres"); break; }
    catch {
      if (i === 100) throw new Error("Disposable PG18 did not start");
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const port = docker("port", name, "5432/tcp").split(":").at(-1)!;
  const base = `postgresql://postgres@${loopback}:${port}`;
  const admin = new Client({ connectionString: `${base}/postgres` });
  clients.push(admin);
  await admin.connect();
  const migrations = join(import.meta.dirname, "../../data/prisma/migrations");
  const dirs = (await readdir(migrations, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  async function database(db: string) {
    await admin.query(`CREATE DATABASE "${db}"`);
    const c = await connectWriter(`${base}/${db}`);
    clients.push(c);
    for (const dir of dirs) await c.query(await readFile(join(migrations, dir, "migration.sql"), "utf8"));
    return c;
  }
  let client = await database("fixture_a");
  const second = await database("fixture_b");
  const shard = join(directory, "tiny.parquet");
  const schema = new ParquetSchema({
    state: { type: "UTF8" }, header: { type: "UTF8" }, content: { type: "UTF8" },
    is_substantive: { type: "BOOLEAN" }, opacity: { type: "DOUBLE" },
    enforcement_discretion: { type: "DOUBLE" }, paternalism: { type: "DOUBLE" },
    problem_salience: { type: "DOUBLE" },
  });
  const writer = await ParquetWriter.openFile(schema, shard);
  // Legitimate duplicate identities must survive; there is no law-row dedupe.
  for (let i = 0; i < 12; i++) await writer.appendRow({
    state: "co", header: `Law ${Math.floor(i / 2)}`, content: `Text ${Math.floor(i / 2)}`,
    is_substantive: true, opacity: i, enforcement_discretion: i,
    paternalism: i, problem_salience: i,
  });
  await writer.close();
  const fingerprint = await fingerprintFile(shard);
  const count = async (c = client) => (await c.query("SELECT count(*)::int n FROM laws")).rows[0].n;
  const load = (limit?: number, c = client) => count(c).then((alreadyLoaded) =>
    loadShard(c, shard, 0, { fingerprint, alreadyLoaded, limit }));

  // Intercept only COMMIT, while still exercising real COPY, transactions and reconnect.
  function failCommit(c: Client, afterCommit: boolean) {
    const original = c.query.bind(c);
    let fail = true;
    const restore = () => { c.query = original as Client["query"]; };
    c.query = ((...args: unknown[]) => {
      if (args[0] === "COMMIT" && fail) {
        fail = false;
        return (afterCommit ? Reflect.apply(original, c, args) : Promise.resolve())
          .then(() => { throw new Error("simulated commit interruption"); });
      }
      return Reflect.apply(original, c, args);
    }) as Client["query"];
    return restore;
  }
  async function reconnect() {
    await client.end();
    client = await connectWriter(`${base}/fixture_a`);
    clients.push(client);
  }

  await t.test("partial resume honors global limits and isolates target progress", async () => {
    assert.equal((await load(3)).rows, 3);
    assert.equal((await load(5)).rows, 2);
    assert.equal(await count(), 5);
    await verifyCorpusProgress(client);
    assert.equal(await getProgress(second, "locus-v1/0000", fingerprint), 0);
    assert.equal((await load(2, second)).rows, 2);
    assert.equal(await count(second), 2);
  });
  await t.test("lost COMMIT acknowledgement reconciles after reconnect", async () => {
    failCommit(client, true);
    await assert.rejects(load(8), /commit interruption/);
    await reconnect();
    assert.equal(await count(), 8);
    await verifyCorpusProgress(client);
    assert.equal((await load(10)).rows, 2);
    assert.equal(await count(), 10);
  });
  await t.test("pre-COMMIT interruption rolls back both rows and progress", async () => {
    const restore = failCommit(client, false);
    await assert.rejects(load(11), /commit interruption/);
    restore();
    assert.equal(await count(), 10);
    assert.equal(await getProgress(client, "locus-v1/0000", fingerprint), 10);
    assert.equal((await load()).complete, true);
    assert.equal(await count(), 12);
    await verifyCorpusProgress(client);
    assert.equal((await client.query("SELECT count(DISTINCT header)::int n FROM laws")).rows[0].n, 6);
  });
  await t.test("writer exclusion and source mismatch fail before loading", async () => {
    await assert.rejects(connectWriter(`${base}/fixture_a`), ImportStateError);
    await assert.rejects(getProgress(client, "locus-v1/0000", "changed"), /Source changed/);
    assert.equal(await count(), 12);
  });
  await t.test("completed legacy imports work; unverifiable partial legacy imports fail", async () => {
    await client.query("DELETE FROM import_progress");
    await verifyCorpusProgress(client);
    await client.query("DELETE FROM seed_checkpoints");
    await assert.rejects(verifyCorpusProgress(client), /Unverifiable partial/);
    await client.query("INSERT INTO seed_checkpoints(shard, rows_loaded) VALUES ('0000', 12)");
  });

  const finesFile = join(directory, "fines.parquet");
  const fineWriter = await ParquetWriter.openFile(new ParquetSchema({
    state: { type: "UTF8" }, header: { type: "UTF8" }, content_sha1: { type: "UTF8" },
    annotation_source: { type: "UTF8" }, effective_max: { type: "DOUBLE" },
  }), finesFile);
  for (let i = 0; i < 6; i++) await fineWriter.appendRow({
    state: "co", header: `Law ${i}`, content_sha1: contentSha1(`Text ${i}`),
    annotation_source: "LLM", effective_max: 500,
  });
  await fineWriter.appendRow({
    state: "co", header: "ignored", content_sha1: "", annotation_source: "unchanged_LOCUS", effective_max: 0,
  });
  await fineWriter.close();
  await t.test("fines replay after ambiguous commit retains stable positions and duplicates", async () => {
    failCommit(client, true);
    await assert.rejects(buildFinesTable(client, { file: finesFile }), /commit interruption/);
    await reconnect();
    const stats = await buildFinesTable(client, { file: finesFile });
    assert.equal(stats.staged, 6);
    assert.equal(stats.matched, 12);
    assert.equal(stats.withAmount, 12);
    const rerun = await buildFinesTable(client, { file: finesFile });
    assert.equal(rerun.matched, 12);
  });
  await t.test("UNLOGGED loss and legacy staging require explicit restaging", async () => {
    const restore = failCommit(client, true);
    await assert.rejects(buildFinesTable(client, { file: finesFile }), /commit interruption/);
    restore();
    await client.query("TRUNCATE law_fines_import_v2");
    await assert.rejects(buildFinesTable(client, { file: finesFile }), /lost or changed/);
    await client.query("CREATE TABLE law_fines_import (row_no int)");
    await assert.rejects(buildFinesTable(client, { file: finesFile }), /Legacy fines/);
    assert.equal((await buildFinesTable(client, { file: finesFile, restage: true })).matched, 12);
  });
  await t.test("fresh reset removes staging and progress atomically", async () => {
    await client.query("CREATE TABLE law_fines_import (row_no int)");
    const restore = failCommit(client, false);
    await assert.rejects(resetCorpus(client), /commit interruption/);
    restore();
    assert.equal(await count(), 12);
    assert.ok((await client.query("SELECT to_regclass('law_fines_import') t")).rows[0].t);
    await resetCorpus(client);
    assert.equal(await count(), 0);
    assert.equal((await client.query("SELECT to_regclass('law_fines_import') t")).rows[0].t, null);
    await verifyCorpusProgress(client);
  });
});
