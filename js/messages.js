'use strict';

(() => {
  const form = document.querySelector('#wish-form');
  const contentInput = document.querySelector('#wish-message');
  const nameInput = document.querySelector('#wish-name');
  const anonymousInput = document.querySelector('#wish-anonymous');
  const submitButton = document.querySelector('#wish-submit');
  const submitLabel = 'Enviar mi notita <span aria-hidden="true">↗</span>';
  const formStatus = document.querySelector('#wish-status');
  const list = document.querySelector('#messages-list');
  const listStatus = document.querySelector('#messages-status');
  const refreshButton = document.querySelector('#messages-refresh');
  const moreButton = document.querySelector('#messages-more');
  let sending = false;
  let readGeneration = 0;
  let loadedCount = 0;
  const dateFormatter = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

  function status(element, text, state = '') {
    element.dataset.state = state;
    element.textContent = text;
  }

  function updateNameField() {
    nameInput.disabled = sending || anonymousInput.checked;
    nameInput.required = !anonymousInput.checked;
    if (anonymousInput.checked) nameInput.removeAttribute('aria-invalid');
  }

  function setSending(value) {
    sending = value;
    form.setAttribute('aria-busy', String(value));
    contentInput.disabled = value;
    anonymousInput.disabled = value;
    submitButton.disabled = value;
    if (value) submitButton.textContent = 'Enviando…';
    else submitButton.innerHTML = submitLabel;
    updateNameField();
  }

  function validate() {
    contentInput.removeAttribute('aria-invalid');
    nameInput.removeAttribute('aria-invalid');
    const content = contentInput.value.trim();
    const name = nameInput.value.trim();
    let invalidInput;
    let error;
    if (!content) {
      invalidInput = contentInput;
      error = 'Escribe unas palabras para Chas antes de enviar.';
    } else if (content.length > 1000) {
      invalidInput = contentInput;
      error = 'Tu notita puede tener hasta 1000 caracteres. ¿La acortas un poquito?';
    } else if (!anonymousInput.checked && !name) {
      invalidInput = nameInput;
      error = 'Escribe tu nombre o marca “Sin nombre”.';
    } else if (!anonymousInput.checked && name.length > 50) {
      invalidInput = nameInput;
      error = 'Usa un nombre de hasta 50 caracteres.';
    }
    if (error) {
      status(formStatus, error, 'error');
      invalidInput.setAttribute('aria-invalid', 'true');
      invalidInput.focus();
      return null;
    }
    return { content, name: anonymousInput.checked ? null : name, is_anonymous: anonymousInput.checked };
  }

  function messageCard(message) {
    const card = document.createElement('article');
    card.className = 'message-card';
    const content = document.createElement('p');
    content.className = 'message-content';
    content.setAttribute('translate', 'no');
    content.textContent = message.content;
    const signature = document.createElement('h4');
    signature.className = 'message-signature';
    signature.setAttribute('translate', !message.is_anonymous && message.name?.trim() ? 'no' : 'yes');
    signature.textContent = message.is_anonymous ? 'Anónimo' : (message.name?.trim() || 'Sin firma');
    card.append(content, signature);
    if (message.created_at) {
      const date = new Date(message.created_at);
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

  async function loadMessages({ append = false, afterSend = false } = {}) {
    const generation = ++readGeneration;
    const offset = append ? loadedCount : 0;
    refreshButton.disabled = true;
    moreButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    status(listStatus, append ? 'Cargando más notitas…' : 'Cargando las notitas…');
    try {
      const rows = await window.chasMessagesApi.read(offset);
      if (generation !== readGeneration) return;
      if (!append) {
        list.replaceChildren();
        loadedCount = 0;
      }
      rows.forEach((message) => list.append(messageCard(message)));
      loadedCount += rows.length;
      moreButton.hidden = rows.length < window.chasMessagesApi.pageSize;
      status(listStatus, loadedCount ? '' : 'Todavía no hay notitas. ¿Dejas la primera?');
    } catch (error) {
      if (generation !== readGeneration) return;
      console.error('Could not read Chas messages:', error);
      status(listStatus, afterSend
        ? 'Tu notita se guardó, pero no pudimos actualizar la lista. Pulsa “Actualizar” para verla; no hace falta enviarla otra vez.'
        : 'No pudimos cargar las notitas. Revisa tu conexión y pulsa “Actualizar” para intentarlo otra vez.', 'error');
    } finally {
      if (generation === readGeneration) {
        refreshButton.disabled = false;
        moreButton.disabled = false;
        list.setAttribute('aria-busy', 'false');
      }
    }
  }

  anonymousInput.addEventListener('change', () => {
    updateNameField();
    status(formStatus, '');
  });
  [contentInput, nameInput].forEach((input) => input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    status(formStatus, '');
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    const payload = validate();
    if (!payload) return;
    setSending(true);
    status(formStatus, 'Guardando tu notita…');
    let saved = false;
    try {
      await window.chasMessagesApi.create(payload);
      saved = true;
      form.reset();
      status(formStatus, 'Tu notita ya está guardada. ¡Gracias por dejarme unas palabras! ♡', 'success');
    } catch (error) {
      console.error('Could not send Chas message:', error);
      // A lost response may follow a committed write. Never retry inserts
      // automatically; preserve the draft and invite the visitor to check first.
      status(formStatus, 'No pudimos confirmar el envío. Tu texto sigue aquí. Revisa tu conexión y actualiza las notitas antes de intentarlo otra vez.', 'error');
    } finally {
      setSending(false);
    }
    if (saved) await loadMessages({ afterSend: true });
  });
  refreshButton.addEventListener('click', () => loadMessages());
  moreButton.addEventListener('click', () => loadMessages({ append: true }));
  setSending(false);
  loadMessages();
})();
