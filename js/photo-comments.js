'use strict';

(() => {
  const dialog = document.querySelector('#photo-dialog');
  const form = document.querySelector('#comment-form');
  const contentInput = document.querySelector('#comment-content');
  const nameInput = document.querySelector('#comment-name');
  const anonymousInput = document.querySelector('#comment-anonymous');
  const submitButton = document.querySelector('#comment-submit');
  const submitLabel = submitButton.textContent;
  const formStatus = document.querySelector('#comment-status');
  const list = document.querySelector('#comments-list');
  const listStatus = document.querySelector('#comments-status');
  const refreshButton = document.querySelector('#comments-refresh');
  const moreButton = document.querySelector('#comments-more');
  const contextTag = document.querySelector('#photo-context-tag');
  const drafts = new Map();
  const dateFormatter = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
  let activePhotoId = null;
  let readGeneration = 0;
  let loadedCount = 0;

  function stateFor(photoId) {
    if (!drafts.has(photoId)) drafts.set(photoId, {
      content: '', name: '', anonymous: false, sending: false, feedback: '', feedbackState: '',
    });
    return drafts.get(photoId);
  }
  function status(element, text, state = '') {
    element.textContent = text;
    element.dataset.state = state;
  }
  function saveDraft() {
    if (!activePhotoId) return;
    Object.assign(stateFor(activePhotoId), {
      content: contentInput.value, name: nameInput.value, anonymous: anonymousInput.checked,
    });
  }
  function renderForm() {
    const state = activePhotoId ? stateFor(activePhotoId) : null;
    const disabled = !state || state.sending;
    contentInput.value = state?.content || '';
    nameInput.value = state?.name || '';
    anonymousInput.checked = state?.anonymous || false;
    contentInput.disabled = disabled;
    anonymousInput.disabled = disabled;
    nameInput.disabled = disabled || anonymousInput.checked;
    nameInput.required = !anonymousInput.checked;
    submitButton.disabled = disabled;
    submitButton.textContent = state?.sending ? 'Guardando…' : submitLabel;
    form.setAttribute('aria-busy', String(Boolean(state?.sending)));
    contentInput.removeAttribute('aria-invalid');
    nameInput.removeAttribute('aria-invalid');
    status(formStatus, state?.feedback || '', state?.feedbackState || '');
  }
  function feedback(state, text, kind = '') {
    state.feedback = text;
    state.feedbackState = kind;
  }
  function validate(state) {
    const content = state.content.trim();
    const name = state.name.trim();
    let input;
    let error;
    if (!content) {
      input = contentInput;
      error = 'Escribe el contexto de esta foto antes de enviar.';
    } else if (content.length > 1000) {
      input = contentInput;
      error = 'Tu comentario puede tener hasta 1000 caracteres.';
    } else if (!state.anonymous && !name) {
      input = nameInput;
      error = 'Escribe tu nombre o marca “Sin nombre”.';
    } else if (!state.anonymous && name.length > 50) {
      input = nameInput;
      error = 'Usa un nombre de hasta 50 caracteres.';
    }
    if (error) {
      feedback(state, error, 'error');
      renderForm();
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return null;
    }
    return { photo_id: activePhotoId, content, name: state.anonymous ? null : name, is_anonymous: state.anonymous };
  }
  function commentCard(comment) {
    const card = document.createElement('article');
    card.className = 'message-card photo-comment';
    const content = document.createElement('p');
    content.className = 'message-content';
    content.textContent = comment.content;
    const author = document.createElement('h4');
    author.className = 'message-signature';
    author.textContent = comment.is_anonymous ? 'Anónimo' : (comment.name?.trim() || 'Sin firma');
    card.append(content, author);
    if (comment.created_at) {
      const date = new Date(comment.created_at);
      if (!Number.isNaN(date.getTime())) {
        const time = document.createElement('time');
        time.className = 'message-date';
        time.dateTime = date.toISOString();
        time.textContent = dateFormatter.format(date);
        card.append(time);
      }
    }
    return card;
  }
  async function loadComments({ append = false, afterSend = false } = {}) {
    if (!activePhotoId) return;
    const photoId = activePhotoId;
    const generation = ++readGeneration;
    const offset = append ? loadedCount : 0;
    list.setAttribute('aria-busy', 'true');
    refreshButton.disabled = true;
    moreButton.disabled = true;
    status(listStatus, 'Buscando el contexto…');
    try {
      const rows = await window.chasPhotoCommentsApi.read(photoId, offset);
      if (generation !== readGeneration || activePhotoId !== photoId) return;
      if (!append) {
        list.replaceChildren();
        loadedCount = 0;
      }
      // Extra guard as well as the server-side equality filter.
      rows.filter((row) => row.photo_id === photoId).forEach((comment) => list.append(commentCard(comment)));
      loadedCount += rows.length;
      moreButton.hidden = rows.length < window.chasPhotoCommentsApi.pageSize;
      contextTag.textContent = list.children.length ? 'Hay chisme sobre esta foto 👀' : 'Esta foto necesita contexto…';
      status(listStatus, list.children.length ? '' : 'Todavía no hay comentarios en esta foto. ¿Empiezas tú?');
    } catch (error) {
      if (generation !== readGeneration || activePhotoId !== photoId) return;
      console.error('Could not read photo comments:', error);
      status(listStatus, afterSend
        ? 'Tu comentario se guardó, pero no pudimos actualizar la lista. Pulsa “Actualizar”; no hace falta enviarlo otra vez.'
        : 'No pudimos cargar el contexto de esta foto. Revisa tu conexión y pulsa “Actualizar”.', 'error');
    } finally {
      if (generation === readGeneration && activePhotoId === photoId) {
        list.setAttribute('aria-busy', 'false');
        refreshButton.disabled = false;
        moreButton.disabled = false;
      }
    }
  }
  function selectPhoto(photoId) {
    saveDraft();
    ++readGeneration;
    activePhotoId = window.chasAlbum?.hasPhoto(photoId) || window.chasMemories.some((item) => item.id === photoId) ? photoId : null;
    list.replaceChildren();
    loadedCount = 0;
    moreButton.hidden = true;
    contextTag.textContent = 'Esta foto necesita contexto…';
    status(listStatus, '');
    renderForm();
    if (activePhotoId) loadComments();
  }
  dialog.addEventListener('memory:change', (event) => selectPhoto(event.detail.photoId));
  dialog.addEventListener('close', () => {
    saveDraft();
    activePhotoId = null;
    ++readGeneration;
    renderForm();
  });
  [contentInput, nameInput].forEach((input) => input.addEventListener('input', () => {
    if (!activePhotoId) return;
    saveDraft();
    feedback(stateFor(activePhotoId), '');
    input.removeAttribute('aria-invalid');
    status(formStatus, '');
  }));
  anonymousInput.addEventListener('change', () => {
    if (!activePhotoId) return;
    saveDraft();
    feedback(stateFor(activePhotoId), '');
    renderForm();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activePhotoId) return;
    const photoId = activePhotoId;
    const state = stateFor(photoId);
    if (state.sending) return;
    saveDraft();
    const payload = validate(state);
    if (!payload) return;
    state.sending = true;
    feedback(state, 'Guardando tu comentario…');
    renderForm();
    let saved = false;
    try {
      await window.chasPhotoCommentsApi.create(payload);
      saved = true;
      Object.assign(state, { content: '', name: '', anonymous: false });
      feedback(state, '¡Contexto guardado! Gracias por sumar tu versión. ♡', 'success');
    } catch (error) {
      console.error('Could not send photo comment:', error);
      feedback(state, 'No pudimos confirmar el envío. Tu texto sigue aquí. Revisa la conexión y actualiza los comentarios antes de intentarlo otra vez.', 'error');
    } finally {
      state.sending = false;
      // Navigating while a request is pending must never overwrite another photo.
      if (activePhotoId === photoId) renderForm();
    }
    if (saved && activePhotoId === photoId) await loadComments({ afterSend: true });
  });
  refreshButton.addEventListener('click', () => loadComments());
  moreButton.addEventListener('click', () => loadComments({ append: true }));
  renderForm();
  // A guest may have opened a photo while the CDN scripts were still loading.
  if (dialog.open && dialog.dataset.photoId) selectPhoto(dialog.dataset.photoId);
})();
