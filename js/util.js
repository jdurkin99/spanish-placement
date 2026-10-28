// Small shared helpers.

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function stripAccents(s) {
  // Keep ñ distinct from n: it's a different letter, not an accent.
  return s.replace(/ñ/g, '\u0000').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0000/g, 'ñ');
}

const ARTICLES = /^(el|la|los|las|un|una|unos|unas)\s+/;

export function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[¿?¡!.,;:"“”'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ARTICLES, '');
}

// Returns { correct, accentSlip } for a typed answer against accepted forms.
export function checkTyped(typed, accepted) {
  const t = normalizeAnswer(typed);
  if (!t) return { correct: false, accentSlip: false };
  const acc = accepted.map(normalizeAnswer);
  if (acc.includes(t)) return { correct: true, accentSlip: false };
  const bare = stripAccents(t);
  if (acc.some(a => stripAccents(a) === bare)) return { correct: true, accentSlip: true };
  return { correct: false, accentSlip: false };
}

export function todayISO() {
  return new Date().toISOString();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ymd(iso) {
  return iso ? iso.slice(0, 10) : '';
}

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function pct(n, d) {
  return d ? Math.round((100 * n) / d) : 0;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// Time spent on one item, capped so a phone left on the table doesn't count.
export function cappedMs(startedAt, capMs = 90000) {
  return Math.min(Date.now() - startedAt, capMs);
}

export function minutes(ms) {
  return Math.max(0, Math.round(ms / 60000));
}
