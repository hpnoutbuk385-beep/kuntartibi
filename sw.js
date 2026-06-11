// ============================================================
// KUN TARTIBI - Service Worker v7
// Offline ishlash + Namoz vaqti eslatmalari + Har soatda eslatma
// ============================================================
const CACHE_NAME = 'kun-tartibi-v7';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  startReminderTimer();
});

// ─── FETCH: offline-first ─────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Fonda yangilash
        fetch(event.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200) return res;
        caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});

// ─── PUSH (server push) ───────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'KUN TARTIBI', {
      body: data.body || "Vaqtingiz qimmat!",
      icon: './icon.png',
      badge: './icon.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: self.registration.scope }
    })
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow(event.notification.data?.url || './');
    })
  );
});

// ─── MESSAGE: sahifadan xabar qabul qilish ───────────────
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    startReminderTimer();
  }

  // Namoz vaqtlarini qabul qilib eslatmalarni rejalashtirish
  if (event.data.type === 'SCHEDULE_PRAYERS') {
    schedulePrayerNotifications(event.data.prayers);
  }

  if (event.data.type === 'TEST_NOTIFICATION') {
    showReminder();
  }
});

// ══════════════════════════════════════════════════════════
// NAMOZ ESLATMALARI
// ══════════════════════════════════════════════════════════

// Namoz emojilari va xabarlari
const prayerConfig = {
  'Bomdod':      { emoji: '🌅', msg: 'Bomdod namozini o\'qish vaqti keldi! Uyg\'oning va tahorat oling.' },
  'Peshin':      { emoji: '☀️', msg: 'Peshin namozini o\'qish vaqti keldi! Ishni to\'xtating, namoz o\'qing.' },
  'Juma namozi': { emoji: '🕌', msg: 'Juma namozi vaqti keldi! Masjidga yuring.' },
  'Asr':         { emoji: '🌤️', msg: 'Asr namozini o\'qish vaqti keldi! Tahorat olib namozga turing.' },
  'Shom':        { emoji: '🌇', msg: 'Shom namozini o\'qish vaqti keldi! Kun yaqinlashmoqda.' },
  'Xufton':      { emoji: '🌙', msg: 'Xufton namozini o\'qish vaqti keldi! Kunning so\'nggi namozi.' },
};

// Aktiv namoz timeoutlarini saqlash
const prayerTimeouts = {};

function schedulePrayerNotifications(prayers) {
  // Avvalgi timeoutlarni bekor qilish
  Object.values(prayerTimeouts).forEach(id => clearTimeout(id));
  Object.keys(prayerTimeouts).forEach(k => delete prayerTimeouts[k]);

  const now = new Date();
  const nowMs = now.getTime();
  const today = now.toDateString();

  prayers.forEach(prayer => {
    const { name, time } = prayer; // time = "13:07" formatida
    const [hours, minutes] = time.split(':').map(Number);

    // Bugungi namoz vaqtini Date ga aylantirish
    const prayerDate = new Date();
    prayerDate.setHours(hours, minutes, 0, 0);
    const diff = prayerDate.getTime() - nowMs;

    // Faqat kelajakdagi namozlarni rejalashtirish (kamida 1 daqiqa keyin)
    if (diff > 60 * 1000) {
      console.log(`[SW] ${name} eslatmasi ${Math.round(diff / 60000)} daqiqadan keyin keladi (${time})`);

      prayerTimeouts[name] = setTimeout(async () => {
        const cfg = prayerConfig[name] || { emoji: '🕌', msg: 'Namoz vaqti keldi!' };
        try {
          await self.registration.showNotification(`${cfg.emoji} ${name} vaqti bo'ldi!`, {
            body: cfg.msg,
            icon: './icon.png',
            badge: './icon.png',
            vibrate: [300, 150, 300, 150, 600],
            requireInteraction: true,      // Foydalanuvchi o'chirmaguncha turadi
            silent: false,
            tag: `prayer-${name}`,
            renotify: true,
            data: { url: self.registration.scope }
          });
        } catch (e) {
          console.error('[SW] Prayer notification error:', e);
        }
      }, diff);
    } else if (diff > -5 * 60 * 1000 && diff <= 60 * 1000) {
      // Agar namoz vaqti 5 daqiqadan kamroq o'tgan bo'lsa — hoziroq eslatma
      const cfg = prayerConfig[name] || { emoji: '🕌', msg: 'Namoz vaqti keldi!' };
      self.registration.showNotification(`${cfg.emoji} ${name} vaqti bo'ldi!`, {
        body: cfg.msg + ' (endi o\'qing!)',
        icon: './icon.png',
        badge: './icon.png',
        vibrate: [300, 150, 300, 150, 600],
        requireInteraction: true,
        tag: `prayer-${name}`,
        data: { url: self.registration.scope }
      }).catch(() => {});
    }
  });
}

// ══════════════════════════════════════════════════════════
// MOTIVATSION SOATLIK ESLATMALAR
// ══════════════════════════════════════════════════════════

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
];

function getSalom() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '🌅 Xayrli tong!';
  if (h >= 12 && h < 17) return '☀️ Xayrli kun!';
  if (h >= 17 && h < 21) return '🌇 Xayrli kech!';
  return '🌙 Tinch tun!';
}

async function showReminder() {
  const msg = eslatmalar[Math.floor(Math.random() * eslatmalar.length)];
  try {
    await self.registration.showNotification('⏰ ' + getSalom() + ' — KUN TARTIBI', {
      body: msg + "\n\nKelajagingiz uchun hoziroq harakat qiling!",
      icon: './icon.png',
      badge: './icon.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      silent: false,
      tag: 'hourly-reminder',
      renotify: true,
      data: { url: self.registration.scope }
    });
  } catch (e) {
    console.error('[SW] Reminder error:', e);
  }
}

let reminderInterval = null;
function startReminderTimer() {
  if (reminderInterval) return;
  const now = new Date();
  const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;
  setTimeout(() => {
    showReminder();
    reminderInterval = setInterval(showReminder, 60 * 60 * 1000);
  }, msToNextHour);
  console.log(`[SW] Soatlik eslatma: ${Math.round(msToNextHour / 60000)} daqiqadan keyin`);
}
