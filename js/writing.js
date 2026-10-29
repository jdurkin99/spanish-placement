// Writing: one task per level band, typed on the phone. Not auto-scored; texts go to the tutor.
import { D } from './data.js';
import { getState, update, nextForm } from './store.js';
import { esc, uid, todayISO, minutes } from './util.js';
import { testHeader, formPicker, onLeave, interestsText } from './ui.js';

const session = () => getState().sessions.writing;
const tasksFor = form => D.writing.forms[form];

export const wordCount = t => (t.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

export function promptText(task) {
  return task.prompt.replace('{interests}', interestsText(getState().profile, D.writing.interestsFallback));
}

export function startSession(form) {
  update(s => { s.sessions.writing = { id: uid(), form, startedAt: todayISO(), tIdx: 0, entries: {} }; });
}

export function discardSession() {
  update(s => { delete s.sessions.writing; });
}

export function scoreWriting(sess) {
  const tasks = tasksFor(sess.form).map(t => {
    const e = sess.entries[t.id] || {};
    return {
      id: t.id, level: t.level, prompt: e.prompt || promptText(t), targetWords: t.words,
      text: e.skipped ? '' : (e.text || '').trim(), words: e.skipped ? 0 : wordCount(e.text || ''),
      minutes: minutes(e.ms || 0), skipped: !!e.skipped, noHelp: !!e.noHelp
    };
  });
  return { tasks, done: tasks.filter(t => !t.skipped).length };
}

function finish() {
  const sess = session();
  update(st => {
    st.attempts.push({ id: sess.id, section: 'writing', form: sess.form, startedAt: sess.startedAt, finishedAt: todayISO(), result: scoreWriting(sess) });
    delete st.sessions.writing;
  });
}

function intro(el, go) {
  const sug = nextForm('writing', Object.keys(D.writing.forms));
  const ts = tasksFor(sug);
  el.innerHTML = `<section class="card"><h1>Writing</h1>
    <p>${ts.length} short tasks, from simple (A2) to harder (B2), about ${D.config.writing.targetMinutes} minutes in total. Your tutor grades these, so write as you would naturally.</p>
    <p><strong>No translator or dictionary</strong>, please; mistakes are useful information. Accents are nice but optional.</p>
    <p class="muted small">You can skip a task that feels too hard. Drafts save as you type.</p>
    ${formPicker('wform', Object.keys(D.writing.forms), sug, sug)}
    <button class="btn btn-primary" data-action="start">Start</button>
    <a class="btn btn-ghost" href="#/">Back</a></section>`;
  el.querySelector('[data-action=start]').addEventListener('click', () => {
    startSession(el.querySelector('#wform').value);
    renderWriting(el, go);
  });
}

export function renderWriting(el, go) {
  const sess = session();
  if (!sess) return intro(el, go);
  const tasks = tasksFor(sess.form);
  if (sess.tIdx >= tasks.length) { finish(); go('#/results'); return; }

  const t = tasks[sess.tIdx];
  const e = sess.entries[t.id] || {};
  const prompt = promptText(t);
  el.innerHTML = `${testHeader({ title: 'Writing', idx: sess.tIdx, total: tasks.length, meta: `Level ${esc(t.level)} · ~${t.minutes} min · ${t.words[0]}–${t.words[1]} words` })}
    <section class="test-body">
      <div class="card task">
        <p class="task-prompt">${esc(prompt)}</p>
        ${t.points?.length ? `<ul class="small">${t.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="small muted">Write in Spanish.</p>
      </div>
      <textarea id="wtext" lang="es" rows="9" spellcheck="false" autocorrect="off" autocapitalize="sentences" placeholder="Escribe aquí…">${esc(e.text || '')}</textarea>
      <div class="wc-row small"><span id="wc"></span><span id="wtime" class="muted"></span></div>
      <label class="check"><input type="checkbox" id="nohelp" ${e.noHelp ? 'checked' : ''}> I wrote this without a translator or dictionary</label>
      <button class="btn btn-primary" data-action="next">Done, next task</button>
      <button class="btn btn-ghost" data-action="skip">Skip: too hard for now</button>
    </section>`;

  const ta = el.querySelector('#wtext');
  const wc = el.querySelector('#wc');
  const wtime = el.querySelector('#wtime');
  // Time counts only while typing: gaps between keystrokes longer than a minute are ignored.
  let msBase = e.ms || 0, lastKey = null;
  const save = (extra = {}) => {
    update(st => {
      st.sessions.writing.entries[t.id] = { ...st.sessions.writing.entries[t.id], prompt, text: ta.value, ms: msBase, noHelp: el.querySelector('#nohelp').checked, ...extra };
    });
  };
  const show = () => {
    const n = wordCount(ta.value);
    wc.textContent = `${n} word${n === 1 ? '' : 's'} (aim ${t.words[0]}–${t.words[1]})`;
    wc.className = n >= t.words[0] ? 'ok-text' : '';
    wtime.textContent = `${minutes(msBase)} / ~${t.minutes} min`;
  };
  show();
  let h;
  ta.addEventListener('input', () => {
    const now = Date.now();
    if (lastKey && now - lastKey < 60000) msBase += now - lastKey;
    lastKey = now;
    clearTimeout(h);
    h = setTimeout(() => { save(); show(); }, 400);
    const n = wordCount(ta.value);
    wc.textContent = `${n} word${n === 1 ? '' : 's'} (aim ${t.words[0]}–${t.words[1]})`;
  });
  onLeave(() => { clearTimeout(h); if (session()) save(); });
  el.querySelector('#nohelp').addEventListener('change', () => save());

  el.querySelector('[data-action=next]').addEventListener('click', () => {
    if (wordCount(ta.value) < Math.ceil(t.words[0] / 2) && !confirm('This is quite short. Move on anyway?')) return;
    clearTimeout(h);
    save({ skipped: false });
    update(st => { st.sessions.writing.tIdx++; });
    renderWriting(el, go);
  });
  el.querySelector('[data-action=skip]').addEventListener('click', () => {
    if (!confirm('Skip this task? It will be reported as skipped.')) return;
    clearTimeout(h);
    save({ skipped: true });
    update(st => { st.sessions.writing.tIdx++; });
    renderWriting(el, go);
  });
}
