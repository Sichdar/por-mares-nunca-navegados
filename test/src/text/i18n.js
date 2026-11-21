// Two languages (Phase 7, Phase 8): every word on screen comes from text/en.json
// or text/pt.json by key. A missing Portuguese line falls back to English.

export const LANGS = ['en', 'pt'];
export const LOCALES = { en: 'en-GB', pt: 'pt-PT' };

export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

export function createTranslator(table, fallback = {}) {
  return function t(key, vars) {
    let s = table[key] ?? fallback[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  };
}

export async function loadTexts(langs = LANGS) {
  const out = {};
  for (const lang of langs) {
    const res = await fetch(new URL(`../../text/${lang}.json`, import.meta.url));
    out[lang] = flatten(await res.json());
  }
  return out;
}

export function guessLang(navLangs = []) {
  return navLangs.some((l) => String(l).toLowerCase().startsWith('pt')) ? 'pt' : 'en';
}

export function formatDate(date, lang) {
  return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}
