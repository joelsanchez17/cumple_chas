'use strict';

(() => {
  const api = window.chasGuestPhotosApi;
  const tools = window.chasPhotoUpload;
  const status = document.querySelector('#guest-photos-status');
  const grid = document.querySelector('#photo-grid');
  const form = document.querySelector('#photo-upload-form');
  const input = document.querySelector('#photo-files');
  const previews = document.querySelector('#photo-previews');
  const selectionStatus = document.querySelector('#photo-selection-status');
  const uploadStatus = document.querySelector('#photo-upload-status');
  const submit = document.querySelector('#photo-upload-submit');
  const reset = document.querySelector('#photo-upload-reset');
  const uploaderName = document.querySelector('#photo-uploader-name');
  const anonymous = document.querySelector('#photo-uploader-anonymous');
  const fields = document.querySelector('#photo-uploader-fields');
  const progress = document.querySelector('#photo-upload-progress');
  const progressBar = progress.querySelector('span');
  const stageStatus = document.querySelector('#photo-upload-stage');
  const result = document.querySelector('#photo-upload-result');
  const resultTitle = document.querySelector('#photo-upload-result-title');
  const resultDetail = document.querySelector('#photo-upload-result-detail');
  const workspace = document.querySelector('#photo-upload-workspace');
  const success = document.querySelector('#photo-upload-success');
  const successTitle = document.querySelector('#photo-upload-success-title');
  const successDetail = document.querySelector('#photo-upload-success-detail');
  const viewAlbum = document.querySelector('#photo-upload-view');
  const uploadAnother = document.querySelector('#photo-upload-another');
  const submitLabel = document.querySelector('#photo-upload-submit-label');
  const dialog = document.querySelector('#contribute-dialog');
  let items = [];
  let uploading = false;
  let uploadRun = null;
  let uploadedMemoryIds = [];

  function setStatus(element, text, state = '') {
    element.textContent = text;
    element.dataset.state = state;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function asMemory(row) {
    const label = row.is_anonymous ? 'Anónimo' : (row.uploader_name?.trim() || 'Anónimo');
    const caption = row.caption?.trim() || '';
    return {
      id: tools.guestPhotoId(row.id),
      src: api.publicUrl(row.storage_path),
      title: caption || 'Esta también va al álbum',
      description: caption || `Un recuerdo que sumó ${label}.`,
      tags: [], origin: 'guest', uploaderLabel: label, createdAt: row.created_at,
    };
  }

  async function loadGuestPhotos() {
    if (!api) {
      setStatus(status, 'No pudimos conectar con los recuerdos de mi gente. Las fotos originales siguen aquí.', 'error');
      grid.setAttribute('aria-busy', 'false');
      return;
    }
    try {
      const rows = await api.read();
      window.chasAlbum.setGuestPhotos((rows || []).map(asMemory));
      setStatus(status, rows?.length ? '' : 'Todavía nadie sumó una foto. ¿Estrenas tú esta página?');
    } catch (error) {
      console.error('Could not load guest photos:', error);
      setStatus(status, 'No pudimos cargar las fotos nuevas. Las 19 originales siguen disponibles; prueba recargando la página.', 'error');
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function stateLabel(item) {
    return {
      selected: formatBytes(item.file.size),
      compressing: 'Preparando…',
      uploading: 'Subiendo…',
      registering: 'Guardando en el álbum…',
      success: `Lista · ${formatBytes(item.compressedSize)}`,
      error: item.error || 'No se pudo subir',
    }[item.status] || '';
  }

  function renderPreviews() {
    previews.replaceChildren();
    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = `upload-preview is-${item.status}`;
      const visual = document.createElement('div');
      visual.className = 'upload-preview-image';
      const image = document.createElement('img');
      image.src = item.previewUrl;
      image.alt = '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-photo';
      remove.dataset.removeUpload = item.key;
      remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
      remove.textContent = '×';
      remove.disabled = uploading || item.status === 'success';
      visual.append(image, remove);
      const label = document.createElement('label');
      label.textContent = 'Agregar contexto (opcional)';
      const caption = document.createElement('textarea');
      caption.rows = 2;
      caption.maxLength = 280;
      caption.placeholder = 'Dónde fue, qué estaba pasando…';
      caption.value = item.caption;
      caption.disabled = uploading || item.status === 'success';
      caption.addEventListener('input', () => { item.caption = caption.value; });
      const itemStatus = document.createElement('p');
      itemStatus.className = 'upload-item-status';
      itemStatus.textContent = stateLabel(item);
      label.append(caption);
      card.append(visual, label, itemStatus);
      previews.append(card);
    });
    fields.hidden = items.length === 0;
    const retryable = items.some((item) => item.status !== 'success' && item.retryable !== false);
    submit.disabled = uploading || !retryable;
    const retryCount = items.filter((item) => item.status === 'error' && item.retryable !== false).length;
    submitLabel.textContent = retryCount ? `Reintentar ${retryCount === 1 ? 'foto' : 'fotos'}` : 'Subir al álbum';
    reset.hidden = !items.length || uploading || retryable;
  }

  function resetProgress() {
    uploadRun = null;
    progressBar.style.width = '0%';
    progress.setAttribute('aria-valuenow', '0');
    setStatus(stageStatus, '');
  }

  function showProgress(item) {
    if (!uploadRun) return;
    const position = uploadRun.positions.get(item.key);
    if (!position) return;
    const weights = { compressing: 0.08, uploading: 0.4, registering: 0.78, success: 1, error: 1 };
    const value = Math.round(((position - 1 + (weights[item.status] || 0)) / uploadRun.total) * 100);
    progressBar.style.width = `${value}%`;
    progress.setAttribute('aria-valuenow', String(value));
    const message = tools.progressMessage(item.status, position, uploadRun.total);
    if (message) setStatus(stageStatus, message);
  }

  function clearBatch() {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    items = [];
    form.reset();
    input.value = '';
    anonymous.checked = false;
    uploaderName.disabled = false;
    uploaderName.required = true;
    workspace.hidden = false;
    success.hidden = true;
    result.hidden = true;
    progress.hidden = true;
    uploadedMemoryIds = [];
    resetProgress();
    setStatus(selectionStatus, '');
    setStatus(uploadStatus, '');
    renderPreviews();
  }

  input.addEventListener('change', () => {
    const result = tools.validateSelection(input.files, items.length);
    setStatus(selectionStatus, result.error, result.error ? 'error' : '');
    result.files.forEach((file) => items.push({
      key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), caption: '', status: 'selected', error: '', saved: null, retryable: true,
    }));
    input.value = '';
    renderPreviews();
  });

  previews.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-upload]');
    if (!button || uploading) return;
    const index = items.findIndex((item) => item.key === button.dataset.removeUpload);
    if (index < 0 || items[index].status === 'success') return;
    URL.revokeObjectURL(items[index].previewUrl);
    items.splice(index, 1);
    setStatus(selectionStatus, '');
    renderPreviews();
  });

  anonymous.addEventListener('change', () => {
    uploaderName.disabled = anonymous.checked;
    uploaderName.required = !anonymous.checked;
    uploaderName.removeAttribute('aria-invalid');
    setStatus(uploadStatus, '');
  });

  async function uploadOne(item, change) {
    change('compressing');
    let compressed;
    try {
      compressed = await tools.compressImage(item.file);
    } catch (error) {
      console.error('Photo compression failed:', error);
      throw new Error('No pudimos preparar esta foto. Prueba con otra copia en JPG, PNG o WebP.');
    }
    item.compressedSize = compressed.blob.size;
    const storagePath = tools.createStoragePath(crypto.randomUUID(), compressed.blob.type);
    const payload = tools.createPhotoPayload({
      storagePath, uploaderName: uploaderName.value, caption: item.caption, anonymous: anonymous.checked,
    });
    change('uploading');
    try {
      await api.upload(storagePath, compressed.blob);
    } catch (error) {
      console.error('Photo Storage upload failed:', { storagePath, error });
      throw new Error('No pudimos subir esta foto. Revisa tu conexión y vuelve a intentarlo.');
    }
    change('registering');
    try {
      const row = await api.create(payload);
      if (!row?.id) throw new Error('The inserted photo row did not return its UUID');
      return row;
    } catch (error) {
      console.error('Photo metadata insert failed after Storage upload; an orphaned object may need administrative cleanup.', { storagePath, error });
      const failure = new Error('La foto llegó, pero no pudimos sumarla al álbum. No vuelvas a enviarla; avísanos para revisarla.');
      failure.noRetry = true;
      throw failure;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploading || !items.some((item) => item.status !== 'success' && item.retryable !== false)) return;
    if (!anonymous.checked && !uploaderName.value.trim()) {
      uploaderName.setAttribute('aria-invalid', 'true');
      uploaderName.focus();
      setStatus(uploadStatus, 'Escribe tu nombre o marca “Sin nombre”.', 'error');
      return;
    }
    uploading = true;
    uploaderName.disabled = true;
    anonymous.disabled = true;
    progress.hidden = false;
    result.hidden = true;
    setStatus(uploadStatus, '');
    progressBar.style.width = '0%';
    progress.setAttribute('aria-valuenow', '0');
    renderPreviews();
    const pending = items.filter((item) => item.status !== 'success' && item.retryable !== false);
    const pendingCount = pending.length;
    uploadRun = { total: pendingCount, positions: new Map(pending.map((item, index) => [item.key, index + 1])) };
    setStatus(stageStatus, tools.progressMessage('compressing', 1, pendingCount));
    const results = await tools.uploadBatch(items, uploadOne, (item) => {
      showProgress(item);
      renderPreviews();
    });
    uploading = false;
    anonymous.disabled = false;
    uploaderName.disabled = anonymous.checked;
    const newSuccesses = results.filter((entry) => entry.ok && !entry.skipped);
    if (newSuccesses.length) {
      const memories = newSuccesses.map((entry) => asMemory(entry.value));
      window.chasAlbum.addGuestPhotos(memories);
      uploadedMemoryIds.push(...memories.map((memory) => memory.id));
    }
    const successCount = items.filter((item) => item.status === 'success').length;
    const failureCount = items.filter((item) => item.status === 'error').length;
    const copy = tools.resultCopy(successCount, failureCount);
    setStatus(stageStatus, '');
    if (!failureCount) {
      progressBar.style.width = '100%';
      progress.setAttribute('aria-valuenow', '100');
      successTitle.textContent = copy.title;
      successDetail.textContent = copy.detail;
      workspace.hidden = true;
      success.hidden = false;
    } else {
      resultTitle.textContent = copy.title;
      resultDetail.textContent = copy.detail;
      result.hidden = false;
      const failures = results.filter((entry) => !entry.ok && !entry.skipped);
      const retryableFailures = failures.filter((entry) => entry.item.retryable !== false).length;
      const retryCopy = retryableFailures ? ' Las que fallaron por conexión siguen aquí para reintentar.' : ' La foto marcada no debe reenviarse; avísanos para revisarla.';
      setStatus(uploadStatus, retryCopy.trim(), 'error');
    }
    renderPreviews();
  });

  reset.addEventListener('click', clearBatch);
  uploadAnother.addEventListener('click', clearBatch);
  viewAlbum.addEventListener('click', () => {
    if (dialog.open) dialog.close();
    window.chasAlbum.revealPhotos(uploadedMemoryIds);
  });
  uploaderName.addEventListener('input', () => { uploaderName.removeAttribute('aria-invalid'); setStatus(uploadStatus, ''); });
  renderPreviews();
  loadGuestPhotos();
})();
