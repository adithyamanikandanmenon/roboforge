import { metrics } from "./pondData.js";
import {
  reminderKinds,
  repeatIntervals,
  reminderStatus,
  completeReminder,
} from "../functions/reminderPolicy.js";
export { reminderKinds, reminderStatus, completeReminder };
export const waterBodyTypes = [
  "Pond",
  "Tank",
  "Lake",
  "Reservoir",
  "River",
  "Canal",
  "Other",
];
const jumpDefaults = {
  ph: 0.8,
  temperature: 2,
  dissolved_oxygen: 2,
  turbidity: 15,
  tds: 100,
  air_temperature: 5,
  aqi: 50,
  rainfall: 20,
};
export function normalizeSensorChecks(input = {}) {
  if (!input || typeof input !== "object")
    throw new Error("Sensor records must be an object.");
  return Object.fromEntries(
    metrics.map((metric) => {
      const row = input[metric.key] || {};
      const result = {
        checkedAt: row.checkedAt ?? null,
        calibratedAt: row.calibratedAt ?? null,
        checkEveryDays: row.checkEveryDays ?? 30,
        calibrateEveryDays: row.calibrateEveryDays ?? 90,
        jumpLimit: row.jumpLimit ?? jumpDefaults[metric.key],
        maxGapMinutes: row.maxGapMinutes ?? 30,
        comparePair: row.comparePair ?? false,
        pairTolerance: row.pairTolerance ?? 0.3,
        pairMaxSkewSeconds: row.pairMaxSkewSeconds ?? 60,
      };
      if (
        typeof result.comparePair !== "boolean" ||
        !Number.isFinite(result.pairTolerance) ||
        result.pairTolerance <= 0 ||
        result.pairTolerance > 14 ||
        !Number.isInteger(result.pairMaxSkewSeconds) ||
        result.pairMaxSkewSeconds < 1 ||
        result.pairMaxSkewSeconds > 3600
      )
        throw new Error(
          "Choose a positive pH comparison limit (up to 14) and a time gap of 1–3600 seconds.",
        );
      for (const key of ["checkedAt", "calibratedAt"])
        if (
          result[key] !== null &&
          (!Number.isFinite(result[key]) ||
            result[key] < 0 ||
            result[key] > Date.now() + 60000)
        )
          throw new Error(
            "Sensor check dates must be valid past or current times.",
          );
      for (const key of ["checkEveryDays", "calibrateEveryDays"])
        if (
          !Number.isInteger(result[key]) ||
          result[key] < 1 ||
          result[key] > 3650
        )
          throw new Error(
            "Sensor intervals must be whole days from 1 to 3650.",
          );
      if (
        !Number.isFinite(result.jumpLimit) ||
        result.jumpLimit <= 0 ||
        result.jumpLimit > 1e6
      )
        throw new Error(
          "Jump limits must be positive numbers up to 1,000,000.",
        );
      if (
        !Number.isFinite(result.maxGapMinutes) ||
        result.maxGapMinutes < 1 ||
        result.maxGapMinutes > 1440
      )
        throw new Error(
          "Comparison windows must be between 1 and 1440 minutes.",
        );
      return [metric.key, result];
    }),
  );
}
export function sensorAssessment(
  metric,
  rows,
  record,
  now = Date.now(),
  staleMinutes = 10,
  connected = true,
) {
  const latest = rows.at(-1);
  const valid = Number.isFinite(latest?.[metric.key]);
  const previous = valid
    ? [...rows.slice(0, -1)]
        .reverse()
        .find(
          (row) => row.time < latest.time && Number.isFinite(row[metric.key]),
        )
    : null;
  const gap = previous ? (latest.time - previous.time) / 60000 : null;
  const comparable = !!previous && gap <= record.maxGapMinutes;
  const delta = comparable ? latest[metric.key] - previous[metric.key] : null;
  const jump = delta !== null && Math.abs(delta) > record.jumpLimit;
  const checkDueAt =
    record.checkedAt === null
      ? null
      : record.checkedAt + record.checkEveryDays * 86400000;
  const calibrationDueAt =
    record.calibratedAt === null
      ? null
      : record.calibratedAt + record.calibrateEveryDays * 86400000;
  let code = "current",
    label = "Checks up to date",
    detail =
      "Recorded maintenance dates are within the chosen intervals. This does not guarantee sensor accuracy.";
  if (!connected) {
    code = "unknown";
    label = "Connection interrupted";
    detail = "A fresh sensor assessment is unavailable.";
  } else if (!valid) {
    code = "unknown";
    label = "No current reading";
    detail =
      "This sensor has not supplied a numeric value in the latest record.";
  } else if (now - latest.time > staleMinutes * 60000) {
    code = "unknown";
    label = "Reading is old";
    detail = "Wait for a fresh update before judging the current conditions.";
  } else if (jump) {
    code = "verify";
    label = "Unusual change — verify";
    detail = `Changed by ${delta > 0 ? "+" : ""}${delta.toFixed(metric.precision)} ${metric.unit} in ${gap.toFixed(1)} min. This can be a real water change or a sensor issue; compare with another reading.`;
  } else if (
    (checkDueAt !== null && now >= checkDueAt) ||
    (calibrationDueAt !== null && now >= calibrationDueAt)
  ) {
    code = "due";
    label = "Maintenance due";
    detail =
      "A recorded check or calibration is due under the chosen schedule.";
  } else if (record.checkedAt === null || record.calibratedAt === null) {
    code = "unrecorded";
    label = "Maintenance not fully recorded";
    detail =
      "Add the last check and calibration dates. Missing records do not mean the sensor is faulty.";
  }
  return {
    code,
    label,
    detail,
    jump,
    delta,
    gap,
    comparable,
    checkDueAt,
    calibrationDueAt,
  };
}
export function recordSensorEvent(profile, sensor, kind, at) {
  if (
    !metrics.some((m) => m.key === sensor) ||
    !["checkedAt", "calibratedAt"].includes(kind) ||
    !Number.isFinite(at) ||
    at < 0 ||
    at > Date.now() + 60000
  )
    throw new Error(
      "Choose a sensor, an event and a valid past or current time.",
    );
  const sensorChecks = normalizeSensorChecks(profile.sensorChecks);
  sensorChecks[sensor][kind] = Math.max(sensorChecks[sensor][kind] ?? 0, at);
  return { ...profile, sensorChecks };
}
export function validateReminder(reminder, pondId, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(reminder.id || ""))
    throw new Error("Invalid reminder ID.");
  if (reminder.pondId !== pondId)
    throw new Error("This reminder belongs to a different water body.");
  if (!reminder.title?.trim() || reminder.title.trim().length > 120)
    throw new Error("Use a reminder title from 1 to 120 characters.");
  if (
    !reminderKinds.includes(reminder.kind) ||
    !Object.hasOwn(repeatIntervals, reminder.repeat)
  )
    throw new Error("Choose a valid care task and repeat setting.");
  if (!Number.isFinite(reminder.dueAt) || reminder.dueAt < 0)
    throw new Error("Choose a valid reminder time.");
  if ((reminder.notes || "").length > 1000)
    throw new Error("Keep reminder notes under 1,000 characters.");
  for (const field of [
    "createdAt",
    "updatedAt",
    "completedAt",
    "lastCompletedAt",
    "archivedAt",
  ])
    if (
      reminder[field] != null &&
      (!Number.isFinite(reminder[field]) ||
        reminder[field] < 0 ||
        reminder[field] > now + 60000)
    )
      throw new Error("Invalid reminder record timestamp.");
  return {
    ...reminder,
    title: reminder.title.trim(),
    notes: (reminder.notes || "").trim(),
  };
}
