'use strict';

// Stable IDs belong to memories, independently of their source filenames.
// A future data adapter can merge guest memories into this same collection.
const photoSource = 'assets/images/chas/';
const memory = (id, file, title, description, tags, extra = {}) => ({
  id, src: photoSource + encodeURIComponent(`WhatsApp Image 2026-10-29 at ${file}.jpeg`),
  title, description, tags, origin: 'seed', ...extra,
});
const memories = [
  memory('sunny-smile', '15.02.07 (2)', 'Una sonrisa al sol', 'Yo, al sol, con mi chaqueta de cuero y una sonrisa que casi no cabe en la foto.', ['everyday']),
  memory('colorful-wigs', '14.01.29_7', 'Las pelucas tienen historia', 'Yo con peluca roja, en buena compañía. La violeta y las gafas de corazón también merecen su explicación.', ['costumes', 'friends']),
  memory('umbrella-street', '14.00.36', 'Debajo de mil colores', 'Yo, un vaso verde y un techo de paraguas de colores. El paseo ya tenía su propia decoración.', ['travel', 'everyday'], { position: 'center 65%' }),
  memory('book-cafe', '15.02.06 (2)', 'Un capítulo y algo rico', 'Mi libro abierto, algo rico en la mesa y yo haciendo una pausa entre páginas.', ['everyday']),
  memory('arms-open', '14.00.36_3', 'Así, con los brazos abiertos', 'Yo con los brazos abiertos y los ojos cerrados, disfrutando un ratito en plena calle.', ['everyday']),
  memory('louvre-night', '15.02.07 (4)', 'La noche también se pasea', 'Mi foto frente a la pirámide del Louvre. Las manos salieron movidas; la intención se entiende.', ['travel']),
  memory('costume-crew', '15.02.07 (7)', 'El reparto completo', 'Acá estoy con cinco personas más y unos cuantos disfraces. Hay bastante contexto pendiente.', ['friends', 'costumes']),
  memory('little-chapter', '14.01.29_6', 'Mi primer capítulo', 'Yo de pequeña, con vestido rosa y botas. El espejo guardó la otra versión de la foto.', ['everyday']),
  memory('night-out', '14.00.3_2', 'Una más y nos vamos…', 'Una selfie en plena salida, con compañía, luces y mucha gente alrededor.', ['friends']),
  memory('red-bridge', '14.01.29_4', 'Un guiño por aquí', 'Mi guiño junto a una barandilla roja, entre bambú y una pequeña cascada.', ['travel', 'everyday']),
  memory('costume-roar', '14.01.29_5', 'Hoy toca otra versión', 'Yo con maquillaje de disfraz y adornos en el pelo. Discreta no salió la pose.', ['costumes']),
  memory('rooftop', '15.02.06 (1)', 'Un ratito en las alturas', 'Yo en una terraza, con la ciudad detrás y una sonrisa de esas que salen sin pensarlo.', ['everyday', 'travel']),
  memory('coffee-stop', '15.02.06', 'Una pausa para el café', 'Mi pausa para el café, con la taza entre las manos y la calle de fondo.', ['everyday']),
  memory('waterside-selfie', '15.02.07 (1)', 'Mejor en compañía', 'Una selfie en compañía junto al agua. Detrás quedó ese edificio de torre y tejado verde.', ['travel', 'friends']),
  memory('rainy-wall', '15.02.07 (3)', 'Ni el frío me borra la sonrisa', 'Yo bien abrigada frente a un muro pintado. La lluvia también se vino a la foto.', ['travel']),
  memory('winter-cup', '15.02.07 (5)', 'Algo calentito entre luces', 'Yo en compañía, con una taza entre las manos y todas las luces del puesto detrás.', ['travel', 'friends']),
  memory('river-friends', '15.02.07 (8)', 'La ciudad de fondo. Mi gente, primero.', 'Yo compartiendo un abrazo en un puente. El río y la ciudad pusieron las luces.', ['travel', 'friends'], { wide: true }),
  memory('piggyback-square', '15.02.07 (9)', 'El paseo tomó otro rumbo', 'Yo a caballito en una plaza iluminada. Si tienes el contexto, este es el momento de contarlo.', ['travel', 'friends']),
  memory('riverside-wave', '15.02.07', 'Y que siga la aventura', 'Yo saludando junto al río, con mis guantes rojos y una torre iluminada a lo lejos.', ['travel']),
];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const grid = $('#photo-grid');
const photoDialog = $('#photo-dialog');
const contributeDialog = $('#contribute-dialog');
let activeFilter = 'all';
let activeMemoryId = null;
let detailSequence = memories;
let lastDialogTrigger = null;
// Photo-context drafts remain local previews. Published wishes use messages.js.
const contextDrafts = new Map();

function filteredMemories() {
  return activeFilter === 'all' ? memories : memories.filter((item) => item.tags.includes(activeFilter));
}
function renderAlbum() {
  const items = filteredMemories();
  grid.replaceChildren();
  items.forEach((item) => {
    const article = document.createElement('article');
    article.className = `memory-card${item.wide ? ' wide' : ''}`;
    const button = document.createElement('button');
    button.className = 'memory-button';
    button.dataset.photo = item.id;
    button.setAttribute('aria-label', `Abrir recuerdo: ${item.title}`);
    const frame = document.createElement('div');
    frame.className = 'memory-image';
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.description;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = item.wide ? 2048 : 1536;
    img.height = item.wide ? 1152 : 2048;
    if (item.position) img.style.objectPosition = item.position;
    const number = document.createElement('span');
    number.className = 'photo-number';
    number.textContent = String(memories.indexOf(item) + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const arrow = document.createElement('span');
    arrow.className = 'photo-open';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    frame.append(img, number, arrow);
    const title = document.createElement('span');
    title.className = 'memory-title';
    title.textContent = item.title;
    const hint = document.createElement('span');
    hint.className = 'memory-hint';
    hint.textContent = 'Esta foto necesita contexto…';
    button.append(frame, title, hint);
    article.append(button);
    grid.append(article);
  });
  $('#album-count').textContent = `${items.length} ${items.length === 1 ? 'recuerdo' : 'recuerdos'}${activeFilter === 'all' ? ' para empezar. Y espacio para muchos más.' : ` de ${memories.length} en el álbum.`}`;
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
function saveContextDraft() {
  if (activeMemoryId) contextDrafts.set(activeMemoryId, {
    text: $('#context-text').value,
    previewed: !$('#context-preview').hidden,
  });
}
function renderContextPreview(text) {
  const preview = $('#context-preview');
  preview.replaceChildren();
  const label = document.createElement('span');
  label.className = 'preview-label';
  label.textContent = 'Tu nota de prueba · solo en esta sesión';
  const content = document.createElement('p');
  content.textContent = text;
  preview.append(label, content);
  preview.hidden = false;
}
function displayMemory(item) {
  activeMemoryId = item.id;
  $('#detail-image').src = item.src;
  $('#detail-image').alt = item.description;
  $('#detail-title').textContent = item.title;
  $('#detail-caption').textContent = item.description;
  $('#detail-position').textContent = `${detailSequence.indexOf(item) + 1} / ${detailSequence.length}`;
  const draft = contextDrafts.get(item.id);
  $('#context-text').value = draft?.text || '';
  $('#context-preview').hidden = true;
  if (draft?.previewed) renderContextPreview(draft.text);
  photoDialog.scrollTop = 0;
}
function openMemory(id, trigger) {
  const item = memories.find((entry) => entry.id === id);
  if (!item) return;
  const filtered = filteredMemories();
  detailSequence = filtered.some((entry) => entry.id === id) ? filtered : memories;
  displayMemory(item);
  showDialog(photoDialog, trigger);
}
function stepPhoto(direction) {
  saveContextDraft();
  const index = detailSequence.findIndex((entry) => entry.id === activeMemoryId);
  displayMemory(detailSequence[(index + direction + detailSequence.length) % detailSequence.length]);
}
$('#previous-photo').addEventListener('click', () => stepPhoto(-1));
$('#next-photo').addEventListener('click', () => stepPhoto(1));
photoDialog.addEventListener('close', saveContextDraft);
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
$('#context-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#context-text').value.trim();
  if (!text) return;
  renderContextPreview(text);
  saveContextDraft();
});

const contributionTypes = {
  photo: ['La foto que solo tienes tú', 'Aquí podrás elegir hasta 5 fotos por selección, revisarlas y sumarles unas palabras. Las fotos de la fiesta formarán parte de este mismo álbum.', 'Me falta tu parte del recuerdo.'],
  memory: ['¿Te acuerdas de aquella vez…?', 'Aquí podrás contar una historia y elegir si aparece tu nombre. Algunos de mis mejores recuerdos no tienen foto.', 'Las buenas historias merecen su página.'],
  audio: ['Tu voz también es un recuerdo', 'Aquí podrás grabar o adjuntar un audio, escucharlo antes de enviarlo y dejarme un mensaje con tu propia voz.', 'Por ahora, el micrófono sigue descansando.'],
  gossip: ['A ver, cuéntame el contexto', 'Aquí podrás contarme el chisme con cariño, con nombre o sin nombre público. Si es sobre una foto, podrás añadirlo desde ese recuerdo.', 'Con cariño. Siempre con cariño.'],
};
function renderContribution(kind) {
  const [title, text, aside] = contributionTypes[kind];
  const panel = $('#contribution-preview');
  panel.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = text;
  const note = document.createElement('span');
  note.className = 'handwritten';
  note.textContent = aside;
  panel.append(heading, description, note);
  $$('[data-kind]').forEach((button) => {
    const selected = button.dataset.kind === kind;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
$$('[data-kind]').forEach((button) => button.addEventListener('click', () => renderContribution(button.dataset.kind)));
let confettiTimeout;
$('#celebrate').addEventListener('click', () => {
  $('#celebration-status').textContent = '¡Feliz cumple, Chas!';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = $('#confetti');
  layer.replaceChildren();
  clearTimeout(confettiTimeout);
  const colors = ['#ad3150', '#f2bc57', '#377c78', '#d68e68', '#382334'];
  for (let index = 0; index < 55; index++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * .6}s`;
    piece.style.setProperty('--drift', `${Math.random() * 180 - 90}px`);
    piece.style.setProperty('--spin', `${Math.random() * 900 - 450}deg`);
    if (index % 3 === 0) piece.style.borderRadius = '50%';
    layer.append(piece);
  }
  confettiTimeout = setTimeout(() => layer.replaceChildren(), 3300);
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
renderContribution('photo');
updateActiveNavigation();
