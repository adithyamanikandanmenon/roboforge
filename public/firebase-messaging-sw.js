/* Public web app configuration only. Never put administrative credentials here. */
const configText = new URL(self.location.href).searchParams.get("config");
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(self.location.origin + "/?section=alerts"),
  );
});
if (configText) {
  importScripts(
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
  );
  importScripts(
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js",
  );
  firebase.initializeApp(JSON.parse(configText));
  firebase
    .messaging()
    .onBackgroundMessage((payload) =>
      self.registration.showNotification(payload.data?.title || "Pond alert", {
        body: payload.data?.body || "A pond reading needs attention.",
        icon: "/pond-icon.svg",
      }),
    );
}
/* No response caching: stale data must never be presented as a fresh update. */
