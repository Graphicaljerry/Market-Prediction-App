// Minimal service worker — NOTIFICATIONS ONLY.
// Deliberately has NO fetch handler, so it never intercepts or caches requests: the app's single HTML
// file always loads fresh from the network (no stale-version bugs on GitHub Pages). Its only jobs are to
// exist (which is what lets installed iOS/iPadOS PWAs show notifications) and to focus the app on tap.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// Future-proofing: if the Worker ever sends a real Web Push, render it natively (works on installed PWAs).
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Predict', {
    body: d.body || '', tag: d.tag || 'predict',
    icon: './apple-touch-icon.png', badge: './apple-touch-icon.png',
    data: { url: d.url || './eth-tracker.html' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './eth-tracker.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
