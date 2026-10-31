import { metrics, assess, defaultTargets } from "./pondData.js";
import { waterBodyTypes, normalizeSensorChecks } from "./waterOperations.js";
export const activityTypes = [
  "Feeding",
  "Aerator use",
  "Water change",
  "Rain observed",
  "Sensor check",
  "Other",
];
export function validateProfile(profile) {
  const bodyType = profile.bodyType || "Pond";
  if (!waterBodyTypes.includes(bodyType))
    throw new Error("Choose a supported water body type.");
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(profile.id || ""))
    throw new Error(
      "Pond ID can contain letters, numbers, underscores and hyphens.",
    );
  if (!profile.name?.trim() || profile.name.length > 80)
    throw new Error("Enter a pond name under 80 characters.");
  if (profile.photoUrl && !/^https:\/\//.test(profile.photoUrl))
    throw new Error("Use an HTTPS photo link.");
  if (!profile.path || /[.#$\[\]]/.test(profile.path))
    throw new Error("Enter a valid Firebase readings path.");
  if (
    !Number.isFinite(profile.staleMinutes) ||
    profile.staleMinutes < 1 ||
    profile.staleMinutes > 1440
  )
    throw new Error("Update timeout must be 1–1440 minutes.");
  const targets = {};
  for (const m of metrics.slice(0, 5)) {
    const original = profile.targets?.[m.key];
    if (!original) throw new Error(`Set targets for ${m.name}.`);
    const r = { min: original.min ?? null, max: original.max ?? null };
    for (const b of ["min", "max"])
      if (r[b] !== null && !Number.isFinite(r[b]))
        throw new Error("Target values must be numbers.");
    if (r.min === null && r.max === null)
      throw new Error(`Set at least one target for ${m.name}.`);
    if (r.min !== null && r.max !== null && r.min > r.max)
      throw new Error("Minimum targets must not exceed maximum targets.");
    targets[m.key] = r;
  }
  return {
    ...profile,
    bodyType,
    sensorChecks: normalizeSensorChecks(profile.sensorChecks),
    targets,
    name: profile.name.trim(),
    fishSpecies: (profile.fishSpecies || "Not specified").slice(0, 80),
    location: (profile.location || "Fish farm").slice(0, 120),
    notes: (profile.notes || "").slice(0, 1000),
    photoUrl: (profile.photoUrl || "").slice(0, 2000),
  };
}
export function dailySummary(rows, targets = defaultTargets, now = Date.now()) {
  const recent = rows.filter((r) => r.time >= now - 86400000 && r.time <= now);
  const stats = metrics.slice(0, 5).map((m) => {
    const vals = recent.map((r) => r[m.key]).filter(Number.isFinite);
    return {
      ...m,
      count: vals.length,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      first: vals[0] ?? null,
      last: vals.at(-1) ?? null,
      outside: vals.filter((v) => assess(m, v, targets) === "attention").length,
    };
  });
  const outside = recent.filter((r) =>
    metrics
      .slice(0, 5)
      .some((m) => assess(m, r[m.key], targets) === "attention"),
  ).length;
  const missing = recent.filter((r) =>
    metrics.slice(0, 5).some((m) => !Number.isFinite(r[m.key])),
  ).length;
  return {
    count: recent.length,
    outside,
    missing,
    stats,
    first: recent[0]?.time,
    last: recent.at(-1)?.time,
  };
}
export function buildAlerts(
  rows,
  targets = defaultTargets,
  { now = Date.now(), staleMinutes = 10, connected = true } = {},
) {
  const alerts = [];
  const recent = rows.filter((r) => r.time >= now - 86400000 && r.time <= now);
  const latest = rows.at(-1);
  for (const m of metrics.slice(0, 5)) {
    let episode = null;
    for (const row of recent) {
      const status = assess(m, row[m.key], targets);
      if (status === "attention" && !episode) {
        episode = {
          id: `${m.key}-${row.time}`,
          kind: m.key,
          title: `${m.name} outside target`,
          detail: `${row[m.key]} ${m.unit} at the first recorded exception. Check the sensor and your pond’s selected target.`,
          started: row.time,
          active: true,
        };
        alerts.push(episode);
      } else if (status === "good" && episode) {
        episode.active = false;
        episode.resolved = row.time;
        episode = null;
      }
    }
    if (!Number.isFinite(latest?.[m.key]))
      alerts.push({
        id: `missing-${m.key}`,
        kind: "missing",
        title: `${m.name} not reported`,
        detail:
          "No numeric value in the latest reading. Inspect this sensor or its field mapping.",
        started: latest?.time || now,
        active: true,
      });
  }
  if (!latest || now - latest.time > staleMinutes * 60000)
    alerts.push({
      id: "stale",
      kind: "stale",
      title: latest
        ? "Sensor updates have stopped"
        : "Waiting for the first reading",
      detail: latest
        ? `No fresh reading in ${Math.floor((now - latest.time) / 60000)} minutes. Check power, Wi-Fi and the data connection.`
        : "Connect Firebase and check the configured readings path.",
      started: latest ? latest.time + staleMinutes * 60000 : now,
      active: true,
    });
  if (!connected)
    alerts.push({
      id: "connection",
      kind: "connection",
      title: "Data connection interrupted",
      detail:
        "Current conditions cannot be confirmed. Shown readings may be old.",
      started: now,
      active: true,
    });
  return alerts.sort(
    (a, b) => Number(b.active) - Number(a.active) || b.started - a.started,
  );
}
export function reportText({
  pond,
  rows,
  targets,
  activities,
  now = Date.now(),
  demo,
}) {
  const summary = dailySummary(rows, targets, now);
  return [
    `RoboForge — ${pond.name}`,
    demo ? "EXAMPLE DATA · local demonstration" : "Recorded Firebase data",
    `Report generated: ${new Date(now).toLocaleString()}`,
    `Fish: ${pond.fishSpecies || "Not specified"}`,
    `Past 24 hours: ${summary.count} records; ${summary.outside} records outside selected targets; ${summary.missing} incomplete records.`,
    ...summary.stats.map(
      (s) =>
        `${s.name}: ${s.count ? `${s.min}–${s.max} ${s.unit}` : "No readings"} (${s.count} measurements)`,
    ),
    "",
    "Pond diary:",
    ...activities
      .filter((a) => a.time >= now - 86400000)
      .map(
        (a) => `${new Date(a.time).toLocaleString()} — ${a.type}: ${a.note}`,
      ),
    "",
    "Targets are selected by the farm owner. This report describes records, not a prediction or a fish-health guarantee.",
  ].join("\n");
}
