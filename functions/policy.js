export const fields = [
  "ph",
  "temperature",
  "dissolved_oxygen",
  "turbidity",
  "tds",
];
export function currentConditions(reading, profile, now = Date.now()) {
  const raw = reading?.timestamp;
  const time =
    typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
  const timeout = (profile.staleMinutes || 10) * 60000;
  if (
    !reading ||
    !Number.isFinite(time) ||
    now - time > timeout ||
    time > now + 300000
  )
    return {
      stale: {
        title: "Sensor updates stopped",
        body: "No fresh reading. Check power, Wi-Fi and the sensor connection.",
      },
    };
  const result = {};
  for (const field of fields) {
    const rawValue = reading[field],
      value =
        typeof rawValue === "number"
          ? rawValue
          : typeof rawValue === "string" && rawValue.trim()
            ? Number(rawValue)
            : NaN;
    const range = profile.targets?.[field];
    if (!Number.isFinite(value))
      result[field] = {
        title: `Missing ${field.replaceAll("_", " ")}`,
        body: "The latest record has no valid number for this sensor.",
      };
    else if (
      range &&
      ((range.min != null && value < range.min) ||
        (range.max != null && value > range.max))
    )
      result[field] = {
        title: `Check ${field.replaceAll("_", " ")}`,
        body: `Latest reading: ${value}. Outside the pond owner’s selected target. Verify the sensor and pond conditions.`,
      };
  }
  return result;
}
export function conditionChanges(previous = {}, current = {}) {
  const changed = [];
  for (const key of Object.keys(current))
    if (!previous[key]) changed.push({ key, active: true, ...current[key] });
  for (const key of Object.keys(previous))
    if (!current[key] && (!current.stale || key === "stale"))
      changed.push({
        key,
        active: false,
        title: `${key.replaceAll("_", " ")} update`,
        body: "The previous exception is no longer present in the latest available reading.",
      });
  return changed;
}
