const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(setImmediate);

// Small DOM fixture for behavior tests; no browser or test dependencies needed.
class Element {
  constructor() {
    this.value = ''; this.checked = false; this.disabled = false;
    this.hidden = false; this.dataset = {}; this.attributes = {};
    this.children = []; this.events = {}; this.innerHTML = ''; this.textContent = '';
  }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  async fire(type) {
    await Promise.all((this.events[type] || []).map((callback) => callback({ preventDefault() {} })));
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  focus() { this.focused = true; }
}
function setupUi(api) {
  const elements = Object.fromEntries([...source('index.html').matchAll(/id="([^"]+)"/g)]
    .map((match) => [match[1], new Element()]));
  elements['wish-form'].reset = () => {
    elements['wish-name'].value = '';
    elements['wish-message'].value = '';
    elements['wish-anonymous'].checked = false;
  };
  const errors = [];
  const context = vm.createContext({
    window: { chasMessagesApi: api },
    document: { querySelector: (selector) => elements[selector.slice(1)], createElement: () => new Element() },
    console: { error: (...args) => errors.push(args) },
  });
  vm.runInContext(source('js/messages.js'), context);
  return { elements, errors };
}
function makeApi(overrides = {}) {
  return { pageSize: 50, read: async () => [], create: async () => null, ...overrides };
}
function message(overrides = {}) {
  return { name: 'Amiga', content: 'Feliz cumple', is_anonymous: false, created_at: '2026-10-29T12:00:00Z', ...overrides };
}

test('reads published messages as plain text and hides anonymous names and database IDs', async () => {
  const { elements: el } = setupUi(makeApi({ read: async () => [
    message({ id: 123, name: '<img src=x>', content: '<script>alert(1)</script>' }),
    message({ name: 'Private name', is_anonymous: true }),
    message({ created_at: 'invalid' }),
  ] }));
  await tick();
  const cards = el['messages-list'].children;
  assert.equal(cards.length, 3);
  assert.equal(cards[0].children[0].textContent, '<script>alert(1)</script>');
  assert.equal(cards[0].children[1].textContent, '<img src=x>');
  assert.equal(cards[1].children[1].textContent, 'Anónimo');
  assert.equal(cards[2].children.length, 2);
  assert.equal(el['messages-list'].attributes['aria-busy'], 'false');
});

test('rejects blank content, missing names, and oversized inputs before calling Supabase', async () => {
  let calls = 0;
  const { elements: el } = setupUi(makeApi({ create: async () => { calls++; } }));
  await tick();
  el['wish-message'].value = '  \n  ';
  await el['wish-form'].fire('submit');
  assert.match(el['wish-status'].textContent, /Escribe unas palabras/);
  el['wish-message'].value = 'Hola'; el['wish-name'].value = '   ';
  await el['wish-form'].fire('submit');
  assert.match(el['wish-status'].textContent, /Escribe tu nombre/);
  el['wish-name'].value = 'x'.repeat(51);
  await el['wish-form'].fire('submit');
  assert.match(el['wish-status'].textContent, /50 caracteres/);
  el['wish-message'].value = 'x'.repeat(1001);
  await el['wish-form'].fire('submit');
  assert.match(el['wish-status'].textContent, /1000 caracteres/);
  assert.equal(calls, 0);
});

test('sends a trimmed named message once, locks controls, resets on success, refreshes list', async () => {
  let resolveInsert;
  const writes = [];
  let reads = 0;
  const { elements: el } = setupUi(makeApi({
    read: async () => ++reads > 1 ? [message()] : [],
    create: (payload) => { writes.push(payload); return new Promise((resolve) => { resolveInsert = resolve; }); },
  }));
  await tick();
  el['wish-message'].value = '  Feliz cumple  '; el['wish-name'].value = '  Amiga  ';
  const pending = el['wish-form'].fire('submit');
  assert.equal(el['wish-submit'].disabled, true);
  assert.equal(el['wish-message'].disabled, true);
  await el['wish-form'].fire('submit');
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), { content: 'Feliz cumple', name: 'Amiga', is_anonymous: false });
  resolveInsert(); await pending;
  assert.equal(el['wish-message'].value, '');
  assert.equal(el['wish-name'].value, '');
  assert.equal(el['wish-submit'].disabled, false);
  assert.equal(el['wish-status'].dataset.state, 'success');
  assert.equal(el['messages-list'].children.length, 1);
  assert.equal(reads, 2);
});

test('Sin nombre always sends null, never a previously typed name', async () => {
  let payload;
  const { elements: el } = setupUi(makeApi({ create: async (value) => { payload = value; } }));
  await tick();
  el['wish-message'].value = '¡Feliz cumple!'; el['wish-name'].value = 'Do not send me';
  el['wish-anonymous'].checked = true; await el['wish-anonymous'].fire('change');
  assert.equal(el['wish-name'].disabled, true);
  assert.equal(el['wish-name'].required, false);
  await el['wish-form'].fire('submit');
  assert.equal(payload.name, null);
  assert.equal(payload.is_anonymous, true);
  assert.equal(el['wish-anonymous'].checked, false);
  assert.equal(el['wish-name'].disabled, false);
  assert.equal(el['wish-name'].required, true);
});

test('insert and network failures preserve drafts, reenable controls and hide technical errors', async () => {
  for (const failure of [new TypeError('Failed to fetch'), { code: '42501', message: 'Sensitive policy details' }]) {
    const { elements: el, errors } = setupUi(makeApi({ create: async () => { throw failure; } }));
    await tick();
    el['wish-message'].value = 'Keep my draft'; el['wish-name'].value = 'Amiga';
    await el['wish-form'].fire('submit');
    assert.equal(el['wish-message'].value, 'Keep my draft');
    assert.equal(el['wish-name'].value, 'Amiga');
    assert.equal(el['wish-submit'].disabled, false);
    assert.equal(el['wish-status'].dataset.state, 'error');
    assert.doesNotMatch(el['wish-status'].textContent, /42501|Sensitive|fetch/);
    assert.equal(errors.length, 1);
  }
});

test('read errors are retryable, including an unavailable CDN/API', async () => {
  let failed = true;
  const { elements: el } = setupUi(makeApi({ read: async () => {
    if (failed) throw new Error('Private details');
    return [message()];
  } }));
  await tick();
  assert.equal(el['messages-status'].dataset.state, 'error');
  assert.doesNotMatch(el['messages-status'].textContent, /Private/);
  assert.equal(el['messages-refresh'].disabled, false);
  failed = false; await el['messages-refresh'].fire('click');
  assert.equal(el['messages-list'].children.length, 1);
  const unavailable = setupUi(undefined);
  await tick();
  assert.equal(unavailable.elements['messages-status'].dataset.state, 'error');
});

test('a failed refresh after a confirmed insert keeps success and warns against resending', async () => {
  let reads = 0;
  const { elements: el } = setupUi(makeApi({ read: async () => {
    if (++reads > 1) throw new Error('Read failure');
    return [];
  } }));
  await tick();
  el['wish-message'].value = 'Hola'; el['wish-name'].value = 'Amiga';
  await el['wish-form'].fire('submit');
  assert.equal(el['wish-status'].dataset.state, 'success');
  assert.equal(el['wish-message'].value, '');
  assert.match(el['messages-status'].textContent, /no hace falta enviarla otra vez/);
});

test('pagination loads older messages without clearing the first page', async () => {
  const offsets = [];
  const { elements: el } = setupUi(makeApi({ read: async (offset) => {
    offsets.push(offset);
    return offset === 0 ? Array.from({ length: 50 }, () => message()) : [message()];
  } }));
  await tick();
  assert.equal(el['messages-more'].hidden, false);
  await el['messages-more'].fire('click');
  assert.deepEqual(offsets, [0, 50]);
  assert.equal(el['messages-list'].children.length, 51);
  assert.equal(el['messages-more'].hidden, true);
});

test('an older pending read cannot overwrite the fresh post-submit list', async () => {
  let resolveInitial;
  let reads = 0;
  const { elements: el } = setupUi(makeApi({ read: () => {
    if (++reads === 1) return new Promise((resolve) => { resolveInitial = resolve; });
    return Promise.resolve([message({ content: 'New notita' })]);
  } }));
  el['wish-message'].value = 'New notita'; el['wish-name'].value = 'Amiga';
  await el['wish-form'].fire('submit');
  resolveInitial([]); await tick();
  assert.equal(el['messages-list'].children[0].children[0].textContent, 'New notita');
});

test('Supabase adapter uses only public config, SELECT/INSERT, newest-first ordering and abort signals', async () => {
  const calls = [];
  let init;
  const query = {};
  for (const method of ['select', 'order', 'range', 'insert']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.abortSignal = async (signal) => {
    assert.ok(signal instanceof AbortSignal);
    return { data: [], error: null };
  };
  const window = { supabase: { createClient: (...args) => {
    init = args;
    return { from: (table) => { assert.equal(table, 'messages'); return query; } };
  } } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  await window.chasMessagesApi.read(50);
  await window.chasMessagesApi.create({ name: null, content: 'Hi', is_anonymous: true });
  assert.equal(init[0], 'https://iscxoxbxcticmnoiygus.supabase.co');
  assert.match(init[1], /^sb_publishable_/);
  assert.equal(init[2].auth.persistSession, false);
  assert.equal(init[2].auth.autoRefreshToken, false);
  assert.equal(init[2].auth.detectSessionInUrl, false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(0, 4))), [
    ['select', 'name,content,is_anonymous,created_at'],
    ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: false }],
    ['range', 50, 99],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[4])), ['insert', { name: null, content: 'Hi', is_anonymous: true }]);
  assert.equal(calls.length, 5);
});

test('adapter propagates Supabase errors to the UI without swallowing them', async () => {
  const expected = { code: '42501', message: 'Rejected by policy' };
  const window = { supabase: { createClient: () => ({ from: () => ({
    insert: () => ({ abortSignal: async () => ({ data: null, error: expected }) }),
  }) }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  await assert.rejects(window.chasMessagesApi.create({ name: 'Amiga', content: 'Hi', is_anonymous: false }), (error) => error === expected);
});

test('adapter aborts a stalled network request rather than leaving the form locked forever', async () => {
  let aborted = false;
  const window = { supabase: { createClient: () => ({ from: () => ({
    insert: () => ({ abortSignal: (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => { aborted = true; resolve({ data: null, error: new Error('Aborted') }); });
    }) }),
  }) }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({
    window, AbortController, setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {},
  }));
  await assert.rejects(window.chasMessagesApi.create({ name: 'Amiga', content: 'Hi', is_anonymous: false }), /Aborted/);
  assert.equal(aborted, true);
});
