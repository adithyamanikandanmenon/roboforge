# Connect the farm when your Firebase project is ready

The published website works now with example readings and a local owner demo. No Firebase project, paid plan, account, database rules or cloud functions have been provisioned. This guide is the remaining account setup, not a claim that these services are already running.

## 1. Create the project and readings source

Create a project in [Firebase Console](https://console.firebase.google.com/), add a web app and create Realtime Database. Copy the web configuration into `public/pond-config.json` under `firebase`. Keep `databaseURL`, `apiKey`, `projectId`, `authDomain` and `appId` from your web app. Never include a service-account key, password or server credential. Web app configuration is public identification; database rules enforce access.

Ask your friend to send timestamped water readings to the configured path, for example `water_quality/POND_01/readings/{unique_record_id}`. See README for the supported fields. Use one consistent timestamp type: ISO date/time strings or numeric epoch time. For a public dashboard, include only readings intended to be public. The single latest-record format is also supported, although it cannot provide historical charts without storing history.

To test in one browser first, use Data connection. To connect all visitors, update the shared config file and rebuild/publish the website. A configured database with denied reads shows an error; the site does not silently replace live failures with example data.

## 2. Enable owner sign-in and deploy rules

Enable Firebase Authentication → Email/Password. Create an owner user in the Firebase Console. Add the deployed website domain to Authentication's authorized domains where needed. There is no public sign-up button and creating a Firebase account does not automatically grant owner access.

The `farm_owner: true` custom claim is required for profile/diary/acknowledgement/token writes. Use a trusted administrator's machine with Application Default Credentials and permission to administer this project:

```sh
cd functions
npm install
node scripts/grant-owner.mjs YOUR_PROJECT_ID EXISTING_OWNER_UID
```

This script preserves existing custom claims and grants the owner role to one existing user. It is not a browser script. Sign out and back in after granting the role. The website keeps its Firebase auth session in memory; reloading requires signing in again. Passwords are never written to application storage.

Review `firebase.farm.rules.json` before deploying. It makes water readings and pond profiles public, keeps diary and acknowledgements owner-only, limits push-token access to its owner and denies client writes to server alert state. Sensor ingestion requires a trusted `sensor_writer: true` claim, a farm owner, or an Admin SDK backend. Never change all database writes to public. For an existing project, merge the rules with its other paths rather than replacing unrelated rules. These rules have not been deployed or emulator-tested against your project.

```sh
firebase login
firebase use --add
firebase deploy --only database --project YOUR_PROJECT_ID
```

Use a supported Firebase CLI from its official package. The repository includes Firebase deployment configuration but no project alias or credentials.

## 3. Save profiles and use the diary

On the website, open Owner tools and sign in. Edit and save a profile for each pond: ID, name, fish species, location, HTTPS photo URL, readings path, update timeout and the five water target ranges. Starting ranges are examples; confirm suitable limits with a farm expert. Profile changes are saved to Firebase and become visible to visitors.

Diary entries (feeding, aerator use, water change, rain, sensor check or other) are private to verified owners. Entries are append-only in the supplied rules. They are shown as dated markers alongside water trends; this illustrates timing, not proof of cause. In demo mode profiles, diary entries and seen-alert marks persist only in this browser, clearly labeled as a local demo. No physical equipment controls are exposed.

## 4. Optional background notifications

Background checks need deployed Cloud Functions and Cloud Scheduler. Firebase requires the Blaze plan to deploy Cloud Functions ([official deployment guide](https://firebase.google.com/docs/functions/get-started)). Check billing and regional availability before deployment; upgrading a plan or enabling billing is a user action, not something this task has done.

```sh
cd functions
npm install
cd ..
firebase deploy --only functions:pond-alerts --project YOUR_PROJECT_ID
```

The scheduled function checks saved pond profiles every five minutes, even when no website tab is open. It compares the newest record with targets and checks stopped updates. It sends a message on condition changes, not every unchanged reading. It uses private server state for duplicate suppression and logs delivery results under `server_alert_log`. Delivery is best-effort, not guaranteed; a server interruption between state update and delivery may lose a message. Readings-page alerts work without this backend whenever data is available.

In Project settings → Cloud Messaging → Web Push certificates, generate a key pair. Put the public key in `public/pond-config.json` as `vapidKey` and republish. Sign in as owner, select the pond, open Pond alerts and click Enable phone alerts. The button requests browser permission and registers this device for that pond. Public visitors cannot register owner alerts. A device's registration is assigned to the pond selected when enabling it; enabling on another pond replaces the assignment. Sign out through the app to remove a registration enabled in the current session. Browser support and OS notification settings affect delivery. iOS may require adding the website to the Home Screen.

The messaging service worker uses official Firebase SDK scripts and does not cache sensor responses. The web manifest supports adding the site to a phone's Home Screen. Photos are URLs rather than uploads; use an image you have permission to share and note that the image host receives visitor requests.

## Verification before relying on live alerts

- Confirm your friend's newest reading reaches the intended database path.
- Confirm public visitors can read intended pond readings but cannot change profiles or view diary entries.
- Sign in as the owner and confirm shared profile/diary writes succeed, while an account without the owner claim is denied by the database.
- Test a controlled target exception and recovery, then stop test updates to verify stale alerts.
- Register a test device and check `server_alert_log`, browser delivery and unsubscribe behavior. No real Firebase project or device has been available to test these external steps here.

References: [custom owner claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Realtime Database rules](https://firebase.google.com/docs/database/security), [Web push setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), [scheduled functions](https://firebase.google.com/docs/functions/schedule-functions).
