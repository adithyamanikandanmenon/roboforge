import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const [projectId, uid] = process.argv.slice(2);
if (!projectId || !uid)
  throw new Error(
    "Usage: node scripts/grant-owner.mjs YOUR_PROJECT_ID EXISTING_USER_UID",
  );
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(),
  user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, {
  ...(user.customClaims || {}),
  farm_owner: true,
});
console.log("Owner role granted. Sign out and back in to refresh the session.");
