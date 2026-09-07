import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Run the actual shell logic with stub executables: no DB, migration or seed runs.
for (const scenario of [
  { name: "failed count", count: "0", status: "1", exits: 1, seeds: false },
  { name: "invalid count", count: "unknown", status: "0", exits: 1, seeds: false },
  { name: "populated database", count: "2211516", status: "0", exits: 0, seeds: false },
  { name: "empty database", count: "0", status: "0", exits: 0, seeds: true },
]) {
  test(`entrypoint handles ${scenario.name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "locus-entrypoint-"));
    try {
      writeFileSync(join(dir, "package.json"), "{}");
      writeFileSync(join(dir, "node"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      writeFileSync(join(dir, "pnpm"), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  *data/db-count.ts*) printf '%s' "$COUNT"; exit "$COUNT_STATUS" ;;
esac
`, { mode: 0o755 });
      const script = join(dir, "entrypoint.sh");
      writeFileSync(script, readFileSync(new URL("../../../docker/entrypoint.sh", import.meta.url), "utf8")
        .replaceAll("/workspace", dir));
      const result = spawnSync("sh", [script], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COUNT: scenario.count,
          COUNT_STATUS: scenario.status, CALL_LOG: join(dir, "calls"), SEED_LIMIT: "25000" },
      });
      assert.equal(result.status, scenario.exits, result.stderr);
      const calls = readFileSync(join(dir, "calls"), "utf8");
      assert.equal(calls.includes("seed --limit 25000"), scenario.seeds);
      assert.equal(calls.includes("exec next dev"), scenario.exits === 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("db-count exits nonzero without printing zero or credentials on connection failure", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "data/db-count.ts"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://unused@localhost:1/fixture",
      DIRECT_URL: "postgresql://unused@localhost:1/fixture" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unable to count laws/);
  assert.doesNotMatch(result.stderr, /postgresql:\/\//);
});
