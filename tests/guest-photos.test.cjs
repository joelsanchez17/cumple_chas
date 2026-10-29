const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function helpers() {
  const window = {};
  vm.runInContext(source('js/photo-upload.js'), vm.createContext({ window, crypto: webcrypto }));
  return window.chasPhotoUpload;
}
function file(name, type, size = 1000) { return { name, type, size }; }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('selection accepts at most five photos across the current batch', () => {
  const tool = helpers();
  const five = Array.from({ length: 5 }, (_, index) => file(`${index}.jpg`, 'image/jpeg'));
  assert.equal(tool.validateSelection(five).files.length, 5);
  const tooMany = tool.validateSelection([...five, file('six.jpg', 'image/jpeg')]);
  assert.equal(tooMany.files.length, 0);
  assert.match(tooMany.error, /hasta 5/);
  const overExisting = tool.validateSelection([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')], 4);
  assert.equal(overExisting.files.length, 0);
  assert.match(overExisting.error, /lote más pequeño/);
});

test('unsupported files are rejected with a friendly format explanation', () => {
  const tool = helpers();
  const result = tool.validateSelection([file('photo.heic', 'image/heic'), file('safe.png', 'image/png')]);
  assert.deepEqual(plain(result.files), [file('safe.png', 'image/png')]);
  assert.match(result.error, /photo\.heic/);
  assert.match(result.error, /JPG, PNG o WebP/);
});

test('anonymous and named database payloads are normalized and validated', () => {
  const tool = helpers();
  assert.deepEqual(plain(tool.createPhotoPayload({ storagePath: 'uploads/a.webp', uploaderName: 'Never send', caption: '  Fiesta  ', anonymous: true })), {
    storage_path: 'uploads/a.webp', uploader_name: null, caption: 'Fiesta', is_anonymous: true,
  });
  assert.deepEqual(plain(tool.createPhotoPayload({ storagePath: 'uploads/b.webp', uploaderName: '  Amiga  ', caption: '   ', anonymous: false })), {
    storage_path: 'uploads/b.webp', uploader_name: 'Amiga', caption: null, is_anonymous: false,
  });
  assert.throws(() => tool.createPhotoPayload({ storagePath: 'x', uploaderName: ' ', anonymous: false }), /Escribe tu nombre/);
});

test('storage paths are unique, collision-resistant and use the encoded image extension', () => {
  const tool = helpers();
  const first = tool.createStoragePath();
  const second = tool.createStoragePath();
  assert.match(first, /^uploads\/[0-9a-f-]{36}\.webp$/);
  assert.notEqual(first, second);
  assert.equal(tool.createStoragePath('12345678-1234-1234-1234-123456789abc', 'image/jpeg'), 'uploads/12345678-1234-1234-1234-123456789abc.jpg');
});

test('compression dimensions preserve orientation and cap the longest side at 1920px', () => {
  const tool = helpers();
  assert.deepEqual(plain(tool.dimensions(4000, 3000)), { width: 1920, height: 1440 });
  assert.deepEqual(plain(tool.dimensions(1200, 2400)), { width: 960, height: 1920 });
  assert.deepEqual(plain(tool.dimensions(800, 600)), { width: 800, height: 600 });
});

test('guest UUIDs become stable comment IDs without filenames or gallery indexes', () => {
  const tool = helpers();
  assert.equal(tool.guestPhotoId('e42fe96f-fcc0-46c6-85ff-7180a094ec9a'), 'guest-e42fe96f-fcc0-46c6-85ff-7180a094ec9a');
  assert.throws(() => tool.guestPhotoId(''), /UUID/);
});

test('progress and completion copy clearly identifies stages, counts and partial results', () => {
  const tool = helpers();
  assert.equal(tool.progressMessage('compressing', 1, 3), 'Preparando fotos…');
  assert.equal(tool.progressMessage('uploading', 1, 3), 'Subiendo 1 de 3…');
  assert.equal(tool.progressMessage('registering', 1, 1), 'Guardando entre las fotos compartidas…');
  assert.equal(tool.progressMessage('registering', 2, 3), 'Guardando 2 de 3 entre las fotos compartidas…');
  assert.deepEqual(plain(tool.resultCopy(1, 0)), { title: '¡Listo!', detail: 'Tu foto ya está entre los recuerdos compartidos.' });
  assert.deepEqual(plain(tool.resultCopy(3, 0)), { title: '¡Listo!', detail: 'Tus 3 fotos ya están entre los recuerdos compartidos.' });
  assert.deepEqual(plain(tool.resultCopy(4, 1)), { title: '4 fotos subidas', detail: '1 foto no pudo subirse.' });
});

test('upload markup points to the dedicated shared-photo section and leaves the extra local image unused', () => {
  const html = source('index.html');
  assert.match(html, /id="guest-photos"/);
  assert.match(html, /id="guest-photo-grid"/);
  assert.match(html, /id="photo-upload-view"[^>]*>Ver las fotos compartidas/);
  assert.match(html, /id="photo-upload-another"[^>]*>Subir otra/);
  assert.match(html, /id="photo-upload-success"/);
  assert.doesNotMatch(html, /17\.25\.10\.jpeg/);
});

test('partial failures remain retryable and successful photos are never uploaded twice', async () => {
  const tool = helpers();
  const items = [{ key: 'a', status: 'selected' }, { key: 'b', status: 'selected' }];
  const calls = [];
  const first = await tool.uploadBatch(items, async (item) => {
    calls.push(item.key);
    if (item.key === 'b') throw new Error('offline');
    return { id: 'saved-a' };
  });
  assert.deepEqual(plain(first.map((result) => result.ok)), [true, false]);
  assert.deepEqual(plain(items.map((item) => item.status)), ['success', 'error']);
  const second = await tool.uploadBatch(items, async (item) => { calls.push(item.key); return { id: 'saved-b' }; });
  assert.equal(second[0].skipped, true);
  assert.deepEqual(calls, ['a', 'b', 'b']);
  assert.deepEqual(plain(items.map((item) => item.status)), ['success', 'success']);
});

test('an uncertain metadata failure is marked non-retryable to avoid duplicate Storage objects', async () => {
  const tool = helpers();
  const item = { key: 'metadata', status: 'selected', retryable: true };
  let calls = 0;
  await tool.uploadBatch([item], async () => {
    calls++;
    const error = new Error('Stored but not registered');
    error.noRetry = true;
    throw error;
  });
  assert.equal(item.retryable, false);
  await tool.uploadBatch([item], async () => { calls++; });
  assert.equal(calls, 1);
});

test('guest photo adapter reads newest first, uploads without upsert and returns inserted UUID', async () => {
  const calls = [];
  const query = {};
  for (const method of ['select', 'order', 'insert', 'single']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = async () => ({ data: { id: 'photo-uuid' }, error: null });
  const bucket = {
    getPublicUrl: (storagePath) => ({ data: { publicUrl: `https://cdn.example/${storagePath}` } }),
    upload: async (...args) => { calls.push(['upload', ...args]); return { data: { path: args[0] }, error: null }; },
  };
  const window = { supabase: { createClient: () => ({
    from: (table) => { calls.push(['from', table]); return query; },
    storage: { from: (name) => { calls.push(['bucket', name]); return bucket; } },
  }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  await window.chasGuestPhotosApi.read();
  const blob = { type: 'image/webp' };
  await window.chasGuestPhotosApi.upload('uploads/uuid.webp', blob);
  const payload = { storage_path: 'uploads/uuid.webp', uploader_name: null, caption: null, is_anonymous: true };
  const inserted = await window.chasGuestPhotosApi.create(payload);
  assert.equal(window.chasGuestPhotosApi.publicUrl('uploads/uuid.webp'), 'https://cdn.example/uploads/uuid.webp');
  assert.deepEqual(plain(inserted), { id: 'photo-uuid' });
  assert.ok(calls.some((call) => call[0] === 'from' && call[1] === 'photos'));
  assert.deepEqual(plain(calls.find((call) => call[0] === 'upload')), ['upload', 'uploads/uuid.webp', blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false }]);
  assert.ok(calls.some((call) => call[0] === 'insert' && JSON.stringify(call[1]) === JSON.stringify(payload)));
  const orders = calls.filter((call) => call[0] === 'order');
  assert.deepEqual(plain(orders), [['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }]]);
});

test('photo comment adapter accepts the deterministic guest ID unchanged', async () => {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'order', 'range']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = async () => ({ data: [], error: null });
  const window = { supabase: { createClient: () => ({ from: () => query }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  const id = 'guest-e42fe96f-fcc0-46c6-85ff-7180a094ec9a';
  await window.chasPhotoCommentsApi.read(id);
  assert.deepEqual(calls.find((call) => call[0] === 'eq'), ['eq', 'photo_id', id]);
});
