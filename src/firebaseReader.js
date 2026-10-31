export function validateSettings(settings) {
  if (!settings?.firebase || typeof settings.firebase !== "object")
    throw new Error("Add your Firebase web app configuration first.");
  if (
    settings.firebase.private_key ||
    settings.firebase.type === "service_account"
  )
    throw new Error(
      "Use the web app configuration, not a service-account key.",
    );
  for (const key of ["apiKey", "databaseURL", "projectId"])
    if (typeof settings.firebase[key] !== "string" || !settings.firebase[key])
      throw new Error(`Firebase configuration is missing ${key}.`);
  if (!/^https:\/\//.test(settings.firebase.databaseURL))
    throw new Error("The database URL must begin with https://.");
  if (
    typeof settings.path !== "string" ||
    !settings.path.replace(/^\/+|\/+$/g, "") ||
    /[.#$\[\]]/.test(settings.path)
  )
    throw new Error("Enter a valid database path for the readings.");
  return { ...settings, path: settings.path.replace(/^\/+|\/+$/g, "") };
}
export async function subscribeToPond(settings, { onData, onStatus, onError }) {
  const config = validateSettings(settings);
  const [appSDK, dbSDK] = await Promise.all([
    import("firebase/app"),
    import("firebase/database"),
  ]);
  const app = appSDK.initializeApp(
    config.firebase,
    `pond-view-${crypto.randomUUID()}`,
  );
  let db,
    unsub,
    connectionUnsub,
    timer,
    closed = false,
    hasConnected = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    unsub?.();
    connectionUnsub?.();
    if (db) dbSDK.goOffline(db);
    void appSDK.deleteApp(app);
  };
  try {
    if (config.anonymous) {
      const auth = await import("firebase/auth");
      const instance = auth.getAuth(app);
      await auth.setPersistence(instance, auth.inMemoryPersistence);
      await auth.signInAnonymously(instance);
    }
    db = dbSDK.getDatabase(app);
    onStatus("connecting");
    connectionUnsub = dbSDK.onValue(
      dbSDK.ref(db, ".info/connected"),
      (snap) => {
        if (closed) return;
        if (snap.val()) {
          hasConnected = true;
          onStatus("connected");
        } else if (hasConnected) onStatus("offline");
      },
    );
    timer = setTimeout(() => {
      if (!closed) {
        onStatus("error");
        onError(
          new Error(
            "No database response yet. Check the connection and read permissions.",
          ),
        );
      }
    }, 15000);
    const query = dbSDK.query(
      dbSDK.ref(db, config.path),
      dbSDK.orderByChild("timestamp"),
      dbSDK.limitToLast(500),
    );
    unsub = dbSDK.onValue(
      query,
      (snapshot) => {
        if (closed) return;
        clearTimeout(timer);
        onStatus("connected");
        onData(snapshot.val());
      },
      (error) => {
        if (closed) return;
        clearTimeout(timer);
        onStatus("error");
        onError(error);
      },
    );
    return close;
  } catch (error) {
    close();
    throw error;
  }
}
