const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(setImmediate);

// A small DOM fixture for real catalogue/DOM integration without dependencies.
function dom() {
  let activeObserver;
  let queued = false;
  const records = [];
  function notify(record) {
    if (!activeObserver || record.type === 'attributes' && !activeObserver.options.attributeFilter.includes(record.attributeName)) return;
    records.push(record);
    if (!queued) { queued = true; queueMicrotask(() => { queued = false; if (records.length) activeObserver.callback(records.splice(0)); }); }
  }
  class Node {
    constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node.nodeType === 9; }
    append(...children) {
      for (let child of children) { if (typeof child === 'string') child = new Text(child); child.parentNode = this; this.childNodes.push(child); }
      notify({ type: 'childList', target: this, addedNodes: children.filter((child) => typeof child !== 'string') });
    }
    replaceChildren(...children) { this.childNodes.forEach((node) => { node.parentNode = null; }); this.childNodes = []; this.append(...children); }
    get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }
    set textContent(value) { this.replaceChildren(new Text(String(value))); }
  }
  class Text extends Node {
    constructor(value) { super(3); this._value = value; }
    get nodeValue() { return this._value; }
    set nodeValue(value) { if (value !== this._value) { this._value = value; notify({ type: 'characterData', target: this }); } }
    get textContent() { return this.nodeValue; }
    set textContent(value) { this.nodeValue = value; }
  }
  const voidTags = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source']);
  class Element extends Node {
    constructor(tag) { super(1); this.tagName = tag.toUpperCase(); this.attrs = {}; this.dataset = {}; this.events = {}; this.value = ''; this.disabled = false; this.hidden = false; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {} }; }
    get id() { return this.attrs.id || ''; }
    set id(value) { this.setAttribute('id', value); }
    get lang() { return this.attrs.lang; }
    set lang(value) { this.setAttribute('lang', value); }
    get dateTime() { return this.attrs.datetime; }
    set dateTime(value) { this.setAttribute('datetime', value); }
    get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
    setAttribute(key, value) { this.attrs[key] = String(value); notify({ type: 'attributes', target: this, attributeName: key }); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    closest(selector) { let node = this; while (node) { if (selector.split(',').some((part) => { part = part.trim(); return part === '[translate="no"]' ? node.attrs?.translate === 'no' : node.tagName?.toLowerCase() === part; })) return node; node = node.parentElement; } return null; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    async fire(type, extra = {}) { await Promise.all((this.events[type] || []).map((fn) => fn({ target: this, preventDefault() {}, ...extra }))); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
    get innerHTML() { return this.childNodes.map(serialize).join(''); }
    set innerHTML(value) { this.replaceChildren(...parse(value)); }
  }
  function serialize(node) { if (node.nodeType === 3) return node.nodeValue; const tag = node.tagName.toLowerCase(); return `<${tag}${Object.entries(node.attrs).map(([key, value]) => ` ${key}="${value}"`).join('')}>` + (voidTags.has(tag) ? '' : node.childNodes.map(serialize).join('') + `</${tag}>`); }
  function parse(html) {
    const holder = new Node(9); const stack = [holder];
    for (const token of html.match(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g) || []) {
      if (/^<!/.test(token)) continue;
      if (/^<\//.test(token)) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([\w-]+)/)[1]; const element = new Element(tag);
        for (const match of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) element.attrs[match[1]] = match[2] ?? '';
        stack[stack.length - 1].append(element);
        if (!voidTags.has(tag)) stack.push(element);
      } else stack[stack.length - 1].append(new Text(token));
    }
    return [...holder.childNodes];
  }
  const document = new Node(9);
  const flatten = (node) => node.childNodes.flatMap((child) => [child, ...flatten(child)]);
  document.append(...parse(source('index.html')));
  document.documentElement = document.childNodes.find((node) => node.tagName === 'HTML');
  document.getElementById = (id) => flatten(document).find((node) => node.id === id);
  document.createElement = (tag) => new Element(tag);
  document.createTreeWalker = (node) => { const nodes = flatten(node); let index = 0; return { nextNode: () => nodes[index++] || null }; };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(root, options) { this.options = options; activeObserver = this; }
  }
  return { document, Element, Text, MutationObserver, flatten };
}
function setup({ preference, denied = false } = {}) {
  const tree = dom(); const storage = new Map(preference ? [['chas:language', preference]] : []);
  const window = { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 }, localStorage: { getItem(key) { if (denied) throw Error('denied'); return storage.get(key); }, setItem(key, value) { if (denied) throw Error('denied'); storage.set(key, value); } } };
  const context = vm.createContext({ window, document: tree.document, MutationObserver: tree.MutationObserver, queueMicrotask, console });
  vm.runInContext(source('js/translations.js'), context);
  vm.runInContext(source('js/i18n.js'), context);
  return { ...tree, window, context, storage, api: window.chasI18n };
}

test('Spanish is the default, independent of browser locale, and all five locales are complete', () => {
  const f = setup();
  assert.equal(f.api.language, 'es'); assert.equal(f.document.documentElement.lang, 'es');
  assert.equal(f.api.t('nav.home'), 'Inicio');
  for (const [key, row] of Object.entries(f.window.chasTranslations)) {
    for (const locale of ['es', 'en', 'de', 'pt', 'zh-CN']) assert.ok(typeof row[locale] === 'string' && row[locale].length, `${key}/${locale}`);
  }
});

test('switching updates DOM, HTML lang and localStorage; a future visit restores preference', async () => {
  const f = setup();
  for (const [locale, home] of [['en', 'Home'], ['de', 'Start'], ['pt', 'Início'], ['zh-CN', '首页'], ['es', 'Inicio']]) {
    const picker = f.document.getElementById('language-select'); picker.value = locale; await picker.fire('change'); await tick();
    assert.equal(f.api.t('nav.home'), home);
    assert.equal(f.document.documentElement.lang, locale);
    assert.equal(f.storage.get('chas:language'), locale);
  }
  const restored = setup({ preference: 'de' });
  assert.equal(restored.api.language, 'de');
  const denied = setup({ denied: true }); denied.api.setLanguage('pt'); assert.equal(denied.api.language, 'pt');
  assert.equal(setup({ preference: 'invalid' }).api.language, 'es');
});

test('static HTML copy and accessibility strings have catalogue keys without core fallbacks', () => {
  const f = setup();
  const exceptions = new Set(['Chas', 'Chas ♡', '×']);
  for (const node of f.flatten(f.document)) {
    if (node.nodeType === 3 && /[A-Za-zÁ-ú]/.test(node.nodeValue) && !node.parentElement.closest('script, style, textarea, option, [translate="no"]')) {
      const text = node.nodeValue.trim();
      if (text && !exceptions.has(text)) assert.ok(f.api.resolve(text), `Missing static copy: ${text}`);
    }
    if (node.nodeType === 1 && !node.closest('[translate="no"], script, style')) {
      for (const attribute of ['aria-label', 'placeholder', 'alt', 'title']) {
        const value = node.getAttribute(attribute);
        if (value && /[A-Za-zÁ-ú]/.test(value)) assert.ok(f.api.resolve(value), `Missing attribute: ${value}`);
      }
    }
  }
});

test('open UI and future dynamic status, attributes and plural templates switch immediately', async () => {
  const f = setup(); const modal = f.document.getElementById('photo-dialog'); modal.open = true;
  f.api.setLanguage('en'); await tick();
  const status = f.document.getElementById('comment-status'); status.textContent = 'Guardando tu comentario…';
  await tick(); assert.equal(status.textContent, 'Saving your comment…');
  f.api.setLanguage('de'); await tick(); assert.equal(status.textContent, 'Dein Kommentar wird gespeichert…');
  const field = f.document.getElementById('comment-content'); assert.equal(field.getAttribute('placeholder'), 'Schreib etwas zu diesem Foto...');
  assert.equal(f.api.translate('25 celebraciones para Chas'), '25 Feiern für Chas');
  f.api.setLanguage('en'); assert.equal(f.api.translate('1 celebración para Chas'), '1 celebration for Chas');
  assert.equal(f.api.translate('25 celebraciones para Chas'), '25 celebrations for Chas');
  assert.equal(f.api.translate('Subiendo 2 de 5…'), 'Uploading 2 of 5…');
  field.value = 'Mi borrador'; f.api.setLanguage('pt');
  assert.equal(field.value, 'Mi borrador');
  assert.equal(f.api.translate('1 celebración para Chas'), '1 celebração para Chas');
  assert.equal(f.api.translate('25 celebraciones para Chas'), '25 celebrações para Chas');
  f.api.setLanguage('zh-CN');
  assert.equal(f.api.translate('1 celebración para Chas'), '已为 Chas 庆祝 1 次');
  assert.equal(f.api.translate('0 celebraciones para Chas'), '已为 Chas 庆祝 0 次');
});

test('names, comments, guest captions and answers remain byte-for-byte unchanged even if they match UI copy', async () => {
  const f = setup(); const parent = f.document.getElementById('messages-list');
  const guest = f.document.createElement('p'); guest.setAttribute('translate', 'no'); guest.textContent = 'Inicio'; parent.append(guest);
  const answer = f.document.getElementById('party-saved-content'); answer.setAttribute('translate', 'no'); answer.textContent = 'Tu comentario';
  const name = f.document.createElement('h4'); name.setAttribute('translate', 'no'); name.textContent = 'Anónimo'; parent.append(name);
  for (const language of f.api.languages) { f.api.setLanguage(language); await tick(); assert.equal(guest.textContent, 'Inicio'); assert.equal(answer.textContent, 'Tu comentario'); assert.equal(name.textContent, 'Anónimo'); }
  f.api.setLanguage('en'); assert.equal(f.api.translate('Por Inicio'), 'By Inicio');
});

test('all curated photo titles, descriptions, modal labels and party prompts translate in every language', () => {
  const f = setup(); vm.runInContext(source('js/photos.js'), f.context); vm.runInContext(source('js/party-data.js'), f.context);
  for (const language of f.api.languages) {
    f.api.setLanguage(language);
    for (const photo of f.window.chasMemories) {
      assert.ok(f.api.resolve(photo.title)); assert.ok(f.api.resolve(photo.description)); assert.ok(f.api.resolve(`Abrir recuerdo: ${photo.title}`));
    }
    for (const prompt of f.window.chasPartyData.prompts) assert.ok(f.api.resolve(prompt.text));
    for (const challenge of f.window.chasPartyData.challenges) { assert.ok(f.api.resolve(challenge.text)); assert.ok(f.api.resolve(challenge.label)); }
  }
});

function counter({ count = 4, insertError = false, pendingInsert = false, readError = false } = {}) {
  const f = dom(); const timers = []; let inserts = 0; let resolveInsert; let failRead = readError;
  const errors = [];
  const window = { matchMedia: () => ({ matches: true }), sessionStorage: { getItem: () => 'seen', setItem() {} },
    setTimeout(fn) { timers.push(fn); }, chasCelebrationsApi: {
      count: async () => { if (failRead) throw Error('read'); return count; },
      create: async () => { inserts++; if (insertError) throw Error('insert'); if (pendingInsert) await new Promise((resolve) => { resolveInsert = resolve; }); count++; },
    } };
  const context = vm.createContext({ window, document: f.document, console: { error: (...args) => errors.push(args), info() {} } });
  vm.runInContext(source('js/celebration.js'), context);
  return { ...f, window, timers, errors, get inserts() { return inserts; }, finishInsert() { resolveInsert(); }, failRead() { failRead = true; } };
}

test('celebration loads the real count, inserts exactly once per click, and reloads from Supabase', async () => {
  const f = counter(); await tick();
  assert.equal(f.document.getElementById('celebration-count').textContent, '4 celebraciones para Chas');
  await f.document.getElementById('celebrate').fire('click');
  assert.equal(f.inserts, 1);
  assert.equal(f.document.getElementById('celebration-count').textContent, '5 celebraciones para Chas');
  await f.document.getElementById('celebrate').fire('click'); assert.equal(f.inserts, 1);
  f.timers.forEach((fn) => fn()); await f.document.getElementById('celebrate').fire('click'); assert.equal(f.inserts, 2);
});

test('failed celebration never increments a local number; cooldown cannot unlock a pending request', async () => {
  const failure = counter({ insertError: true }); await tick(); await failure.document.getElementById('celebrate').fire('click');
  assert.equal(failure.document.getElementById('celebration-count').textContent, '4 celebraciones para Chas');
  assert.match(failure.document.getElementById('celebration-feedback').textContent, /No pudimos confirmar/);
  const pending = counter({ pendingInsert: true }); await tick();
  const request = pending.document.getElementById('celebrate').fire('click');
  pending.timers.forEach((fn) => fn());
  assert.equal(pending.document.getElementById('celebrate').disabled, true);
  pending.finishInsert(); await request; assert.equal(pending.document.getElementById('celebrate').disabled, false);
});

test('counter failure is honest and a saved insert is not confused with a failed refresh', async () => {
  const f = counter(); await tick(); f.failRead(); await f.document.getElementById('celebrate').fire('click');
  assert.equal(f.document.getElementById('celebration-count').textContent, '4 celebraciones para Chas');
  assert.match(f.document.getElementById('celebration-feedback').textContent, /se guardó/);
  const unavailable = counter({ readError: true }); await tick();
  assert.equal(unavailable.document.getElementById('celebration-count').textContent, 'El total no está disponible ahora.');
  assert.equal(unavailable.inserts, 0);
});

test('celebrations adapter uses exact HEAD count and INSERT only with a fresh UUID', async () => {
  const calls = []; const query = { select: (...args) => { calls.push(['select', ...args]); return query; }, insert: (payload) => { calls.push(['insert', payload]); return query; }, abortSignal: async () => ({ data: null, error: null, count: 37 }) };
  const window = { supabase: { createClient: () => ({ from: (table) => { assert.equal(table, 'celebrations'); return query; } }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, crypto: webcrypto, AbortController, setTimeout, clearTimeout }));
  assert.equal(await window.chasCelebrationsApi.count(), 37); await window.chasCelebrationsApi.create();
  assert.equal(calls[0][0], 'select'); assert.equal(calls[0][1], 'id'); assert.equal(calls[0][2].count, 'exact'); assert.equal(calls[0][2].head, true);
  assert.match(calls[1][1].id, /^[a-f0-9-]{36}$/);
});


test('explicit labels distinguish curated copy from identical guest captions and named authors', async () => {
  const f = setup();
  const parent = f.document.getElementById('messages-list');
  const guest = f.document.createElement('button');
  guest.setAttribute('aria-label', 'Abrir recuerdo: Una sonrisa al sol'); parent.append(guest);
  const seed = f.document.createElement('button');
  seed.setAttribute('aria-label', 'Abrir recuerdo: Una sonrisa al sol');
  seed.setAttribute('data-i18n-aria-label', 'photo.open.001'); parent.append(seed);
  const author = f.document.createElement('p');
  author.setAttribute('data-i18n-text', 'copy.c212');
  author.setAttribute('data-i18n-params', JSON.stringify({ 0: { key: 'copy.c145' } }));
  author.textContent = 'Por Anónimo'; parent.append(author);
  const player = f.document.createElement('audio');
  player.setAttribute('aria-label', 'Escuchar mensaje de Anónimo'); parent.append(player);
  f.api.setLanguage('en'); await tick();
  assert.equal(guest.getAttribute('aria-label'), 'Open memory: Una sonrisa al sol');
  assert.equal(seed.getAttribute('aria-label'), 'Open memory: A smile in the sun');
  assert.equal(author.textContent, 'By Anonymous');
  assert.equal(player.getAttribute('aria-label'), 'Listen to a message from Anónimo');
  author.setAttribute('data-i18n-params', JSON.stringify({ 0: 'Anónimo' })); await tick();
  assert.equal(author.textContent, 'By Anónimo');
});
