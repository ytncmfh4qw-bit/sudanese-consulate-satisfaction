/*
  عامل الخدمة الخاص بمنصة قياس رضا المواطن السوداني
  يوفر تخزيناً مؤقتاً للملفات الأساسية عند توفر HTTPS.
*/

const CACHE_NAME = "sudanese-consulate-satisfaction-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./style.css",
  "./app.js",
  "./admin.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return cachedResponse || fetch(request).catch(() => caches.match("./index.html"));
    })
  );
});
