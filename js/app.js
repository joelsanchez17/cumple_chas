'use strict';

const seedMemories = window.chasMemories;
let guestMemories = [];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const grid = $('#photo-grid');
const guestGrid = $('#guest-photo-grid');
const photoDialog = $('#photo-dialog');
const contributeDialog = $('#contribute-dialog');
let activeFilter = 'all';
let activeMemoryId = null;
let detailSequence = seedMemories;
let lastDialogTrigger = null;
let highlightedMemoryIds = new Set();

function filteredMemories() {
  return activeFilter === 'all' ? seedMemories : seedMemories.filter((item) => item.tags.includes(activeFilter));
}
function uploaderParameters(item) {
  return JSON.stringify({ 0: item.isAnonymousUploader ? { key: 'copy.c145' } : item.uploaderLabel });
}
function memoryCard(item, position) {
  const article = document.createElement('article');
  article.className = `memory-card${item.wide ? ' wide' : ''}${highlightedMemoryIds.has(item.id) ? ' newly-added' : ''}`;
  const button = document.createElement('button');
  button.className = 'memory-button';
  button.dataset.photo = item.id;
  button.setAttribute('aria-label', `Abrir recuerdo: ${item.title}`);
  if (item.origin !== 'guest') button.setAttribute('data-i18n-aria-label', `photo.open.${item.id.slice(-3)}`);
  const frame = document.createElement('div');
  frame.className = 'memory-image';
  const img = document.createElement('img');
  img.src = item.src;
  img.setAttribute('translate', item.origin === 'guest' && item.hasGuestCaption !== false ? 'no' : 'yes');
  img.alt = item.description;
  if (item.origin === 'guest' && item.hasGuestCaption === false) {
    img.setAttribute('data-i18n-alt', 'copy.c231');
    img.setAttribute('data-i18n-params', uploaderParameters(item));
  }
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = item.wide ? 2048 : 1536;
  img.height = item.wide ? 1152 : 2048;
  if (item.position) img.style.objectPosition = item.position;
  const number = document.createElement('span');
  number.className = 'photo-number';
  number.textContent = String(position).padStart(2, '0');
  number.setAttribute('aria-hidden', 'true');
  const arrow = document.createElement('span');
  arrow.className = 'photo-open';
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  frame.append(img, number, arrow);
  const title = document.createElement('span');
  title.className = 'memory-title';
  title.setAttribute('translate', item.origin === 'guest' && item.hasGuestCaption !== false ? 'no' : 'yes');
  title.textContent = item.title;
  const hint = document.createElement('span');
  hint.className = 'memory-hint';
  hint.textContent = item.origin === 'guest' ? `Por ${item.uploaderLabel}` : '¿Qué te nace decir?';
  if (item.origin === 'guest') {
    hint.setAttribute('data-i18n-text', 'copy.c212');
    hint.setAttribute('data-i18n-params', uploaderParameters(item));
  }
  button.append(frame, title, hint);
  article.append(button);
  return article;
}
function renderAlbum() {
  const items = filteredMemories();
  grid.replaceChildren(...items.map((item) => memoryCard(item, seedMemories.indexOf(item) + 1)));
  $('#album-count').textContent = activeFilter === 'all'
    ? `${seedMemories.length} recuerdos elegidos para este álbum.`
    : `${items.length} ${items.length === 1 ? 'recuerdo' : 'recuerdos'} de ${seedMemories.length} en el álbum.`;
}
function renderGuestPhotos() {
  guestGrid.replaceChildren(...guestMemories.map((item, index) => memoryCard(item, index + 1)));
  const count = $('#guest-photo-count');
  count.textContent = guestMemories.length
    ? `${guestMemories.length} ${guestMemories.length === 1 ? 'foto compartida' : 'fotos compartidas'} por mi gente.`
    : '';
}
function showDialog(dialog, trigger) {
  lastDialogTrigger = trigger || document.activeElement;
  dialog.showModal();
  document.documentElement.classList.add('dialog-open');
}
function closeDialog(dialog) { dialog.close(); }
[photoDialog, contributeDialog].forEach((dialog) => {
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('dialog-open');
    if (lastDialogTrigger?.isConnected) lastDialogTrigger.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    }
  });
  dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(dialog)));
});
function displayMemory(item) {
  activeMemoryId = item.id;
  $('#detail-image').src = item.src;
  ['detail-image', 'detail-title', 'detail-caption'].forEach((id) => document.getElementById(id).setAttribute('translate', item.origin === 'guest' && item.hasGuestCaption !== false ? 'no' : 'yes'));
  ['detail-image', 'detail-caption', 'detail-uploader'].forEach((id) => {
    const element = document.getElementById(id);
    element.removeAttribute('data-i18n-text');
    element.removeAttribute('data-i18n-alt');
    element.setAttribute('data-i18n-params', uploaderParameters(item));
  });
  if (item.origin === 'guest') {
    $('#detail-uploader').setAttribute('data-i18n-text', 'copy.c213');
    if (item.hasGuestCaption === false) {
      $('#detail-caption').setAttribute('data-i18n-text', 'copy.c231');
      $('#detail-image').setAttribute('data-i18n-alt', 'copy.c231');
    }
  }
  $('#detail-image').alt = item.description;
  $('#detail-title').textContent = item.title;
  $('#detail-caption').textContent = item.description;
  $('#detail-uploader').textContent = item.origin === 'guest' ? `Sumada por ${item.uploaderLabel}` : '';
  $('#detail-position').textContent = `${detailSequence.indexOf(item) + 1} / ${detailSequence.length}`;
  photoDialog.dataset.photoId = item.id;
  photoDialog.dispatchEvent(new CustomEvent('memory:change', { detail: { photoId: item.id } }));
  photoDialog.scrollTop = 0;
  $('#detail-content').scrollTop = 0;
}
function openMemory(id, trigger) {
  const all = [...seedMemories, ...guestMemories];
  const item = all.find((entry) => entry.id === id);
  if (!item) return;
  if (item.origin === 'guest') detailSequence = guestMemories;
  else {
    const filtered = filteredMemories();
    detailSequence = filtered.some((entry) => entry.id === id) ? filtered : seedMemories;
  }
  displayMemory(item);
  showDialog(photoDialog, trigger);
}
function stepPhoto(direction) {
  const index = detailSequence.findIndex((entry) => entry.id === activeMemoryId);
  displayMemory(detailSequence[(index + direction + detailSequence.length) % detailSequence.length]);
}
$('#previous-photo').addEventListener('click', () => stepPhoto(-1));
$('#next-photo').addEventListener('click', () => stepPhoto(1));
photoDialog.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    stepPhoto(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
document.addEventListener('click', (event) => {
  const photoButton = event.target.closest('[data-photo], [data-show-photo]');
  if (photoButton) {
    event.preventDefault();
    openMemory(photoButton.dataset.photo || photoButton.dataset.showPhoto, photoButton);
  }
  const contributeButton = event.target.closest('[data-contribute]');
  if (contributeButton) showDialog(contributeDialog, contributeButton);
});
$$('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  $$('[data-filter]').forEach((filter) => {
    const selected = filter === button;
    filter.classList.toggle('active', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  renderAlbum();
}));
$('#random-photo').addEventListener('click', (event) => {
  const items = filteredMemories();
  openMemory(items[Math.floor(Math.random() * items.length)].id, event.currentTarget);
});
function updateActiveNavigation() {
  const sections = ['inicio', 'album', 'para-chas'];
  let active = 'inicio';
  for (const id of sections) {
    if (document.getElementById(id).getBoundingClientRect().top <= window.innerHeight * .38) active = id;
  }
  $$('.nav-item[data-section]').forEach((link) => {
    const selected = link.dataset.section === active;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
let navigationFrame = false;
window.addEventListener('scroll', () => {
  if (navigationFrame) return;
  navigationFrame = true;
  requestAnimationFrame(() => { updateActiveNavigation(); navigationFrame = false; });
}, { passive: true });
window.addEventListener('resize', updateActiveNavigation);
renderAlbum();
renderGuestPhotos();
updateActiveNavigation();

window.chasAlbum = Object.freeze({
  openPhoto(id, trigger) { openMemory(id, trigger); },
  openUpload(trigger) { showDialog(contributeDialog, trigger); },
  setGuestPhotos(items) {
    const loadedIds = new Set(items.map((item) => item.id));
    guestMemories = [...items, ...guestMemories.filter((item) => !loadedIds.has(item.id))]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    renderGuestPhotos();
  },
  addGuestPhotos(items) {
    const ids = new Set(items.map((item) => item.id));
    guestMemories = [...items, ...guestMemories.filter((item) => !ids.has(item.id))]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    renderGuestPhotos();
  },
  hasPhoto(id) {
    return seedMemories.some((item) => item.id === id) || guestMemories.some((item) => item.id === id);
  },
  guestPhotoCount() {
    return guestMemories.length;
  },
  revealGuestPhotos(ids) {
    highlightedMemoryIds = new Set(ids);
    renderGuestPhotos();
    requestAnimationFrame(() => {
      const first = ids.length ? document.querySelector(`[data-photo="${ids[0]}"]`) : null;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      (first?.closest('.memory-card') || $('#guest-photos')).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => {
        highlightedMemoryIds.clear();
        $$('.memory-card.newly-added').forEach((card) => card.classList.remove('newly-added'));
      }, 4500);
    });
  },
});
