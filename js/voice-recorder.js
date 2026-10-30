'use strict';

(() => {
  const MAX_SECONDS = 120;
  const MIME_TYPES = Object.freeze([
    'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mpeg',
  ]);
  const baseType = (type) => String(type || '').split(';')[0].trim().toLowerCase();
  const extensionFor = (type) => ({ 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' })[baseType(type)] || null;
  function selectMimeType(Recorder) {
    if (typeof Recorder?.isTypeSupported !== 'function') return null;
    return MIME_TYPES.find((type) => Recorder.isTypeSupported(type)) || null;
  }
  function availability(env = window) {
    if (!env.isSecureContext) return 'Para grabar, abre este álbum con una conexión segura (HTTPS) o desde localhost. Mientras tanto, puedes dejarme una notita.';
    if (!env.MediaRecorder || !env.navigator?.mediaDevices?.getUserMedia) return 'Este navegador no permite grabar audios. Prueba con otro o déjame una notita: también me encantará leerla.';
    return '';
  }
  function microphoneError(error) {
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) return 'No pudimos usar el micrófono. Puedes permitirlo en los ajustes del navegador y volver a probar, o dejarme una notita.';
    if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No encontramos un micrófono. Puedes probar con otro dispositivo o dejarme una notita.';
    if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error?.name)) return 'No pudimos acceder al micrófono. Comprueba que otra aplicación no lo esté usando y vuelve a probar.';
    return 'No pudimos grabar este audio. Prueba de nuevo o déjame una notita.';
  }

  function createRecorder({ onState = () => {}, onTick = () => {}, onReady = () => {}, onError = () => {} } = {}, env = window) {
    let phase = 'idle';
    let stream = null;
    let recorder = null;
    let chunks = [];
    let startedAt = 0;
    let stoppedAt = 0;
    let timer;
    let deadline;
    let run = 0;
    let discarded = false;
    let limitReached = false;
    let recordingError = null;
    const now = () => env.performance.now();
    function setPhase(value) { phase = value; onState(value); }
    function cleanup() {
      env.clearInterval(timer);
      env.clearTimeout(deadline);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    function stop(atLimit = false) {
      if (phase !== 'recording') return;
      stoppedAt = now();
      limitReached = atLimit;
      setPhase('stopping');
      env.clearInterval(timer);
      env.clearTimeout(deadline);
      try { recorder.stop(); } catch (error) {
        recordingError = error;
        cleanup();
        setPhase('idle');
        onError(error, microphoneError(error));
      }
    }
    function cancel() {
      ++run; // Also cancels a getUserMedia request that has not resolved yet.
      discarded = true;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch (error) { console.error('Could not stop discarded recording:', error); }
      }
      cleanup();
      chunks = [];
      setPhase('idle');
    }
    async function start() {
      if (phase !== 'idle') return;
      const unsupported = availability(env);
      if (unsupported) { onError(null, unsupported); return; }
      const token = ++run;
      discarded = false;
      recordingError = null;
      limitReached = false;
      setPhase('requesting');
      try {
        const media = await env.navigator.mediaDevices.getUserMedia({ audio: true });
        if (token !== run) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        const mimeType = selectMimeType(env.MediaRecorder);
        // If no advertised format matches, let the browser choose. Validate the
        // resulting MIME type before it can become an uploadable recording.
        recorder = mimeType ? new env.MediaRecorder(stream, { mimeType }) : new env.MediaRecorder(stream);
        chunks = [];
        recorder.ondataavailable = (event) => { if (token === run && event.data?.size) chunks.push(event.data); };
        recorder.onerror = (event) => { recordingError = event.error || new Error('MediaRecorder failed'); stop(); };
        recorder.onstop = () => {
          if (token !== run) return;
          const elapsed = ((stoppedAt || now()) - startedAt) / 1000;
          cleanup();
          setPhase('idle');
          if (discarded) return;
          if (recordingError) { onError(recordingError, microphoneError(recordingError)); return; }
          if (elapsed < 1 || elapsed > MAX_SECONDS) {
            onError(new Error(`Recording duration outside limit: ${elapsed}`), elapsed < 1
              ? 'Ese audio quedó muy cortito. Graba al menos un segundo.'
              : 'El navegador no pudo detener el audio a tiempo. Graba otro de hasta dos minutos y mantén esta página abierta.');
            return;
          }
          const actualType = baseType(recorder.mimeType || chunks[0]?.type || mimeType);
          if (!extensionFor(actualType)) {
            onError(new Error(`Unsupported recorded MIME type: ${actualType}`), 'Este navegador grabó un formato que no podemos guardar. Prueba con otro navegador o déjame una notita.');
            return;
          }
          const blob = new env.Blob(chunks, { type: actualType });
          chunks = [];
          onReady({ blob, durationSeconds: Math.ceil(elapsed), limitReached });
        };
        recorder.onstart = () => {
          if (token !== run) return;
          startedAt = now();
          stoppedAt = 0;
          setPhase('recording');
          onTick(0);
          timer = env.setInterval(() => onTick(Math.min(MAX_SECONDS, (now() - startedAt) / 1000)), 250);
          // A 100 ms safety margin avoids exceeding the maximum due to timer
          // scheduling. If the browser suspends timers, the elapsed-time guard
          // above rejects an overlong clip instead of mislabelling its duration.
          deadline = env.setTimeout(() => stop(true), MAX_SECONDS * 1000 - 100);
        };
        recorder.start();
      } catch (error) {
        if (token !== run) return;
        cleanup();
        setPhase('idle');
        onError(error, microphoneError(error));
      }
    }
    return Object.freeze({ start, stop: () => stop(false), cancel, dispose: cancel, get phase() { return phase; } });
  }
  window.chasVoiceRecorder = Object.freeze({ MAX_SECONDS, MIME_TYPES, baseType, extensionFor, selectMimeType, availability, microphoneError, createRecorder });
})();
