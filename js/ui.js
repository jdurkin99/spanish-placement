// Shared bits of markup for the test screens.
import { esc } from './util.js';

export function testHeader({ title, idx, total, meta = '' }) {
  const p = total ? Math.round((100 * idx) / total) : 0;
  return `
    <div class="test-head">
      <div class="test-head-row">
        <a class="btn-link" href="#/" data-action="pause" aria-label="Pause and save">⏸ Pause</a>
        <span class="test-title">${esc(title)}</span>
        <span class="test-count">${total ? `${Math.min(idx + 1, total)}/${total}` : ''}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>
      ${meta ? `<div class="test-meta">${meta}</div>` : ''}
    </div>`;
}

export function undoButton(enabled) {
  return enabled ? `<button class="btn-link undo" data-action="undo">↶ Undo last answer</button>` : '';
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

export const ACCENT_KEYS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'];

// Cleanup hooks (timers, audio, speech) run whenever the route changes.
const leaveHooks = [];
export function onLeave(fn) { leaveHooks.push(fn); }
export function runLeaveHooks() {
  while (leaveHooks.length) {
    try { leaveHooks.pop()(); } catch (e) { console.error(e); }
  }
}

export function formPicker(id, forms, selected, suggested) {
  return `<label class="field"><span>Test form</span>
    <select id="${id}">${forms.map(f => `<option ${f === selected ? 'selected' : ''}>${f}</option>`).join('')}</select>
    <small class="muted">Alternate forms for retests. Suggested: Form ${suggested}.</small>
  </label>`;
}

// First interest from the profile (e.g. "Liga MX" from "Liga MX, cumbia, cooking").
export function interestsText(profile, fallback) {
  const first = (profile?.interests || '').split(/[,;\n]/)[0].trim();
  return first || fallback;
}
