// VALENTIS Cut - Service Worker
// Version: 3.0.0
// Cache Strategy: Cache First, Network Fallback

const CACHE_NAME = 'valentis-cut-v3';
const STATIC_CACHE = 'valentis-static-v3';
const DYNAMIC_CACHE = 'valentis-dynamic-v3';
const IMAGE_CACHE = 'valentis-images-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/fonts/inter-var.woff2'
];

// Install Event - Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VALENTIS Cut Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('valentis-') && 
                     !name.includes(CACHE_NAME);
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch Event - Cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Strategy for static assets (HTML, CSS, JS, JSON)
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy for images
  if (isImage(request)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Strategy for API calls (network first)
  if (isAPI(request)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Strategy for video/audio files (network first with cache fallback)
  if (isMedia(request)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Default: Stale while revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// Helper functions
function isStaticAsset(request) {
  const staticExtensions = ['.html', '.css', '.js', '.json', '.woff', '.woff2'];
  return staticExtensions.some(ext => request.url.includes(ext));
}

function isImage(request) {
  return request.destination === 'image' || 
         /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(request.url);
}

function isAPI(request) {
  return request.url.includes('/api/') || 
         request.url.includes('/ai/') ||
         request.url.includes('/ffmpeg/');
}

function isMedia(request) {
  return request.destination === 'video' || 
         request.destination === 'audio' ||
         /\.(mp4|webm|ogg|mp3|wav|m4a)$/i.test(request.url);
}

// Cache strategies
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    // Return offline fallback if available
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    throw error;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache...');
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.error('[SW] Stale while revalidate failed:', error);
      throw error;
    });

  return cached || fetchPromise;
}

// Background Sync for offline exports
self.addEventListener('sync', (event) => {
  if (event.tag === 'export-video') {
    event.waitUntil(processPendingExports());
  }
});

async function processPendingExports() {
  console.log('[SW] Processing pending exports...');
  // Implementation for background export processing
  const db = await openDB('valentis-exports', 1);
  const pending = await db.getAll('pending');
  
  for (const exportJob of pending) {
    try {
      // Process export
      await processExport(exportJob);
      await db.delete('pending', exportJob.id);
      
      // Notify user
      self.registration.showNotification('Export Complete', {
        body: `Your video "${exportJob.title}" has been exported!`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: `export-${exportJob.id}`
      });
    } catch (error) {
      console.error('[SW] Export failed:', error);
    }
  }
}

// Push Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    image: data.image,
    tag: data.tag,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { notification } = event;
  const action = event.action;
  
  if (action === 'open') {
    event.waitUntil(
      clients.openWindow(notification.data.url || '/')
    );
  } else if (action === 'dismiss') {
    // Just close
  } else {
    // Default click behavior
    event.waitUntil(
      clients.openWindow(notification.data.url || '/')
    );
  }
});

// Message handler from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_ASSETS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE)
        .then(cache => cache.addAll(event.data.assets))
    );
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(names => 
        Promise.all(names.map(name => caches.delete(name)))
      )
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-assets') {
    event.waitUntil(updateAssets());
  }
});

async function updateAssets() {
  console.log('[SW] Periodic sync: Updating assets...');
  // Check for new versions of static assets
  const cache = await caches.open(STATIC_CACHE);
  // Implementation for checking updates
}

// Error handling
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});