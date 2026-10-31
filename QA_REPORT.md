# Dashboard verification — 31 October 2026

## Action centre follow-up

Added priorities across water bodies, paired pH probe explanations, grouped alerts, four-step setup and a public offline cache. Browser-tested the empty live-data priority, owner gate, complete local example setup (including a unique destination and required target review), and the labelled probe-disagreement illustration. Automated coverage is now 39 passing tests, including cache isolation, stale and mismatched probe timestamps, alert grouping, and simulated offline navigation. Offline navigation is tested in a worker simulation; real-device offline and hardware ingestion remain unverified. See `FEATURES_ACTION_CENTER.md` for limits and data format.

The navy, teal and aqua theme was checked in the in-app browser on desktop (1280 × 900) and phone (390 × 844) layouts. Colours are paired with condition words. The main text, primary buttons, navigation, badges and hero text were spot-checked for contrast; the checked foreground/background pairs exceeded 4.5:1 after darkening the hero gradient. This is a focused check, not a complete accessibility or cross-browser audit.

## Browser checks

| Area | Result |
| --- | --- |
| All nine main pages | Navigation opens the expected page; no horizontal page overflow at the tested phone width. |
| Water bodies | Invalid IDs rejected; added a demo tank with its own readings path. Switching between pond, lake and tank keeps private tasks and sensor records separate. |
| History | Six-hour filtering produced 24 sample records; changing the chart to pH updated its accessible description. Downloaded CSV had the expected header and 24 data rows. |
| Sensor confidence | Check/calibration dates persisted in the local demo. Lowering a demo jump limit flagged a +1 NTU change and explained that it may be a water change or sensor issue. Other water bodies retained their own records. |
| Care reminders | Created an overdue task, snoozed it, completed a one-time task, advanced an overdue weekly task to its next future occurrence, and archived it. Completed/archived filters showed the retained records. |
| Water-quality alerts | Changing a demo pH target generated an active exception. Mark seen disabled the acknowledgement button without resolving the condition. Restored the original target afterward. |
| Activity diary | Dated entry saved at the chosen noon timestamp after the date-input fix. |
| Daily report | Download identified example data and included the saved diary entry. |
| Large-screen view | Five large water measurements, explicit target/unknown status words, sensor-jump warning and water-body selection. Target exception displayed “Outside target — check”. Full-screen enter/leave controls changed their labels in the available browser. Phone layout had no horizontal overflow. |
| Connection dialog | Escape dismissed the dialog. |
| Live Firebase | Connected to the configured database and showed missing readings honestly. Deliberately attempting an unsigned read of the private care path showed a permission error and dashes, with no example-data fallback. Restored the public readings path afterward. |
| Fresh startup | No example banner or simulated values while the live configuration loads. |
| Public access | Private care and diary controls remain behind owner access. Local owner demo is explicitly labeled. |
| Technical simulator | Start generated and transmitted packets; the receiver acknowledged local demo storage; Stop returned the simulation to idle. |
| Browser console | No errors during the normal dashboard flows checked before the deliberate permission-denial test. |

All browser test records were created in local example storage. No fabricated readings or test tasks were inserted into the live Firebase database.

## Automated checks

- `node --test tests/*.test.js`: **31 passed, 0 failed**.
- Production build: **passed**.
- Git whitespace/diff check: **passed**.

## Fixes found during this pass

1. The dashboard previously started with sample readings before fetching its live configuration. It now starts empty, waits for configuration, and reports loading failures instead of silently retaining example values.
2. The diary date picker could submit the previous value or current time. The form now captures date input events and reads the submitted date directly; a backdated entry was verified in the browser.

## Verification limits

Verified-owner Firebase writes still require completing the real owner account and its role. Phone/background notifications require the optional deployed Firebase backend, Web Push key and a registered device; those services are not enabled on the current Spark project. No new billing service was activated. The real hardware-to-Firebase sensor stream and delivery to a physical phone were not tested. Automated tests cover offline, stale and missing readings, transport failures and write acknowledgement, but do not replace an end-to-end test with real equipment.
