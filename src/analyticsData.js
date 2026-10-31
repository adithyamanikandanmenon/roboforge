import { metrics, assess, targetText } from "./pondData.js";
export function analyseRows(rows, targets) {
  return metrics.map((metric) => {
    const samples = rows.filter((r) => Number.isFinite(r[metric.key]));
    const values = samples.map((r) => r[metric.key]);
    const latest = rows.at(-1),
      previous = rows.at(-2);
    const assessed = samples.filter((r) =>
      ["good", "attention"].includes(assess(metric, r[metric.key], targets)),
    );
    return {
      ...metric,
      count: values.length,
      missing: rows.length - values.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      mean: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
      latest: Number.isFinite(latest?.[metric.key]) ? latest[metric.key] : null,
      delta:
        Number.isFinite(latest?.[metric.key]) &&
        Number.isFinite(previous?.[metric.key])
          ? latest[metric.key] - previous[metric.key]
          : null,
      within: assessed.filter(
        (r) => assess(metric, r[metric.key], targets) === "good",
      ).length,
      assessed: assessed.length,
      target: targets[metric.key]
        ? targetText(targets[metric.key])
        : "No target selected",
    };
  });
}
export function thermalDifference(row) {
  return Number.isFinite(row?.air_temperature) &&
    Number.isFinite(row?.temperature)
    ? row.air_temperature - row.temperature
    : null;
}
export function pairedSamples(rows, xKey, yKey) {
  return rows.filter(
    (r) => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey]),
  );
}
export function correlation(rows, xKey, yKey) {
  const pairs = pairedSamples(rows, xKey, yKey);
  if (pairs.length < 3) return null;
  if (pairs.every(r=>r[xKey]===pairs[0][xKey]) || pairs.every(r=>r[yKey]===pairs[0][yKey])) return null;
  const mx = pairs.reduce((n, r) => n + r[xKey], 0) / pairs.length,
    my = pairs.reduce((n, r) => n + r[yKey], 0) / pairs.length;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const r of pairs) {
    const x = r[xKey] - mx,
      y = r[yKey] - my;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  return xx > 0 && yy > 0
    ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)))
    : null;
}
export function analyticsDataset({
  profile,
  rows,
  targets,
  source,
  hours,
  now = Date.now(),
}) {
  return JSON.stringify(
    {
      generatedAt: new Date(now).toISOString(),
      source,
      waterBody: {
        id: profile.id,
        name: profile.name,
        type: profile.bodyType || "Pond",
      },
      hours,
      targets,
      statistics: analyseRows(rows, targets),
      records: rows.map((r) => ({
        packet_id: r.id,
        timestamp: new Date(r.time).toISOString(),
        ...Object.fromEntries(
          metrics.map((m) => [
            m.key,
            Number.isFinite(r[m.key]) ? r[m.key] : null,
          ]),
        ),
        ph_secondary: Number.isFinite(r.ph_secondary) ? r.ph_secondary : null,
        ph_secondary_timestamp: Number.isFinite(r.ph_secondary_time)
          ? new Date(r.ph_secondary_time).toISOString()
          : null,
        air_minus_water_c: thermalDifference(r),
      })),
    },
    null,
    2,
  );
}
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const value = (n) => (Number.isFinite(n) ? n.toFixed(2) : "Not reported");
export function analyticsReport({
  profile,
  rows,
  targets,
  source,
  hours,
  now = Date.now(),
}) {
  const stats = analyseRows(rows, targets);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>RoboForge water observation report</title>
  <style>body{font:16px system-ui;margin:40px;color:#143442}h1{color:#087b79}table{border-collapse:collapse;width:100%;margin:24px 0}td,th{border:1px solid #bacfce;padding:9px;text-align:left}small{display:block;margin:8px 0}@media print{body{margin:0}button{display:none}}</style>
  <h1>RoboForge · Water observation report</h1><h2>${escape(profile.name)}</h2><p>${escape(profile.bodyType || "Pond")} · ${escape(profile.id)}</p>
  <p>Source: <strong>${escape(source)}</strong></p><p>Generated: ${escape(new Date(now).toISOString())}<br>Window: last ${hours} hours · ${rows.length} records (maximum 500 fetched)</p>
  <p>First record: ${rows.length ? escape(new Date(rows[0].time).toISOString()) : "None"}<br>Last record: ${rows.length ? escape(new Date(rows.at(-1).time).toISOString()) : "None"}</p>
  <p>Original acquisition timestamps are retained. Historical summaries do not establish current conditions. Means and within-target counts use numeric samples only; they are not time-weighted or a safety score. Missing samples remain missing.</p>
  <table><thead><tr><th>Measurement</th><th>Latest</th><th>Min / Mean / Max</th><th>Numeric / Missing</th><th>Selected target</th><th>Within target</th></tr></thead><tbody>${stats.map((s) => `<tr><td>${escape(s.name)} (${escape(s.unit)})</td><td>${value(s.latest)}</td><td>${value(s.min)} / ${value(s.mean)} / ${value(s.max)}</td><td>${s.count} / ${s.missing}</td><td>${escape(s.target)}</td><td>${s.assessed ? `${s.within} of ${s.assessed}` : "No assessed samples"}</td></tr>`).join("")}</tbody></table>
  <p>Latest air minus water temperature: ${value(thermalDifference(rows.at(-1)))} °C.</p>
  <h2>Recorded values</h2><table><thead><tr><th>Timestamp (UTC)</th>${metrics.map((m) => `<th>${escape(m.technical || m.name)} (${escape(m.unit)})</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(new Date(r.time).toISOString())}</td>${metrics.map((m) => `<td>${value(r[m.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <p>Observation report only. This is not a laboratory test, compliance certificate or validated prediction.</p></html>`;
}
export function analyticsCSV(rows) {
  return [
    [
      "timestamp",
      ...metrics.map((m) => m.key),
      "ph_secondary",
      "ph_secondary_timestamp",
      "air_minus_water_c",
    ],
    ...rows.map((r) => [
      new Date(r.time).toISOString(),
      ...metrics.map((m) => (Number.isFinite(r[m.key]) ? r[m.key] : "")),
      Number.isFinite(r.ph_secondary) ? r.ph_secondary : "",
      Number.isFinite(r.ph_secondary_time)
        ? new Date(r.ph_secondary_time).toISOString()
        : "",
      thermalDifference(r) ?? "",
    ]),
  ]
    .map((r) => r.join(","))
    .join("\n");
}
