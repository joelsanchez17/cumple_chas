const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(setImmediate);
const A = 'chas-memory-001';
const B = 'chas-memory-002';
class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.dataset = {};
    this.children = []; this.events = {}; this.value = ''; this.checked = false;
    this.disabled = false; this.hidden = false; this.textContent = ''; this.isConnected = true;
    this.style = { setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
  }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  async fire(type, extra = {}) {
    await Promise.all((this.events[type] || []).map((fn) => fn({ target: this, currentTarget: this, preventDefault() {}, ...extra })));
  }
  dispatchEvent(event) { (this.events[event.type] || []).forEach((fn) => fn(event)); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent({ type: 'close' }); }
  getBoundingClientRect() { return { top: 1000, left: 0, right: 100, bottom: 100 }; }
  scrollIntoView(options) { this.scrolled = options; }
}
function api(overrides = {}) {
  return { pageSize: 50, read: async () => [], create: async () => null, ...overrides };
}
function comment(photo_id = A, overrides = {}) {
  return { photo_id, name: 'Amiga', content: 'El contexto', is_anonymous: false, created_at: '2026-10-29T12:00:00Z', ...overrides };
}
function setup(service = api(), { app = false } = {}) {
  const nodes = [...source('index.html').matchAll(/<([a-z][\w-]*)\s+([^>]+)>/g)].map((match) => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]));
    return new Element(match[1], attrs);
  });
  const el = Object.fromEntries(nodes.filter((node) => node.attrs.id).map((node) => [node.attrs.id, node]));
  function queryAll(selector) {
    if (selector === '.nav-item[data-section]') return nodes.filter((node) => node.dataset.section);
    const data = selector.match(/^\[data-([^\]]+)\]$/);
    return data ? nodes.filter((node) => Object.hasOwn(node.attrs, `data-${data[1]}`)) : [];
  }
  const document = new Element('document');
  Object.assign(document, { querySelector: (selector) => el[selector.slice(1)], querySelectorAll: queryAll,
    createElement: (tag) => new Element(tag), getElementById: (id) => el[id], documentElement: new Element('html'), activeElement: nodes[0] });
  const window = new Element('window');
  Object.assign(window, { chasPhotoCommentsApi: service, innerHeight: 800, matchMedia: () => ({ matches: true }) });
  const errors = [];
  const context = vm.createContext({ window, document, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(),
    console: { error: (...args) => errors.push(args) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(source('js/photos.js'), context);
  vm.runInContext(source('js/photo-comments.js'), context);
  if (app) vm.runInContext(source('js/app.js'), context);
  return { el, window, context, errors, async open(photoId) {
    el['photo-dialog'].dataset.photoId = photoId;
    el['photo-dialog'].open = true;
    el['photo-dialog'].dispatchEvent({ type: 'memory:change', detail: { photoId } });
    await tick();
  } };
}

test('all 19 IDs are explicit and permanently mapped to their original photos', () => {
  const { window } = setup();
  const expectedFiles = ['15.02.07 (2)', '14.01.29_7', '14.00.36', '15.02.06 (2)', '14.00.36_3', '15.02.07 (4)',
    '15.02.07 (7)', '14.01.29_6', '14.00.3_2', '14.01.29_4', '14.01.29_5', '15.02.06 (1)', '15.02.06',
    '15.02.07 (1)', '15.02.07 (3)', '15.02.07 (5)', '15.02.07 (8)', '15.02.07 (9)', '15.02.07'];
  const photos = window.chasMemories;
  assert.equal(new Set(photos.map((photo) => photo.id)).size, 19);
  expectedFiles.forEach((file, index) => {
    const id = `chas-memory-${String(index + 1).padStart(3, '0')}`;
    assert.equal(photos[index].id, id);
    assert.equal(decodeURIComponent(photos[index].src), `assets/images/chas/WhatsApp Image 2026-10-29 at ${file}.jpeg`);
    assert.ok(source('js/photos.js').includes(`memory('${id}'`));
  });
  const reordered = [...photos].reverse().map((photo) => ({ ...photo, src: 'a-renamed-photo.jpeg' }));
  reordered.forEach((photo) => assert.equal(photo.id, photos.find((entry) => entry.title === photo.title).id));
});

test('existing modal, hero links, filters and previous/next use the permanent IDs', async () => {
  const calls = [];
  const { el, context } = setup(api({ read: async (id) => { calls.push(id); return []; } }), { app: true });
  assert.equal(el['photo-grid'].children.length, 19);
  const filters = context.document.querySelectorAll('[data-filter]');
  const travel = filters.find((button) => button.dataset.filter === 'travel');
  await travel.fire('click');
  assert.equal(el['photo-grid'].children.length, context.window.chasMemories.filter((photo) => photo.tags.includes('travel')).length);
  await filters.find((button) => button.dataset.filter === 'all').fire('click');
  vm.runInContext("openMemory('chas-memory-001')", context); await tick();
  assert.equal(el['photo-dialog'].open, true);
  assert.equal(el['photo-dialog'].dataset.photoId, A);
  await el['next-photo'].fire('click'); await tick();
  assert.equal(el['photo-dialog'].dataset.photoId, B);
  await el['previous-photo'].fire('click'); await el['previous-photo'].fire('click'); await tick();
  assert.equal(el['photo-dialog'].dataset.photoId, 'chas-memory-019');
  assert.equal(el['detail-position'].textContent, '19 / 19');
  assert.deepEqual(calls, [A, B, A, 'chas-memory-019']);
  el['photo-dialog'].close();
  assert.equal(el['comment-submit'].disabled, true);
});

test('a loaded guest photo opens in the same modal and reads comments with its stable guest UUID', async () => {
  const calls = [];
  const { el, context, window } = setup(api({ read: async (id) => { calls.push(id); return []; } }), { app: true });
  const id = 'guest-e42fe96f-fcc0-46c6-85ff-7180a094ec9a';
  window.chasAlbum.setGuestPhotos([{ id, src: 'https://example.test/photo.webp', title: 'Esta también va al álbum',
    description: 'Una noche bonita', tags: [], origin: 'guest', uploaderLabel: 'Anónimo' }]);
  assert.equal(el['photo-grid'].children.length, 19);
  assert.equal(el['guest-photo-grid'].children.length, 1);
  assert.equal(el['guest-photo-grid'].children[0].children[0].dataset.photo, id);
  vm.runInContext(`openMemory('${id}')`, context); await tick();
  assert.equal(el['photo-dialog'].dataset.photoId, id);
  assert.equal(el['detail-uploader'].textContent, 'Sumada por Anónimo');
  assert.deepEqual(calls, [id]);
});

test('guest photos never enter the curated grid or its filters', async () => {
  const { el, context, window } = setup(api(), { app: true });
  const guests = [
    { id: 'guest-new', src: 'new.webp', title: 'Nueva', description: 'Nueva', tags: [], origin: 'guest', uploaderLabel: 'Ana', createdAt: '2026-10-30T12:00:00Z' },
    { id: 'guest-old', src: 'old.webp', title: 'Anterior', description: 'Anterior', tags: [], origin: 'guest', uploaderLabel: 'Anónimo', createdAt: '2026-10-29T12:00:00Z' },
  ];
  window.chasAlbum.setGuestPhotos(guests);
  assert.equal(el['photo-grid'].children.length, 19);
  assert.deepEqual(el['photo-grid'].children.map((card) => card.children[0].dataset.photo), [...window.chasMemories].map((photo) => photo.id));
  assert.deepEqual(el['guest-photo-grid'].children.map((card) => card.children[0].dataset.photo), ['guest-new', 'guest-old']);
  const travel = context.document.querySelectorAll('[data-filter]').find((button) => button.dataset.filter === 'travel');
  await travel.fire('click');
  assert.equal(el['photo-grid'].children.length, window.chasMemories.filter((photo) => photo.tags.includes('travel')).length);
  assert.equal(el['guest-photo-grid'].children.length, 2);
  vm.runInContext("openMemory('guest-new')", context); await tick();
  await el['next-photo'].fire('click'); await tick();
  assert.equal(el['photo-dialog'].dataset.photoId, 'guest-old');
});

test('loads only the selected photo, renders literal text and hides anonymous identity', async () => {
  const calls = [];
  const fixture = setup(api({ read: async (id) => {
    calls.push(id);
    return [comment(id, { name: '<img>', content: '<script>text</script>' }), comment(id, { name: 'Do not display', is_anonymous: true }), comment(B)];
  } }));
  await fixture.open(A);
  const cards = fixture.el['comments-list'].children;
  assert.deepEqual(calls, [A]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].children[0].textContent, '<script>text</script>');
  assert.equal(cards[0].children[1].textContent, '<img>');
  assert.equal(cards[1].children[1].textContent, 'Anónimo');
  assert.match(fixture.el['photo-context-tag'].textContent, /Ya hay comentarios/);
});

test('empty state is honest and has no fabricated counts', async () => {
  const fixture = setup(); await fixture.open(A);
  assert.equal(fixture.el['comments-list'].children.length, 0);
  assert.match(fixture.el['comments-status'].textContent, /Todavía no hay comentarios/);
  assert.equal(fixture.el['photo-context-tag'].textContent, 'Tu mirada también cuenta');
});

test('validates empty content, named signatures and length before sending', async () => {
  let calls = 0;
  const fixture = setup(api({ create: async () => { calls++; } })); await fixture.open(A);
  const el = fixture.el;
  el['comment-content'].value = '   ';
  await el['comment-form'].fire('submit');
  assert.match(el['comment-status'].textContent, /Escribe un comentario/);
  el['comment-content'].value = 'Hola'; el['comment-name'].value = '   ';
  await el['comment-form'].fire('submit');
  assert.match(el['comment-status'].textContent, /Escribe tu nombre/);
  el['comment-name'].value = 'x'.repeat(51);
  await el['comment-form'].fire('submit');
  assert.match(el['comment-status'].textContent, /50 caracteres/);
  el['comment-content'].value = 'x'.repeat(1001);
  await el['comment-form'].fire('submit');
  assert.match(el['comment-status'].textContent, /1000 caracteres/);
  assert.equal(calls, 0);
});

test('named insert trims payload, disables double submits, clears form and refreshes this photo', async () => {
  let resolve;
  const writes = []; const reads = [];
  const fixture = setup(api({
    read: async (id) => { reads.push(id); return writes.length ? [comment(id)] : []; },
    create: (payload) => { writes.push(payload); return new Promise((done) => { resolve = done; }); },
  })); await fixture.open(A);
  const el = fixture.el;
  el['comment-content'].value = '  El contexto  '; el['comment-name'].value = '  Amiga  ';
  const pending = el['comment-form'].fire('submit');
  assert.equal(el['comment-submit'].disabled, true);
  await el['comment-form'].fire('submit');
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), { photo_id: A, name: 'Amiga', content: 'El contexto', is_anonymous: false });
  resolve(); await pending;
  assert.equal(el['comment-content'].value, '');
  assert.equal(el['comment-name'].value, '');
  assert.equal(el['comment-status'].dataset.state, 'success');
  assert.equal(el['comment-submit'].disabled, false);
  assert.deepEqual(reads, [A, A]);
  assert.equal(el['comments-list'].children.length, 1);
});

test('anonymous insert always sends null name and selected permanent photo ID', async () => {
  let payload;
  const fixture = setup(api({ create: async (value) => { payload = value; } })); await fixture.open(B);
  const el = fixture.el;
  el['comment-content'].value = 'Contexto'; el['comment-name'].value = 'Do not send';
  el['comment-anonymous'].checked = true; await el['comment-anonymous'].fire('change');
  assert.equal(el['comment-name'].disabled, true);
  await el['comment-form'].fire('submit');
  assert.equal(payload.name, null);
  assert.equal(payload.is_anonymous, true);
  assert.equal(payload.photo_id, B);
  assert.equal(el['comment-anonymous'].checked, false);
});

test('insert/network failures retain per-photo drafts through navigation and close/reopen', async () => {
  const fixture = setup(api({ create: async () => { throw new Error('Private policy detail'); } })); await fixture.open(A);
  const el = fixture.el;
  el['comment-content'].value = 'Keep this'; el['comment-name'].value = 'Amiga';
  await el['comment-form'].fire('submit');
  assert.equal(el['comment-submit'].disabled, false);
  assert.equal(el['comment-content'].value, 'Keep this');
  assert.equal(el['comment-status'].dataset.state, 'error');
  assert.doesNotMatch(el['comment-status'].textContent, /Private/);
  await fixture.open(B);
  assert.equal(el['comment-content'].value, '');
  el['comment-content'].value = 'Photo B draft';
  await fixture.open(A);
  assert.equal(el['comment-content'].value, 'Keep this');
  el['photo-dialog'].close(); await fixture.open(A);
  assert.equal(el['comment-content'].value, 'Keep this');
});

test('read errors permit retry and a failed post-insert refresh does not invite duplicate sends', async () => {
  let fail = true;
  const fixture = setup(api({ read: async () => { if (fail) throw new Error('Private read error'); return []; } }));
  await fixture.open(A); const el = fixture.el;
  assert.equal(el['comments-status'].dataset.state, 'error');
  assert.equal(el['comments-refresh'].disabled, false);
  fail = false; await el['comments-refresh'].fire('click');
  assert.match(el['comments-status'].textContent, /Todavía no hay/);
  fail = true;
  el['comment-content'].value = 'Saved'; el['comment-name'].value = 'Amiga';
  await el['comment-form'].fire('submit');
  assert.equal(el['comment-status'].dataset.state, 'success');
  assert.match(el['comments-status'].textContent, /no hace falta enviarlo otra vez/);
});

test('out-of-order reads cannot leak comments between photos', async () => {
  let finishA;
  const fixture = setup(api({ read: (id) => id === A ? new Promise((resolve) => { finishA = resolve; }) : Promise.resolve([comment(B)]) }));
  await fixture.open(A); await fixture.open(B);
  finishA([comment(A, { content: 'Stale A' })]); await tick();
  assert.equal(fixture.el['comments-list'].children.length, 1);
  assert.equal(fixture.el['comments-list'].children[0].children[0].textContent, 'El contexto');
});

test('navigating during an insert preserves the destination draft and keeps the original photo ID', async () => {
  let complete;
  let payload;
  const fixture = setup(api({ create: (value) => { payload = value; return new Promise((resolve) => { complete = resolve; }); } }));
  await fixture.open(A); const el = fixture.el;
  el['comment-content'].value = 'Photo A'; el['comment-name'].value = 'Amiga';
  const pending = el['comment-form'].fire('submit');
  await fixture.open(B);
  el['comment-content'].value = 'Photo B draft';
  complete(); await pending;
  assert.equal(payload.photo_id, A);
  assert.equal(el['comment-content'].value, 'Photo B draft');
  assert.notEqual(el['comment-status'].dataset.state, 'success');
  await fixture.open(A);
  assert.equal(el['comment-content'].value, '');
  assert.equal(el['comment-status'].dataset.state, 'success');
});

test('closing the modal invalidates pending reads', async () => {
  let resolve;
  const fixture = setup(api({ read: () => new Promise((done) => { resolve = done; }) }));
  await fixture.open(A); fixture.el['photo-dialog'].close();
  resolve([comment(A)]); await tick();
  assert.equal(fixture.el['comments-list'].children.length, 0);
});

test('comments and messages adapters reuse one public client and only query/insert allowed fields', async () => {
  const calls = []; let clients = 0;
  function from(table) {
    const query = {};
    for (const method of ['select', 'eq', 'order', 'range', 'insert']) query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
    query.abortSignal = async () => ({ data: [], error: null });
    return query;
  }
  const window = { supabase: { createClient: () => { clients++; return { from }; } } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  await window.chasPhotoCommentsApi.read(A, 50);
  await window.chasPhotoCommentsApi.create({ photo_id: A, name: null, content: 'Hi', is_anonymous: true });
  await window.chasMessagesApi.read();
  assert.equal(clients, 1);
  const actual = JSON.parse(JSON.stringify(calls));
  assert.deepEqual(actual.slice(0, 5), [
    ['photo_comments', 'select', 'photo_id,name,content,is_anonymous,created_at'],
    ['photo_comments', 'eq', 'photo_id', A],
    ['photo_comments', 'order', 'created_at', { ascending: false }],
    ['photo_comments', 'order', 'id', { ascending: false }],
    ['photo_comments', 'range', 50, 99],
  ]);
  assert.deepEqual(actual[5], ['photo_comments', 'insert', { photo_id: A, name: null, content: 'Hi', is_anonymous: true }]);
});
