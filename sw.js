// ============================================================
// KUN TARTIBI - Service Worker
// Offline ishlash + Har soatda bildirishnoma
// ============================================================
const CACHE_NAME = 'kun-tartibi-v6';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// ─── INSTALL: fayllarni cache'ga saqlash ───────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// ─── ACTIVATE: eski cache'larni o'chirish ──────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  // SW yoqilganda eslatma taymerini boshlash
  startReminderTimer();
});

// ─── FETCH: offline-first strategiya ─────────────────────
self.addEventListener('fetch', event => {
  // Faqat GET so'rovlarni cache qilamiz
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Cache'da bor — darhol qaytaramiz (offline ham ishlaydi)
      if (cachedResponse) {
        // Fonda yangilash (stale-while-revalidate)
        fetch(event.request).then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkRes.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      // Cache'da yo'q — tarmoqdan olishga urinamiz
      return fetch(event.request).then(networkRes => {
        if (!networkRes || networkRes.status !== 200) return networkRes;
        const toCache = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return networkRes;
      }).catch(() => {
        // Offline va cache'da ham yo'q
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ─── PUSH: server push kelganda ko'rsatish ───────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'KUN TARTIBI';
  const options = {
    body: data.body || "Vaqtingiz qimmat! Maqsadingizga intiling.",
    icon: './icon.png',
    badge: './icon.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: self.registration.scope }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── NOTIFICATION CLICK: bildirishnomaga bosganda ────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow(event.notification.data?.url || './');
    })
  );
});

// ─── MESSAGE: sahifadan xabar qabul qilish ───────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    startReminderTimer();
  }
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    showReminder();
  }
});

// ─── ESLATMA VAQTLARI ─────────────────────────────────────
const eslatmalar = [
  "Buni qilmasang — kelajaging bo'lmaydi!",
  "Kechikmang, vaqt kutib turmaydi!",
  "Bugungi harakatingiz ertangi natijangizdir.",
  "O'zgarishni bugundan boshlang!",
  "Dangasalik — orzular qotilidir.",
  "Hech qachon taslim bo'lmang!",
  "Ertaga emas, hozir! Harakat qil!",
  "Har bir daqiqa qimmatbaho — isrof qilma!",
  "Maqsadlaringga hoziroq qadam qo'y!",
  "Eng qiyin qadamni hozir qo'y — qolganiga kuch topiladi.",
];

function getEslatma() {
  return eslatmalar[Math.floor(Math.random() * eslatmalar.length)];
}

// Soatga qarab salom
function getSalom() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '🌅 Xayrli tong!';
  if (h >= 12 && h < 17) return '☀️ Xayrli kun!';
  if (h >= 17 && h < 21) return '🌇 Xayrli kech!';
  return '🌙 Tinch tun!';
}

// Bildirishnoma ko'rsatish
async function showReminder() {
  const msg = getEslatma();
  const salom = getSalom();
  const options = {
    body: msg + "\n\nKelajagingiz uchun hoziroq harakat qiling!",
    icon: './icon.png',
    badge: './icon.png',
    vibrate: [300, 100, 300, 100, 300],
    requireInteraction: false,
    silent: false,
    tag: 'kun-tartibi-reminder',
    renotify: true,
    data: { url: self.registration.scope }
  };
  try {
    await self.registration.showNotification('⏰ ' + salom + ' — KUN TARTIBI', options);
  } catch (e) {
    console.error('[SW] Notification error:', e);
  }
}

// Har soatda eslatma — taymerni boshlash
let reminderInterval = null;
function startReminderTimer() {
  if (reminderInterval) return; // Ikki marta ishga tushmaslik

  // Keyingi soat boshlanishigacha kutish (masalan: 10:00, 11:00...)
  const now = new Date();
  const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;

  // Birinchi marta — keyingi soat boshida
  setTimeout(() => {
    showReminder();
    // Keyin har soatda
    reminderInterval = setInterval(showReminder, 60 * 60 * 1000);
  }, msToNextHour);

  console.log(`[SW] Eslatma taymer boshlandi. Keyingi: ${Math.round(msToNextHour / 60000)} daqiqadan keyin`);
}
