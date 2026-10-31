import { metrics, assess } from "./pondData.js";
import { buildAlerts } from "./farmInsights.js";
export function actionAlerts(profile, rows, options = {}) {
  const alerts = buildAlerts(rows, profile.targets, options),
    pair = compareProbes(rows, profile, options.now);
  if (options.connected !== false && pair.code === "disagree")
    alerts.push({
      id: `probe-${rows.at(-1).time}`,
      kind: "probe",
      title: "pH probes disagree — verify",
      detail: pair.detail,
      started: rows.at(-1).time,
      active: true,
    });
  return groupAlerts(alerts);
}
export function compareProbes(rows, profile, now = Date.now()) {
  const config = profile.sensorChecks?.ph || {},
    latest = rows.at(-1);
  if (!config.comparePair)
    return {
      code: "disabled",
      label: "Comparison not enabled",
      detail: "Enable only when both pH probes sample the same water.",
    };
  if (!latest || now - latest.time > (profile.staleMinutes || 10) * 60000)
    return {
      code: "unknown",
      label: "Fresh comparison unavailable",
      detail: "Wait for fresh readings from both probes.",
    };
  if (!Number.isFinite(latest.ph) || !Number.isFinite(latest.ph_secondary))
    return {
      code: "unknown",
      label: "Waiting for both probes",
      detail: "The latest record needs ph and ph_secondary.",
    };
  const secondaryTime =
    latest.ph_secondary_time === undefined
      ? latest.time
      : latest.ph_secondary_time;
  if (!Number.isFinite(secondaryTime))
    return {
      code: "unknown",
      label: "Second probe timestamp is invalid",
      detail: "Send a valid paired timestamp before comparing.",
    };
  const skew = Math.abs(secondaryTime - latest.time) / 1000;
  if (skew > (config.pairMaxSkewSeconds ?? 60))
    return {
      code: "unknown",
      label: "Probe readings are too far apart",
      detail: `Readings are ${Math.round(skew)} seconds apart. Take a fresh paired sample.`,
    };
  const delta = Math.abs(latest.ph - latest.ph_secondary),
    limit = config.pairTolerance ?? 0.3;
  return {
    code: delta > limit ? "disagree" : "agree",
    label:
      delta > limit
        ? "pH probes disagree — verify"
        : "pH probes agree within the chosen limit",
    detail: `Probe A: ${latest.ph.toFixed(1)} pH · Probe B: ${latest.ph_secondary.toFixed(1)} pH · difference ${delta.toFixed(2)}; comparison limit ${limit}. Agreement does not establish accuracy.`,
    delta,
    limit,
  };
}
export function waterAction(
  profile,
  rows,
  { now = Date.now(), connected = true, cached = false } = {},
) {
  const latest = rows.at(-1),
    pair = compareProbes(rows, profile, now);
  if (
    !connected ||
    cached ||
    !latest ||
    now - latest.time > (profile.staleMinutes || 10) * 60000
  )
    return {
      rank: 2,
      code: "unknown",
      title: "Check the data connection",
      reason: latest
        ? "Current conditions are unknown; the last readings may be old."
        : "No readings received for this water body.",
      next: "Check device power and connectivity, then confirm a new timestamp.",
      pair,
    };
  const outside = metrics
    .slice(0, 5)
    .filter((m) => assess(m, latest[m.key], profile.targets) === "attention");
  const missing = metrics
    .slice(0, 5)
    .filter((m) => !Number.isFinite(latest[m.key]));
  if (pair.code === "disagree")
    return {
      rank: 0,
      code: "verify",
      title: "Verify the pH readings first",
      reason: pair.detail,
      next: outside.length
        ? "Check both probes and take an independent measurement. Other target exceptions still need inspection."
        : "Take a fresh paired reading or compare with a reference instrument before acting.",
      pair,
      outside,
    };
  if (outside.length)
    return {
      rank: 0,
      code: "attention",
      title: "Inspect this water body",
      reason: `${outside.map((m) => m.name).join(", ")} outside the selected targets.`,
      next: "Inspect the water and verify the measurements against a fresh sample.",
      pair,
      outside,
    };
  if (missing.length)
    return {
      rank: 2,
      code: "unknown",
      title: "Check missing measurements",
      reason: `Not reported: ${missing.map((m) => m.name).join(", ")}.`,
      next: "Check the sensor connection and field mapping. A partial record is not an all-clear.",
      pair,
    };
  if (profile.sensorChecks?.ph?.comparePair && pair.code === "unknown")
    return {
      rank: 1,
      code: "verify",
      title: "Check the paired pH probes",
      reason: pair.detail,
      next: "Confirm both probes are reporting fresh samples from the same water.",
      pair,
    };
  return {
    rank: 3,
    code: "good",
    title: "Within your selected targets",
    reason:
      "The latest five water measurements are within their chosen ranges.",
    next: "Continue routine care and keep an eye on trends.",
    pair,
  };
}
export function groupAlerts(alerts) {
  const groups = new Map();
  for (const a of alerts) {
    const category = ["missing", "stale", "connection"].includes(a.kind)
        ? "data"
        : a.kind,
      key = category + ":" + a.active;
    const existing = groups.get(key);
    if (!existing) groups.set(key, { ...a, category, count: 1, members: [a] });
    else {
      existing.count++;
      existing.members.push(a);
      if (a.started > existing.started) {
        existing.id = a.id;
        existing.started = a.started;
        existing.resolved = a.resolved;
      }
    }
  }
  return [...groups.values()]
    .map((g) =>
      g.category === "data"
        ? {
            ...g,
            title: "Check sensor updates",
            detail:
              g.members.map((a) => a.title).join(" · ") +
              ". Check power, connectivity and the newest timestamp.",
            priority: "Data unavailable",
          }
        : {
            ...g,
            detail:
              g.count > 1
                ? `${g.count} recorded episodes in this period. ${g.detail}`
                : g.detail,
            priority: g.active ? "Inspect / verify" : "Recovered",
          },
    )
    .sort(
      (a, b) => Number(b.active) - Number(a.active) || b.started - a.started,
    );
}
