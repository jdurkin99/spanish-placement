// Speaking: (a) can-do self-assessment, (b) timed speaking tasks with optional
// browser speech-to-text. No audio is stored; only the transcript and ratings.
import { D } from './data.js';
import { getState, update, nextForm } from './store.js';
import { esc, uid, todayISO, cappedMs } from './util.js';
import { testHeader, undoButton, formPicker, onLeave, interestsText } from './ui.js';

export const PARTS = [
  { id: 'cando', name: 'a. Can-do checklist', blurb: '20 quick statements. ~3 min' },
  { id: 'tasks', name: 'b. Speak', blurb: '3 short prompts, 1–1.5 min each. ~8 min' }
];
const RATINGS = [
  { v: 1, label: 'Yes, easily' },
  { v: 0.5, label: 'Yes, with effort' },
  { v: 0, label: 'Not yet' }
];
const LEVELS = () => D.config.comprehension.levels;
const session = () => getState().sessions.speaking;
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;

const promptText = t => t.prompt.replace('{interests}', interestsText(getState().profile, D.writing.interestsFallback));

export function startSession(form) {
  update(s => { s.sessions.speaking = { id: uid(), form, startedAt: todayISO(), parts: {} }; });
}

export function discardSession() {
  update(s => { delete s.sessions.speaking; });
}

export function scoreSpeaking(sess) {
  const cd = sess.parts.cando;
  const levels = LEVELS().map(l => {
    const rs = cd.responses.filter(r => r.level === l);
    const avg = rs.length ? rs.reduce((a, r) => a + r.v, 0) / rs.length : 0;
    return { level: l, avg: Math.round(avg * 100), met: avg >= D.speaking.canDoThreshold };
  });
  let selfLevel = 'Below A1';
  for (const l of levels) { if (l.met) selfLevel = l.level; else break; }
  const tasks = D.speaking.tasks[sess.form].map(t => {
    const e = sess.parts.tasks.entries[t.id] || {};
    return { id: t.id, level: t.level, prompt: promptText(t), method: e.method || 'skipped', edited: !!e.edited, seconds: e.seconds || 0, transcript: (e.transcript || '').trim(), ratings: e.ratings || {} };
  });
  return {
    selfLevel,
    canDo: { levels, items: cd.responses.map(r => ({ level: r.level, text: r.text, rating: RATINGS.find(x => x.v === r.v).label })) },
    tasks
  };
}

function maybeFinish() {
  const s = session();
  if (!s || !PARTS.every(p => s.parts[p.id]?.done)) return false;
  update(st => {
    st.attempts.push({ id: s.id, section: 'speaking', form: s.form, startedAt: s.startedAt, finishedAt: todayISO(), result: scoreSpeaking(s) });
    delete st.sessions.speaking;
  });
  return true;
}

// ---------- views ----------

export function renderSpeakingHome(el, go) {
  const s = session();
  const forms = Object.keys(D.speaking.tasks);
  const sug = nextForm('speaking', forms);
  el.innerHTML = `
    <section class="card">
      <h1>Speaking</h1>
      <p class="muted">Two parts, about ${D.config.speaking.targetMinutes} minutes. Find a spot where you can talk out loud.</p>
      ${s ? `<p><span class="pill">In progress · Form ${esc(s.form)}</span></p>` : formPicker('sform', forms, sug, sug)}
      <p class="muted small">${SR() ? 'Your browser can transcribe your speech, and the text goes to your tutor. Nothing is recorded or uploaded by this app; transcription is done by your phone\'s speech service.' : 'This browser can\'t transcribe speech. You\'ll speak aloud with a timer and can type a rough version of what you said.'}</p>
    </section>
    <div class="part-list">
      ${PARTS.map(p => {
        const ps = s?.parts[p.id];
        const total = p.id === 'cando' ? D.speaking.canDo.length : D.speaking.tasks[s?.form || sug].length;
        const status = ps?.done ? '✓ Done' : ps ? `Resume (${ps.idx}/${total})` : 'Start';
        return `<button class="part ${ps?.done ? 'done' : ''}" data-part="${p.id}" ${ps?.done ? 'disabled' : ''}>
          <span><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.blurb)}</small></span>
          <span class="part-status">${status}</span></button>`;
      }).join('')}
    </div>
    ${s ? `<button class="btn btn-ghost danger" data-action="discard">Discard this in-progress attempt</button>` : ''}`;
  el.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => {
    if (!session()) startSession(el.querySelector('#sform')?.value || sug);
    const id = b.dataset.part;
    update(st => {
      const sp = st.sessions.speaking;
      sp.parts[id] ||= id === 'cando' ? { idx: 0, responses: [] } : { idx: 0, entries: {} };
    });
    go(`#/speaking/${id}`);
  }));
  el.querySelector('[data-action=discard]')?.addEventListener('click', () => {
    if (confirm('Discard this unfinished speaking attempt?')) { discardSession(); renderSpeakingHome(el, go); }
  });
}

function partDone(el, go, partId) {
  update(st => { st.sessions.speaking.parts[partId].done = true; });
  if (maybeFinish()) { go('#/results'); return; }
  const next = PARTS.find(p => !session().parts[p.id]?.done);
  el.innerHTML = `<section class="card center"><h1>Part done ✓</h1><p>Saved. One part left.</p>
    <button class="btn btn-primary" data-next="${next.id}">Continue: ${esc(next.name)}</button>
    <a class="btn btn-ghost" href="#/">Stop for today</a></section>`;
  el.querySelector('[data-next]').addEventListener('click', () => {
    update(st => { st.sessions.speaking.parts[next.id] ||= next.id === 'cando' ? { idx: 0, responses: [] } : { idx: 0, entries: {} }; });
    go(`#/speaking/${next.id}`);
  });
}

export function renderSpeakingPart(el, go, partId) {
  const s = session();
  if (!s || !s.parts[partId]) { go('#/speaking'); return; }
  return partId === 'cando' ? renderCanDo(el, go) : renderTask(el, go);
}

function renderCanDo(el, go) {
  const ps = session().parts.cando;
  const items = D.speaking.canDo;
  if (ps.idx >= items.length) return partDone(el, go, 'cando');
  const it = items[ps.idx];
  el.innerHTML = `${testHeader({ title: 'Can-do checklist', idx: ps.idx, total: items.length, meta: 'In Spanish, I can…' })}
    <section class="test-body">
      <div class="prompt-en">${esc(it.text)}</div>
      <div class="choices">${RATINGS.map(r => `<button class="btn btn-choice" data-v="${r.v}">${r.label}</button>`).join('')}</div>
    </section>
    ${undoButton(ps.idx > 0)}`;
  el.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
    update(st => {
      const p = st.sessions.speaking.parts.cando;
      p.responses.push({ level: it.level, text: it.text, v: +b.dataset.v });
      p.idx++;
    });
    renderCanDo(el, go);
  }));
  el.querySelector('[data-action=undo]')?.addEventListener('click', () => {
    update(st => { const p = st.sessions.speaking.parts.cando; if (p.responses.pop()) p.idx--; });
    renderCanDo(el, go);
  });
}

function renderTask(el, go) {
  const sess = session();
  const ps = sess.parts.tasks;
  const tasks = D.speaking.tasks[sess.form];
  if (ps.idx >= tasks.length) return partDone(el, go, 'tasks');
  const t = tasks[ps.idx];
  const e = ps.entries[t.id] || {};
  const limit = Math.min(t.seconds || D.speaking.maxSeconds, D.speaking.maxSeconds);
  const canSR = !!SR();

  el.innerHTML = `${testHeader({ title: 'Speak', idx: ps.idx, total: tasks.length, meta: `Level ${esc(t.level)} · up to ${limit} s` })}
    <section class="test-body">
      <div class="card task">
        <p class="task-prompt">${esc(promptText(t))}</p>
        <details><summary class="small">Need a way to start?</summary><p lang="es" class="small">${esc(t.hint || '')}</p></details>
      </div>
      <div class="rec">
        <div class="rec-timer" id="timer">0:00 / ${Math.floor(limit / 60)}:${String(limit % 60).padStart(2, '0')}</div>
        <button class="btn btn-primary" data-action="rec">${canSR ? '🎙 Start speaking' : '⏱ Start timer'}</button>
        <p class="small muted" id="recstatus">${canSR ? 'Tap, then answer in Spanish. Tap again to stop.' : 'Speak aloud while the timer runs.'}</p>
      </div>
      <label class="field"><span>${canSR ? 'What the phone heard (fix only obvious mishearings)' : 'Roughly what you said (optional)'}</span>
        <textarea id="tx" lang="es" rows="5" spellcheck="false" autocorrect="off">${esc(e.transcript || '')}</textarea></label>
      <div id="ratings">${D.speaking.selfRatings.map(r => `
        <fieldset class="mcq rating" data-key="${r.key}"><legend>${esc(r.label)}</legend>
          <div class="seg">${r.options.map(o => `<button type="button" class="btn btn-choice opt ${e.ratings?.[r.key] === o ? 'sel' : ''}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        </fieldset>`).join('')}</div>
      <button class="btn btn-primary" data-action="next">Save, next prompt</button>
      <button class="btn btn-ghost" data-action="skip">Skip this prompt</button>
    </section>`;

  const tx = el.querySelector('#tx');
  const timerEl = el.querySelector('#timer');
  const status = el.querySelector('#recstatus');
  const recBtn = el.querySelector('[data-action=rec]');
  let rec = null, running = false, startedAt = 0, tickH = null, finalText = '';
  let seconds = e.seconds || 0;
  const fmt = n => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

  const saveEntry = extra => update(st => {
    const en = st.sessions.speaking.parts.tasks.entries;
    en[t.id] = { ...en[t.id], transcript: tx.value, seconds, ...extra };
  });

  const stop = () => {
    if (!running) return;
    running = false;
    clearInterval(tickH);
    seconds = Math.min(limit, Math.round((Date.now() - startedAt) / 1000));
    try { rec?.stop(); } catch { /* already stopped */ }
    recBtn.textContent = canSR ? '🎙 Speak again (replaces text)' : '⏱ Restart timer';
    status.textContent = `Stopped at ${fmt(seconds)}.`;
    saveEntry({ method: canSR ? 'speech' : 'typed' });
  };
  onLeave(stop);

  const start = () => {
    running = true;
    startedAt = Date.now();
    finalText = '';
    recBtn.textContent = '■ Stop';
    status.textContent = canSR ? 'Listening… speak in Spanish.' : 'Timer running…';
    tickH = setInterval(() => {
      const sec = Math.floor(cappedMs(startedAt, limit * 1000 + 1000) / 1000);
      timerEl.textContent = `${fmt(Math.min(sec, limit))} / ${fmt(limit)}`;
      if (sec >= limit) stop();
    }, 250);
    if (!canSR) return;
    tx.value = '';
    rec = new (SR())();
    rec.lang = D.speaking.recognitionLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
        else interim += r[0].transcript;
      }
      tx.value = (finalText + interim).trim();
    };
    // Some browsers end recognition after a pause; restart until the user stops.
    rec.onend = () => { if (running) { try { rec.start(); } catch { /* restarting too fast */ } } };
    rec.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        status.textContent = 'Microphone or speech recognition is blocked. Allow it in browser settings, or type what you said below.';
        running = false;
        clearInterval(tickH);
        recBtn.textContent = '🎙 Try again';
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        status.textContent = `Speech recognition problem (${ev.error}). Keep talking; you can type what you said below.`;
      }
    };
    try { rec.start(); } catch (err) { status.textContent = `Couldn't start speech recognition: ${err.message}`; }
  };

  recBtn.addEventListener('click', () => (running ? stop() : start()));
  tx.addEventListener('input', () => {
    const spoken = session().parts.tasks.entries[t.id]?.method === 'speech';
    saveEntry(spoken ? { method: 'speech', edited: true } : { method: 'typed' });
  });

  el.querySelectorAll('.rating').forEach(fs => fs.addEventListener('click', ev => {
    const b = ev.target.closest('.opt');
    if (!b) return;
    fs.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === b));
    update(st => {
      const en = st.sessions.speaking.parts.tasks.entries;
      en[t.id] = { ...en[t.id], ratings: { ...(en[t.id]?.ratings || {}), [fs.dataset.key]: b.dataset.o } };
    });
  }));

  const advance = extra => {
    stop();
    saveEntry(extra);
    update(st => { st.sessions.speaking.parts.tasks.idx++; });
    renderTask(el, go);
  };
  el.querySelector('[data-action=next]').addEventListener('click', () => {
    if (!seconds && !tx.value.trim() && !confirm('You haven\'t spoken or typed anything. Save as skipped?')) return;
    const cur = session().parts.tasks.entries[t.id] || {};
    advance({ method: !seconds && !tx.value.trim() ? 'skipped' : (cur.method || (canSR ? 'speech' : 'typed')) });
  });
  el.querySelector('[data-action=skip]').addEventListener('click', () => advance({ method: 'skipped' }));
}
