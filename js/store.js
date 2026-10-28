// All app state lives in one localStorage key. Saved after every answer.

const KEY = 'spanish-placement.v1';
const SCHEMA = 1;

function blank() {
  return {
    schema: SCHEMA,
    createdAt: new Date().toISOString(),
    profile: null,       // { key: value } — filled from data/profile-default.json on first run
    sessions: {},        // in-progress tests, keyed by section id
    attempts: [],        // finished tests, oldest first
    seen: {}             // itemId -> times shown (for rotating grammar items on retests)
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return { ...blank(), ...s };
  } catch {
    return blank();
  }
}

export function getState() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Save failed', e);
    alert('Could not save progress (storage full or blocked). Export a backup from the Data page.');
    return false;
  }
}

export function update(fn) {
  fn(state);
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'spanish-placement', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (s.app !== 'spanish-placement' || !Array.isArray(s.attempts)) {
    throw new Error('This file is not a Spanish Placement backup.');
  }
  delete s.app;
  delete s.exportedAt;
  state = { ...blank(), ...s };
  save();
}

export function resetAll() {
  state = blank();
  save();
}

export function attemptsFor(section) {
  return state.attempts.filter(a => a.section === section);
}

export function lastAttempt(section) {
  const list = attemptsFor(section);
  return list[list.length - 1] || null;
}
