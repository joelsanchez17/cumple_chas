const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://chas.test';

function worker() {
  const listeners = {}; const stores = new Map(); const fetched = [];
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  let failNetwork = false; let failCache = false; let body = 'fresh'; let status = 200; let skips = 0; let claims = 0;
  const caches = {
    async open(name) {
      if (failCache) throw Error('storage unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response); },
        async keys() { return [...store.keys()].map(url => new Request(url)); },
        async delete(request) { return store.delete(key(request)); },
        async addAll(requests) { for (const request of requests) store.set(key(request), new Response('precached')); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  class LocalRequest extends Request { constructor(url, options) { super(new URL(url, origin), options); } }
  const context = vm.createContext({ URL, Request: LocalRequest, Response, caches,
    fetch: async (request, options) => { fetched.push({ request, options }); if (failNetwork) throw Error('offline'); return new Response(body, { status }); },
    self: { location: { origin }, addEventListener(type, callback) { listeners[type] = callback; }, clients: { async claim() { claims++; } }, async skipWaiting() { skips++; } },
  });
  vm.runInContext(source('sw.js'), context);
  async function fire(type, extras = {}) { let promise; listeners[type]({ ...extras, waitUntil(value) { promise = value; } }); await promise; }
  function request(url, { method = 'GET', mode = 'cors' } = {}) {
    let promise;
    listeners.fetch({ request: { url: new URL(url, origin).href, method, mode }, respondWith(value) { promise = value; } });
    return promise;
  }
  return { context, stores, caches, fetched, fire, request,
    offline(value = true) { failNetwork = value; }, cacheFailure() { failCache = true; }, response(value, code = 200) { body = value; status = code; },
    get skips() { return skips; }, get claims() { return claims; } };
}
function ui({ agent = 'Chrome Desktop', touch = 0, standalone = false, appleStandalone = false, welcome = false, storageDenied = false, dismissed = false, secure = true, registrationFailure = false } = {}) {
  function target() { return { handlers: {}, addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, async fire(type, values = {}) { await Promise.all((this.handlers[type] || []).map(fn => fn({ preventDefault() {}, ...values }))); } }; }
  const ids = ['pwa-install', 'pwa-install-button', 'pwa-android-help', 'pwa-ios-help', 'pwa-install-status', 'welcome-dialog', 'connection-note', 'pwa-install-dismiss'];
  const elements = Object.fromEntries(ids.map(id => [id, { ...target(), hidden: true, disabled: false, textContent: '', open: false }]));
  elements['welcome-dialog'].open = welcome;
  const storage = new Map(dismissed ? [['chas:pwa-install-dismissed:v1', 'yes']] : []);
  const media = { ...target(), matches: standalone }; const calls = []; const messages = []; const warnings = [];
  const navigator = { userAgent: agent, maxTouchPoints: touch, standalone: appleStandalone, onLine: true, serviceWorker: {
    async register(...args) { calls.push(args); if (registrationFailure) throw Error('registration failed'); return { waiting: { postMessage(message) { messages.push(message); } } }; },
  } };
  const window = { ...target(), isSecureContext: secure, matchMedia: () => media, sessionStorage: {
    getItem(key) { if (storageDenied) throw Error('denied'); return storage.get(key); },
    setItem(key, value) { if (storageDenied) throw Error('denied'); storage.set(key, value); },
  } };
  vm.runInContext(source('js/pwa.js'), vm.createContext({ window, navigator, document: { getElementById: id => elements[id] }, console: { warn: (...args) => warnings.push(args) } }));
  return { elements, window, navigator, calls, messages, media, storage, warnings };
}

test('manifest identity, scope, standalone display, palette and icon dimensions are valid', () => {
  const manifest = JSON.parse(source('manifest.webmanifest'));
  assert.equal(manifest.name, 'El álbum de Chas'); assert.equal(manifest.short_name, 'Chas');
  for (const field of ['id', 'scope', 'start_url']) assert.equal(manifest[field], '/');
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.lang, 'es'); assert.ok(manifest.description);
  for (const field of ['theme_color', 'background_color']) assert.equal(manifest[field], '#fff7ec');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of [...manifest.icons, { src: '/assets/icons/apple-touch-icon-photo.png', sizes: '180x180', type: 'image/png' }]) {
    const bytes = fs.readFileSync(path.join(root, icon.src));
    assert.equal(icon.type, 'image/png'); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  const html = source('index.html');
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/); assert.match(html, /rel="apple-touch-icon"/);
});

test('every precached shell asset exists, including every local HTML script, without remote dependencies', async () => {
  const w = worker(); const shell = vm.runInContext('SHELL', w.context);
  for (const asset of shell) assert.ok(fs.existsSync(path.join(root, asset === '/' ? 'index.html' : asset)), asset);
  for (const [, script] of source('index.html').matchAll(/<script src="(js\/[^\"]+)"/g)) assert.ok(shell.includes('/' + script), script);
  assert.equal(shell.some(asset => /^https?:/.test(asset)), false);
  await w.fire('install'); assert.equal(w.skips, 0);
});

test('activation deletes obsolete app caches and preserves unrelated origin caches', async () => {
  const w = worker(); await w.fire('install'); await w.caches.open('chas-album-shell-v0'); await w.caches.open('other-app-v1');
  await w.fire('activate'); assert.equal(w.stores.has('chas-album-shell-v0'), false); assert.ok(w.stores.has('other-app-v1')); assert.equal(w.claims, 1);
});

test('only a normal-load update message activates a waiting worker', async () => {
  const w = worker(); await w.fire('message', { data: { type: 'unrelated' } }); assert.equal(w.skips, 0);
  await w.fire('message', { data: { type: 'ACTIVATE_ON_LOAD' } }); assert.equal(w.skips, 1);
});

test('Supabase reads, guest media, mutations, CDN files and unknown same-origin APIs bypass caching', () => {
  const w = worker();
  for (const url of ['https://iscxoxbxcticmnoiygus.supabase.co/rest/v1/messages', 'https://iscxoxbxcticmnoiygus.supabase.co/storage/v1/object/public/voice-messages/a.webm', 'https://iscxoxbxcticmnoiygus.supabase.co/storage/v1/object/public/guest-photos/a.jpg', 'https://cdn.jsdelivr.net/a.js', '/api/messages', '/uploads/guest.jpg', '/css/style.css?private=1']) assert.equal(w.request(url), undefined, url);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(w.request('/index.html', { method }), undefined);
  assert.equal(w.fetched.length, 0);
});

test('shell uses fresh network data and falls back to cached shell offline or on a 5xx', async () => {
  const w = worker(); await w.fire('install');
  assert.equal(await (await w.request('/css/style.css')).text(), 'fresh'); assert.equal(w.fetched[0].options.cache, 'no-cache');
  w.offline(); assert.equal(await (await w.request('/css/style.css')).text(), 'fresh');
  assert.equal(await (await w.request('/?source=home', { mode: 'navigate' })).text(), 'precached');
  w.offline(false); w.response('down', 503); assert.equal(await (await w.request('/css/style.css')).text(), 'fresh');
  w.response('new release'); assert.equal(await (await w.request('/css/style.css')).text(), 'new release');
});

test('image cache is bounded and storage failure does not break a successful network response', async () => {
  const w = worker();
  for (let n = 0; n < 25; n++) await w.request(`/assets/images/chas/photo-${n}.jpeg`);
  const cache = await w.caches.open(vm.runInContext('IMAGE_CACHE', w.context)); assert.equal((await cache.keys()).length, 21);
  w.cacheFailure(); assert.equal(await (await w.request('/css/style.css')).text(), 'fresh');
});

test('registration is secure, failures are contained and waiting updates do not reload a draft', async () => {
  const f = ui(); await f.window.fire('load'); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], '/sw.js'); assert.equal(f.calls[0][1].updateViaCache, 'none'); assert.equal(f.messages[0].type, 'ACTIVATE_ON_LOAD');
  const insecure = ui({ secure: false }); await insecure.window.fire('load'); assert.equal(insecure.calls.length, 0);
  const failed = ui({ registrationFailure: true }); await failed.window.fire('load'); assert.equal(failed.warnings.length, 1);
});

test('Android install CTA only appears with an available event after the welcome closes', async () => {
  const f = ui({ welcome: true }); await f.window.fire('load'); assert.equal(f.elements['pwa-install'].hidden, true);
  await f.window.fire('beforeinstallprompt', { prompt() {}, userChoice: Promise.resolve({ outcome: 'accepted' }) }); assert.equal(f.elements['pwa-install'].hidden, true);
  f.elements['welcome-dialog'].open = false; await f.elements['welcome-dialog'].fire('close'); assert.equal(f.elements['pwa-install'].hidden, false);
  await f.elements['pwa-install-button'].fire('click'); assert.equal(f.elements['pwa-install'].hidden, true);
});

test('installed event and both standalone signals suppress installation UI', async () => {
  for (const options of [{ standalone: true }, { appleStandalone: true }, {}]) {
    const f = ui(options); await f.window.fire('load'); await f.window.fire('beforeinstallprompt', { prompt() {} });
    if (!options.standalone && !options.appleStandalone) await f.window.fire('appinstalled');
    assert.equal(f.elements['pwa-install'].hidden, true);
  }
});

test('declined prompts are dismissed for this session; installation failures remain friendly', async () => {
  const f = ui(); await f.window.fire('load'); await f.window.fire('beforeinstallprompt', { prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }); await f.elements['pwa-install-button'].fire('click');
  assert.equal(f.elements['pwa-install'].hidden, true); assert.equal(f.storage.get('chas:pwa-install-dismissed:v1'), 'yes');
  const failed = ui(); await failed.window.fire('load'); await failed.window.fire('beforeinstallprompt', { prompt() { throw Error('technical detail'); } }); await failed.elements['pwa-install-button'].fire('click');
  assert.match(failed.elements['pwa-install-status'].textContent, /menú/); assert.doesNotMatch(failed.elements['pwa-install-status'].textContent, /technical/);
});

test('iPhone Safari and desktop-mode iPad receive dismissible instructions', async () => {
  for (const [agent, touch] of [['iPhone Version/18 Mobile Safari/604.1', 1], ['Macintosh Version/18 Safari/605.1', 5]]) {
    const f = ui({ agent, touch }); await f.window.fire('load'); assert.equal(f.elements['pwa-install'].hidden, false); assert.equal(f.elements['pwa-ios-help'].hidden, false); assert.equal(f.elements['pwa-install-button'].hidden, true);
    await f.elements['pwa-install-dismiss'].fire('click'); assert.equal(f.elements['pwa-install'].hidden, true);
  }
  for (const agent of ['Macintosh Version/18 Safari/605.1']) { const f = ui({ agent }); await f.window.fire('load'); assert.equal(f.elements['pwa-install'].hidden, true); }
});

test('saved dismissal and restricted storage do not annoy or block visitors', async () => {
  const saved = ui({ agent: 'iPhone Safari', dismissed: true }); await saved.window.fire('load'); assert.equal(saved.elements['pwa-install'].hidden, true);
  const restricted = ui({ agent: 'iPhone Safari', storageDenied: true }); await restricted.window.fire('load'); await restricted.elements['pwa-install-dismiss'].fire('click'); assert.equal(restricted.elements['pwa-install'].hidden, true);
});

test('offline notice follows connection state without any offline submission queue', async () => {
  const f = ui(); assert.equal(f.elements['connection-note'].hidden, true); f.navigator.onLine = false; await f.window.fire('offline'); assert.equal(f.elements['connection-note'].hidden, false); f.navigator.onLine = true; await f.window.fire('online'); assert.equal(f.elements['connection-note'].hidden, true);
});

test('all PWA keys have complete translations in five languages', () => {
  const context = vm.createContext({ window: {} }); vm.runInContext(source('js/translations.js'), context);
  for (const key of ['pwa.offline', 'pwa.label', 'pwa.install', 'pwa.ios', 'pwa.dismiss', 'pwa.error', 'pwa.android.button', 'pwa.android.help', 'pwa.ios.safari']) for (const locale of ['es', 'en', 'de', 'pt', 'zh-CN']) assert.ok(context.window.chasTranslations[key][locale]);
});


test('Android always offers an install action and explains the browser menu until native install is available', async () => {
  const f = ui({ agent: 'Chrome Android' }); await f.window.fire('load');
  assert.equal(f.elements['pwa-install-button'].hidden, false);
  assert.equal(f.elements['pwa-install-button'].textContent, 'Instalar en Android');
  await f.elements['pwa-install-button'].fire('click'); assert.equal(f.elements['pwa-android-help'].hidden, false);
  let prompted = false;
  await f.window.fire('beforeinstallprompt', { prompt() { prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(f.elements['pwa-android-help'].hidden, true);
  await f.elements['pwa-install-button'].fire('click'); assert.equal(prompted, true); assert.equal(f.elements['pwa-install'].hidden, true);
});

test('iPhone alternative browsers show Safari instructions without claiming automatic installation', async () => {
  for (const agent of ['iPhone CriOS/130 Mobile Safari/604.1', 'iPhone Instagram Safari/604.1']) {
    const f = ui({ agent }); await f.window.fire('load');
    assert.equal(f.elements['pwa-install'].hidden, false); assert.match(f.elements['pwa-ios-help'].textContent, /Safari/);
    assert.equal(f.elements['pwa-install-button'].hidden, true);
  }
});
