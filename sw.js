/*
  Service Worker — Frise Chronologique
  Rôle : permettre l'installation de l'app (PWA) et un fonctionnement hors-ligne
  raisonnable pour la coquille de l'application (HTML/CSS/JS/icônes).
  Les tuiles de carte (OpenStreetMap / Esri) ne sont volontairement PAS mises
  en cache : elles nécessitent une connexion et sont trop nombreuses/lourdes.
*/

const CACHE_VERSION = 'frise-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

// Domaines de tuiles cartographiques à ne jamais intercepter/mettre en cache
const MAP_TILE_HOSTS = [
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll échouerait entièrement si une seule ressource externe est bloquée ;
      // on ajoute donc la coquille locale de façon groupée, puis les ressources
      // externes (police, Leaflet, Dexie) une par une, en tolérant les échecs.
      return cache.addAll(APP_SHELL).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // On ne touche jamais aux requêtes qui ne sont pas de simples lectures GET
  if (event.request.method !== 'GET') return;

  // Tuiles de carte : on laisse passer directement au réseau, sans mise en cache
  if (MAP_TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    return;
  }

  // Coquille de l'app (même origine) : cache d'abord, puis réseau en secours,
  // et on met à jour le cache silencieusement en arrière-plan
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Ressources externes (polices, Leaflet, Dexie via CDN) : stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
