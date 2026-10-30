'use strict';

(() => {
  const get = (id) => document.getElementById(id);
  const tools = window.chasPartyData;
  const api = window.chasPartyAnswersApi;
  const wheel = get('party-wheel');
  const spinButton = get('wheel-spin');
  const actionButton = get('wheel-action');
  const result = get('wheel-result');
  const form = get('party-answer-form');
  const answerInput = get('party-answer');
  const nameInput = get('party-name');
  const anonymousInput = get('party-anonymous');
  const submitButton = get('party-submit');
  const nextQuestion = get('party-next-question');
  const submitStatus = get('party-submit-status');
  const readStatus = get('party-read-status');
  const savedCard = get('party-saved-answer');
  const anotherAnswer = get('party-another-answer');
  const refreshButton = get('party-refresh');
  const moreButton = get('party-more');
  const drafts = new Map();
  let prompt = tools.chooseOther(tools.prompts);
  let rotation = 0;
  let spinning = false;
  let spinTimer;
  let selectedChallenge = null;
  let sending = false;
  let answers = [];
  let displayedId = null;
  let readGeneration = 0;
  let offset = 0;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function status(element, text, state = '') { element.textContent = text; element.dataset.state = state; }
  function scrollTo(element) { element.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
  function updateForm() {
    answerInput.disabled = sending;
    anonymousInput.disabled = sending;
    nameInput.disabled = sending || anonymousInput.checked;
    nameInput.required = !anonymousInput.checked;
    submitButton.disabled = sending;
    nextQuestion.disabled = sending;
    submitButton.textContent = sending ? 'Publicando…' : 'Publicar mi respuesta ↗';
    form.setAttribute('aria-busy', String(sending));
  }
  function changePrompt(next) {
    if (sending) return;
    if (prompt) drafts.set(prompt.id, answerInput.value);
    prompt = next;
    get('party-prompt').textContent = prompt.text;
    answerInput.value = drafts.get(prompt.id) || '';
    answerInput.removeAttribute('aria-invalid');
    nameInput.removeAttribute('aria-invalid');
    status(submitStatus, '');
  }
  tools.challenges.forEach((challenge, index) => {
    const label = document.createElement('span');
    label.className = 'wheel-label';
    label.style.setProperty('--angle', `${(index + .5) * 45}deg`);
    label.textContent = challenge.label;
    wheel.append(label);
  });
  function finishSpin() {
    if (!spinning) return;
    window.clearTimeout(spinTimer);
    spinning = false;
    spinButton.disabled = false;
    spinButton.textContent = 'Otra vuelta ↻';
    get('wheel-challenge').textContent = selectedChallenge.text;
    get('wheel-offline').hidden = Boolean(selectedChallenge.action);
    result.hidden = false;
    actionButton.hidden = !selectedChallenge.action;
  }
  spinButton.addEventListener('click', () => {
    if (spinning) return;
    spinning = true;
    result.hidden = true;
    actionButton.hidden = true;
    spinButton.disabled = true;
    spinButton.textContent = 'Girando…';
    const next = tools.spin(rotation);
    selectedChallenge = next.challenge;
    rotation = next.rotation;
    wheel.style.transition = reducedMotion() ? 'none' : '';
    wheel.style.transform = `rotate(${rotation}deg)`;
    if (reducedMotion()) finishSpin();
    else spinTimer = window.setTimeout(finishSpin, 3350);
  });
  wheel.addEventListener('transitionend', (event) => { if (event.target === wheel && event.propertyName === 'transform') finishSpin(); });
  actionButton.addEventListener('click', () => {
    if (!selectedChallenge || spinning) return;
    switch (selectedChallenge.action) {
      case 'upload': window.chasAlbum.openUpload(actionButton); break;
      case 'voice':
        get('voice-tab').click();
        scrollTo(get('voice-panel'));
        get('voice-record').focus({ preventScroll: true });
        break;
      case 'note': case 'memory':
        get('note-tab').click();
        scrollTo(get('wish-form'));
        get('wish-message').focus({ preventScroll: true });
        break;
      case 'comment': {
        const photo = tools.chooseOther(window.chasMemories);
        window.chasAlbum.openPhoto(photo.id, actionButton);
        break;
      }
      case 'gossip':
        if (sending) { scrollTo(form); return; }
        changePrompt(tools.prompts.find((item) => item.id === 'chisme-inocente'));
        scrollTo(get('party-question-card'));
        answerInput.focus({ preventScroll: true });
        break;
    }
  });
  nextQuestion.addEventListener('click', () => changePrompt(tools.chooseOther(tools.prompts, prompt.id)));
  anonymousInput.addEventListener('change', () => { nameInput.removeAttribute('aria-invalid'); status(submitStatus, ''); updateForm(); });
  [answerInput, nameInput].forEach((input) => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); status(submitStatus, ''); }));
  function displayAnswer() {
    const row = tools.chooseOther(answers, displayedId);
    if (!row) { savedCard.hidden = true; anotherAnswer.disabled = true; return; }
    displayedId = row.id;
    const question = tools.prompts.find((item) => item.id === row.prompt_id);
    get('party-saved-prompt').textContent = question?.text || 'Una respuesta de otra ronda';
    get('party-saved-content').setAttribute('translate', 'no');
    get('party-saved-content').textContent = row.answer;
    get('party-saved-author').setAttribute('translate', !row.is_anonymous && row.name?.trim() ? 'no' : 'yes');
    get('party-saved-author').textContent = row.is_anonymous ? 'Anónimo' : (row.name?.trim() || 'Sin firma');
    savedCard.hidden = false;
    anotherAnswer.disabled = answers.length < 2;
  }
  async function loadAnswers({ append = false, afterSend = false } = {}) {
    const generation = ++readGeneration;
    refreshButton.disabled = true;
    moreButton.disabled = true;
    status(readStatus, 'Buscando respuestas…');
    try {
      const rows = await api.read(append ? offset : 0);
      if (generation !== readGeneration) return;
      if (!append) { answers = []; offset = 0; }
      const ids = new Set(answers.map((row) => row.id));
      answers.push(...rows.filter((row) => !ids.has(row.id)));
      offset += rows.length;
      moreButton.hidden = rows.length < api.pageSize;
      displayAnswer();
      status(readStatus, answers.length ? '' : 'Todavía no hay respuestas publicadas. ¿Me dejas la primera?');
    } catch (error) {
      if (generation !== readGeneration) return;
      console.error('Could not read party answers:', error);
      status(readStatus, afterSend
        ? 'Tu respuesta se guardó, pero no pudimos refrescar las tarjetas. Pulsa “Actualizar”; no hace falta publicarla otra vez.'
        : 'No pudimos cargar las respuestas. Revisa tu conexión y pulsa “Actualizar”.', 'error');
    } finally {
      if (generation === readGeneration) { refreshButton.disabled = false; moreButton.disabled = false; }
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    let payload;
    try { payload = tools.answerPayload({ promptId: prompt.id, answer: answerInput.value, name: nameInput.value, anonymous: anonymousInput.checked }); }
    catch (error) {
      status(submitStatus, error.message, 'error');
      const input = !answerInput.value.trim() || answerInput.value.trim().length > 1000 ? answerInput : nameInput;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    sending = true;
    updateForm();
    status(submitStatus, 'Guardando tu respuesta…');
    let saved = false;
    try {
      await api.create(payload);
      saved = true;
      drafts.delete(prompt.id);
      form.reset();
      status(submitStatus, '¡Respuesta guardada! Gracias por sumar tu parte. ♡', 'success');
    } catch (error) {
      console.error('Could not send party answer:', error);
      status(submitStatus, 'No pudimos confirmar el envío. Tu respuesta sigue aquí. Actualiza las tarjetas antes de volver a intentarlo.', 'error');
    } finally { sending = false; updateForm(); }
    if (saved) await loadAnswers({ afterSend: true });
  });
  anotherAnswer.addEventListener('click', displayAnswer);
  refreshButton.addEventListener('click', () => loadAnswers());
  moreButton.addEventListener('click', () => loadAnswers({ append: true }));
  get('party-prompt').textContent = prompt.text;
  spinButton.disabled = false;
  updateForm();
  loadAnswers();
})();
