const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(setImmediate);
const plain = (value) => JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.events = {}; this.dataset = {}; this.attrs = {}; this.value = ''; this.textContent = ''; this.checked = false; this.hidden = false; this.disabled = false; this.open = false; this.style = { setProperty() {} }; this.classes = new Set(); this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) }; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  async fire(type, extra = {}) { await Promise.all((this.events[type] || []).map((fn) => fn({ target: this, preventDefault() {}, ...extra }))); }
  click() { this.clicked = true; return this.fire('click'); }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  showModal() { this.open = true; this.opened = true; }
  close() { this.open = false; }
}
function setup({ answers = [], read, create = async () => {}, reduced = true, session = new Map(), deniedStorage = false, celebration = false } = {}) {
  const el = Object.fromEntries([...source('index.html').matchAll(/id="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  el['party-answer-form'].reset = () => { el['party-answer'].value = ''; el['party-name'].value = ''; el['party-anonymous'].checked = false; };
  const timers = new Map(); let timerId = 0;
  const window = {
    matchMedia: () => ({ matches: reduced }),
    sessionStorage: { getItem(key) { if (deniedStorage) throw new Error('Denied'); return session.get(key); }, setItem(key, value) { if (deniedStorage) throw new Error('Denied'); session.set(key, value); } },
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout(id) { timers.delete(id); },
    chasPartyAnswersApi: { pageSize: 50, read: read || (async () => answers), create },
    chasMemories: [{ id: 'chas-memory-001' }],
    chasAlbum: { openUpload: () => { el.uploadOpened = true; }, openPhoto: (id) => { el.openedPhotoId = id; } },
  };
  const document = { getElementById: (id) => el[id], createElement: (tag) => new Element(tag), documentElement: new Element('html') };
  const errors = [];
  const context = vm.createContext({ window, document, console: { info() {}, error: (...args) => errors.push(args) } });
  vm.runInContext(source('js/party-data.js'), context);
  if (celebration) vm.runInContext(source('js/celebration.js'), context);
  else vm.runInContext(source('js/party.js'), context);
  return { el, window, context, session, timers, errors, flush(ms) {
    for (const [id, timer] of [...timers]) if (timer.ms <= ms) { timers.delete(id); timer.fn(); }
  } };
}
function answer(overrides = {}) { return { id: 'uuid-a', prompt_id: 'una-palabra', answer: 'Buena compañía', name: 'Amiga', is_anonymous: false, ...overrides }; }

test('welcome appears once per session, Enter dismisses it and subsequent loads skip it', async () => {
  const session = new Map();
  const first = setup({ celebration: true, session });
  assert.equal(first.el['welcome-dialog'].open, true);
  await first.el['welcome-enter'].fire('click');
  assert.equal(first.el['welcome-dialog'].open, false);
  assert.equal(first.el['hero-title'].focused, true);
  const again = setup({ celebration: true, session });
  assert.notEqual(again.el['welcome-dialog'].opened, true);
  const freshSession = setup({ celebration: true });
  assert.equal(freshSession.el['welcome-dialog'].open, true);
});

test('welcome entry handles motion and unavailable session storage without blocking entry', async () => {
  const f = setup({ celebration: true, reduced: false, deniedStorage: true });
  await f.el['welcome-enter'].fire('click');
  assert.equal(f.el['welcome-dialog'].open, true);
  assert.ok(f.el['welcome-dialog'].classes.has('is-leaving'));
  f.flush(320);
  assert.equal(f.el['welcome-dialog'].open, false);
  assert.equal(f.el.confetti.children.length, 28);
});

test('confetti is bounded, has a shared cooldown and skips particles for reduced motion', async () => {
  const f = setup({ celebration: true, reduced: false, session: new Map([['chas:welcome:v1', 'seen']]) });
  await f.el.celebrate.fire('click');
  assert.equal(f.el.confetti.children.length, 28);
  assert.equal(f.el.celebrate.disabled, true);
  assert.equal(f.window.chasCelebration.burst(), false);
  f.flush(2500);
  assert.equal(f.el.confetti.children.length, 0);
  assert.equal(f.el.celebrate.disabled, false);
  const reduced = setup({ celebration: true });
  reduced.window.chasCelebration.burst();
  assert.equal(reduced.el.confetti.children.length, 0);
  assert.match(reduced.el['celebration-status'].textContent, /Feliz cumple/);
});

test('all roulette outcomes are selectable and the selected segment ends at the pointer', () => {
  const { window } = setup(); const tools = window.chasPartyData;
  for (let index = 0; index < tools.challenges.length; index++) {
    const result = tools.spin(1234, () => (index + .5) / tools.challenges.length);
    assert.equal(result.challenge.id, tools.challenges[index].id);
    const center = (index + .5) * 45;
    assert.ok(Math.abs((result.rotation + center) % 360) < .00001);
    assert.ok(result.rotation > 1234 + 4 * 360);
  }
});

test('wheel spins visibly, prevents double activation and announces the final challenge', async () => {
  const f = setup({ reduced: false });
  await f.el['wheel-spin'].fire('click');
  assert.equal(f.el['wheel-spin'].disabled, true);
  const rotation = f.el['party-wheel'].style.transform;
  await f.el['wheel-spin'].fire('click');
  assert.equal(f.el['party-wheel'].style.transform, rotation);
  assert.equal(f.el['wheel-result'].hidden, true);
  f.flush(3350);
  assert.equal(f.el['wheel-result'].hidden, false);
  assert.ok(f.el['wheel-challenge'].textContent.length);
  assert.equal(f.el['wheel-spin'].disabled, false);
});

test('roulette shortcuts open existing upload, voice, text, comment and game features without submitting anything', async () => {
  const f = setup();
  for (const [index, expected] of [[0, 'upload'], [1, 'voice'], [2, 'note'], [3, 'comment'], [6, 'gossip']]) {
    vm.runInContext(`Math.random = () => ${(index + .5) / 8}`, f.context);
    await f.el['wheel-spin'].fire('click'); await f.el['wheel-action'].fire('click');
    if (expected === 'upload') assert.equal(f.el.uploadOpened, true);
    if (expected === 'voice') assert.equal(f.el['voice-tab'].clicked, true);
    if (expected === 'note') assert.equal(f.el['note-tab'].clicked, true);
    if (expected === 'comment') assert.equal(f.el.openedPhotoId, 'chas-memory-001');
    if (expected === 'gossip') assert.equal(f.el['party-prompt'].textContent, f.window.chasPartyData.prompts.find((prompt) => prompt.id === 'chisme-inocente').text);
  }
});

test('prompt IDs are explicit, stable and unrelated to visible numbering', () => {
  const { window } = setup(); const prompts = window.chasPartyData.prompts;
  assert.equal(prompts.length, 10);
  assert.equal(new Set(prompts.map((prompt) => prompt.id)).size, 10);
  assert.deepEqual(plain(prompts.map((prompt) => prompt.id)), ['primera-impresion', 'una-palabra', 'plan-imperdible', 'recuerdo-favorito', 'muy-chas', 'nuevo-ano', 'proximo-viaje', 'cancion-fiesta', 'consejo-cumple', 'chisme-inocente']);
  const reordered = [...prompts].reverse();
  assert.equal(reordered.find((prompt) => prompt.id === 'una-palabra').text, prompts[1].text);
});

test('anonymous payload drops a typed name and named responses require a trimmed nonempty name', () => {
  const { window } = setup(); const payload = window.chasPartyData.answerPayload;
  assert.deepEqual(plain(payload({ promptId: 'una-palabra', answer: ' Hola ', name: 'Do not send', anonymous: true })), { prompt_id: 'una-palabra', answer: 'Hola', name: null, is_anonymous: true });
  assert.deepEqual(plain(payload({ promptId: 'una-palabra', answer: ' Hola ', name: ' Amiga ', anonymous: false })), { prompt_id: 'una-palabra', answer: 'Hola', name: 'Amiga', is_anonymous: false });
  assert.throws(() => payload({ promptId: 'una-palabra', answer: 'Hola', name: ' ', anonymous: false }), /Escribe tu nombre/);
  assert.throws(() => payload({ promptId: 'una-palabra', answer: ' ', anonymous: true }), /Escribe lo que/);
  assert.throws(() => payload({ promptId: 'bad', answer: 'Hola', anonymous: true }), /pregunta/);
});

test('empty database shows an honest empty state and no fabricated cards', async () => {
  const f = setup(); await tick();
  assert.equal(f.el['party-saved-answer'].hidden, true);
  assert.equal(f.el['party-another-answer'].disabled, true);
  assert.match(f.el['party-read-status'].textContent, /Todavía no hay respuestas/);
});

test('saved answers display the real prompt, plain text, and author or Anónimo without IDs', async () => {
  const f = setup({ answers: [answer({ answer: '<script>hello</script>', name: 'Must not display', is_anonymous: true })] }); await tick();
  assert.equal(f.el['party-saved-content'].textContent, '<script>hello</script>');
  assert.equal(f.el['party-saved-author'].textContent, 'Anónimo');
  assert.equal(f.el['party-saved-prompt'].textContent, '¿Qué palabra me define mejor?');
  assert.equal(f.el['party-saved-answer'].hidden, false);
  const known = setup({ answers: [answer({ name: '<img src=x>' })] }); await tick();
  assert.equal(known.el['party-saved-author'].textContent, '<img src=x>');
});

test('discovering another saved answer avoids repeating the current one', async () => {
  const f = setup({ answers: [answer(), answer({ id: 'uuid-b', answer: 'Another response' })] }); await tick();
  const previous = f.el['party-saved-content'].textContent;
  await f.el['party-another-answer'].fire('click');
  assert.notEqual(f.el['party-saved-content'].textContent, previous);
});

test('publishing validates, locks double submits, resets on success and reloads real answers', async () => {
  let resolve; let reads = 0; const writes = [];
  const f = setup({ read: async () => ++reads > 1 ? [answer()] : [], create: (payload) => { writes.push(payload); return new Promise((done) => { resolve = done; }); } });
  await tick(); await f.el['party-answer-form'].fire('submit');
  assert.equal(writes.length, 0);
  f.el['party-answer'].value = 'My answer'; f.el['party-name'].value = 'Do not send'; f.el['party-anonymous'].checked = true;
  await f.el['party-anonymous'].fire('change');
  const pending = f.el['party-answer-form'].fire('submit');
  await f.el['party-answer-form'].fire('submit');
  assert.equal(writes.length, 1); assert.equal(writes[0].name, null); assert.equal(writes[0].is_anonymous, true);
  assert.equal(f.el['party-next-question'].disabled, true);
  resolve(); await pending;
  assert.equal(f.el['party-answer'].value, '');
  assert.equal(f.el['party-submit-status'].dataset.state, 'success');
  assert.equal(f.el['party-saved-answer'].hidden, false);
});

test('failed submissions keep drafts and show a friendly error; failed reads are retryable', async () => {
  let fail = true;
  const f = setup({ read: async () => { if (fail) throw new Error('Private read detail'); return []; }, create: async () => { throw new Error('Private insert detail'); } }); await tick();
  assert.equal(f.el['party-read-status'].dataset.state, 'error');
  assert.equal(f.el['party-refresh'].disabled, false);
  fail = false; await f.el['party-refresh'].fire('click');
  f.el['party-answer'].value = 'Keep my answer'; f.el['party-name'].value = 'Amiga';
  await f.el['party-answer-form'].fire('submit');
  assert.equal(f.el['party-answer'].value, 'Keep my answer');
  assert.equal(f.el['party-submit'].disabled, false);
  assert.doesNotMatch(f.el['party-submit-status'].textContent, /Private/);
});

test('party adapter reuses the public client and only SELECTs and INSERTs party_answers', async () => {
  const calls = []; const query = {};
  for (const method of ['select', 'order', 'range', 'insert']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = async () => ({ data: [], error: null });
  const window = { supabase: { createClient: () => ({ from: (table) => { calls.push(['table', table]); return query; } }) } };
  vm.runInContext(source('js/supabase-client.js'), vm.createContext({ window, AbortController, setTimeout, clearTimeout }));
  await window.chasPartyAnswersApi.read(50);
  const payload = { prompt_id: 'una-palabra', answer: 'Hola', name: null, is_anonymous: true };
  await window.chasPartyAnswersApi.create(payload);
  assert.deepEqual(plain(calls), [
    ['table', 'party_answers'], ['select', 'id,prompt_id,answer,name,is_anonymous,created_at'],
    ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 50, 99],
    ['table', 'party_answers'], ['insert', payload],
  ]);
});

test('serious Chas appears only in the game and never becomes an album record', () => {
  const html = source('index.html');
  assert.equal((html.match(/chas-serious\.jpeg/g) || []).length, 1);
  assert.ok(html.indexOf('chas-serious.jpeg') > html.indexOf('id="party-game-title"'));
  assert.doesNotMatch(source('js/photos.js'), /chas-serious|17\.25\.10/);
  assert.match(html, /Si publicas sin nombre, tu nombre no se mostrará ni se guardará junto a esta respuesta\./);
  assert.doesNotMatch(html, /100% an[oó]nim/);
});

test('changing questions retains the previous draft and never repeats the same prompt immediately', async () => {
  const f = setup();
  const original = f.el['party-prompt'].textContent;
  f.el['party-answer'].value = 'My unsent memory';
  await f.el['party-next-question'].fire('click');
  assert.notEqual(f.el['party-prompt'].textContent, original);
  assert.equal(f.el['party-answer'].value, '');
  // Route to the original prompt deterministically through the configurable list.
  const originalIndex = f.window.chasPartyData.prompts.findIndex((item) => item.text === original);
  for (let attempt = 0; attempt < 30 && f.el['party-prompt'].textContent !== original; attempt++) {
    const currentText = f.el['party-prompt'].textContent;
    const choices = f.window.chasPartyData.prompts.filter((item) => item.text !== currentText);
    const slot = choices.findIndex((item) => item.id === f.window.chasPartyData.prompts[originalIndex].id);
    vm.runInContext(`Math.random = () => ${(slot + .5) / choices.length}`, f.context);
    await f.el['party-next-question'].fire('click');
  }
  assert.equal(f.el['party-answer'].value, 'My unsent memory');
});

test('a successful insert followed by a failed read remains a confirmed success', async () => {
  let reads = 0;
  const f = setup({ read: async () => { if (++reads > 1) throw new Error('Read unavailable'); return []; } }); await tick();
  f.el['party-answer'].value = 'A real answer'; f.el['party-name'].value = 'Amiga';
  await f.el['party-answer-form'].fire('submit');
  assert.equal(f.el['party-submit-status'].dataset.state, 'success');
  assert.equal(f.el['party-answer'].value, '');
  assert.match(f.el['party-read-status'].textContent, /no hace falta publicarla otra vez/);
});
