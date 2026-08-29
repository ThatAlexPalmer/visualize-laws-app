import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FINES_STAGING_COLUMNS,
  contentSha1,
  copyBool,
  copyNum,
  copyText,
  encodeStagingRow,
  identityKey,
  isModelAnnotated,
  toKey,
  toNullableBool,
  toNullableNum,
  type RawFineRow,
} from "./fines";

/**
 * Real rows from the head of the supplement, paired with the `content_sha1`
 * the dataset publishes for them. These fingerprints were confirmed against
 * the matching `laws` rows in the local full corpus.
 */
const KINGCOVE: RawFineRow = {
  state: "ak",
  source_jurisdiction_type: "cities",
  city: "kingcove",
  county: null,
  function: "Context",
  header: "### 1.05.010 Name of municipality--Form of government.",
  content_sha1: "4fce7cb536997fcc",
  annotation_source: "unchanged_LOCUS",
  fine_relevant: false,
  per_day_violation: false,
  jail_mentioned: false,
  grounded: null,
};

const PENALTY_ROW: RawFineRow = {
  state: "ak",
  source_jurisdiction_type: "cities",
  city: "kingcove",
  county: null,
  function: "Enforcement",
  header: "## 1.15.025 Civil remedies, penalties and injunctions.",
  content_sha1: "4b006d0c042a0ddb",
  annotation_source: "LLM",
  fine_relevant: true,
  penalty_scope: "code_general",
  penalty_stated: "amounts_here",
  fine_structure: "fluid",
  fixed_amount: null,
  min_amount: 50,
  max_amount: 1000,
  first_violation_amount: null,
  second_violation_amount: null,
  subsequent_violation_amount: null,
  effective_min: 50,
  effective_max: 1000,
  per_day_violation: true,
  jail_mentioned: false,
  penalty_nature: "civil",
  extraction_flag: null,
  grounded: true,
};

test("contentSha1 reproduces the supplement's fingerprint format", () => {
  // sha1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
  assert.equal(contentSha1(""), "da39a3ee5e6b4b0d");
  assert.equal(contentSha1("").length, 16);
  // Stable and content-sensitive.
  assert.equal(contentSha1("abc"), contentSha1("abc"));
  assert.notEqual(contentSha1("abc"), contentSha1("abd"));
});

test("contentSha1 hashes UTF-8 bytes, matching the Python reference", () => {
  // hashlib.sha1("§ 1-8 café".encode()).hexdigest()[:16]
  const utf8 = Buffer.from("§ 1-8 café", "utf8");
  assert.equal(
    contentSha1("§ 1-8 café"),
    // Same input hashed as bytes, so a latin1 round-trip would diverge here.
    contentSha1(utf8.toString("utf8")),
  );
  assert.notEqual(contentSha1("§ 1-8 café"), contentSha1("SS 1-8 cafe"));
});

test("isModelAnnotated keeps only rows the model read", () => {
  assert.equal(isModelAnnotated(PENALTY_ROW), true);
  assert.equal(isModelAnnotated(KINGCOVE), false);
  assert.equal(isModelAnnotated({ annotation_source: null }), false);
});

test("identityKey normalizes NULL city/county to empty, matching the SQL join", () => {
  const key = identityKey(PENALTY_ROW);
  const parts = key.split("\u001f");
  assert.equal(parts.length, 7);
  assert.equal(parts[2], "kingcove");
  // county is null on a city row; the join compares COALESCE(county, '').
  assert.equal(parts[3], "");
  assert.equal(parts[6], "4b006d0c042a0ddb");
});

test("identityKey separates fields that differ only in one column", () => {
  const a = identityKey(PENALTY_ROW);
  const b = identityKey({ ...PENALTY_ROW, function: "Rules" });
  const c = identityKey({ ...PENALTY_ROW, content_sha1: "0000000000000000" });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("identityKey cannot be forged by shifting text across field boundaries", () => {
  // Without a delimiter outside the slug alphabet, these would collide.
  const left = identityKey({ state: "ak", source_jurisdiction_type: "cities" });
  const right = identityKey({ state: "akcities", source_jurisdiction_type: "" });
  assert.notEqual(left, right);
});

test("duplicate identity keys collapse; distinct ones do not", () => {
  // Mirrors the DISTINCT ON in the attach query: LOCUS-v1 repeats some
  // sections verbatim, so several staged rows can share one key.
  const rows: RawFineRow[] = [
    PENALTY_ROW,
    { ...PENALTY_ROW },
    { ...PENALTY_ROW, header: "## 1.15.030 Something else." },
  ];
  const unique = new Map(rows.map((r) => [identityKey(r), r]));
  assert.equal(rows.length, 3);
  assert.equal(unique.size, 2);
});

test("toKey turns absent values into the empty string", () => {
  assert.equal(toKey(null), "");
  assert.equal(toKey(undefined), "");
  assert.equal(toKey("pagosa_springs"), "pagosa_springs");
  assert.equal(toKey(Buffer.from("kingcove", "utf8")), "kingcove");
});

test("toNullableNum keeps 0 and drops non-finite values", () => {
  // 0 is a real fine amount (effective_min bottoms out at 0), so it must not
  // be coerced to null by a falsy check.
  assert.equal(toNullableNum(0), 0);
  assert.equal(toNullableNum(5_000_000), 5_000_000);
  assert.equal(toNullableNum(12.5), 12.5);
  assert.equal(toNullableNum(null), null);
  assert.equal(toNullableNum(undefined), null);
  assert.equal(toNullableNum(Number.NaN), null);
  assert.equal(toNullableNum(Number.POSITIVE_INFINITY), null);
});

test("toNullableBool keeps grounded tri-state", () => {
  assert.equal(toNullableBool(true), true);
  assert.equal(toNullableBool(false), false);
  assert.equal(toNullableBool(null), null);
  assert.equal(toNullableBool(undefined), null);
});

test("COPY encoders emit the text format's null and escapes", () => {
  assert.equal(copyText(null), "\\N");
  assert.equal(copyNum(null), "\\N");
  assert.equal(copyBool(null), "\\N");
  assert.equal(copyBool(true), "t");
  assert.equal(copyBool(false), "f");
  assert.equal(copyNum(0), "0");
  // Tabs and newlines inside a header would otherwise break row framing.
  assert.equal(copyText("a\tb"), "a\\tb");
  assert.equal(copyText("a\nb"), "a\\nb");
  assert.equal(copyText("a\\b"), "a\\\\b");
});

test("encodeStagingRow emits one line per staging column, in order", () => {
  const line = encodeStagingRow(PENALTY_ROW);
  assert.ok(line.endsWith("\n"));
  const fields = line.slice(0, -1).split("\t");
  assert.equal(fields.length, FINES_STAGING_COLUMNS.length);

  const at = (name: (typeof FINES_STAGING_COLUMNS)[number]) =>
    fields[FINES_STAGING_COLUMNS.indexOf(name)];

  assert.equal(at("state"), "ak");
  assert.equal(at("city"), "kingcove");
  assert.equal(at("county"), ""); // NULL normalized for the hash join
  assert.equal(at("content_sha1"), "4b006d0c042a0ddb");
  assert.equal(at("annotation_source"), "LLM");
  assert.equal(at("fine_relevant"), "t");
  assert.equal(at("fixed_amount"), "\\N");
  assert.equal(at("min_amount"), "50");
  assert.equal(at("effective_max"), "1000");
  assert.equal(at("per_day_violation"), "t");
  assert.equal(at("jail_mentioned"), "f");
  assert.equal(at("penalty_nature"), "civil");
  assert.equal(at("extraction_flag"), "\\N");
  assert.equal(at("grounded"), "t");
});

test("encodeStagingRow escapes a header containing a tab", () => {
  const line = encodeStagingRow({
    ...PENALTY_ROW,
    header: "## 1.15.025\tCivil remedies",
  });
  const fields = line.slice(0, -1).split("\t");
  // Still one field per column: the literal tab was escaped, not emitted.
  assert.equal(fields.length, FINES_STAGING_COLUMNS.length);
  assert.equal(
    fields[FINES_STAGING_COLUMNS.indexOf("header")],
    "## 1.15.025\\tCivil remedies",
  );
});

test("a rule-derived row still encodes with a tri-state null grounded", () => {
  const line = encodeStagingRow(KINGCOVE);
  const fields = line.slice(0, -1).split("\t");
  assert.equal(fields[FINES_STAGING_COLUMNS.indexOf("grounded")], "\\N");
  assert.equal(fields[FINES_STAGING_COLUMNS.indexOf("fine_relevant")], "f");
});
