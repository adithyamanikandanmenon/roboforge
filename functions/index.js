import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { currentConditions, conditionChanges } from "./policy.js";
import { shouldNotifyReminder } from "./reminderPolicy.js";
initializeApp();
// Runs independently of open website tabs. Requires deployment in the owner's project.
export const checkPonds = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "asia-southeast1",
    timeZone: "UTC",
    maxInstances: 1,
    concurrency: 1,
  },
  async () => {
    const db = getDatabase();
    const profiles = (await db.ref("pond_profiles").get()).val() || {};
    const candidates = (await db.ref("notification_tokens").get()).val() || {};
    const subscriptions = {};
    for (const [uid, items] of Object.entries(candidates)) {
      try {
        const user = await getAuth().getUser(uid);
        if (!user.disabled && user.customClaims?.farm_owner === true)
          subscriptions[uid] = items;
      } catch {
        logger.warn("Skipping unavailable notification account");
      }
    }
    async function sendToOwners(pondId, title, body, section = "alerts") {
      const recipients = [];
      for (const [uid, items] of Object.entries(subscriptions))
        for (const [hash, item] of Object.entries(items || {}))
          if (item.pondId === pondId && typeof item.token === "string")
            recipients.push({
              token: item.token,
              path: `notification_tokens/${uid}/${hash}`,
            });
      let delivered = 0,
        failed = 0;
      for (let i = 0; i < recipients.length; i += 500) {
        const chunk = recipients.slice(i, i + 500);
        const result = await getMessaging().sendEachForMulticast({
          tokens: chunk.map((r) => r.token),
          data: { title, body, pondId, section },
          webpush: { headers: { TTL: "300", Urgency: "normal" } },
        });
        delivered += result.successCount;
        failed += result.failureCount;
        await Promise.all(
          result.responses.map((response, index) =>
            [
              "messaging/registration-token-not-registered",
              "messaging/invalid-registration-token",
            ].includes(response.error?.code)
              ? db.ref(chunk[index].path).remove()
              : Promise.resolve(),
          ),
        );
      }
      return {
        delivery: recipients.length ? "attempted" : "no-subscribers",
        delivered,
        failed,
      };
    }
    for (const [pondId, profile] of Object.entries(profiles)) {
      if (!profile.path || /[.#$\[\]]/.test(profile.path)) {
        logger.warn("Skipping invalid pond path", { pondId });
        continue;
      }
      const timestampSnapshot = await db
        .ref(profile.path)
        .child("timestamp")
        .get();
      let reading;
      if (timestampSnapshot.exists())
        reading = (await db.ref(profile.path).get()).val();
      else {
        const latestSnapshot = await db
          .ref(profile.path)
          .orderByChild("timestamp")
          .limitToLast(1)
          .get();
        const raw = latestSnapshot.val();
        reading = raw ? Object.values(raw).at(-1) : null;
      }
      const current = currentConditions(reading, profile);
      let changes = [];
      const stateRef = db.ref(`server_alert_state/${pondId}`);
      const transaction = await stateRef.transaction((previous) => {
        changes = conditionChanges(previous?.conditions || {}, current);
        if (!changes.length) return;
        return { conditions: current, checkedAt: Date.now() };
      });
      if (!transaction.committed) continue;
      // Delivery is best-effort; record status and results for the project administrator.
      for (const change of changes) {
        const title = `${profile.name || pondId}: ${change.title}`.slice(
            0,
            160,
          ),
          body = change.body.slice(0, 500);
        const logRef = db.ref(`server_alert_log/${pondId}`).push();
        await logRef.set({
          ...change,
          title,
          body,
          time: Date.now(),
          delivery: "attempting",
        });
        await logRef.update(await sendToOwners(pondId, title, body));
      }
    }
    // Care tasks are independent of water conditions and have their own delivery state.
    const care = (await db.ref("care_reminders").get()).val() || {};
    for (const [pondId, items] of Object.entries(care)) {
      const profile = profiles[pondId];
      if (!profile) continue;
      for (const [id, reminder] of Object.entries(items || {})) {
        if (!shouldNotifyReminder(reminder, undefined)) continue;
        const state = db.ref(`server_reminder_state/${pondId}/${id}`);
        const claim = await state.transaction((previous) =>
          shouldNotifyReminder(reminder, previous?.dueAt)
            ? {
                dueAt: reminder.dueAt,
                attemptedAt: Date.now(),
                delivery: "attempting",
              }
            : undefined,
        );
        if (!claim.committed) continue;
        // Recheck after claiming so a task completed while this run started is skipped.
        const current = (
          await db.ref(`care_reminders/${pondId}/${id}`).get()
        ).val();
        if (
          !current ||
          current.dueAt !== reminder.dueAt ||
          !shouldNotifyReminder(current, undefined)
        ) {
          await state.update({ delivery: "superseded" });
          continue;
        }
        const title = `Care reminder · ${profile.name || pondId}`.slice(0, 160),
          body = `${reminder.kind}: ${reminder.title}`.slice(0, 500);
        await state.update(
          await sendToOwners(pondId, title, body, "reminders"),
        );
      }
    }
  },
);
