// 대치파파 서비스워커 — 설치 가능 판정 + 기본 셸 캐시
const CACHE = "daechipapa-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // API 는 항상 네트워크
  if (new URL(request.url).pathname.startsWith("/api/")) return;
  // 정적: 네트워크 우선, 실패 시 캐시
  e.respondWith(
    fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(request))
  );
});
