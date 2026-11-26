'use strict';
/*
 * Ciśnienie – przypomnienia o pomiarze ciśnienia. Uruchamiane co godzinę przez GitHub Actions
 * w prywatnym repozytorium z danymi (zadanie .github/workflows/przypomnienia.yml dodaje aplikacja).
 *
 * Godziny przypomnień (rano i wieczorem) są w ustawieniach w pliku cisnienie-dane.json (cfg.rm, cfg.re).
 * Przypomnienie idzie, gdy:
 *  - minęła ustawiona godzina (okno 2,5 godziny, bo GitHub potrafi opóźnić start zadania),
 *  - od 2 godzin przed tą godziną nie było pomiaru,
 *  - dziś jeszcze nie wysłano tego przypomnienia (stan w push-stan.json).
 * Treść nie zawiera żadnych wyników.
 *
 *   node remind.js --check   → tylko decyzja (zapisuje send=true/false do GITHUB_OUTPUT), bez bibliotek
 *   node remind.js           → wysyła powiadomienia (wymaga web-push i kluczy VAPID)
 */
const fs = require('fs');
const path = require('path');
const C = require('../js/core.js');

const TIMEZONE = 'Europe/Warsaw';
const WINDOW = 150; // minut po ustawionej godzinie
const BEFORE = 120; // pomiar z ostatnich 2 godzin przed przypomnieniem „zalicza” porę

/** Data (RRRR-MM-DD) i minuta doby w czasie polskim. */
function localParts(date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const o = {};
  f.formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  return { key: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour) * 60 + Number(o.minute) };
}

function protoLine(data, key) {
  const p = C.protocol(data, key);
  if (!p || p.done || p.notStarted) return '';
  return `Tydzień pomiarów: dzień ${p.dayNo} z ${C.PROTO_DAYS}. `;
}

/**
 * Które przypomnienia wysłać teraz. state = { sent: { "RRRR-MM-DD": ["rano", ...] } }.
 * Zwraca { key, due: [{ slot, title, body }], mode }.
 */
function decide(data, state, now, opts) {
  opts = opts || {};
  const { key, minutes } = localParts(now);
  if (opts.test) {
    return { key, mode: 'test', due: [{ slot: 'test', title: 'Ciśnienie', body: 'Próbne powiadomienie z GitHuba. Przypomnienia działają.' }] };
  }
  const cfg = C.getCfg(data);
  const sent = (state && state.sent && Array.isArray(state.sent[key])) ? state.sent[key] : [];
  const today = C.listReadings(data, key, key);
  const due = [];
  [
    { slot: 'rano', h: cfg.rm, body: 'Pora na poranny pomiar ciśnienia. Najlepiej przed lekami i śniadaniem.' },
    { slot: 'wieczor', h: cfg.re, body: 'Pora na wieczorny pomiar ciśnienia. Najlepiej przed kolacją.' }
  ].forEach((s) => {
    if (!(s.h >= 0)) return;
    const start = s.h * 60;
    if (minutes < start || minutes >= start + WINDOW) return;
    if (sent.indexOf(s.slot) >= 0) return;
    if (today.some((r) => C.parseTime(r.h) >= start - BEFORE)) return;
    due.push({ slot: s.slot, title: 'Ciśnienie', body: protoLine(data, key) + s.body });
  });
  return { key, mode: 'reminder', due };
}

function validSub(s) {
  return !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) &&
    !!s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function load(dir) {
  const raw = readJson(path.join(dir, 'cisnienie-dane.json'));
  const data = raw ? C.validate(raw).data : C.emptyData();
  const subsRaw = readJson(path.join(dir, 'push-subskrypcje.json'));
  const subs = subsRaw && Array.isArray(subsRaw.subs) ? subsRaw.subs.filter(validSub) : [];
  const st = readJson(path.join(dir, 'push-stan.json'));
  const state = st && st.sent && typeof st.sent === 'object' ? st : { v: 1, sent: {} };
  return { data, subs, state };
}

/**
 * Główna logika. o: { dataDir, now, test, send(sub, payload) → Promise (odrzucony z .statusCode przy błędzie) }.
 * Zapisuje stan wysłanych przypomnień i usuwa wygasłe subskrypcje (kody 404 i 410).
 */
async function run(o) {
  const { data, subs, state } = load(o.dataDir);
  const d = decide(data, state, o.now, { test: o.test });
  const summary = { decision: { key: d.key, mode: d.mode, due: d.due.map((x) => x.slot) }, subs: subs.length, sent: 0, failed: 0, removed: 0 };
  if (!d.due.length || !subs.length) return summary;
  let keep = subs.slice();
  for (const item of d.due) {
    const payload = { title: item.title, body: item.body, url: './', tag: 'cisnienie-' + item.slot };
    const next = [];
    let ok = 0;
    for (const sub of keep) {
      try {
        await o.send(sub, payload);
        summary.sent++; ok++;
        next.push(sub);
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) summary.removed++;
        else { summary.failed++; next.push(sub); }
      }
    }
    keep = next;
    if (ok && item.slot !== 'test') {
      state.sent[d.key] = (state.sent[d.key] || []).concat([item.slot]);
    }
  }
  // zostaw tylko ostatnie dni
  const keys = Object.keys(state.sent).sort().slice(-10);
  const sent = {};
  keys.forEach((k) => { sent[k] = state.sent[k]; });
  fs.writeFileSync(path.join(o.dataDir, 'push-stan.json'), JSON.stringify({ v: 1, sent }, null, 2) + '\n');
  if (summary.removed) fs.writeFileSync(path.join(o.dataDir, 'push-subskrypcje.json'), JSON.stringify({ v: 1, subs: keep }, null, 2) + '\n');
  return summary;
}

function check(dir, now, test) {
  const { data, subs, state } = load(dir);
  const d = decide(data, state, now, { test });
  return { send: d.due.length > 0 && subs.length > 0, decision: d, subs: subs.length };
}

async function main() {
  const dir = process.env.DATA_DIR || 'data';
  const test = process.env.TEST === 'true';
  if (process.argv.includes('--check')) {
    const r = check(dir, new Date(), test);
    console.log(JSON.stringify({ key: r.decision.key, due: r.decision.due.map((x) => x.slot), subs: r.subs, send: r.send }));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'send=' + r.send + '\n');
    return;
  }
  const webpush = require('web-push');
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.error('Brak klucza VAPID_PRIVATE_KEY. Dodaj go w repozytorium z danymi: Settings → Secrets and variables → Actions → New repository secret.');
    process.exit(1);
  }
  webpush.setVapidDetails('mailto:cisnienie@users.noreply.github.com', pub, priv);
  const summary = await run({
    dataDir: dir, now: new Date(), test,
    send: (sub, payload) => webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' })
  });
  console.log(JSON.stringify(summary));
}

module.exports = { decide, run, check, localParts, validSub };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
