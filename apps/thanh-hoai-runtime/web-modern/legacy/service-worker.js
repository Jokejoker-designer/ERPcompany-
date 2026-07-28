"use strict";

// Bump whenever shell JS/CSS changes so clients drop stale cache-first copies.
const CACHE_NAME = "thanh-hoai-shell-v15-tt-settle-live";
const APP_SHELL = [
  "/", "/index.html", "/app.css", "/app.js", "/app_write.js", "/offline.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  // JS/CSS/HTML: network-first so deploy buttons/features show without stale shell.
  const dest = request.destination;
  if (dest === "script" || dest === "style" || dest === "document"
      || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")
      || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    });
    return cached || network;
  }));
});
