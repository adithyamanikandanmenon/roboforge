import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailySummary,
  buildAlerts,
  validateProfile,
  reportText,
} from "../src/farmInsights.js";
import { makeDemo, defaultTargets } from "../src/pondData.js";
import { FarmClient } from "../src/farmClient.js";
import { currentConditions, conditionChanges } from "../functions/policy.js";
const now = Date.now();
const profile = {
  id: "POND_01",
  name: "Pond 01",
  path: "water_quality/POND_01/readings",
  staleMinutes: 10,
  targets: defaultTargets,
};
test("daily summary excludes old readings and counts actual exceptions and missing data", () => {
  const rows = makeDemo(now);
  rows[0].time = now - 90000000;
  rows.at(-1).dissolved_oxygen = 3;
  rows.at(-1).ph = null;
  const summary = dailySummary(rows, defaultTargets, now);
  assert.equal(summary.count, 96);
  assert.equal(summary.outside, 1);
  assert.equal(summary.missing, 1);
  assert.equal(summary.stats.find((s) => s.key === "dissolved_oxygen").min, 3);
});
test("alert episodes resolve only when a later valid reading returns to range", () => {
  const rows = makeDemo(now).slice(-3);
  rows[0].dissolved_oxygen = 3;
  rows[1].dissolved_oxygen = null;
  rows[2].dissolved_oxygen = 6;
  const events = buildAlerts(rows, defaultTargets, { now });
  const oxygen = events.find((a) => a.kind === "dissolved_oxygen");
  assert.equal(oxygen.active, false);
  assert.equal(oxygen.resolved, rows[2].time);
});
test("stopped updates and connection failure are shown separately", () => {
  const alerts = buildAlerts(makeDemo(now - 7200000), defaultTargets, {
    now,
    connected: false,
  });
  assert.ok(alerts.find((a) => a.id === "stale" && a.active));
  assert.ok(alerts.find((a) => a.id === "connection" && a.active));
});
test("profile validates ranges and normalizes absent Firebase null bounds", () => {
  const input = structuredClone(profile);
  delete input.targets.dissolved_oxygen.max;
  assert.equal(validateProfile(input).targets.dissolved_oxygen.max, null);
  input.targets.ph = { min: 9, max: 7 };
  assert.throws(() => validateProfile(input), /Minimum/);
  assert.throws(
    () => validateProfile({ ...profile, photoUrl: "javascript:alert(1)" }),
    /HTTPS/,
  );
  assert.throws(
    () => validateProfile({ ...profile, id: "invalid.path" }),
    /Pond ID/,
  );
});
test("public browser clients cannot use owner write helper; writes await acknowledgement", async () => {
  const client = new FarmClient();
  let writes = 0,
    ack;
  client.sdk = {
    ref: () => "",
    set: () => {
      writes++;
      return new Promise((resolve) => {
        ack = resolve;
      });
    },
  };
  await assert.rejects(
    client.write("pond_profiles/POND_01", {}),
    /verified farm owner/,
  );
  assert.equal(writes, 0);
  client.owner = true;
  let finished = false;
  const result = client.write("pond_profiles/POND_01", {}).then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  ack();
  await result;
  assert.equal(finished, true);
});
test("background policy detects low oxygen, missing fields, stale records and avoids repeat messages", () => {
  const reading = {
    ...makeDemo(now).at(-1),
    timestamp: now,
    dissolved_oxygen: 3,
  };
  const current = currentConditions(reading, profile, now);
  assert.ok(current.dissolved_oxygen);
  assert.equal(conditionChanges({}, current).length, 1);
  assert.equal(conditionChanges(current, current).length, 0);
  assert.equal(conditionChanges(current, {}).length, 1);
  const stale = currentConditions(
    { ...reading, timestamp: now - 7200000 },
    profile,
    now,
  );
  assert.ok(stale.stale);
  assert.equal(
    conditionChanges(current, stale).filter((e) => !e.active).length,
    0,
  );
});
test("report explicitly identifies demo data and includes recorded diary entries", () => {
  const text = reportText({
    pond: profile,
    rows: makeDemo(now),
    targets: defaultTargets,
    activities: [{ time: now, type: "Feeding", note: "Morning feed" }],
    now,
    demo: true,
  });
  assert.match(text, /EXAMPLE DATA/);
  assert.match(text, /Morning feed/);
  assert.match(text, /not a prediction/);
});
