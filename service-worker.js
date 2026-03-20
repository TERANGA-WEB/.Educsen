// service-worker.js

const CACHE_NAME = 'educsen-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/userdashboard.html',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// Installation : mise en cache des fichiers essentiels
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache ouvert');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activation immédiate
  );
});

// Activation : suppression des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle immédiatement
  );
});

// Interception des requêtes : cache d'abord, réseau ensuite
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et Firebase
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('firebase') ||
    event.request.url.includes('gstatic.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(networkResponse => {
            // Mettre en cache les nouvelles ressources statiques
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback si hors ligne et pas dans le cache
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

