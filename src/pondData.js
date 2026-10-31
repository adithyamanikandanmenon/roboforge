export const metrics = [
  {
    key: "ph",
    name: "Water balance",
    technical: "pH level",
    unit: "pH",
    min: 6.5,
    max: 8.5,
    precision: 1,
    description: "Shows how acidic or alkaline the water is.",
    meaning: "A steady pH helps keep the pond environment consistent.",
    icon: "balance",
  },
  {
    key: "temperature",
    name: "Water temperature",
    technical: "Temperature",
    unit: "°C",
    min: 24,
    max: 30,
    precision: 1,
    description: "How warm the pond water is.",
    meaning:
      "Fish respond to changes in water temperature. The right range depends on the species.",
    icon: "temperature",
  },
  {
    key: "dissolved_oxygen",
    name: "Oxygen in water",
    technical: "Dissolved oxygen",
    unit: "mg/L",
    min: 5,
    max: null,
    precision: 1,
    description: "The oxygen available in the water for fish.",
    meaning:
      "A falling reading deserves attention, even before it moves outside your selected target.",
    icon: "oxygen",
  },
  {
    key: "turbidity",
    name: "Water clarity",
    technical: "Turbidity",
    unit: "NTU",
    min: 0,
    max: 25,
    precision: 0,
    description: "How cloudy the water is. A lower number means clearer water.",
    meaning:
      "Changes can come from suspended particles, rain or activity in the pond.",
    icon: "clarity",
  },
  {
    key: "tds",
    name: "Dissolved materials",
    technical: "TDS",
    unit: "ppm",
    min: 0,
    max: 500,
    precision: 0,
    description:
      "An estimate of dissolved salts and other materials in the water.",
    meaning:
      "TDS does not identify individual substances or tell you whether the water is safe.",
    icon: "tds",
  },
  {
    key: "air_temperature",
    name: "Air temperature",
    unit: "°C",
    precision: 1,
    description: "The air temperature around the pond.",
  },
  {
    key: "aqi",
    name: "Air quality reading",
    unit: "AQI",
    precision: 0,
    description:
      "The air-quality index reported by your sensor. Interpretation depends on the index used.",
  },
  {
    key: "rainfall",
    name: "Rainfall",
    unit: "mm/h",
    precision: 1,
    description: "The rainfall rate reported near the pond.",
  },
];
export const defaultTargets = Object.fromEntries(
  metrics
    .filter((m) => m.min !== undefined)
    .map((m) => [m.key, { min: m.min, max: m.max }]),
);
export const number = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ? Number(value)
      : null;
export function timestamp(value) {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
export function normalizeReadings(data) {
  if (!data || typeof data !== "object") return [];
  const raw =
    "ph" in data || "temperature" in data || "timestamp" in data
      ? [data]
      : Object.entries(data).map(([id, row]) =>
          row && typeof row === "object" ? { ...row, id } : null,
        );
  return raw
    .filter(Boolean)
    .map((row, index) => ({
      id: row.packet_id || row.id || String(index),
      time: timestamp(row.timestamp),
      ...Object.fromEntries(metrics.map((m) => [m.key, number(row[m.key])])),
    }))
    .filter((row) => row.time !== null && row.time <= Date.now() + 300000)
    .sort((a, b) => a.time - b.time);
}
export function assess(metric, value, targets = defaultTargets) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "unknown";
  const range = targets[metric.key];
  if (!range || (range.min == null && range.max == null)) return "info";
  return (range.min !== null && value < range.min) ||
    (range.max !== null && value > range.max)
    ? "attention"
    : "good";
}
export function formatValue(value, precision = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(precision);
}
export function targetText(range) {
  if (!range || (range.min == null && range.max == null))
    return "No target set";
  if (range.max === null) return `${range.min} or more`;
  if (range.min === null || range.min === 0) return `${range.max} or less`;
  return `${range.min}–${range.max}`;
}
export function makeDemo(now = Date.now()) {
  return Array.from({ length: 97 }, (_, i) => {
    const progress = i / 96;
    return {
      id: `demo-${i}`,
      time: now - (96 - i) * 900000,
      ph: +(7.2 + 0.13 * Math.sin(i * 0.2)).toFixed(1),
      temperature: +(27.5 + 0.9 * Math.sin(i * 0.065 - 1)).toFixed(1),
      dissolved_oxygen: +(
        6.5 -
        0.8 * progress +
        0.12 * Math.sin(i * 0.15)
      ).toFixed(1),
      turbidity: Math.round(16 + 2 * Math.sin(i * 0.2)),
      tds: Math.round(320 + 9 * Math.sin(i * 0.1)),
      air_temperature: +(30.1 + 1.3 * Math.sin(i * 0.065)).toFixed(1),
      aqi: Math.round(42 + 6 * Math.sin(i * 0.1)),
      rainfall: 0,
    };
  });
}
export function summary(
  rows,
  targets = defaultTargets,
  now = Date.now(),
  staleMinutes = 10,
) {
  const latest = rows.at(-1);
  const stale = !latest || now - latest.time > staleMinutes * 60000;
  const primary = metrics.slice(0, 5);
  const unassessed = primary.filter(
    (m) => assess(m, latest?.[m.key], targets) === "info",
  );
  const missing = primary.filter(
    (m) => assess(m, latest?.[m.key], targets) === "unknown",
  );
  const alerts = primary.filter(
    (m) => assess(m, latest?.[m.key], targets) === "attention",
  );
  return {
    unassessed,
    latest,
    stale,
    missing,
    alerts,
    good:
      !!latest &&
      !stale &&
      !missing.length &&
      !alerts.length &&
      !unassessed.length,
  };
}
