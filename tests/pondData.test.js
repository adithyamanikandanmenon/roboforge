import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReadings,
  summary,
  metrics,
  assess,
  defaultTargets,
  makeDemo,
  number,
} from "../src/pondData.js";
import { validateSettings } from "../src/firebaseReader.js";
test("Firebase child records sort chronologically, independent of record keys", () => {
  const result = normalizeReadings({
    z: { ph: "7.2", timestamp: "2026-01-01T11:00:00Z" },
    a: { ph: 7.5, timestamp: "2026-01-01T12:00:00Z" },
  });
  assert.equal(result.at(-1).ph, 7.5);
  assert.equal(result[0].ph, 7.2);
});
test("missing and malformed sensor values stay missing rather than becoming zero", () => {
  const [row] = normalizeReadings({
    timestamp: "2026-01-01T11:00:00Z",
    ph: "",
    temperature: "broken",
    dissolved_oxygen: null,
  });
  assert.equal(row.ph, null);
  assert.equal(row.temperature, null);
  assert.equal(row.dissolved_oxygen, null);
  assert.equal(number(false), null);
  assert.equal(number("0"), 0);
});
test("single latest-value record and Unix-second timestamps are supported", () => {
  const [row] = normalizeReadings({ ph: 7, timestamp: 1767225600 });
  assert.equal(row.time, 1767225600000);
  assert.equal(row.ph, 7);
});
test("undated or far-future readings cannot create a fresh status", () => {
  assert.deepEqual(
    normalizeReadings({
      a: { ph: 7 },
      b: { ph: 7, timestamp: Date.now() + 3600000 },
    }),
    [],
  );
});
test("stale and missing sensor readings cannot give an all-clear", () => {
  const now = Date.now(),
    rows = makeDemo(now);
  assert.equal(summary(rows, defaultTargets, now).good, true);
  assert.equal(summary(rows, defaultTargets, now + 11 * 60000).good, false);
  rows.at(-1).tds = null;
  assert.equal(summary(rows, defaultTargets, now).good, false);
  assert.equal(summary(rows, defaultTargets, now).missing[0].key, "tds");
});
test("low oxygen is flagged using selected targets and no targets means unassessed", () => {
  const oxygen = metrics.find((m) => m.key === "dissolved_oxygen");
  assert.equal(assess(oxygen, 3), "attention");
  assert.equal(assess(oxygen, 6), "good");
  const targets = {
    ...defaultTargets,
    dissolved_oxygen: { min: null, max: null },
  };
  assert.equal(assess(oxygen, 6, targets), "info");
  assert.equal(summary(makeDemo(), targets).good, false);
});
test("read settings reject missing config, private keys and forbidden paths", () => {
  assert.throws(() => validateSettings({}), /configuration/);
  assert.throws(
    () => validateSettings({ firebase: { private_key: "do-not-use" } }),
    /service-account/,
  );
  const settings = {
    firebase: {
      apiKey: "web-id",
      projectId: "test",
      databaseURL: "https://example.firebaseio.com",
    },
    path: "/water_quality/POND_01/readings/",
  };
  assert.equal(
    validateSettings(settings).path,
    "water_quality/POND_01/readings",
  );
  assert.throws(
    () => validateSettings({ ...settings, path: "invalid.#path" }),
    /path/,
  );
});
