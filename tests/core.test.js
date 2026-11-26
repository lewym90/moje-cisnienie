'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('kategorie ESH 2023 na granicach', () => {
  const cases = [
    [119, 79, 'opt'], [120, 79, 'norm'], [119, 80, 'norm'], [129, 84, 'norm'], [130, 70, 'high'], [125, 85, 'high'],
    [139, 89, 'high'], [140, 60, 'g1'], [120, 90, 'g1'], [159, 99, 'g1'], [160, 80, 'g2'], [150, 100, 'g2'],
    [179, 109, 'g2'], [180, 90, 'g3'], [150, 110, 'g3'], [89, 59, 'low'], [100, 59, 'low'], [89, 70, 'low'], [150, 55, 'g1']
  ];
  for (const [s, d, id] of cases) assert.equal(C.classify(s, d).id, id, `${s}/${d}`);
  assert.equal(C.isCrisis(180, 80), true);
  assert.equal(C.isCrisis(179, 109), false);
});

test('sprawdzanie wartości', () => {
  assert.equal(C.checkValues(120, 80, 70).ok, true);
  assert.equal(C.checkValues(120, 80, 0).ok, true);
  assert.equal(C.checkValues(120, 80, null).ok, true);
  assert.equal(C.checkValues(null, 80).field, 's');
  assert.equal(C.checkValues(49, 30).field, 's');
  assert.equal(C.checkValues(301, 80).field, 's');
  assert.equal(C.checkValues(120, null).field, 'di');
  assert.equal(C.checkValues(120, 29).field, 'di');
  assert.equal(C.checkValues(80, 80).field, 'di');
  assert.equal(C.checkValues(120, 80, 7).field, 'p');
  assert.equal(C.checkValues(120, 80, 251).field, 'p');
  assert.equal(C.checkValues(120.5, 80).ok, false);
  assert.equal(C.unusualValues(120, 80, 70), false);
  assert.equal(C.unusualValues(240, 80, 70), true);
  assert.equal(C.unusualValues(120, 110, 70), true);
  assert.equal(C.unusualValues(120, 80, 190), true);
});

function rec(d, h, s, di, p) { return { d, h, s, di, p }; }

test('zapis, usuwanie i scalanie z wielu urządzeń', () => {
  let a = C.emptyData();
  a = C.setReading(a, 'aaaa1', rec('2026-11-20', '07:10', 130, 85, 70), 100);
  let b = C.setReading(a, 'bbbb1', rec('2026-11-20', '20:10', 125, 80, 66), 200);
  a = C.setReading(a, 'aaaa1', null, 300); // usunięte na urządzeniu A
  const m1 = C.merge(a, b), m2 = C.merge(b, a);
  assert.equal(C.serialize(m1), C.serialize(m2));
  assert.equal(C.serialize(C.merge(m1, m1)), C.serialize(m1));
  assert.equal(C.getReading(m1, 'aaaa1'), null, 'usunięcie wygrywa ze starszą wersją');
  assert.equal(C.countReadings(m1), 1);
  // późniejsza edycja na B przywraca pomiar
  b = C.setReading(b, 'aaaa1', rec('2026-11-20', '07:10', 131, 85, 70), 400);
  assert.equal(C.getReading(C.merge(m1, b), 'aaaa1').s, 131);
  // znacznik czasu zawsze rośnie
  const c = C.setReading(b, 'aaaa1', rec('2026-11-20', '07:10', 132, 85, 70), 10);
  assert.ok(c.r.aaaa1.t > b.r.aaaa1.t);
  assert.throws(() => C.setReading(b, 'x', rec('2026-11-20', '07:10', 132, 85, 70), 1));
  assert.throws(() => C.setReading(b, 'zzzz9', rec('2026-11-20', '07:10', 80, 85, 70), 1));
});

test('zapis JSON i walidacja danych z zewnątrz', () => {
  let d = C.emptyData();
  d = C.setReading(d, 'r00001', { d: '2026-11-21', h: '08:00', s: 128, di: 82, p: 71, a: 'L', g: ['po', 'arytmia', 'xxx'], n: ' po  kawie \n' }, 5);
  d = C.setReading(d, 'r00002', null, 6);
  d = C.setCfg(d, { ts: 130, td: 80, nm: 'Jan <b>Kowalski</b>', ps: '2026-11-20' }, 7);
  const text = C.serialize(d);
  const back = C.parseSerialized(text);
  assert.equal(back.dropped, 0);
  assert.equal(C.serialize(back.data), text);
  const r = C.getReading(back.data, 'r00001');
  assert.deepEqual(r.g, ['po', 'arytmia']);
  assert.equal(r.n, 'po kawie');
  assert.equal(C.getCfg(back.data).nm, 'Jan b Kowalski /b');
  const bad = C.validate({ app: 'cisnienie', r: { ok01: { d: '2026-02-30', h: '07:00', s: 120, di: 80, p: 0, t: 1 }, ok02: { d: '2026-02-03', h: '25:00', s: 120, di: 80, t: 1 }, ok03: { d: '2026-02-03', h: '07:00', s: 80, di: 90, t: 1 }, 'bad id!': {} } });
  assert.equal(bad.dropped, 4);
  assert.equal(C.validate({ app: 'utarg', days: {} }).foreign, true);
  assert.equal(C.parseSerialized('{zepsute').error, true);
});

test('statystyki, pory dnia i cel', () => {
  const l = [rec('2026-11-20', '07:00', 140, 90, 70), rec('2026-11-20', '20:00', 120, 80, 0), rec('2026-11-21', '13:00', 131, 84, 75)];
  const st = C.stats(l, { ts: 135, td: 85 });
  assert.equal(st.n, 3); assert.equal(st.s, 130); assert.equal(st.di, 85); assert.equal(st.p, 73); assert.equal(st.pn, 2);
  assert.equal(st.inTarget, 2); assert.equal(st.inTargetPct, 67);
  assert.equal(st.maxS, 140); assert.equal(st.minDi, 80); assert.equal(st.minP, 70);
  assert.equal(st.cats.g1, 1);
  assert.equal(C.dayPart('03:59'), 'noc'); assert.equal(C.dayPart('04:00'), 'rano'); assert.equal(C.dayPart('11:59'), 'rano');
  assert.equal(C.dayPart('12:00'), 'dzien'); assert.equal(C.dayPart('17:00'), 'wieczor'); assert.equal(C.dayPart('23:59'), 'wieczor');
  assert.equal(C.stats([]).n, 0);
});

test('punkty wykresu: dni, tygodnie, miesiące', () => {
  let d = C.emptyData();
  for (let i = 0; i < 400; i++) d = C.setReading(d, 'id' + String(i).padStart(4, '0'), rec(C.addDays('2025-10-01', i), '08:00', 120 + (i % 10), 80, 70), i + 1);
  const w = C.periodRange('d7', '2026-11-04', d);
  assert.deepEqual(w, { from: '2026-10-29', to: '2026-11-04' });
  const p7 = C.chartPoints(C.listReadings(d, w.from, w.to), w.from, w.to);
  assert.equal(p7.unit, 'day'); assert.equal(p7.points.length, 7); assert.equal(p7.points[0].label, 'Cz');
  const y = C.periodRange('y1', '2026-11-04', d);
  const py = C.chartPoints(C.listReadings(d, y.from, y.to), y.from, y.to);
  assert.equal(py.unit, 'week');
  assert.ok(py.points.length >= 52 && py.points.length <= 54);
  const all = C.chartPoints(C.listReadings(d), '2025-09-01', '2026-11-04');
  assert.equal(all.unit, 'month');
  assert.equal(C.weekStart('2026-11-25'), '2026-11-23');
});

test('tydzień pomiarów: średnia z dni 2–7', () => {
  let d = C.setCfg(C.emptyData(), { ps: '2026-11-01' }, 1);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const day = C.addDays('2026-11-01', i);
    for (const h of ['07:00', '07:02', '20:00', '20:02']) d = C.setReading(d, 'p' + (n++) + 'xxxx', rec(day, h, i === 0 ? 180 : 130, i === 0 ? 100 : 80, 70), n);
  }
  const mid = C.protocol(d, '2026-11-03');
  assert.equal(mid.dayNo, 3); assert.equal(mid.done, false);
  const p = C.protocol(d, '2026-11-08');
  assert.equal(p.done, true); assert.equal(p.result.n, 24); assert.equal(p.result.s, 130); assert.equal(p.enough, true); assert.equal(p.above, false);
  assert.equal(p.days[0].rano, 2); assert.equal(p.days[0].wieczor, 2);
  assert.equal(C.protocol(C.emptyData(), '2026-11-08'), null);
});

test('CSV: eksport, import i brak duplikatów', () => {
  let d = C.emptyData();
  d = C.setReading(d, 'aaaa1', { d: '2026-11-20', h: '07:10', s: 130, di: 85, p: 70, a: 'P', g: ['przed'], n: 'po; "spacerze"' }, 1);
  const csv = C.toCsv(C.listReadings(d));
  assert.ok(csv.startsWith('﻿Data;Godzina;Skurczowe'));
  const parsed = C.parseCsv(csv);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].n, 'po; "spacerze"');
  assert.equal(parsed.entries[0].a, 'P');
  assert.deepEqual(parsed.entries[0].g, ['przed']);
  const r1 = C.addEntries(C.emptyData(), parsed.entries, 10);
  assert.equal(r1.added, 1);
  const r2 = C.addEntries(r1.data, parsed.entries, 11);
  assert.equal(r2.added, 0); assert.equal(r2.existing, 1);
  const simple = C.parseCsv('data,godzina,sys,dia,puls\n21.11.2026,8:05,128,82,71\n22.11.2026,x,1,2,3\n');
  assert.equal(simple.entries.length, 1); assert.equal(simple.entries[0].h, '08:05'); assert.deepEqual(simple.skipped, [3]);
  assert.ok(C.parseCsv('').error);
});

test('wnioski i nagłówek', () => {
  const l = [];
  for (let i = 0; i < 14; i++) l.push(rec(C.addDays('2026-11-01', i), '07:30', 150 - i * 2, 92 - i, 70), rec(C.addDays('2026-11-01', i), '20:30', 135 - i * 2, 85 - i, 68));
  const ins = C.insights(l, { ts: 135, td: 85 }, '2026-11-01', '2026-11-14');
  assert.ok(ins.some((x) => /Rano ciśnienie skurczowe jest średnio o 15 mmHg wyższe/.test(x.text)));
  assert.ok(ins.some((x) => /spadło/.test(x.text)));
  const hl = C.headline(l, { ts: 135, td: 85 }, '2026-11-01', '2026-11-14');
  assert.equal(hl.title, 'Ciśnienie spada');
  assert.equal(C.headline([], { ts: 135, td: 85 }), null);
});
