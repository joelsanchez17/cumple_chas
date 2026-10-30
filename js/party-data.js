'use strict';

(() => {
  // Permanent prompt IDs: editing wording or reordering must not change an ID.
  const prompts = Object.freeze([
    { id: 'primera-impresion', text: '¿Cuál fue tu primera impresión de mí?' },
    { id: 'una-palabra', text: '¿Qué palabra me define mejor?' },
    { id: 'plan-imperdible', text: '¿Qué plan crees que nunca rechazaría?' },
    { id: 'recuerdo-favorito', text: '¿Cuál es tu mejor recuerdo conmigo?' },
    { id: 'muy-chas', text: '¿Qué hago que ya es demasiado Chas?' },
    { id: 'nuevo-ano', text: '¿Qué debería hacer al menos una vez este año?' },
    { id: 'proximo-viaje', text: '¿Dónde debería ser mi próximo viaje?' },
    { id: 'cancion-fiesta', text: '¿Qué canción tiene que sonar esta noche?' },
    { id: 'consejo-cumple', text: '¿Qué consejo me darías para este nuevo año?' },
    { id: 'chisme-inocente', text: 'Cuenta un chisme o rumor sobre mí' },
  ].map(Object.freeze));
  const challenges = Object.freeze([
    { id: 'photo', label: 'Una foto', text: 'Sube una foto conmigo 📸', action: 'upload' },
    { id: 'voice', label: 'Tu voz', text: 'Déjame un audio 🎙️', action: 'voice' },
    { id: 'note', label: 'Una notita', text: 'Escríbeme algo bonito 💌', action: 'note' },
    { id: 'comment', label: 'Otra mirada', text: 'Comenta una foto del álbum 👀', action: 'comment' },
    { id: 'memory', label: 'Un recuerdo', text: 'Cuéntame un recuerdo que no quieras perder', action: 'memory' },
    { id: 'now', label: 'Foto de ahora', text: 'Haz una foto ahora con alguien de la fiesta', action: 'upload' },
    { id: 'gossip', label: 'Un chismecito', text: 'Cuenta un chisme o rumor sobre mí', action: 'gossip' },
    { id: 'toast', label: 'Un brindis', text: '¡Un brindis por otro año de historias! 🥂', action: null },
  ].map(Object.freeze));
  function randomIndex(length, random = Math.random) {
    return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  }
  function chooseOther(items, previous, random = Math.random) {
    const choices = items.filter((item) => item.id !== previous);
    const pool = choices.length ? choices : items;
    return pool.length ? pool[randomIndex(pool.length, random)] : null;
  }
  function spin(currentRotation = 0, random = Math.random) {
    const index = randomIndex(challenges.length, random);
    const center = (index + .5) * (360 / challenges.length);
    const target = (360 - center) % 360;
    const rotation = currentRotation + 5 * 360 + (target - currentRotation % 360 + 360) % 360;
    return { challenge: challenges[index], rotation };
  }
  function answerPayload({ promptId, answer, name, anonymous }) {
    const content = String(answer || '').trim();
    const author = String(name || '').trim();
    if (!prompts.some((prompt) => prompt.id === promptId)) throw new Error('Elige una pregunta para empezar.');
    if (!content) throw new Error('Escribe lo que te nazca antes de publicar.');
    if (content.length > 1000) throw new Error('Tu respuesta puede tener hasta 1000 caracteres.');
    if (!anonymous && !author) throw new Error('Escribe tu nombre o marca “Anónimo”.');
    if (!anonymous && author.length > 50) throw new Error('Usa un nombre de hasta 50 caracteres.');
    return { prompt_id: promptId, answer: content, name: anonymous ? null : author, is_anonymous: Boolean(anonymous) };
  }
  window.chasPartyData = Object.freeze({ prompts, challenges, randomIndex, chooseOther, spin, answerPayload });
})();
