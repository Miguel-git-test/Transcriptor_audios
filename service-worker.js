const CACHE_NAME = 'transcriptor-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/worker.js',
  './manifest.json',
  './icon.svg'
];

// Instalar el Service Worker y almacenar en caché los archivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Interceptar las peticiones de red
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a HuggingFace CDN si queremos que lo gestione Transformers.js
  // (La librería de transformers.js usa su propio sistema de Cache, por lo que esto es ideal)
  if (event.request.url.includes('huggingface') || event.request.url.includes('jsdelivr')) {
    return; // Dejar que Transformers.js cachee los modelos por su cuenta
  }

  // Estrategia: Cache First, fallback a Red
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Encontrado en caché
        }
        return fetch(event.request).then(
          (response) => {
            // Comprobar si la respuesta es válida
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar respuesta y guardar en caché
            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});
