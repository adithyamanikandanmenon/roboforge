# RoboForge on Vercel

Import `adithyamanikandanmenon/roboforge`, production branch `main`. Root directory is the repository root (`./`), not `simulator`: that folder name only describes the local checkout. Vercel uses the committed Vite configuration, Node 24, pnpm 11.25.0 and `dist` build output.

`vercel.json` pins the install/build commands and keeps the service worker and public Firebase configuration fresh. Sections use query parameters (for example `/?section=analytics`), so the existing routes work directly without a catch-all rewrite. Existing static assets remain available at their original URLs.

The website frontend deploys to Vercel. The database, sensor ingestion permissions and owner authentication remain in the configured Firebase project. Web configuration in `public/pond-config.json` is public identification; never add admin/service-account credentials to it or Vercel's frontend variables.

After deployment, add the actual production hostname (without https://) to Firebase Authentication → Settings → Authorized domains if needed for owner sign-in. Authorize only the chosen production hostname rather than arbitrary preview domains. Public readings keep their existing database rules. Phone notifications still require the separate Firebase backend and Web Push configuration described in `FIREBASE_SETUP.md`.

Check the production overview, analytics, public config, service worker and owner sign-in. No sensor records means a waiting state. The existing Sites publication can remain available while the Vercel deployment is verified. Connecting the GitHub repository enables subsequent commits to trigger Vercel builds.
