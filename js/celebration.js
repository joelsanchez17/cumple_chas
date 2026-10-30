'use strict';

(() => {
  const WELCOME_KEY = 'chas:welcome:v1';
  const COOLDOWN_MS = 2500;
  let cooldown = false;
  let sending = false;
  let countGeneration = 0;
  const button = document.getElementById('celebrate');
  const layer = document.getElementById('confetti');
  const announcement = document.getElementById('celebration-status');
  const welcome = document.getElementById('welcome-dialog');
  const enter = document.getElementById('welcome-enter');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function burst() {
    if (cooldown) return false;
    cooldown = true;
    button.disabled = true;
    announcement.textContent = '¡Feliz cumple, Chas! Que siga la fiesta. ♡';
    layer.replaceChildren();
    if (!reducedMotion()) {
      const colors = ['#ad3150', '#f2bc57', '#377c78', '#d68e68', '#382334'];
      for (let index = 0; index < 28; index++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[index % colors.length];
        piece.style.animationDelay = `${Math.random() * .35}s`;
        piece.style.setProperty('--drift', `${Math.random() * 100 - 50}px`);
        piece.style.setProperty('--spin', `${Math.random() * 500 - 250}deg`);
        if (index % 3 === 0) piece.style.borderRadius = '50%';
        layer.append(piece);
      }
    }
    window.setTimeout(() => {
      layer.replaceChildren();
      cooldown = false;
      button.disabled = sending;
    }, COOLDOWN_MS);
    return true;
  }
  const counter = document.getElementById('celebration-count');
  const feedback = document.getElementById('celebration-feedback');
  async function loadCount(afterSend = false) {
    const generation = ++countGeneration;
    try {
      const count = await window.chasCelebrationsApi.count();
      if (generation !== countGeneration) return;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid shared celebration count');
      counter.textContent = count === 1 ? '1 celebración para Chas' : `${count} celebraciones para Chas`;
    } catch (error) {
      if (generation !== countGeneration) return;
      console.error('Could not read celebration count:', error);
      if (!counter.dataset.loaded) counter.textContent = 'El total no está disponible ahora.';
      if (afterSend) feedback.textContent = 'Tu celebración se guardó, pero no pudimos actualizar el total.';
      return;
    }
    counter.dataset.loaded = 'true';
  }
  button.addEventListener('click', async () => {
    if (sending || !burst()) return;
    sending = true;
    feedback.textContent = 'Guardando tu celebración…';
    try {
      await window.chasCelebrationsApi.create();
      feedback.textContent = '¡Una celebración más para Chas! ♡';
      await loadCount(true);
    } catch (error) {
      console.error('Could not save celebration:', error);
      feedback.textContent = 'El confeti sí; la conexión no. No pudimos confirmar tu celebración.';
    } finally {
      sending = false;
      button.disabled = cooldown;
    }
  });
  loadCount();
  let seen = false;
  try { seen = window.sessionStorage.getItem(WELCOME_KEY) === 'seen'; }
  catch (error) { console.info('Session storage unavailable; welcome still works for this page.'); }
  if (!seen) {
    try { window.sessionStorage.setItem(WELCOME_KEY, 'seen'); }
    catch (error) { /* Restricted storage must never prevent entry. */ }
    welcome.showModal();
    document.documentElement.classList.add('party-welcome-open');
  }
  let leaving = false;
  function finishEntry() {
    if (!welcome.open) return;
    welcome.close();
    document.documentElement.classList.remove('party-welcome-open');
    document.getElementById('hero-title').focus({ preventScroll: true });
    burst();
  }
  function enterSite() {
    if (leaving) return;
    leaving = true;
    enter.disabled = true;
    if (reducedMotion()) finishEntry();
    else {
      welcome.classList.add('is-leaving');
      window.setTimeout(finishEntry, 320);
    }
  }
  enter.addEventListener('click', enterSite);
  welcome.addEventListener('cancel', (event) => { event.preventDefault(); enterSite(); });
  window.chasCelebration = Object.freeze({ burst });
})();
