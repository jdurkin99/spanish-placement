// Loads the editable test content from /data. No test content lives in code.

const FILES = {
  config: 'data/config.json',
  profile: 'data/profile-default.json',
  lextale: 'data/vocab-lextale.json',
  meaning: 'data/vocab-meaning.json',
  production: 'data/vocab-production.json',
  grammar: 'data/grammar.json',
  reading: 'data/reading.json',
  listening: 'data/listening.json',
  writing: 'data/writing.json',
  speaking: 'data/speaking.json'
};

export const D = {};

export async function loadData() {
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, url]) => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
    try {
      return [k, await r.json()];
    } catch (e) {
      throw new Error(`${url} is not valid JSON: ${e.message}`);
    }
  }));
  Object.assign(D, Object.fromEntries(entries));
  // Index grammar items for quick lookup.
  D.grammarById = Object.fromEntries(D.grammar.items.map(it => [it.id, it]));
}
