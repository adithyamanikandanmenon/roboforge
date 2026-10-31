export const reminderKinds = ["Feeding", "Cleaning", "Sensor check", "Other"];
export const repeatIntervals = { none: 0, daily: 86400000, weekly: 604800000 };
export function reminderStatus(reminder, now = Date.now()) {
  if (reminder.archivedAt) return "archived";
  if (reminder.completedAt) return "completed";
  if (!Number.isFinite(reminder.dueAt)) return "invalid";
  return reminder.dueAt <= now ? "due" : "upcoming";
}
export function completeReminder(reminder, now = Date.now()) {
  if (
    !Number.isFinite(reminder.dueAt) ||
    !Object.hasOwn(repeatIntervals, reminder.repeat)
  )
    throw new Error("This reminder needs a valid time and repeat setting.");
  if (reminder.archivedAt || reminder.completedAt) return reminder;
  const interval = repeatIntervals[reminder.repeat];
  return interval
    ? {
        ...reminder,
        dueAt:
          reminder.dueAt +
          Math.max(1, Math.floor((now - reminder.dueAt) / interval) + 1) *
            interval,
        lastCompletedAt: now,
        updatedAt: now,
      }
    : { ...reminder, completedAt: now, lastCompletedAt: now, updatedAt: now };
}
export function shouldNotifyReminder(
  reminder,
  lastNotifiedDueAt,
  now = Date.now(),
) {
  return (
    reminderStatus(reminder, now) === "due" &&
    lastNotifiedDueAt !== reminder.dueAt
  );
}
