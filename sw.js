/* Horizons — service worker : l'application s'ouvre et fonctionne hors connexion. */
"use strict";

var VERSION = "horizons-1.1.0";
var CORE = [
  "./", "./index.html", "./app.css", "./manifest.webmanifest",
  "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png",
  "./fonts/inter-latin.woff2", "./fonts/inter-latin-ext.woff2",
  "./js/main.js", "./js/util.js", "./js/dates.js", "./js/store.js", "./js/items.js", "./js/md.js",
  "./js/ui.js", "./js/dnd.js", "./js/render.js", "./js/sheet-item.js",
  "./js/views/horizons.js", "./js/views/board.js", "./js/views/calendar.js",
  "./js/views/climbs.js", "./js/views/progress.js", "./js/views/search.js", "./js/views/life.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  if (url.origin !== self.location.origin) return;

  /* La page et le code : réseau d'abord, pour recevoir les mises à jour ;
     cache en secours, pour fonctionner sans connexion. */
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var c = r.clone(); caches.open(VERSION).then(function (cc) { cc.put(req.mode === "navigate" ? "./index.html" : req, c); }); }
      return r;
    }).catch(function () {
      return caches.match(req.mode === "navigate" ? "./index.html" : req, { ignoreSearch: true }).then(function (m) { return m || caches.match("./"); });
    })
  );
});

/* Toucher un rappel ramène sur l'application plutôt que d'ouvrir un doublon. */
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) return list[i].focus();
    if (self.clients.openWindow) return self.clients.openWindow("./");
  }));
});
