const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function helpers() {
  const window = {};
  const errors = [];
  const context = vm.createContext({ window, crypto: webcrypto, console: { error: (...args) => errors.push(args) } });
  vm.runInContext(source('js/voice-recorder.js'), context);
  vm.runInContext(source('js/voice-data.js'), context);
  return { tools: window.chasVoiceData, recording: window.chasVoiceRecorder, errors };
}
const blob = (type = 'audio/webm', size = 1000) => ({ type, size });
const identity = { name: ' Amiga ', anonymous: false };
const draft = () => ({ blob: blob(), durationSeconds: 8, path: null, blocked: false });

test('MIME selection respects browser support order and supports a genuine browser-default fallback', () => {
  const { recording } = helpers();
  assert.equal(recording.selectMimeType({ isTypeSupported: (type) => type === 'audio/mp4' }), 'audio/mp4');
  assert.equal(recording.selectMimeType({ isTypeSupported: (type) => type.startsWith('audio/webm') }), 'audio/webm;codecs=opus');
  assert.equal(recording.selectMimeType({ isTypeSupported: () => false }), null);
  assert.equal(recording.selectMimeType({}), null);
  for (const [type, ext] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg'], ['audio/mpeg', 'mp3']]) assert.equal(recording.extensionFor(type), ext);
  assert.equal(recording.extensionFor('video/mp4'), null);
});

test('audio size, MIME, and integer duration validation rejects invalid drafts before any upload', async () => {
  const { tools } = helpers();
  for (const duration of [0, -1, 121, 1.5, NaN, null]) assert.throws(() => tools.validateDuration(duration), /entre 1 segundo/);
  assert.equal(tools.validateDuration(120), 120);
  assert.equal(tools.validateDuration(1), 1);
  assert.throws(() => tools.validateBlob(blob('audio/webm', 0)), /vacío/);
  assert.throws(() => tools.validateBlob(blob('audio/webm', tools.MAX_BYTES + 1)), /10 MB/);
  assert.throws(() => tools.validateBlob(blob('video/mp4')), /formato/);
  assert.equal(tools.validateBlob(blob('audio/mp4', tools.MAX_BYTES)).size, tools.MAX_BYTES);
  let writes = 0;
  await assert.rejects(tools.publish({ ...draft(), durationSeconds: 121 }, identity, { upload() { writes++; } }), /2 minutos/);
  assert.equal(writes, 0);
});

test('named and anonymous audio payloads normalize author and include only the metadata schema', () => {
  const { tools } = helpers();
  assert.deepEqual(plain(tools.createPayload({ path: 'uploads/a.webm', name: 'Do not send', anonymous: true, durationSeconds: 8 })), {
    storage_path: 'uploads/a.webm', name: null, is_anonymous: true, duration_seconds: 8,
  });
  assert.deepEqual(plain(tools.createPayload({ path: 'uploads/a.m4a', name: ' Amiga ', anonymous: false, durationSeconds: 1 })), {
    storage_path: 'uploads/a.m4a', name: 'Amiga', is_anonymous: false, duration_seconds: 1,
  });
  assert.throws(() => tools.createPayload({ path: 'x', name: ' ', anonymous: false, durationSeconds: 1 }), /Escribe tu nombre/);
  assert.throws(() => tools.createPayload({ path: 'x', name: 'a'.repeat(51), anonymous: false, durationSeconds: 1 }), /50 caracteres/);
});

test('Storage paths use random UUIDs, correct extensions, and no author/timestamp', () => {
  const { tools } = helpers();
  assert.match(tools.storagePath('audio/webm'), /^uploads\/[a-f0-9-]{36}\.webm$/);
  assert.notEqual(tools.storagePath('audio/webm'), tools.storagePath('audio/webm'));
  assert.equal(tools.storagePath('audio/mp4', 'uuid'), 'uploads/uuid.m4a');
  assert.equal(tools.storagePath('audio/ogg;codecs=opus', 'uuid'), 'uploads/uuid.ogg');
  assert.equal(tools.formatDuration(120), '2:00');
});

test('publishing uploads first, then inserts exactly the correct audio metadata', async () => {
  const { tools } = helpers(); const order = []; const stages = []; const item = draft();
  const payload = await tools.publish(item, identity, {
    async upload(path, audio) { order.push('upload'); assert.equal(path, item.path); assert.equal(audio, item.blob); },
    async create(row) { order.push('insert'); assert.equal(row.storage_path, item.path); },
  }, (stage) => stages.push(stage));
  assert.deepEqual(order, ['upload', 'insert']);
  assert.deepEqual(stages, ['uploading', 'registering']);
  assert.deepEqual(plain(payload), { storage_path: item.path, name: 'Amiga', is_anonymous: false, duration_seconds: 8 });
});

test('Storage failure never inserts metadata and retry retains the same object path', async () => {
  const { tools } = helpers(); const item = draft(); const paths = []; let inserts = 0;
  const api = { async upload(path) { paths.push(path); throw new Error('Offline'); }, async create() { inserts++; } };
  await assert.rejects(tools.publish(item, identity, api), /No pudimos subir/);
  await assert.rejects(tools.publish(item, identity, api), /No pudimos subir/);
  assert.equal(inserts, 0);
  assert.equal(paths[0], paths[1]);
});

test('metadata failure logs orphan path, forbids another send and never deletes or overwrites', async () => {
  const { tools, errors } = helpers(); const item = draft(); let uploads = 0;
  const api = { async upload() { uploads++; }, async create() { throw new Error('Rejected'); } };
  await assert.rejects(tools.publish(item, identity, api), /necesita revisión/);
  assert.equal(item.blocked, true);
  assert.equal(errors[0][1].storage_path, item.path);
  await assert.rejects(tools.publish(item, identity, api), /revisión/);
  assert.equal(uploads, 1);
});

test('a conflict after a lost Storage response blocks duplicate upload attempts', async () => {
  const { tools } = helpers(); const item = draft();
  await assert.rejects(tools.publish(item, identity, { async upload() { throw { statusCode: '409' }; } }), /revisión/);
  assert.equal(item.blocked, true);
});

function recorderFixture({ supported = () => true, actualType = 'audio/webm', permissionError = null } = {}) {
  const { recording } = helpers();
  let time = 0; let stoppedTracks = 0; let stopCalls = 0; let instance;
  const timers = new Map(); let nextTimer = 0; const ready = []; const errors = []; const states = [];
  class Recorder {
    static isTypeSupported(type) { return supported(type); }
    constructor(stream, options) { this.mimeType = options?.mimeType || actualType; this.state = 'inactive'; this.options = options; instance = this; }
    start() { this.state = 'recording'; this.onstart(); }
    stop() { stopCalls++; this.state = 'inactive'; this.ondataavailable({ data: new Blob(['recording'], { type: this.mimeType }) }); this.onstop(); }
  }
  const env = { isSecureContext: true, MediaRecorder: Recorder, Blob,
    navigator: { mediaDevices: { async getUserMedia() { if (permissionError) throw permissionError; return { getTracks: () => [{ stop() { stoppedTracks++; } }] }; } } },
    performance: { now: () => time }, setInterval: () => 0, clearInterval() {},
    setTimeout(fn, delay) { timers.set(++nextTimer, { fn, at: time + delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
  };
  const recorder = recording.createRecorder({ onState: (state) => states.push(state), onReady: (item) => ready.push(item), onError: (error, message) => errors.push({ error, message }) }, env);
  return { recorder, env, ready, errors, states, setTime(value) { time = value; }, expire(value) { time = value; [...timers.values()].forEach((timer) => { if (timer.at <= time) timer.fn(); }); }, get instance() { return instance; }, get stoppedTracks() { return stoppedTracks; }, get stopCalls() { return stopCalls; } };
}

test('MediaRecorder local result uses actual MIME, releases mic and never uploads on stop', async () => {
  const f = recorderFixture({ supported: () => false, actualType: 'audio/mp4' });
  await f.recorder.start(); f.setTime(2100); f.recorder.stop();
  assert.equal(f.ready.length, 1);
  assert.equal(f.ready[0].blob.type, 'audio/mp4');
  assert.equal(f.ready[0].durationSeconds, 3);
  assert.equal(f.instance.options, undefined);
  assert.equal(f.stoppedTracks, 1);
  assert.equal(f.recorder.phase, 'idle');
});

test('automatic stop caps recording at two minutes and rejects delayed overlong clips', async () => {
  const f = recorderFixture(); await f.recorder.start(); f.expire(120000);
  assert.equal(f.stopCalls, 1);
  assert.equal(f.ready[0].durationSeconds, 120);
  assert.equal(f.ready[0].limitReached, true);
  const delayed = recorderFixture(); await delayed.recorder.start(); delayed.expire(125000);
  assert.equal(delayed.ready.length, 0);
  assert.match(delayed.errors[0].message, /no pudo detener/);
});

test('too-short recordings, rejected MIME and recorder errors never become ready drafts', async () => {
  const short = recorderFixture(); await short.recorder.start(); short.setTime(300); short.recorder.stop();
  assert.match(short.errors[0].message, /al menos un segundo/);
  const format = recorderFixture({ supported: () => false, actualType: 'video/mp4' }); await format.recorder.start(); format.setTime(2000); format.recorder.stop();
  assert.equal(format.ready.length, 0);
  assert.match(format.errors[0].message, /formato/);
  const failure = recorderFixture(); await failure.recorder.start(); failure.instance.onerror({ error: new Error('Internal failure') });
  assert.equal(failure.ready.length, 0);
  assert.equal(failure.stoppedTracks, 1);
});

test('permissions, missing microphone, insecure context and unsupported browsers give friendly fallbacks', async () => {
  const { recording } = helpers();
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'UnknownError']) {
    const f = recorderFixture({ permissionError: { name, message: 'Raw technical error' } }); await f.recorder.start();
    assert.equal(f.recorder.phase, 'idle');
    assert.equal(f.ready.length, 0);
    assert.doesNotMatch(f.errors[0].message, /Raw technical error/);
  }
  assert.match(recording.availability({ isSecureContext: false }), /HTTPS/);
  assert.match(recording.availability({ isSecureContext: true }), /notita/);
});

test('cancelled permission requests release late microphone streams without recording', async () => {
  let resolve; let stopped = 0;
  const f = recorderFixture(); f.env.navigator.mediaDevices.getUserMedia = () => new Promise((done) => { resolve = done; });
  const pending = f.recorder.start(); f.recorder.cancel();
  resolve({ getTracks: () => [{ stop() { stopped++; } }] }); await pending;
  assert.equal(stopped, 1); assert.equal(f.ready.length, 0); assert.equal(f.instance, undefined);
});

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.events = {}; this.dataset = {}; this.attrs = {}; this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  async fire(type, extra = {}) { await Promise.all((this.events[type] || []).map((fn) => fn({ preventDefault() {}, ...extra }))); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  querySelectorAll(tag) { return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
  pause() { this.paused = true; }
  load() {}
  focus() { this.focused = true; }
  scrollIntoView() {}
}
function uiFixture({ read = async () => [], upload = async () => {}, create = async () => {}, unavailable = '' } = {}) {
  const el = Object.fromEntries([...source('index.html').matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  el['voice-form'].reset = () => { el['voice-name'].value = ''; el['voice-anonymous'].checked = false; };
  const window = new Element(); const document = new Element();
  document.getElementById = (id) => el[id]; document.createElement = (tag) => new Element(tag);
  let callbacks; let cancelled = 0; let uploaded = 0; let urlCount = 0;
  const revoked = []; const errors = [];
  const context = vm.createContext({ window, document, crypto: webcrypto,
    URL: { createObjectURL: () => `blob:local-${++urlCount}`, revokeObjectURL: (url) => revoked.push(url) },
    console: { error: (...args) => errors.push(args) },
  });
  vm.runInContext(source('js/voice-recorder.js'), context);
  window.chasVoiceRecorder = { ...window.chasVoiceRecorder, availability: () => unavailable,
    createRecorder(hooks) { callbacks = hooks; return { start: async () => hooks.onState('recording'), stop() { hooks.onState('idle'); hooks.onReady({ blob: blob(), durationSeconds: 8 }); }, cancel() { cancelled++; hooks.onState('idle'); }, dispose() { cancelled++; hooks.onState('idle'); } }; },
  };
  window.chasVoiceMessagesApi = { pageSize: 50, read, publicUrl: (path) => `https://storage.example/voice-messages/${path}`,
    upload: async (...args) => { uploaded++; return upload(...args); }, create };
  window.matchMedia = () => ({ matches: true });
  vm.runInContext(source('js/voice-data.js'), context);
  vm.runInContext(source('js/voice-messages.js'), context);
  return { el, window, document, revoked, errors, callbacks: () => callbacks, get uploaded() { return uploaded; }, get cancelled() { return cancelled; }, async ready() { await el['voice-tab'].fire('click'); await el['voice-record'].fire('click'); await el['voice-stop'].fire('click'); } };
}
const row = (extra = {}) => ({ storage_path: 'uploads/id.webm', name: 'Amiga', is_anonymous: false, duration_seconds: 8, created_at: '2026-10-30T12:00:00Z', ...extra });

test('saved voice cards render safe named/anonymous authors, dates, durations and non-autoplay players', async () => {
  const f = uiFixture({ read: async () => [row({ name: '<script>name</script>' }), row({ name: 'Secret', is_anonymous: true })] }); await tick();
  const cards = f.el['voices-list'].children;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].children[0].textContent, '<script>name</script>');
  assert.equal(cards[1].children[0].textContent, 'Anónimo');
  assert.equal(cards[0].children[1].textContent, '0:08');
  assert.equal(cards[0].children[2].controls, true);
  assert.equal(cards[0].children[2].preload, 'none');
  assert.notEqual(cards[0].children[2].autoplay, true);
  assert.match(cards[0].children[2].src, /voice-messages\/uploads\/id.webm$/);
  assert.equal(cards[0].children.length, 4);
});

test('recording stop creates local preview only; explicit submit saves, cleans URL and shows unmistakable success', async () => {
  let reads = 0; let metadata;
  const f = uiFixture({ read: async () => ++reads > 1 ? [row()] : [], create: async (payload) => { metadata = payload; } });
  await tick(); await f.ready();
  assert.equal(f.uploaded, 0);
  assert.match(f.el['voice-preview'].src, /^blob:/);
  f.el['voice-name'].value = 'Amiga';
  await f.el['voice-form'].fire('submit');
  assert.equal(f.uploaded, 1);
  assert.equal(metadata.name, 'Amiga');
  assert.equal(f.el['voice-success'].hidden, false);
  assert.equal(f.el['voice-workspace'].hidden, true);
  assert.equal(f.el['voices-list'].children.length, 1);
  assert.deepEqual(f.revoked, ['blob:local-1']);
});

test('UI validates author, sends anonymous null and prevents double submits', async () => {
  let resolve; const payloads = [];
  const f = uiFixture({ create: (payload) => { payloads.push(payload); return new Promise((done) => { resolve = done; }); } });
  await f.ready(); await f.el['voice-form'].fire('submit');
  assert.equal(f.uploaded, 0);
  assert.match(f.el['voice-status'].textContent, /Escribe tu nombre/);
  f.el['voice-name'].value = 'Do not send'; f.el['voice-anonymous'].checked = true; await f.el['voice-anonymous'].fire('change');
  const pending = f.el['voice-form'].fire('submit'); await tick();
  assert.equal(f.el['voice-send'].disabled, true);
  await f.el['voice-form'].fire('submit');
  assert.equal(payloads.length, 1); assert.equal(payloads[0].name, null); assert.equal(payloads[0].is_anonymous, true);
  resolve(); await pending;
});

test('failed upload retains preview and signature; metadata failure disables another send', async () => {
  const offline = uiFixture({ upload: async () => { throw new TypeError('Failed to fetch'); } }); await offline.ready();
  offline.el['voice-name'].value = 'Amiga'; await offline.el['voice-form'].fire('submit');
  assert.equal(offline.el['voice-review'].hidden, false);
  assert.equal(offline.el['voice-name'].value, 'Amiga');
  assert.equal(offline.el['voice-send'].disabled, false);
  assert.equal(offline.el['voice-status'].dataset.state, 'error');
  const rejected = uiFixture({ create: async () => { throw new Error('Raw policy'); } }); await rejected.ready();
  rejected.el['voice-name'].value = 'Amiga'; await rejected.el['voice-form'].fire('submit');
  assert.equal(rejected.el['voice-send'].disabled, true);
  assert.doesNotMatch(rejected.el['voice-status'].textContent, /Raw policy/);
});

test('discard/re-record and pagehide revoke local URLs; switching modes keeps text available', async () => {
  const f = uiFixture(); await f.ready(); await f.el['voice-discard'].fire('click');
  assert.deepEqual(f.revoked, ['blob:local-1']);
  await f.ready(); await f.el['note-tab'].fire('click');
  assert.equal(f.el['wish-form'].hidden, false);
  assert.equal(f.el['voice-panel'].hidden, true);
  await f.window.fire('pagehide');
  assert.deepEqual(f.revoked, ['blob:local-1', 'blob:local-2']);
  assert.equal(f.cancelled, 1);
});

test('read failures allow retry and post-save refresh failures retain the success panel', async () => {
  let fail = true;
  const f = uiFixture({ read: async () => { if (fail) throw new Error('Raw DB'); return []; } }); await tick();
  assert.equal(f.el['voices-status'].dataset.state, 'error');
  assert.equal(f.el['voices-refresh'].disabled, false);
  fail = false; await f.el['voices-refresh'].fire('click');
  assert.match(f.el['voices-status'].textContent, /Todavía no hay audios/);
  await f.ready(); fail = true; f.el['voice-name'].value = 'Amiga'; await f.el['voice-form'].fire('submit');
  assert.equal(f.el['voice-success'].hidden, false);
  assert.match(f.el['voices-status'].textContent, /no hace falta enviarlo/);
});

test('unsupported recording leaves the text tab usable and explains the fallback', async () => {
  const f = uiFixture({ unavailable: 'Este navegador no permite grabar. Puedes dejarme una notita.' }); await tick();
  assert.equal(f.el['voice-record'].disabled, true);
  assert.match(f.el['voice-status'].textContent, /notita/);
  await f.el['note-tab'].fire('click'); assert.equal(f.el['wish-form'].hidden, false);
});

test('audio adapter uses the existing client, voice bucket, MIME and upsert false, then metadata table', async () => {
  const calls = []; let clients = 0;
  const query = {};
  for (const method of ['select', 'order', 'range', 'insert']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = async () => ({ data: [], error: null });
  const window = { supabase: { createClient: () => { clients++; return {
    from(table) { calls.push(['table', table]); return query; },
    storage: { from(bucket) { calls.push(['bucket', bucket]); return { upload: async (...args) => { calls.push(['upload', ...args]); return { data: {}, error: null }; }, getPublicUrl: (path) => ({ data: { publicUrl: `https://test/${path}` } }) }; } },
  }; } } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  const api = window.chasVoiceMessagesApi;
  await api.upload('uploads/id.webm', blob());
  await api.create({ storage_path: 'uploads/id.webm', name: null, is_anonymous: true, duration_seconds: 8 });
  await api.read(50);
  assert.equal(clients, 1);
  assert.deepEqual(plain(calls[0]), ['bucket', 'voice-messages']);
  assert.deepEqual(plain(calls[1][3]), { contentType: 'audio/webm', cacheControl: '3600', upsert: false });
  assert.deepEqual(plain(calls[2]), ['table', 'audio_messages']);
  assert.deepEqual(plain(calls[3]), ['insert', { storage_path: 'uploads/id.webm', name: null, is_anonymous: true, duration_seconds: 8 }]);
  assert.deepEqual(plain(calls.slice(-3)), [['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 50, 99]]);
});

test('recording warning, stop control and background handling are explicit and keep the result local', async () => {
  const f = uiFixture(); await f.el['voice-tab'].fire('click'); await f.el['voice-record'].fire('click');
  assert.equal(f.el['voice-stop'].hidden, false);
  f.callbacks().onTick(106);
  assert.equal(f.el['voice-timer'].textContent, '1:46 / 2:00');
  assert.equal(f.el['voice-limit-warning'].hidden, false);
  f.document.hidden = true; await f.document.fire('visibilitychange');
  assert.equal(f.el['voice-review'].hidden, false);
  assert.equal(f.uploaded, 0);
  await f.el['voice-rerecord'].fire('click');
  assert.deepEqual(f.revoked, ['blob:local-1']);
  assert.equal(f.el['voice-stop'].hidden, false);
});

test('voice tabs support arrow keys and switching to text stops an active recording', async () => {
  const f = uiFixture();
  await f.el['note-tab'].fire('keydown', { key: 'ArrowRight' });
  assert.equal(f.el['voice-panel'].hidden, false);
  assert.equal(f.el['voice-tab'].attrs['aria-selected'], 'true');
  await f.el['voice-record'].fire('click');
  await f.el['note-tab'].fire('click');
  assert.equal(f.el['voice-review'].hidden, false);
  assert.equal(f.el['wish-form'].hidden, false);
  assert.equal(f.uploaded, 0);
});
