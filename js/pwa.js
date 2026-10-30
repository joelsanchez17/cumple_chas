'use strict';

(() => {
  const dismissalKey = 'chas:pwa-install-dismissed:v1';
  const panel = document.getElementById('pwa-install');
  const button = document.getElementById('pwa-install-button');
  const iosHelp = document.getElementById('pwa-ios-help');
  const feedback = document.getElementById('pwa-install-status');
  const welcome = document.getElementById('welcome-dialog');
  const offlineNote = document.getElementById('connection-note');
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const agent = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  const iosSafari = ios && /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram/.test(agent);
  let ready = false;
  let installed = false;
  let pendingPrompt = null;
  let prompting = false;
  let dismissed = false;
  try { dismissed = window.sessionStorage.getItem(dismissalKey) === 'yes'; }
  catch (error) { /* In-memory dismissal still works when storage is restricted. */ }

  function standalone() { return installed || displayMode.matches || navigator.standalone === true; }
  function render() {
    const visible = ready && !welcome.open && !standalone() && !dismissed && Boolean(pendingPrompt || iosSafari || feedback.textContent);
    panel.hidden = !visible;
    button.hidden = !pendingPrompt;
    button.disabled = prompting;
    iosHelp.hidden = !iosSafari;
  }
  function dismiss() {
    dismissed = true;
    pendingPrompt = null;
    try { window.sessionStorage.setItem(dismissalKey, 'yes'); }
    catch (error) { /* A restricted browser must still let visitors dismiss. */ }
    render();
  }
  function updateConnection() { offlineNote.hidden = navigator.onLine !== false; }
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();
  welcome.addEventListener('close', render);
  displayMode.addEventListener?.('change', render);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingPrompt = event;
    feedback.textContent = '';
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    render();
  });
  document.getElementById('pwa-install-dismiss').addEventListener('click', dismiss);
  button.addEventListener('click', async () => {
    if (!pendingPrompt || prompting || standalone()) return;
    const prompt = pendingPrompt;
    prompting = true;
    render();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      pendingPrompt = null;
      if (choice.outcome === 'accepted') installed = true;
      else dismiss();
    } catch (error) {
      pendingPrompt = null;
      console.warn('Album install prompt unavailable:', error);
      feedback.textContent = 'No pudimos abrir la instalación. Prueba desde el menú de tu navegador.';
    } finally { prompting = false; render(); }
  });
  window.addEventListener('load', async () => {
    ready = true;
    render();
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      // Only activate a PREVIOUSLY waiting update on a normal page load. Never
      // reload a page mid-recording, mid-upload or with an unsent draft.
      registration.waiting?.postMessage({ type: 'ACTIVATE_ON_LOAD' });
    } catch (error) {
      console.warn('Album service worker registration failed:', error);
    }
  });
})();
