const key = "roboforge-public-readings-v1";
export function readingCacheId(settings) {
  return settings.firebase?.projectId &&
    /^water_quality\/[A-Za-z0-9_-]+\/readings$/.test(settings.path)
    ? `${settings.firebase.projectId}:${settings.path}`
    : null;
}
export function readSavedReadings(settings, storage = localStorage) {
  try {
    const id = readingCacheId(settings),
      value = JSON.parse(storage.getItem(key) || "{}")[id];
    if (!id || !Array.isArray(value?.rows)) return null;
    return {
      ...value,
      rows: value.rows
        .filter((r) => Number.isFinite(r.time) && r.time <= Date.now() + 300000)
        .slice(-500),
    };
  } catch {
    return null;
  }
}
export function saveReadings(
  settings,
  rows,
  storage = localStorage,
  merge = false,
) {
  const id = readingCacheId(settings);
  if (!id) return false;
  try {
    const all = JSON.parse(storage.getItem(key) || "{}");
    const combined =
      merge && rows.length
        ? [
            ...new Map(
              [...(all[id]?.rows || []), ...rows].map((row) => [
                `${row.time}:${row.id || ""}`,
                row,
              ]),
            ).values(),
          ].sort((a, b) => a.time - b.time)
        : rows;
    all[id] = { rows: combined.slice(-500), savedAt: Date.now() };
    const entries = Object.entries(all)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, 12);
    storage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch {
    return false;
  }
}
export function removeSavedReadings(settings, storage = localStorage) {
  try {
    const all = JSON.parse(storage.getItem(key) || "{}");
    delete all[readingCacheId(settings)];
    storage.setItem(key, JSON.stringify(all));
  } catch {}
}
