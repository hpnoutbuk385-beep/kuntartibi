const CACHE_NAME = 'kun-tartibi-v4';
const urlsToCache = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Xabar kelganda ko'rsatish (OneSignal yoki boshqa push orqali)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'KUN TARTIBI';
  const options = {
    body: data.body || "Vaqtingiz qimmat! Maqsadingizga intiling.",
    icon: 'https://cdn-icons-png.flaticon.com/512/3050/3050357.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3050/3050357.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: self.registration.scope }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirishnomaga bosganida ilovani ochish
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow(event.notification.data.url || '/');
    })
  );
});
