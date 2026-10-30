'use strict';

// Bump VERSION whenever changing the shell or its asset list for a release.
const VERSION = 'v3';
const PREFIX = 'chas-album-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}images-${VERSION}`;
const MAX_IMAGES = 21;
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/css/style.css',
  '/js/translations.js', '/js/i18n.js', '/js/pwa.js', '/js/photos.js',
  '/js/photo-upload.js', '/js/app.js', '/js/supabase-client.js',
  '/js/celebration.js', '/js/guest-photos.js', '/js/messages.js',
  '/js/photo-comments.js', '/js/voice-recorder.js', '/js/voice-data.js',
  '/js/voice-messages.js', '/js/party-data.js', '/js/party.js',
  '/assets/icons/favicon.svg', '/assets/icons/chas-photo-192.png',
  '/assets/icons/chas-photo-512.png', '/assets/icons/chas-photo-maskable-512.png',
  '/assets/icons/apple-touch-icon-photo.png',
];
const ESSENTIAL_IMAGES = [
  '/assets/images/chas/WhatsApp%20Image%202026-10-29%20at%2015.02.07%20(2).jpeg',
  '/assets/images/chas/chas-serious.jpeg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' })));
    const images = await caches.open(IMAGE_CACHE);
    await images.addAll(ESSENTIAL_IMAGES.map((path) => new Request(path, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && ![SHELL_CACHE, IMAGE_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_ON_LOAD') event.waitUntil(self.skipWaiting());
});

async function networkFirst(request, cacheName, key, images = false) {
  async function savedResponse() {
    try { return await (await caches.open(cacheName)).match(key); }
    catch (error) { return undefined; }
  }
  let response;
  try { response = await fetch(request, { cache: 'no-cache' }); }
  catch (error) {
    const saved = await savedResponse();
    return saved || Response.error();
  }
  // An unavailable static host may return 5xx while the shell is still useful.
  if (response.status >= 500) return (await savedResponse()) || response;
  if (response.ok && response.type !== 'opaque') {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(key, response.clone());
      if (images) {
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((old) => cache.delete(old)));
      }
    } catch (error) { /* Full/unavailable storage must not break a network response. */ }
  }
  return response;
}
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // No API, CDN, Storage, guest media, POST, PUT or other mutation interception.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
  } else if (!url.search && SHELL.includes(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE, url.pathname));
  } else if (!url.search && url.pathname.startsWith('/assets/images/chas/') && /\.jpe?g$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, IMAGE_CACHE, url.pathname, true));
  }
});
