import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { currentConditions, conditionChanges } from "./policy.js";
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
            data: { title, body, pondId },
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
        await logRef.update({
          delivery: recipients.length ? "attempted" : "no-subscribers",
          delivered,
          failed,
        });
      }
    }
  },
);
