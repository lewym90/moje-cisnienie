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

function fakeGithub(isPrivate = true) {
  const gh = { files: {}, puts: 0, sha: 1 };
  gh.fetch = async (url, init) => {
    const u = new URL(url);
    const method = (init && init.method) || 'GET';
    const res = (code, body) => ({ ok: code < 300, status: code, headers: { get: () => null }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
    if (u.hostname !== 'api.github.com') {
      if (u.pathname.endsWith('/tools/przypomnienia.yml')) return res(200, fs.readFileSync(path.join(ROOT, 'tools/przypomnienia.yml'), 'utf8'));
      return res(404, {});
    }
    const p = decodeURIComponent(u.pathname);
    if (p === '/repos/jan/dane') return res(200, { private: isPrivate, default_branch: 'main', permissions: { push: true } });
    if (p === '/repos/jan/dane/branches/main') return res(200, {});
    const m = /^\/repos\/jan\/dane\/contents\/(.+)$/.exec(p);
    if (m) {
      const f = gh.files[m[1]];
      if (method === 'GET') return f ? res(200, { sha: f.sha, content: b64(f.text) }) : res(404, {});
      const body = JSON.parse(init.body);
      if ((f ? f.sha : undefined) !== body.sha) return res(409, {});
      gh.files[m[1]] = { text: unb64(body.content), sha: 'sha' + (++gh.sha) };
      gh.puts++;
      return res(200, {});
    }
    return res(404, {});
  };
  return gh;
}

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
  assert.match(q(doc, '#ed-preview').textContent, /Prawidłowe ciśnienie/);
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
      assert.match(q(doc, '.view').textContent, /Nieregularne bicie serca zaznaczono/);
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
  const sel = q(doc, '#rm-select');
  sel.value = '7';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(C.getCfg(stored(w)).rm, 7);
  const name = q(doc, '#name-input');
  name.value = '  Jan  Kowalski ';
  name.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(C.getCfg(stored(w)).nm, 'Jan Kowalski');
  // przełącznik przypomnień bez kopii pokazuje wyjaśnienie
  click(w, q(doc, '.tabbar [data-view="home"]'));
  const t = q(doc, '#push-toggle');
  t.checked = true;
  t.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(t.checked, false);
  assert.match(q(doc, '.toast').textContent, /kopię na GitHubie/);
  assert.deepEqual(errors, []);
});

test('kopia na GitHubie: połączenie, wysyłka po pomiarze, odmowa dla publicznego repozytorium', async () => {
  const gh = fakeGithub();
  const { w, doc, errors } = boot({ fetch: gh.fetch });
  await tick(60);
  click(w, q(doc, '.tabbar [data-view="settings"]'));
  q(doc, '#repo-input').value = 'jan/dane';
  q(doc, '#token-input').value = 'github_pat_x';
  click(w, q(doc, '[data-action="sync-connect"]'));
  await tick(1200);
  assert.ok(gh.files['cisnienie-dane.json'], 'utworzono plik kopii');
  click(w, q(doc, '.tabbar [data-view="home"]'));
  click(w, q(doc, '.last-card .btn.red'));
  type(w, q(doc, '#ed-in-s'), '133');
  type(w, q(doc, '#ed-in-di'), '83');
  click(w, q(doc, '#ed-save'));
  await tick(1500);
  const remote = C.parseSerialized(gh.files['cisnienie-dane.json'].text).data;
  assert.equal(C.listReadings(remote)[0].s, 133);
  assert.deepEqual(errors, []);

  const pub = fakeGithub(false);
  const b = boot({ fetch: pub.fetch });
  await tick(60);
  click(b.w, q(b.doc, '.tabbar [data-view="settings"]'));
  q(b.doc, '#repo-input').value = 'jan/dane';
  q(b.doc, '#token-input').value = 'x';
  click(b.w, q(b.doc, '[data-action="sync-connect"]'));
  await tick(300);
  assert.match(q(b.doc, '#connect-error').textContent, /PUBLICZNE/);
  assert.equal(Object.keys(pub.files).length, 0);
});

test('zadanie przypomnień trafia do repozytorium z podmienionym repozytorium kodu i kluczem', async () => {
  const gh = fakeGithub();
  const { w } = boot({ fetch: gh.fetch, localStorage: { 'cisnienie.sync.v1': JSON.stringify({ owner: 'jan', repo: 'dane', token: 't', branch: 'main' }) } });
  await tick(60);
  const yml = fs.readFileSync(path.join(ROOT, 'tools/przypomnienia.yml'), 'utf8');
  const r = await w.SCSync.ensureWorkflow(yml.replaceAll('__CODE_REPO__', 'lewym90/moje-cisnienie'));
  assert.equal(r, 'created');
  assert.equal(await w.SCSync.ensureWorkflow(yml.replaceAll('__CODE_REPO__', 'lewym90/moje-cisnienie')), 'same');
  assert.match(gh.files['.github/workflows/przypomnienia.yml'].text, /repository: lewym90\/moje-cisnienie/);
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
