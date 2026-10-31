const STORAGE_KEY = "roboforge-demo-records-v1";
export class FirebaseService {
  constructor(getConfig) {
    this.getConfig = getConfig;
    this.mode = "demo";
    this.uid = null;
    this.connected = false;
    this.records = [];
    try {
      this.records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(this.records)) this.records = [];
    } catch {
      this.records = [];
    }
  }
  async connect(config) {
    if (config.private_key || config.type === "service_account")
      throw new Error(
        "Use Firebase web app configuration, never a service account",
      );
    for (const key of ["apiKey", "authDomain", "projectId", "databaseURL"])
      if (!config[key]) throw new Error(`Missing ${key}`);
    if (!/^https:\/\//.test(config.databaseURL))
      throw new Error("databaseURL must use HTTPS");
    await this.disconnect();
    const [app, auth, db] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/database"),
    ]);
    this.sdk = { ...app, ...auth, ...db };
    this.app = app.initializeApp(config, `roboforge-${crypto.randomUUID()}`);
    this.auth = auth.getAuth(this.app);
    await auth.setPersistence(this.auth, auth.inMemoryPersistence);
    try {
      const credential = await auth.signInAnonymously(this.auth);
      this.uid = credential.user.uid;
      this.db = db.getDatabase(this.app);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Firebase database connection timed out")),
          10000,
        );
        this.unsub = db.onValue(
          db.ref(this.db, ".info/connected"),
          (snap) => {
            this.connected = snap.val() === true;
            if (this.connected) {
              clearTimeout(timer);
              resolve();
            }
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
      this.mode = "live";
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  async disconnect() {
    this.unsub?.();
    this.unsub = null;
    if (this.db) this.sdk.goOffline(this.db);
    if (this.app) await this.sdk.deleteApp(this.app);
    this.app = null;
    this.db = null;
    this.uid = null;
    this.connected = false;
    this.mode = "demo";
  }
  async upload(packet) {
    if (!this.getConfig().cloud)
      throw new Error("Firebase link disconnected by simulation");
    const path = `water_quality/${packet.pond_id}/devices/${packet.device_id}/readings/${packet.packet_id}`;
    if (this.mode === "demo") {
      const record = {
        ...packet,
        stored_at: new Date().toISOString(),
        demo: true,
      };
      this.records = [record, ...this.records].slice(0, 300);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
      return { demo: true, path };
    }
    if (!this.connected)
      throw new Error("Firebase is offline; write not queued");
    const write = this.sdk.set(
      this.sdk.ref(this.db, `users/${this.uid}/${path}`),
      { ...packet, stored_at: this.sdk.serverTimestamp() },
    );
    let timer;
    try {
      await Promise.race([
        write,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Write acknowledgement timed out; outcome unknown. Check Firebase records.",
                ),
              ),
            10000,
          );
        }),
      ]);
      return { demo: false, path: `users/${this.uid}/${path}` };
    } catch (error) {
      this.sdk.goOffline(this.db);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async retrieve(pondId) {
    if (this.mode === "demo")
      return this.records.filter((r) => r.pond_id === pondId);
    if (!this.connected) throw new Error("Firebase disconnected");
    const { ref, query, orderByChild, limitToLast, get } = this.sdk;
    const snapshot = await get(
      query(
        ref(
          this.db,
          `users/${this.uid}/water_quality/${pondId}/devices/ESP32_TX_01/readings`,
        ),
        orderByChild("timestamp"),
        limitToLast(100),
      ),
    );
    return Object.values(snapshot.val() || {}).sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
  }
}
