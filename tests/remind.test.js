'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../js/core.js');
const R = require('../tools/remind.js');

// 25.11.2026 to czas zimowy: UTC+1
const at = (hhmm) => new Date('2026-11-25T' + hhmm + ':00+01:00');

function data(readings, cfg) {
  let d = C.setCfg(C.emptyData(), cfg || {}, 1);
  readings.forEach((r, i) => { d = C.setReading(d, 'rid' + i + 'xx', { d: '2026-11-25', h: r[0], s: 125, di: 80, p: 70 }, i + 2); });
  return d;
}

test('czas polski z uwzględnieniem lata i zimy', () => {
  assert.deepEqual(R.localParts(new Date('2026-11-25T07:05:00Z')), { key: '2026-11-25', minutes: 8 * 60 + 5 });
  assert.deepEqual(R.localParts(new Date('2026-07-01T06:05:00Z')), { key: '2026-07-01', minutes: 8 * 60 + 5 });
});

test('okno przypomnienia, świeży pomiar i stan wysłanych', () => {
  const empty = { sent: {} };
  assert.deepEqual(R.decide(data([]), empty, at('07:59')).due, []);
  assert.deepEqual(R.decide(data([]), empty, at('08:07')).due.map((x) => x.slot), ['rano']);
  assert.deepEqual(R.decide(data([]), empty, at('10:29')).due.map((x) => x.slot), ['rano']);
  assert.deepEqual(R.decide(data([]), empty, at('10:30')).due, []);
  assert.deepEqual(R.decide(data([['06:10']]), empty, at('08:07')).due, [], 'pomiar z ostatnich 2 godzin');
  assert.deepEqual(R.decide(data([['05:50']]), empty, at('08:07')).due.map((x) => x.slot), ['rano']);
  assert.deepEqual(R.decide(data([]), { sent: { '2026-11-25': ['rano'] } }, at('09:07')).due, []);
  assert.deepEqual(R.decide(data([], { rm: -1 }), empty, at('08:07')).due, []);
  assert.deepEqual(R.decide(data([], { re: 21 }), empty, at('21:30')).due.map((x) => x.slot), ['wieczor']);
  assert.equal(R.decide(data([]), empty, at('03:00'), { test: true }).due[0].slot, 'test');
  const proto = data([], { ps: '2026-11-23' });
  assert.match(R.decide(proto, empty, at('08:07')).due[0].body, /Tydzień pomiarów: dzień 3 z 7/);
});

test('wysyłka zapisuje stan i usuwa wygasłe telefony', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cis-'));
  fs.writeFileSync(path.join(dir, 'cisnienie-dane.json'), C.serialize(data([])));
  const sub = (n) => ({ endpoint: 'https://push.example/' + n, keys: { p256dh: 'k', auth: 'a' } });
  fs.writeFileSync(path.join(dir, 'push-subskrypcje.json'), JSON.stringify({ v: 1, subs: [sub(1), sub(2), { bad: 1 }] }));
  const sent = [];
  const send = async (s, payload) => { if (s.endpoint.endsWith('2')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push(payload); };
  assert.equal(R.check(dir, at('08:07')).send, true);
  const sum = await R.run({ dataDir: dir, now: at('08:07'), send });
  assert.equal(sum.sent, 1); assert.equal(sum.removed, 1);
  assert.equal(sent[0].tag, 'cisnienie-rano');
  assert.doesNotMatch(sent[0].body, /\d{2,3}\/\d{2,3}/, 'bez wyników w treści');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'push-stan.json'))).sent, { '2026-11-25': ['rano'] });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'push-subskrypcje.json'))).subs.length, 1);
  assert.equal(R.check(dir, at('08:40')).send, false, 'drugi raz tego samego dnia nie wysyła');
  const again = await R.run({ dataDir: dir, now: at('09:07'), send });
  assert.equal(again.sent, 0);
});

test('plik zadania ma znaczniki do podmiany i poprawną strukturę', () => {
  const y = fs.readFileSync(path.join(__dirname, '..', 'tools', 'przypomnienia.yml'), 'utf8');
  assert.match(y, /repository: __CODE_REPO__/);
  assert.match(y, /VAPID_PUBLIC_KEY: '__VAPID_PUBLIC__'/);
  assert.match(y, /cron: '7 3-22 \* \* \*'/);
  assert.doesNotMatch(y, /\t/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const pub = /VAPID_PUBLIC = '([^']+)'/.exec(app)[1];
  assert.equal(Buffer.from(pub, 'base64url').length, 65, 'klucz publiczny P-256');
});
