# RoboForge · Your pond, at a glance

The main website is a simple dashboard for pond owners and everyday visitors. It explains water balance (pH), temperature, oxygen, clarity and surrounding sensor readings. Visitors can explore history, download readings and learn what the measurements mean without seeing device logs or JSON packets.

## Dashboard and Firebase data

Firebase has not been set up for this project yet. The website therefore opens with clearly labeled example data. There are no genuine farm readings or trained predictions in this preview.

When your Firebase Realtime Database is ready, set `public/pond-config.json` with the Firebase **web app** configuration and exact readings path, then rebuild and publish. All visitors will automatically receive live updates through the SDK's `onValue` listener. The Data connection dialog lets the farm owner try configuration in one tab without changing the shared website. Neither the dashboard nor its reader writes to Firebase. Never place service-account private keys or administrative tokens in this file.

Supported data: a collection of reading objects, or one latest-reading object. Use the sensor keys below and `timestamp` as an ISO date/time string or Unix seconds/milliseconds. Missing/non-numeric sensor values remain missing; undated records are excluded. The reader queries the latest 500 records ordered by `timestamp` (keep its type consistent across the collection). Index this field in your database rules.

```json
{
  "reading_001": {
    "ph": 7.2,
    "temperature": 28.5,
    "dissolved_oxygen": 6.8,
    "turbidity": 12,
    "tds": 320,
    "air_temperature": 31.2,
    "aqi": 45,
    "rainfall": 0,
    "timestamp": "2026-10-31T10:30:00Z"
  }
}
```

Example path: `water_quality/POND_01/readings`. An existing device-specific path also works when configured explicitly. Visitors need read permission at that exact path. `firebase.public-read.rules.example.json` demonstrates public read access to **only** the chosen pond readings, with all client writes denied. It is an optional reference, not deployed by this website. Merge appropriate rules into your project; keep ingestion restricted to your trusted device/backend. Do not publish private farm data. The older simulator's per-user rules grant access only to its anonymous session, so they will not automatically make that history readable to public visitors.

Dashboard status compares measurements to **example** target ranges. These are not species-specific recommendations, fish-health guarantees or a prediction model. Adjust them in Understand the readings, or configure shared `targets` in the JSON file. Old readings (default 10 minutes, configurable), missing data, offline and permission failures are shown explicitly. Recorded changes are described as observations. Charts use the timestamps and units from the readings; history is limited to the fetched records.

The technical simulator is retained at `?view=simulator` for development and teaching. It is separate from the main visitor experience; its original documentation follows.

## Technical simulator

A functional React + Tailwind application for virtual water-quality sensors → ESP32 transmitter → wireless transport → ESP32 receiver → simulated Wi-Fi → Firebase Realtime Database.

## Run

Node 22.12+ or Node 24 and pnpm 10+:

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm preview
```

Open the printed local address and press **Start simulation**. No hardware, account or broker is required in demo mode. Use Stop/Reset, individual board controls, eight sensor inputs, interval/delay settings, packet loss and connection fault toggles to explore the pipeline. The JSON tabs show the actual outgoing and decoded packets. Export downloads the recent communication log.

## Demo and live behavior

Demo sensors create simulated values. Wireless packets are JSON strings handed asynchronously to an independent receiver after a delay; packet loss and disconnected devices cause actual transport failure. The receiver parses and validates all eight measurements before calling the storage service. Wi-Fi is a simulated gate, not access to the computer's network settings. This is a software simulation, not ESP-NOW radio emulation or a prediction model.

**Demo storage** persists up to 300 received packets in browser localStorage and is always labeled demo. Reset clears the current session counters and logs, retaining saved records. Logs retain 300 recent events; counters retain the session totals. Receiver history is available in the decoded packet log; database history retrieves records that actually reached the selected store.

**Live Firebase** uses the official modular JavaScript SDK, anonymous authentication, server timestamps and acknowledged `set()` operations. No write is counted successful until the SDK resolves. Permission and network errors appear in the Firebase log. A 10-second acknowledgement timeout reports an unknown outcome and takes the client offline: reconnect and inspect records before retrying. It never replaces a live failure with a demo success.

## Connect your Firebase project

1. Create a Firebase web app and enable Realtime Database.
2. Enable Authentication → Sign-in method → Anonymous. Add the deployed website domain to authorized domains where required.
3. Publish `firebase.database.rules.json` in Realtime Database → Rules. These rules allow each authenticated user to access only their own namespace, validate the sensor fields and allow creation but no overwrite/deletion of records.
4. Stop the transmitter, open **Connections & settings**, paste the **web app config as JSON** with `apiKey`, `authDomain`, `projectId`, `databaseURL` (and optional `appId`), then click Connect Firebase.
5. Start simulation, confirm acknowledged writes in the Firebase log, and use Retrieve stored records to query the database.

```text
users/{anonymous_uid}/water_quality/POND_01/devices/ESP32_TX_01/readings/{packet_id}
```

The extra user prefix isolates sessions. Firebase credentials and auth state are held in memory, not committed or stored in browser localStorage. Anonymous users have a new UID after refresh/reconnection; earlier live records remain in the database and can be inspected by the project owner in the Firebase Console. A durable multi-session user history would require persistent sign-in. The web config is public app identification; never paste a service-account key. Deploy authentication and database rules before using live mode. No real Firebase project was supplied during development, so actual project integration must be verified with your configuration.

Firebase references: [Web setup](https://firebase.google.com/docs/database/web/start), [reads and acknowledged writes](https://firebase.google.com/docs/database/web/read-and-write), [anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth).

## Optional MQTT over WebSockets

Stop the transmitter and configure a secure `wss://` broker and a unique topic in Connections & settings. MQTT.js subscribes before transmission. Outbound JSON is published and delivered to the receiver only when the broker echoes the same packet ID through the subscribed topic. An unacknowledged receive times out. The simulated latency/loss controls apply only to default simulated transport. A public broker can expose payloads to other subscribers; use test data and your own broker for private sessions. Broker authentication is not implemented in this initial version. No external broker is contacted by default.

## Modules

- `sensorSimulator.js`: eight sensor definitions, generation and validation
- `transmitter.js`: packet creation, interval and lifecycle
- `wirelessTransport.js`: delayed handoff/loss and optional MQTT transport
- `receiver.js`: decode, validation and gateway ownership
- `firebaseService.js`: real SDK connection/read/write and demo storage
- `packetMonitor.js`: event stream and bounded log
- `main.jsx`: interactive UI and simulation controls

`pnpm test` exercises asynchronous packet integrity, loss, offline receiver, Wi-Fi/cloud failures and recovery, invalid data, cancellation, demo persistence, Firebase acknowledgement ordering and permission errors. Firebase SDK tests use a mock; a real project/broker is required for external end-to-end checks.
