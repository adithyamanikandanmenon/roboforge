export class FarmClient {
  async open(config, onSession) {
    this.config = config;
    const [app, auth, db] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/database"),
    ]);
    this.sdk = { ...app, ...auth, ...db };
    this.app = app.initializeApp(config, `farm-owner-${crypto.randomUUID()}`);
    this.auth = auth.getAuth(this.app);
    await auth.setPersistence(this.auth, auth.inMemoryPersistence);
    this.db = db.getDatabase(this.app);
    this.connected = false;
    this.offConnection = db.onValue(
      db.ref(this.db, ".info/connected"),
      (snapshot) => {
        this.connected = snapshot.val() === true;
      },
    );
    this.offAuth = auth.onIdTokenChanged(this.auth, async (user) => {
      try {
        const token = user ? await user.getIdTokenResult() : null;
        if (this.auth.currentUser?.uid !== user?.uid) return;
        this.owner = token?.claims.farm_owner === true;
        onSession({
          user: user ? { uid: user.uid, email: user.email } : null,
          isOwner: this.owner,
        });
      } catch (e) {
        this.owner = false;
        onSession({ user: null, isOwner: false, error: e.message });
      }
    });
  }
  watch(path, callback, onError) {
    const { ref, onValue } = this.sdk;
    return onValue(ref(this.db, path), (s) => callback(s.val()), onError);
  }
  async login(email, password) {
    this.sdk.goOnline(this.db);
    await this.sdk.signInWithEmailAndPassword(this.auth, email, password);
  }
  async logout() {
    await this.sdk.signOut(this.auth);
    this.owner = false;
  }
  async write(path, value) {
    return this.performWrite(() =>
      this.sdk.set(this.sdk.ref(this.db, path), value),
    );
  }
  async transaction(path, update) {
    return this.performWrite(() =>
      this.sdk.runTransaction(this.sdk.ref(this.db, path), update, {
        applyLocally: false,
      }),
    );
  }
  async performWrite(operation) {
    if (!this.owner)
      throw new Error("A verified farm owner account is required.");
    if (this.connected === false)
      throw new Error(
        "Owner database connection is offline. Nothing was submitted.",
      );
    let timeout;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Write acknowledgement timed out; outcome is unknown. Reconnect and inspect records before retrying.",
                ),
              ),
            15000,
          );
        }),
      ]);
    } catch (error) {
      this.sdk.goOffline?.(this.db);
      this.connected = false;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  async enablePush(pondId, vapidKey) {
    if (!this.owner) throw new Error("Sign in as the farm owner first.");
    if (!vapidKey)
      throw new Error(
        "Add the Firebase Web Push key in the shared configuration.",
      );
    if (typeof Notification === "undefined" || !navigator.serviceWorker)
      throw new Error("Push notifications are not supported in this browser.");
    if ((await Notification.requestPermission()) !== "granted")
      throw new Error("Notification permission was not granted.");
    const messaging = await import("firebase/messaging");
    if (!(await messaging.isSupported()))
      throw new Error("Push notifications are not supported in this browser.");
    const params = new URLSearchParams({ config: JSON.stringify(this.config) });
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${params}`,
    );
    await navigator.serviceWorker.ready;
    this.messaging = messaging.getMessaging(this.app);
    const token = await messaging.getToken(this.messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    this.tokenPath = `notification_tokens/${this.auth.currentUser.uid}/${hash}`;
    await this.write(this.tokenPath, { token, pondId, updatedAt: Date.now() });
    this.offMessage?.();
    this.offMessage = messaging.onMessage(this.messaging, (payload) => {
      if (Notification.permission === "granted")
        void registration.showNotification(
          payload.data?.title || "Pond alert",
          {
            body: payload.data?.body || "A pond reading needs attention.",
            icon: "/pond-icon.svg",
            data: {
              section: payload.data?.section,
              pondId: payload.data?.pondId,
            },
          },
        );
    });
  }
  async disablePush() {
    if (this.tokenPath) await this.write(this.tokenPath, null);
    if (this.messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(this.messaging);
    }
    this.offMessage?.();
    this.tokenPath = null;
  }
  async close() {
    this.offConnection?.();
    this.offAuth?.();
    this.offMessage?.();
    if (this.db) this.sdk.goOffline(this.db);
    if (this.app) await this.sdk.deleteApp(this.app);
  }
}
