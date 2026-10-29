// Checks the data files for mistakes after you edit them.
// Run from the project folder:  node tools/validate.mjs
import { readFileSync } from 'node:fs';

const load = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const errors = [];
const warn = [];
const err = m => errors.push(m);

const config = load('config.json');
const lextale = load('vocab-lextale.json');
const meaning = load('vocab-meaning.json');
const production = load('vocab-production.json');
const grammar = load('grammar.json');
load('profile-default.json');
const reading = load('reading.json');
const listening = load('listening.json');
const writing = load('writing.json');
const speaking = load('speaking.json');

const bandIds = new Set([...config.vocab.bands.map(b => b.id), config.vocab.regionalBand.id]);

function checkMC(where, it) {
  if (!it.answer) err(`${where}: missing answer`);
  if (!Array.isArray(it.distractors) || it.distractors.length !== config.vocab.mcOptionCount - 1)
    err(`${where}: needs exactly ${config.vocab.mcOptionCount - 1} distractors`);
  else {
    if (it.distractors.includes(it.answer)) err(`${where}: answer is also a distractor`);
    if (new Set(it.distractors).size !== it.distractors.length) err(`${where}: duplicate distractors`);
  }
}

for (const form of config.forms) {
  const lx = lextale.forms[form];
  if (!lx) { err(`lextale: missing form ${form}`); continue; }
  const words = new Set(lx.words.map(w => w.w));
  lx.pseudowords.forEach(p => words.has(p) && err(`lextale ${form}: "${p}" is both word and pseudoword`));

  const mc = meaning.forms[form] || [];
  if (!mc.length) err(`meaning: missing form ${form}`);
  mc.forEach((it, i) => {
    checkMC(`meaning ${form} #${i} (${it.w})`, it);
    if (!bandIds.has(it.band)) err(`meaning ${form} ${it.w}: unknown band "${it.band}"`);
  });
  for (const b of bandIds) {
    const n = mc.filter(x => x.band === b).length;
    if (n < 5) warn.push(`meaning ${form}: band ${b} has only ${n} items`);
  }
  (production.forms[form] || []).forEach((it, i) => {
    if (!it.en || !Array.isArray(it.accept) || !it.accept.length) err(`production ${form} #${i}: needs en + accept[]`);
  });
}

// Words the brief requires in Form A (meaning or production).
const required = ['siempre', 'ciudad', 'tiempo', 'cerca', 'llevar', 'todavía', 'quedarse', 'pedir', 'lograr', 'aprovechar', 'sin embargo', 'soler', 'extrañar', 'ahorrar', 'aguantar', 'chamba'];
const formA = new Set([...meaning.forms.A.map(x => x.w), ...production.forms.A.flatMap(x => x.accept)]);
required.forEach(w => formA.has(w) || err(`Form A is missing required word "${w}"`));

// Grammar
const ids = new Set();
const perStructure = {};
grammar.items.forEach(it => {
  if (ids.has(it.id)) err(`grammar: duplicate id ${it.id}`);
  ids.add(it.id);
  if (!grammar.structures[it.structure]) err(`grammar ${it.id}: unknown structure ${it.structure}`);
  if (!it.q.includes('___')) err(`grammar ${it.id}: q has no ___ gap`);
  checkMC(`grammar ${it.id}`, it);
  perStructure[it.structure] = (perStructure[it.structure] || 0) + 1;
});
Object.entries(grammar.structures).forEach(([k, s]) => {
  if (!config.grammar.levels.includes(s.level)) err(`grammar structure ${k}: bad level ${s.level}`);
  const n = perStructure[k] || 0;
  if (n < 2) err(`grammar structure ${k}: has ${n} items; needs ≥2 (main + follow-up)`);
  else if (n < 3) warn.push(`grammar structure ${k}: only ${n} items (3+ lets retests rotate)`);
});

// Reading / listening
const cLevels = config.comprehension.levels;
const seenIds = new Set();
for (const [name, data] of [['reading', reading], ['listening', listening]]) {
  for (const [form, list] of Object.entries(data.forms)) {
    let last = -1;
    list.forEach(p => {
      const where = `${name} ${form} ${p.id}`;
      if (seenIds.has(p.id)) err(`${where}: duplicate id`);
      seenIds.add(p.id);
      const li = cLevels.indexOf(p.level);
      if (li < 0) err(`${where}: bad level ${p.level}`);
      if (li <= last) err(`${where}: passages must be in increasing level order`);
      last = li;
      if (name === 'reading' && !p.text) err(`${where}: missing text`);
      if (name === 'listening' && !p.transcript) err(`${where}: missing transcript (needed for the voice fallback)`);
      if (!p.questions?.length) err(`${where}: no questions`);
      p.questions?.forEach((q, i) => checkMC(`${where} q${i + 1}`, q));
    });
  }
}
const placeholders = Object.values(listening.forms).flat().filter(c => c.audio?.placeholder || !c.audio?.src);
if (placeholders.length) warn.push(`listening: ${placeholders.length} clip(s) still use PLACEHOLDER audio (device voice will be used): ${placeholders.map(c => c.id).join(', ')}`);

// Writing / speaking
for (const [form, tasks] of Object.entries(writing.forms)) tasks.forEach(t => {
  if (!t.prompt || !Array.isArray(t.words) || t.words.length !== 2 || t.words[0] > t.words[1]) err(`writing ${form} ${t.id}: needs prompt and words [min, max]`);
});
speaking.canDo.forEach((c, i) => cLevels.includes(c.level) || err(`speaking canDo #${i}: bad level ${c.level}`));
cLevels.forEach(l => speaking.canDo.some(c => c.level === l) || err(`speaking canDo: no statements for ${l}`));
for (const [form, tasks] of Object.entries(speaking.tasks)) tasks.forEach(t => t.prompt || err(`speaking ${form} ${t.id}: missing prompt`));

warn.forEach(w => console.log('warning:', w));
if (errors.length) {
  errors.forEach(e => console.log('ERROR:', e));
  process.exit(1);
}
const counts = config.forms.map(f => `Form ${f}: ${lextale.forms[f].words.length}+${lextale.forms[f].pseudowords.length} yes/no, ${meaning.forms[f].length} meaning, ${production.forms[f].length} production`).join('; ');
console.log(`OK. ${counts}; grammar: ${grammar.items.length} items, ${Object.keys(grammar.structures).length} structures; reading/listening/writing/speaking checked.`);
