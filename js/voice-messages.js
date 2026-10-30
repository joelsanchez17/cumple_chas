'use strict';

(() => {
  const get = (id) => document.getElementById(id);
  const tools = window.chasVoiceData;
  const recording = window.chasVoiceRecorder;
  const api = window.chasVoiceMessagesApi;
  const noteTab = get('note-tab');
  const voiceTab = get('voice-tab');
  const noteForm = get('wish-form');
  const voicePanel = get('voice-panel');
  const workspace = get('voice-workspace');
  const success = get('voice-success');
  const recordButton = get('voice-record');
  const stopButton = get('voice-stop');
  const cancelButton = get('voice-cancel');
  const review = get('voice-review');
  const preview = get('voice-preview');
  const form = get('voice-form');
  const nameInput = get('voice-name');
  const anonymousInput = get('voice-anonymous');
  const sendButton = get('voice-send');
  const rerecordButton = get('voice-rerecord');
  const discardButton = get('voice-discard');
  const formStatus = get('voice-status');
  const list = get('voices-list');
  const listStatus = get('voices-status');
  const refreshButton = get('voices-refresh');
  const moreButton = get('voices-more');
  const timer = get('voice-timer');
  const warning = get('voice-limit-warning');
  const unavailable = recording.availability();
  const dateFormatter = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
  let draft = null;
  let previewUrl = null;
  let sending = false;
  let phase = 'idle';
  let readGeneration = 0;
  let loadedCount = 0;

  function status(element, text, state = '') {
    element.textContent = text;
    element.dataset.state = state;
  }
  function updateControls() {
    const active = ['requesting', 'recording', 'stopping'].includes(phase);
    recordButton.hidden = Boolean(draft) || phase === 'recording' || phase === 'stopping';
    recordButton.disabled = Boolean(unavailable) || sending || phase !== 'idle';
    stopButton.hidden = !['recording', 'stopping'].includes(phase);
    stopButton.disabled = phase !== 'recording';
    cancelButton.hidden = !active;
    cancelButton.disabled = phase === 'stopping';
    review.hidden = !draft;
    sendButton.disabled = !draft || draft.blocked || sending;
    nameInput.disabled = sending || anonymousInput.checked;
    nameInput.required = !anonymousInput.checked;
    anonymousInput.disabled = sending;
    rerecordButton.disabled = sending;
    discardButton.disabled = sending;
    form.setAttribute('aria-busy', String(sending));
    get('voice-recording-state').dataset.phase = phase;
    get('voice-state-label').textContent = {
      idle: draft ? 'Listo para escucharlo.' : 'Cuando quieras, te escucho.',
      requesting: 'Esperando permiso del micrófono…',
      recording: 'Grabando tu mensaje…',
      stopping: 'Preparando tu audio…',
    }[phase];
  }
  function clearPreview() {
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    draft = null;
  }
  function resetWorkspace() {
    clearPreview();
    form.reset();
    warning.hidden = true;
    timer.textContent = '0:00 / 2:00';
    workspace.hidden = false;
    success.hidden = true;
    nameInput.removeAttribute('aria-invalid');
    status(formStatus, unavailable);
    updateControls();
  }
  const recorder = recording.createRecorder({
    onState(value) { phase = value; updateControls(); },
    onTick(seconds) {
      timer.textContent = `${tools.formatDuration(seconds)} / 2:00`;
      warning.hidden = seconds < 105;
    },
    onReady(result) {
      try {
        tools.validateBlob(result.blob);
        draft = { blob: result.blob, durationSeconds: result.durationSeconds, path: null, blocked: false };
        previewUrl = URL.createObjectURL(result.blob);
        preview.src = previewUrl;
        timer.textContent = `${tools.formatDuration(result.durationSeconds)} / 2:00`;
        warning.hidden = true;
        status(formStatus, result.limitReached
          ? 'Llegaste al límite de dos minutos. Escúchalo antes de enviarlo.'
          : 'Puedes escucharlo, grabar de nuevo o enviarlo cuando quieras.');
      } catch (error) {
        console.error('Could not prepare voice preview:', error);
        clearPreview();
        status(formStatus, 'No pudimos preparar este audio, o supera los 10 MB. Prueba con una grabación más corta.', 'error');
      }
      updateControls();
    },
    onError(error, text) {
      if (error) console.error('Voice recording failed:', error);
      warning.hidden = true;
      status(formStatus, text, 'error');
      updateControls();
    },
  });
  function selectMode(mode, focus = false) {
    const voice = mode === 'voice';
    if (!voice && phase === 'recording') recorder.stop();
    if (!voice && phase === 'requesting') recorder.cancel();
    if (!voice) preview.pause();
    noteForm.hidden = voice;
    voicePanel.hidden = !voice;
    [noteTab, voiceTab].forEach((tab, index) => {
      const selected = voice === Boolean(index);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (focus) (voice ? voiceTab : noteTab).focus();
  }
  noteTab.addEventListener('click', () => selectMode('note'));
  voiceTab.addEventListener('click', () => selectMode('voice'));
  [noteTab, voiceTab].forEach((tab) => tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const mode = event.key === 'Home' ? 'note' : event.key === 'End' ? 'voice' : tab === noteTab ? 'voice' : 'note';
    selectMode(mode, true);
  }));
  async function startRecording() {
    if (sending) return;
    resetWorkspace();
    status(formStatus, '');
    await recorder.start();
  }
  recordButton.addEventListener('click', startRecording);
  rerecordButton.addEventListener('click', startRecording);
  get('voice-another').addEventListener('click', startRecording);
  stopButton.addEventListener('click', () => recorder.stop());
  cancelButton.addEventListener('click', () => { recorder.cancel(); resetWorkspace(); });
  discardButton.addEventListener('click', resetWorkspace);
  preview.addEventListener('error', () => {
    if (draft) status(formStatus, 'No pudimos reproducir este audio. Puedes grabar otro o probar con otro navegador.', 'error');
  });
  anonymousInput.addEventListener('change', () => {
    nameInput.removeAttribute('aria-invalid');
    status(formStatus, '');
    updateControls();
  });
  nameInput.addEventListener('input', () => { nameInput.removeAttribute('aria-invalid'); status(formStatus, ''); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || !draft || draft.blocked) return;
    try {
      tools.createPayload({ path: 'pending', name: nameInput.value, anonymous: anonymousInput.checked, durationSeconds: draft.durationSeconds });
    } catch (error) {
      status(formStatus, error.message, 'error');
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      return;
    }
    sending = true;
    preview.pause();
    updateControls();
    let saved = false;
    try {
      await tools.publish(draft, { name: nameInput.value, anonymous: anonymousInput.checked }, api, (stage) => {
        status(formStatus, stage === 'uploading' ? 'Subiendo tu audio…' : 'Guardando tu mensaje entre los recuerdos…');
      });
      saved = true;
      clearPreview();
      form.reset();
      workspace.hidden = true;
      success.hidden = false;
      status(formStatus, '');
      success.focus({ preventScroll: true });
    } catch (error) {
      status(formStatus, error.message || 'No pudimos guardar tu audio. Prueba de nuevo más tarde.', 'error');
    } finally {
      sending = false;
      updateControls();
    }
    if (saved) await loadVoices({ afterSend: true });
  });
  function audioCard(row) {
    const card = document.createElement('article');
    card.className = 'message-card voice-card';
    const author = document.createElement('h4');
    author.className = 'message-signature';
    author.textContent = row.is_anonymous ? 'Anónimo' : (row.name?.trim() || 'Sin firma');
    const detail = document.createElement('p');
    detail.className = 'voice-card-detail';
    detail.textContent = row.duration_seconds ? tools.formatDuration(row.duration_seconds) : 'Mensaje de voz';
    const date = new Date(row.created_at);
    if (row.created_at && !Number.isNaN(date.getTime())) {
      const time = document.createElement('time');
      time.dateTime = date.toISOString();
      time.textContent = ` · ${dateFormatter.format(date)}`;
      detail.append(time);
    }
    const player = document.createElement('audio');
    player.controls = true;
    player.preload = 'none';
    player.src = api.publicUrl(row.storage_path);
    player.setAttribute('aria-label', `Escuchar mensaje de ${author.textContent}`);
    const playbackStatus = document.createElement('p');
    playbackStatus.className = 'message-status';
    playbackStatus.setAttribute('role', 'status');
    player.addEventListener('error', () => status(playbackStatus, 'No pudimos reproducir este audio. Revisa tu conexión o prueba con otro navegador.', 'error'));
    card.append(author, detail, player, playbackStatus);
    return card;
  }
  async function loadVoices({ append = false, afterSend = false } = {}) {
    const generation = ++readGeneration;
    refreshButton.disabled = true;
    moreButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    status(listStatus, 'Buscando los mensajes de voz…');
    try {
      const rows = await api.read(append ? loadedCount : 0);
      if (generation !== readGeneration) return;
      if (!append) {
        list.querySelectorAll('audio').forEach((player) => player.pause());
        list.replaceChildren();
        loadedCount = 0;
      }
      rows.forEach((row) => list.append(audioCard(row)));
      loadedCount += rows.length;
      moreButton.hidden = rows.length < api.pageSize;
      status(listStatus, loadedCount ? '' : 'Todavía no hay audios. ¿Me dejas el primero?');
    } catch (error) {
      if (generation !== readGeneration) return;
      console.error('Could not read voice messages:', error);
      status(listStatus, afterSend
        ? 'Tu audio se guardó, pero no pudimos actualizar la lista. Pulsa “Actualizar”; no hace falta enviarlo otra vez.'
        : 'No pudimos cargar los audios. Revisa tu conexión y pulsa “Actualizar”.', 'error');
    } finally {
      if (generation === readGeneration) {
        refreshButton.disabled = false;
        moreButton.disabled = false;
        list.setAttribute('aria-busy', 'false');
      }
    }
  }
  refreshButton.addEventListener('click', () => loadVoices());
  moreButton.addEventListener('click', () => loadVoices({ append: true }));
  get('voice-listen').addEventListener('click', () => {
    get('saved-voices').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    get('voices-title').focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'recording') recorder.stop();
    if (document.hidden && phase === 'requesting') recorder.cancel();
  });
  window.addEventListener('pagehide', () => { recorder.dispose(); resetWorkspace(); });
  updateControls();
  if (unavailable) status(formStatus, unavailable);
  loadVoices();
})();
