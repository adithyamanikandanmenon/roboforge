import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfile, buildAlerts } from "../src/farmInsights.js";
import { metrics, defaultTargets } from "../src/pondData.js";
import {
  normalizeSensorChecks,
  sensorAssessment,
  recordSensorEvent,
  validateReminder,
  completeReminder,
  reminderStatus,
} from "../src/waterOperations.js";
import {
  shouldNotifyReminder,
  repeatIntervals,
} from "../functions/reminderPolicy.js";
import { FarmClient } from "../src/farmClient.js";
const now = Date.now(),
  ph = metrics[0];
const pond = {
  id: "LAKE_02",
  name: "North Lake",
  bodyType: "Lake",
  path: "water_quality/LAKE_02/readings",
  staleMinutes: 10,
  targets: defaultTargets,
};
const reminder = {
  id: "task-1",
  pondId: "LAKE_02",
  title: "Check probe",
  kind: "Sensor check",
  dueAt: now - 1000,
  repeat: "none",
  createdAt: now - 10000,
  updatedAt: now - 10000,
};
test("water bodies retain independent types, paths and sensor records", () => {
  const lake = validateProfile(pond),
    tank = validateProfile({
      ...pond,
      id: "TANK_03",
      bodyType: "Tank",
      path: "water_quality/TANK_03/readings",
    });
  const checked = recordSensorEvent(lake, "ph", "checkedAt", now - 1000);
  assert.equal(checked.bodyType, "Lake");
  assert.equal(checked.sensorChecks.ph.checkedAt, now - 1000);
  assert.equal(tank.sensorChecks.ph.checkedAt, null);
  assert.notEqual(lake.path, tank.path);
  assert.throws(
    () => validateProfile({ ...pond, bodyType: "Bad type" }),
    /water body type/i,
  );
});
test("jump assessment requires two recent comparable numeric samples and retains raw values", () => {
  const record = normalizeSensorChecks().ph,
    rows = [
      { time: now - 60000, ph: 7 },
      { time: now, ph: 9 },
    ];
  assert.equal(sensorAssessment(ph, rows, record, now).code, "verify");
  assert.equal(rows.at(-1).ph, 9);
  assert.equal(
    sensorAssessment(ph, [{ time: now - 7200000, ph: 7 }, rows[1]], record, now)
      .comparable,
    false,
  );
  assert.equal(
    sensorAssessment(ph, [rows[0], { time: now, ph: null }], record, now).code,
    "unknown",
  );
  assert.equal(
    sensorAssessment(ph, rows, record, now + 7200000).code,
    "unknown",
  );
  assert.equal(
    sensorAssessment(ph, rows, record, now, 10, false).code,
    "unknown",
  );
  assert.equal(sensorAssessment(ph, [rows[1]], record, now).code, "unrecorded");
});
test("maintenance dates cannot move backwards or be recorded in the future", () => {
  const profile = recordSensorEvent(pond, "ph", "checkedAt", now - 1000);
  assert.equal(
    recordSensorEvent(profile, "ph", "checkedAt", now - 60000).sensorChecks.ph
      .checkedAt,
    now - 1000,
  );
  assert.throws(
    () => recordSensorEvent(profile, "ph", "calibratedAt", now + 7200000),
    /valid past/,
  );
  const record = {
    ...normalizeSensorChecks().ph,
    checkedAt: now - 31 * 86400000,
    calibratedAt: now,
  };
  assert.equal(
    sensorAssessment(ph, [{ time: now, ph: 7 }], record, now).code,
    "due",
  );
  assert.throws(
    () => normalizeSensorChecks({ ph: { jumpLimit: 0 } }),
    /positive/,
  );
});
test("care reminders validate their water body and remain separate from quality alerts", () => {
  assert.equal(validateReminder(reminder, "LAKE_02").title, "Check probe");
  assert.throws(
    () => validateReminder(reminder, "POND_01"),
    /different water body/,
  );
  assert.throws(
    () => validateReminder({ ...reminder, dueAt: NaN }, "LAKE_02"),
    /valid reminder time/,
  );
  assert.equal(reminderStatus(reminder, now), "due");
  assert.equal(
    buildAlerts([], defaultTargets, { now }).some(
      (a) => a.kind === "Sensor check",
    ),
    false,
  );
});
test("one-time completion is idempotent and completed/archived tasks do not notify", () => {
  const completed = completeReminder(reminder, now);
  assert.equal(reminderStatus(completed, now), "completed");
  assert.equal(completeReminder(completed, now + 1000).completedAt, now);
  assert.equal(shouldNotifyReminder(completed, undefined, now), false);
  assert.equal(
    shouldNotifyReminder({ ...reminder, archivedAt: now }, undefined, now),
    false,
  );
  assert.equal(shouldNotifyReminder(reminder, reminder.dueAt, now), false);
  assert.equal(shouldNotifyReminder(reminder, undefined, now), true);
});
test("repeat completion advances past missed occurrences without generating a backlog", () => {
  const daily = {
    ...reminder,
    repeat: "daily",
    dueAt: now - 3 * repeatIntervals.daily - 1000,
  };
  const completed = completeReminder(daily, now);
  assert.ok(completed.dueAt > now);
  assert.ok(completed.dueAt < now + repeatIntervals.daily);
  assert.equal(completed.lastCompletedAt, now);
  assert.equal(completed.completedAt, undefined);
  assert.equal(shouldNotifyReminder(completed, undefined, now), false);
  assert.equal(
    shouldNotifyReminder(completed, daily.dueAt, completed.dueAt),
    true,
  );
  const snoozed = { ...reminder, dueAt: now + 3600000 };
  assert.equal(reminderStatus(snoozed, now), "upcoming");
});
test("owner transaction preserves commit result and prevents unsigned calls", async () => {
  const client = new FarmClient();
  let calls = 0;
  client.sdk = {
    ref: () => "",
    runTransaction: async () => {
      calls++;
      return { committed: true };
    },
  };
  await assert.rejects(
    client.transaction("care_reminders/LAKE_02/task-1", () => ({})),
    /verified farm owner/,
  );
  assert.equal(calls, 0);
  client.owner = true;
  const result = await client.transaction(
    "care_reminders/LAKE_02/task-1",
    () => ({}),
  );
  assert.equal(result.committed, true);
  assert.equal(calls, 1);
});
