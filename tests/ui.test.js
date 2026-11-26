'use strict';
/* Test interfejsu w jsdom: dodawanie, poprawianie, usuwanie, cofanie, walidacja, widoki, import, kopia na GitHub. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const C = require('../js/core.js');

const ROOT = path.join(__dirname, '..');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64').toString('utf8');

function fakeServer() {
  const srv = { data: C.emptyData(), zm: 0, konta: { jan: 'haslo1234' }, posts: 0, push: null };
  const res = (code, body) => ({ ok: code < 300, status: code, text: async () => JSON.stringify(body) });
  srv.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.hostname !== '188-68-247-201.sslip.io') return res(404, {});
    const p = u.pathname.replace('/cisnienie-api', '');
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : {};
    const auth = (init && init.headers && init.headers.Authorization) || '';
    if (p === '/rejestracja') {
      if (body.kod !== 'Serce') return res(403, { blad: 'Nieprawidłowy kod zaproszenia.' });
      srv.konta[body.login] = body.haslo;
      return res(200, { token: 'tok-' + body.login, konto: { login: body.login, imie: body.imie } });
    }
    if (p === '/logowanie') {
      if (srv.konta[body.login] !== body.haslo) return res(401, { blad: 'Zły login lub hasło.' });
      return res(200, { token: 'tok-' + body.login, konto: { login: body.login, imie: '' } });
    }
    if (p === '/vapid') return res(200, { klucz: 'AA' });
    if (!/^Bearer tok-/.test(auth) || srv.wygasla) return res(401, { blad: 'Zaloguj się ponownie.' });
    if (p === '/dane' && method === 'POST') {
      srv.posts++;
      const m = C.merge(srv.data, C.validate(body.dane).data);
      if (!C.sameData(m, srv.data)) { srv.data = m; srv.zm++; }
      return res(200, { zmienione: srv.zm, dane: JSON.parse(C.serialize(srv.data)) });
    }
    if (p === '/dane') {
      if (+u.searchParams.get('znane') === srv.zm) return res(200, { zmiana: false, zmienione: srv.zm });
      return res(200, { zmiana: true, zmienione: srv.zm, dane: JSON.parse(C.serialize(srv.data)) });
    }
    if (p === '/wyloguj') return res(200, { ok: true });
    return res(404, { blad: 'brak' });
  };
  return srv;
}

const KONTO = JSON.stringify({ token: 'tok-jan', login: 'jan', imie: 'Jan' });

const windows = [];
test.after(() => { windows.forEach((w) => { try { w.close(); } catch (e) { /* ignoruj */ } }); });

function boot(opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://lewym90.github.io/moje-cisnienie/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = function () {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.fetch = opts.fetch || (async () => { throw new TypeError('offline'); });
  if (opts.konto !== false) w.localStorage.setItem('cisnienie.konto.v1', KONTO);
  if (opts.localStorage) for (const [k, v] of Object.entries(opts.localStorage)) w.localStorage.setItem(k, v);
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  for (const f of ['js/theme-init.js', 'js/core.js', 'js/store.js', 'js/sync.js', 'js/app.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return { w, doc: w.document, errors };
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const q = (doc, s) => doc.querySelector(s);
function click(w, el) { assert.ok(el, 'brak elementu'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function type(w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); }
function stored(w) { return C.parseSerialized(w.localStorage.getItem('cisnienie.data.v1') || '{}').data; }

test('pusty start, dodanie pomiaru i widok startowy', async () => {
  const { w, doc, errors } = boot();
  await tick(60);
  assert.match(q(doc, '.home-top h1').textContent, /Ciśnienie/);
  assert.match(q(doc, '.last-card').textContent, /Brak pomiarów/);
  click(w, q(doc, '.last-card .btn.red'));
  assert.ok(q(doc, '.page-modal'));
  type(w, q(doc, '#ed-in-s'), '128');
  assert.equal(doc.activeElement.id, 'ed-in-di', '3 cyfry przenoszą do następnego pola');
  type(w, q(doc, '#ed-in-di'), '82');
  assert.equal(doc.activeElement.id, 'ed-in-p', '82 → kolejna cyfra przekroczyłaby zakres');
  type(w, q(doc, '#ed-in-p'), '071a');
  assert.equal(q(doc, '#ed-in-p').value, '71', 'tylko cyfry, bez zera na początku');
  assert.match(q(doc, '#ed-preview').textContent, /Podwyższone ciśnienie/, '128/82 wg PTNT/PTK 2024');
  click(w, q(doc, '[data-action="ed-tag"][data-tag="przed"]'));
  click(w, q(doc, '[data-action="ed-tag"][data-tag="po"]'));
  click(w, q(doc, '[data-action="ed-arm"][data-a="L"]'));
  click(w, q(doc, '#ed-save'));
  await tick();
  assert.equal(q(doc, '.page-modal'), null);
  const list = C.listReadings(stored(w));
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].s, list[0].di, list[0].p, list[0].a], [128, 82, 71, 'L']);
  assert.deepEqual(list[0].g, ['po'], 'przed/po lekach wykluczają się');
  assert.match(q(doc, '.lc-bp').textContent, /128 \/ 82/);
  assert.match(q(doc, '.toast').textContent, /Zapisano 128\/82/);
  // cofnij
  click(w, q(doc, '[data-action="toast-undo"]'));
  await tick();
  assert.equal(C.countReadings(stored(w)), 0);
  assert.deepEqual(errors, []);
});

test('walidacja: brak wartości, odwrócone wartości, przyszłość, nietypowy wynik', async () => {
  const { w, doc, errors } = boot();
  await tick(60);
  click(w, q(doc, '.last-card .btn.red'));
  click(w, q(doc, '#ed-save'));
  assert.match(q(doc, '#ed-preview').textContent, /Wpisz ciśnienie skurczowe/);
  type(w, q(doc, '#ed-in-s'), '80');
  type(w, q(doc, '#ed-in-di'), '90');
  click(w, q(doc, '#ed-save'));
  assert.match(q(doc, '#ed-preview').textContent, /musi być wyższe/);
  assert.ok(q(doc, '#ed-row-di').classList.contains('bad'));
  type(w, q(doc, '#ed-in-s'), '120');
  type(w, q(doc, '#ed-in-di'), '80');
  click(w, q(doc, '[data-action="ed-when"]'));
  const tomorrow = C.addDays(C.todayKey(), 1);
  q(doc, '#ed-date').value = tomorrow;
  click(w, q(doc, '#ed-save'));
  assert.match(q(doc, '#ed-preview').textContent, /z przyszłości/);
  q(doc, '#ed-date').value = C.addDays(C.todayKey(), -2);
  q(doc, '#ed-time').value = '07:15';
  type(w, q(doc, '#ed-in-s'), '245');
  type(w, q(doc, '#ed-in-di'), '120');
  click(w, q(doc, '#ed-save'));
  await tick();
  assert.match(q(doc, '#confirm-root').textContent, /nietypowy/);
  click(w, q(doc, '[data-action="confirm-yes"]'));
  await tick();
  const l = C.listReadings(stored(w));
  assert.equal(l.length, 1);
  assert.equal(l[0].d, C.addDays(C.todayKey(), -2));
  assert.equal(l[0].h, '07:15');
  assert.match(q(doc, '#confirm-root').textContent, /Bardzo wysokie ciśnienie/, 'ostrzeżenie przy ≥180/110');
  assert.equal(q(doc, '[data-action="confirm-no"]'), null);
  click(w, q(doc, '[data-action="confirm-yes"]'));
  assert.deepEqual(errors, []);
});

test('przyciski − / + startują od ostatniego pomiaru, edycja i usuwanie', async () => {
  let d = C.setReading(C.emptyData(), 'abcd1', { d: C.addDays(C.todayKey(), -1), h: '07:00', s: 131, di: 84, p: 66 }, 1);
  const { w, doc, errors } = boot({ localStorage: { 'cisnienie.data.v1': C.serialize(d) } });
  await tick(60);
  click(w, q(doc, '.last-card .btn.red'));
  const plus = q(doc, '.stp[data-f="s"][data-d="1"]');
  plus.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  doc.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
  assert.equal(q(doc, '#ed-in-s').value, '131');
  plus.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  doc.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
  assert.equal(q(doc, '#ed-in-s').value, '132');
  click(w, q(doc, '[data-action="editor-cancel"]'));
  await tick();
  assert.equal(C.countReadings(stored(w)), 1, 'anulowanie niczego nie zapisuje');
  // edycja z listy
  click(w, q(doc, '.rrow[data-id="abcd1"]'));
  assert.equal(q(doc, '#ed-in-s').value, '131');
  type(w, q(doc, '#ed-in-s'), '129');
  click(w, q(doc, '#ed-save'));
  await tick();
  assert.equal(C.getReading(stored(w), 'abcd1').s, 129);
  click(w, q(doc, '.rrow[data-id="abcd1"]'));
  click(w, q(doc, '[data-action="editor-delete"]'));
  await tick();
  assert.equal(C.countReadings(stored(w)), 0);
  click(w, q(doc, '[data-action="toast-undo"]'));
  await tick();
  assert.equal(C.getReading(stored(w), 'abcd1').s, 129);
  assert.deepEqual(errors, []);
});

test('wszystkie widoki rysują się bez błędów (z danymi i bez)', async () => {
  let d = C.emptyData();
  for (let i = 0; i < 120; i++) {
    const day = C.addDays(C.todayKey(), -i);
    d = C.setReading(d, 'm' + i + 'xxx', { d: day, h: '07:30', s: 125 + (i % 20), di: 78 + (i % 12), p: 60 + (i % 15), g: i % 9 ? [] : ['arytmia'] }, i + 1);
    d = C.setReading(d, 'e' + i + 'xxx', { d: day, h: '20:30', s: 118 + (i % 17), di: 75 + (i % 10), p: 0 }, i + 1);
  }
  for (const data of [C.emptyData(), d]) {
    const { w, doc, errors } = boot({ localStorage: { 'cisnienie.data.v1': C.serialize(data) } });
    await tick(60);
    for (const v of ['history', 'charts', 'settings', 'home']) {
      click(w, q(doc, `.tabbar [data-view="${v}"]`));
      assert.equal(q(doc, `.tabbar [data-view="${v}"]`).getAttribute('aria-current'), 'page');
    }
    click(w, q(doc, '.tile:nth-child(4)'));
    assert.match(q(doc, '.bar h1').textContent, /Porady/);
    click(w, q(doc, '.tabbar [data-view="charts"]'));
    for (const p of ['d7', 'd30', 'd90', 'y1']) {
      click(w, q(doc, `[data-action="period"][data-p="${p}"]`));
      if (data === d) assert.ok(q(doc, '.chart'), 'wykres ' + p);
    }
    if (data === d) {
      assert.match(q(doc, '.view').textContent, /Nieregularne bicie serca.*Zaznaczono je 14 razy/);
      click(w, q(doc, '[data-action="proto-start"]'));
      assert.match(q(doc, '.view').textContent, /dzień 1 z 7/);
      click(w, q(doc, '.tabbar [data-view="history"]'));
      click(w, q(doc, '[data-action="hist-prev"]'));
      assert.ok(doc.querySelectorAll('.rrow').length > 20);
    }
    assert.deepEqual(errors, []);
  }
});

test('cel i godziny przypomnień zapisują się w danych', async () => {
  const { w, doc, errors } = boot();
  await tick(60);
  click(w, q(doc, '.tabbar [data-view="settings"]'));
  click(w, q(doc, '[data-action="tgt"][data-f="ts"][data-d="-5"]'));
  assert.equal(C.getCfg(stored(w)).ts, 130);
  click(w, q(doc, '[data-action="rp-del"][data-i="0"]'));
  assert.deepEqual(C.getCfg(stored(w)).rp, ['20:00']);
  click(w, q(doc, '[data-action="rp-add"]'));
  assert.deepEqual(C.getCfg(stored(w)).rp, ['08:00', '20:00']);
  const tin = q(doc, '.rp-in[data-i="0"]');
  tin.value = '06:45';
  tin.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.deepEqual(C.getCfg(stored(w)).rp, ['06:45', '20:00']);
  const name = q(doc, '#name-input');
  name.value = '  Jan  Kowalski ';
  name.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(C.getCfg(stored(w)).nm, 'Jan Kowalski');
  // przełącznik przypomnień na urządzeniu bez obsługi powiadomień pokazuje wyjaśnienie
  click(w, q(doc, '.tabbar [data-view="home"]'));
  const t = q(doc, '#push-toggle');
  t.checked = true;
  t.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(t.checked, false);
  assert.match(q(doc, '.toast').textContent, /nie obsługuje powiadomień/);
  assert.deepEqual(errors, []);
});

test('konto: rejestracja, zapis po pomiarze, wylogowanie czyści urządzenie, utrata sesji', async () => {
  const srv = fakeServer();
  const { w, doc, errors } = boot({ fetch: srv.fetch, konto: false });
  await tick(60);
  assert.ok(q(doc, '#auth-form'), 'bez konta pokazuje się ekran zakładania konta');
  assert.ok(doc.body.classList.contains('no-nav'));
  q(doc, '#au-imie').value = 'Anna Nowak';
  q(doc, '#au-login').value = 'anna';
  q(doc, '#au-haslo').value = 'tajnehaslo';
  q(doc, '#au-kod').value = 'zly';
  q(doc, '#auth-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(80);
  assert.match(q(doc, '#au-err').textContent, /Nieprawidłowy kod/);
  q(doc, '#au-kod').value = 'Serce';
  q(doc, '#auth-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(150);
  assert.ok(q(doc, '.last-card'), 'po założeniu konta – ekran startowy');
  assert.equal(C.getCfg(stored(w)).nm, 'Anna Nowak', 'imię trafia na raport');
  click(w, q(doc, '.last-card .btn.red'));
  type(w, q(doc, '#ed-in-s'), '133');
  type(w, q(doc, '#ed-in-di'), '83');
  click(w, q(doc, '#ed-save'));
  await tick(1600);
  assert.equal(C.listReadings(srv.data)[0].s, 133, 'pomiar trafił na serwer');
  // wylogowanie: dane znikają z urządzenia, zostają na serwerze
  click(w, q(doc, '.tabbar [data-view="settings"]'));
  click(w, q(doc, '[data-action="logout"]'));
  click(w, q(doc, '[data-action="confirm-yes"]'));
  await tick(150);
  assert.ok(q(doc, '#auth-form'));
  assert.equal(C.countReadings(stored(w)), 0);
  assert.equal(w.localStorage.getItem('cisnienie.konto.v1'), '');
  // ponowne logowanie przywraca pomiary
  click(w, q(doc, '[data-action="auth-mode"][data-m="login"]'));
  q(doc, '#au-login').value = 'anna';
  q(doc, '#au-haslo').value = 'tajnehaslo';
  q(doc, '#auth-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(150);
  assert.equal(C.countReadings(stored(w)), 1);
  // sesja unieważniona na serwerze (np. zmiana hasła na innym telefonie) → ekran logowania
  srv.wygasla = true;
  await w.SCSync.run();
  await tick(60);
  assert.ok(q(doc, '#auth-form'));
  assert.match(q(doc, '.toast').textContent, /Zaloguj się ponownie/);
  assert.deepEqual(errors, []);
});

test('dwa urządzenia jednej osoby widzą te same pomiary', async () => {
  const srv = fakeServer();
  const A = boot({ fetch: srv.fetch });
  const B = boot({ fetch: srv.fetch });
  await tick(100);
  click(A.w, q(A.doc, '.last-card .btn.red'));
  type(A.w, q(A.doc, '#ed-in-s'), '128');
  type(A.w, q(A.doc, '#ed-in-di'), '81');
  click(A.w, q(A.doc, '#ed-save'));
  await tick(1600);
  await B.w.SCSync.poll();
  await tick(60);
  assert.match(q(B.doc, '.lc-bp').textContent, /128 \/ 81/);
});

test('import kopii JSON i CSV bez duplikatów', async () => {
  const { w, doc, errors } = boot();
  await tick(60);
  let d = C.setReading(C.emptyData(), 'imp001', { d: '2026-10-01', h: '08:00', s: 140, di: 90, p: 70 }, 5);
  const files = [
    new w.File([C.serialize(d)], 'k.json', { type: 'application/json' }),
    new w.File(['Data;Godzina;Skurczowe;Rozkurczowe;Tętno\n02.10.2026;08:00;135;85;68\n'], 'p.csv', { type: 'text/csv' })
  ];
  click(w, q(doc, '.tabbar [data-view="settings"]'));
  for (const f of files.concat(files)) {
    const inp = q(doc, '#import-file');
    Object.defineProperty(inp, 'files', { value: [f], configurable: true });
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick(80);
  }
  assert.equal(C.countReadings(stored(w)), 2);
  assert.deepEqual(errors, []);
});
