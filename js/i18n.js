'use strict';

(() => {
  const catalogue = window.chasTranslations;
  const languages = ['es', 'en', 'fr', 'de', 'pt', 'zh-CN'];
  const preferenceKey = 'chas:language';
  const textBindings = new WeakMap();
  const attributeBindings = new WeakMap();
  const datePrefixes = new WeakMap();
  let language = 'es';
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    if (languages.includes(saved)) language = saved;
  } catch (error) { /* Private/storage-restricted browsers still translate. */ }
  const exact = new Map();
  const patterns = [];
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [key, values] of Object.entries(catalogue)) {
    if (values.es.includes('{')) {
      const names = [];
      const parts = values.es.split(/(\{\w+\})/).map((part) => {
        if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; }
        return escape(part);
      });
      patterns.push({ key, names, regex: new RegExp(`^${parts.join('')}$`, 'su') });
    } else if (!values.explicitOnly) exact.set(values.es, key);
  }
  function t(key, parameters = {}) {
    const value = catalogue[key]?.[language];
    if (typeof value !== 'string') throw new Error(`Missing translation: ${key}/${language}`);
    return value.replace(/\{(\w+)\}/g, (_, name) => {
      const parameter = parameters[name];
      return parameter && typeof parameter === 'object' && parameter.key ? t(parameter.key) : parameter ?? `{${name}}`;
    });
  }
  function resolve(source) {
    const clean = source.trim();
    if (exact.has(clean)) return { key: exact.get(clean), parameters: {} };
    for (const pattern of patterns) {
      const match = clean.match(pattern.regex);
      if (match) return { key: pattern.key, parameters: Object.fromEntries(pattern.names.map((name, index) => [name, match[index + 1]])) };
    }
    return null;
  }
  function translate(source) {
    const match = resolve(source);
    if (!match) return source;
    return source.replace(source.trim(), t(match.key, match.parameters));
  }
  function excluded(element, forAttributes = false) {
    const selector = forAttributes
      ? '[translate="no"], script, style, option'
      : '[translate="no"], script, style, textarea, option, input';
    return !element || Boolean(element.closest(selector));
  }
  function explicitMatch(element, target) {
    const key = element.getAttribute(`data-i18n-${target}`);
    return key ? { key, parameters: JSON.parse(element.getAttribute('data-i18n-params') || '{}') } : null;
  }
  function renderText(node) {
    if (excluded(node.parentElement)) return;
    if (node.parentElement.tagName === 'TIME') return;
    let binding = textBindings.get(node);
    const current = node.nodeValue;
    const explicit = explicitMatch(node.parentElement, 'text');
    if (!binding || current !== binding.last || explicit || binding.explicit) {
      const match = explicit || resolve(current);
      if (!match) { textBindings.delete(node); return; }
      binding = { ...match, explicit: Boolean(explicit), source: current, last: current };
      textBindings.set(node, binding);
      if (node.parentElement.childNodes.length === 1) node.parentElement.dataset.i18n = binding.key;
    }
    const next = binding.source.replace(binding.source.trim(), t(binding.key, binding.parameters));
    binding.last = next;
    if (node.nodeValue !== next) node.nodeValue = next;
  }
  const attributes = ['aria-label', 'placeholder', 'alt', 'title'];
  function renderAttributes(element) {
    const htmlKey = element.getAttribute('data-i18n-html');
    if (htmlKey) {
      const markup = t(htmlKey);
      if (element.innerHTML !== markup) element.innerHTML = markup;
    }
    if (excluded(element, true) && element.id !== 'language-select') return;
    const list = element.tagName === 'META' && element.getAttribute('name') === 'description' ? [...attributes, 'content'] : attributes;
    let bindings = attributeBindings.get(element);
    if (!bindings) { bindings = new Map(); attributeBindings.set(element, bindings); }
    for (const attribute of list) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      let binding = bindings.get(attribute);
      const explicit = explicitMatch(element, attribute);
      if (!binding || current !== binding.last || explicit || binding.explicit) {
        const match = explicit || resolve(current);
        if (!match) { bindings.delete(attribute); continue; }
        binding = { ...match, explicit: Boolean(explicit), source: current, last: current };
        bindings.set(attribute, binding);
      }
      const next = t(binding.key, binding.parameters);
      binding.last = next;
      if (current !== next) element.setAttribute(attribute, next);
    }
    if (element.tagName === 'TIME' && element.dateTime) {
      const date = new Date(element.dateTime);
      if (!Number.isNaN(date.getTime())) {
        if (!datePrefixes.has(element)) datePrefixes.set(element, element.textContent.startsWith(' · ') ? ' · ' : '');
        const next = datePrefixes.get(element) + new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
        if (element.textContent !== next) element.textContent = next;
      }
    }
  }
  function refresh(root = document.documentElement) {
    if (root.nodeType === 3) { renderText(root); return; }
    if (root.nodeType !== 1) return;
    renderAttributes(root);
    const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_ELEMENT | window.NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) renderText(node);
      else renderAttributes(node);
    }
  }
  function setLanguage(next, { persist = true } = {}) {
    if (!languages.includes(next)) return;
    language = next;
    document.documentElement.lang = next;
    const picker = document.getElementById('language-select');
    if (picker) picker.value = next;
    if (persist) {
      try { window.localStorage.setItem(preferenceKey, next); } catch (error) { /* Session still works. */ }
    }
    refresh();
  }
  const pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach((node) => pending.add(node));
      else pending.add(record.target);
    }
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const roots = [...pending]; pending.clear();
        roots.forEach((root) => { if (root.isConnected) refresh(root); });
      });
    }
  });
  document.getElementById('language-select').addEventListener('change', (event) => setLanguage(event.target.value));
  window.chasI18n = Object.freeze({ t, translate, resolve, refresh, setLanguage, get language() { return language; }, languages });
  setLanguage(language, { persist: false });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes, ...attributes.map((attribute) => `data-i18n-${attribute}`), 'data-i18n-text', 'data-i18n-params', 'content', 'translate', 'datetime'] });
})();
