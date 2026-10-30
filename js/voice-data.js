'use strict';

(() => {
  const MAX_BYTES = 10 * 1024 * 1024;
  function validateDuration(seconds) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new Error('El audio debe durar entre 1 segundo y 2 minutos.');
    return seconds;
  }
  function validateBlob(blob) {
    if (!blob?.size) throw new Error('El audio quedó vacío. Prueba a grabarlo otra vez.');
    if (blob.size > MAX_BYTES) throw new Error('Este audio supera los 10 MB. Graba uno más corto.');
    if (!window.chasVoiceRecorder.extensionFor(blob.type)) throw new Error('No podemos guardar este formato de audio. Prueba con otro navegador.');
    return blob;
  }
  function storagePath(mimeType, uuid = crypto.randomUUID()) {
    const extension = window.chasVoiceRecorder.extensionFor(mimeType);
    if (!extension) throw new Error('Formato de audio no compatible.');
    return `uploads/${uuid}.${extension}`;
  }
  function createPayload({ path, name, anonymous, durationSeconds }) {
    const cleanName = String(name || '').trim();
    if (!path) throw new Error('Falta preparar el audio. Vuelve a grabarlo.');
    if (!anonymous && !cleanName) throw new Error('Escribe tu nombre o marca “Sin nombre”.');
    if (!anonymous && cleanName.length > 50) throw new Error('Usa un nombre de hasta 50 caracteres.');
    return {
      storage_path: path, name: anonymous ? null : cleanName,
      is_anonymous: Boolean(anonymous), duration_seconds: validateDuration(durationSeconds),
    };
  }
  function formatDuration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }
  async function publish(draft, identity, api, onStage = () => {}) {
    if (draft.blocked) throw new Error('Este envío necesita revisión. Comprueba los audios guardados antes de grabar otro.');
    validateBlob(draft.blob);
    validateDuration(draft.durationSeconds);
    // Validate the signature before creating any Storage object.
    const payload = createPayload({ path: draft.path || 'pending', durationSeconds: draft.durationSeconds, ...identity });
    if (!draft.path) draft.path = storagePath(draft.blob.type);
    payload.storage_path = draft.path;
    onStage('uploading');
    try {
      await api.upload(draft.path, draft.blob);
    } catch (error) {
      console.error('Voice Storage upload failed (path may need review if response was lost):', { storage_path: draft.path, error });
      // Retry the SAME path, never a fresh object. A conflict means the earlier
      // response may have been lost; do not overwrite or create another copy.
      if (Number(error?.statusCode || error?.status) === 409) draft.blocked = true;
      throw new Error(draft.blocked
        ? 'Este audio parece haber llegado antes. Comprueba la lista antes de grabar otro; este envío necesita revisión.'
        : 'No pudimos subir tu audio. Lo tienes aquí para escucharlo y volver a intentar.');
    }
    onStage('registering');
    try {
      await api.create(payload);
    } catch (error) {
      draft.blocked = true;
      console.error('Voice metadata registration failed; possible orphan object for administrative cleanup:', { storage_path: draft.path, error });
      throw new Error('No pudimos confirmar que el audio quedara guardado. Comprueba la lista antes de grabar otro. Este envío necesita revisión.');
    }
    return payload;
  }
  window.chasVoiceData = Object.freeze({ MAX_BYTES, validateDuration, validateBlob, storagePath, createPayload, formatDuration, publish });
})();
