// Testy serwera: konta, izolacja danych, scalanie, szyfrowanie w bazie, przypomnienia, push, kopie.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../js/core.js');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cis-srv-'));
process.env.CISNIENIE_DANE = DIR;
process.env.CISNIENIE_KLUCZ = crypto.randomBytes(32).toString('hex');
process.env.CISNIENIE_BEZ_STARTU = '1';
const S = await import('../serwer/cisnienie.mjs');
await new Promise((r) => S.serwer.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${S.serwer.address().port}`;
test.after(() => S.serwer.close());

async function api(p, { method = 'GET', body, token, origin } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (origin) h.Origin = origin;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
}
const rec = (d, h, s, di) => ({ d, h, s, di, p: 70 });

let tokA, tokB;

test('rejestracja wymaga kodu zaproszenia', async () => {
  let r = await api('/zdrowie');
  assert.equal(r.json.kod, false);
  r = await api('/rejestracja', { method: 'POST', body: { login: 'anna', haslo: 'tajnehaslo', kod: 'x' } });
  assert.equal(r.status, 403);
  S.ustawKod('Serce2026');
  r = await api('/rejestracja', { method: 'POST', body: { login: 'anna', haslo: 'tajnehaslo', kod: 'zly' } });
  assert.equal(r.status, 403);
  r = await api('/rejestracja', { method: 'POST', body: { login: 'a', haslo: 'tajnehaslo', kod: 'serce2026' } });
  assert.equal(r.status, 400);
  r = await api('/rejestracja', { method: 'POST', body: { login: 'anna', haslo: 'krotkie', kod: 'serce2026' } });
  assert.equal(r.status, 400);
  r = await api('/rejestracja', { method: 'POST', body: { login: 'anna', imie: 'Anna <b>', haslo: 'tajnehaslo', kod: ' SERCE2026 ', urzadzenie: 'iPhone' } });
  assert.equal(r.status, 200); tokA = r.json.token;
  assert.equal(r.json.konto.imie, 'Anna b');
  r = await api('/rejestracja', { method: 'POST', body: { login: 'ANNA', haslo: 'tajnehaslo', kod: 'Serce2026' } });
  assert.equal(r.status, 409, 'login bez względu na wielkość liter');
  r = await api('/rejestracja', { method: 'POST', body: { login: 'jan', haslo: 'innehaslo1', kod: 'Serce2026' } });
  tokB = r.json.token;
  assert.ok(tokB);
});

test('logowanie, blokada zgadywania, CORS', async () => {
  let r = await api('/logowanie', { method: 'POST', body: { login: 'Anna', haslo: 'tajnehaslo' }, origin: 'https://lewym90.github.io' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://lewym90.github.io');
  r = await api('/logowanie', { method: 'POST', body: { login: 'anna', haslo: 'x' }, origin: 'https://zly.example' });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  for (let i = 0; i < 8; i++) await api('/logowanie', { method: 'POST', body: { login: 'jan', haslo: 'zle' } });
  r = await api('/logowanie', { method: 'POST', body: { login: 'jan', haslo: 'innehaslo1' } });
  assert.equal(r.status, 429);
  assert.equal((await api('/dane')).status, 401);
  assert.equal((await api('/dane', { token: 'zmyslony' })).status, 401);
});

test('każdy widzi tylko swoje dane; scalanie z wielu urządzeń; szyfrowanie w bazie', async () => {
  let a = C.setReading(C.emptyData(), 'aaaa1', rec('2026-11-20', '07:10', 131, 84), 100);
  let r = await api('/dane', { method: 'POST', token: tokA, body: { dane: JSON.parse(C.serialize(a)), tz: 'Europe/Warsaw' } });
  assert.equal(r.status, 200);
  const zm = r.json.zmienione;
  // drugie urządzenie Anny dopisuje swój pomiar i usuwa pierwszy
  let a2 = C.setReading(C.emptyData(), 'bbbb1', rec('2026-11-21', '20:10', 125, 80), 200);
  a2 = C.setReading(a2, 'aaaa1', null, 300);
  r = await api('/dane', { method: 'POST', token: tokA, body: { dane: JSON.parse(C.serialize(a2)) } });
  const merged = C.validate(r.json.dane).data;
  assert.equal(C.countReadings(merged), 1);
  assert.equal(C.getReading(merged, 'bbbb1').s, 125);
  assert.ok(r.json.zmienione >= zm);
  // Jan nie widzi pomiarów Anny
  r = await api('/dane', { token: tokB });
  assert.equal(C.countReadings(C.validate(r.json.dane).data), 0);
  // ten sam stan → brak zmiany
  r = await api('/dane?znane=' + (await api('/dane', { token: tokA })).json.zmienione, { token: tokA });
  assert.equal(r.json.zmiana, false);
  // w bazie nie ma jawnych wartości
  const raw = S.db.prepare('SELECT dane FROM dane').all().map((x) => x.dane).join(' ');
  assert.doesNotMatch(raw, /125|2026-11-21/);
  assert.match(raw, /^CS1\|/);
  // dane innej aplikacji odrzucone
  r = await api('/dane', { method: 'POST', token: tokA, body: { dane: { app: 'utarg', days: {} } } });
  assert.equal(r.status, 400);
});

test('przypomnienia: pora, świeży pomiar, raz dziennie, tylko urządzenia z push', async () => {
  const wyslane = [];
  S.ustawWysylke(async (s, tresc) => { wyslane.push({ s: s.id, tresc }); return true; });
  const sub = { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } };
  let r = await api('/push', { method: 'POST', token: tokA, body: { sub } });
  assert.equal(r.status, 200);
  assert.equal((await api('/push', { method: 'POST', token: tokA, body: { sub: { endpoint: 'http://x' } } })).status, 400);
  // 21.11.2026 08:05 czasu polskiego = 07:05 UTC; Anna ma pomiar 21.11 tylko wieczorem (20:10)
  const t = new Date('2026-11-21T07:05:00Z');
  assert.equal(await S.sprawdzPrzypomnienia(t), 1);
  assert.equal(wyslane[0].tresc.tag, 'cisnienie-0800');
  assert.match(wyslane[0].tresc.body, /poranny/);
  assert.doesNotMatch(wyslane[0].tresc.body, /\d{2,3}\/\d{2,3}/);
  assert.equal(await S.sprawdzPrzypomnienia(new Date('2026-11-21T07:30:00Z')), 0, 'drugi raz tego samego dnia nie');
  // wieczorem jest pomiar 20:10 → brak przypomnienia o 20:00? przypomnienie 20:00 przed pomiarem: pomiar ≥ 18:00 jest, więc nic
  assert.equal(await S.sprawdzPrzypomnienia(new Date('2026-11-21T19:20:00Z')), 0);
  // Jan nie ma włączonych powiadomień → nic
  assert.equal(wyslane.filter((w) => w.s !== wyslane[0].s).length, 0);
  // próbne powiadomienie
  r = await api('/push/test', { method: 'POST', token: tokA });
  assert.equal(r.status, 200);
  assert.equal((await api('/push/test', { method: 'POST', token: tokB })).status, 400);
});

test('przypomnienia w strefie użytkownika i z tygodniem pomiarów', () => {
  let d = C.setCfg(C.emptyData(), { rp: ['07:00', '13:30'], ps: '2026-11-20' }, 1);
  const p = S.przypomnieniaDo(d, new Set(), new Date('2026-11-22T06:10:00Z'), 'Europe/Warsaw');
  assert.equal(p.length, 1); assert.match(p[0].tresc.body, /dzień 3 z 7/);
  assert.equal(S.przypomnieniaDo(d, new Set(), new Date('2026-11-22T06:10:00Z'), 'Europe/London').length, 0, '06:10 w Londynie to przed 7:00');
  // dowolna godzina: 13:30 (12:35 UTC zimą)
  const p2 = S.przypomnieniaDo(d, new Set(), new Date('2026-11-22T12:35:00Z'), 'Europe/Warsaw');
  assert.equal(p2.length, 1); assert.equal(p2[0].pora, '13:30'); assert.match(p2[0].tresc.body, /Pora na pomiar ciśnienia/);
  assert.equal(S.przypomnieniaDo(d, new Set(['13:30']), new Date('2026-11-22T12:35:00Z'), 'Europe/Warsaw').length, 0);
  assert.equal(S.przypomnieniaDo(d, new Set(), new Date('2026-11-22T14:05:00Z'), 'Europe/Warsaw').length, 0, 'po 90 minutach już nie');
  assert.equal(S.przypomnieniaDo(C.setCfg(d, { rp: [] }, 2), new Set(), new Date('2026-11-22T06:10:00Z'), 'Europe/Warsaw').length, 0);
  assert.deepEqual(S.czasLokalny(new Date('2026-07-01T06:05:00Z'), 'Europe/Warsaw'), { dzien: '2026-07-01', minuty: 8 * 60 + 5 });
});

test('szyfrowanie powiadomień zgodne z RFC 8291 (rozszyfrowanie po stronie telefonu)', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = S.szyfrujPush('{"a":1}', ua.getPublicKey().toString('base64url'), auth.toString('base64url'));
  const sol = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ikm = hm(hm(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hm(sol, ikm);
  const d = crypto.createDecipheriv('aes-128-gcm', hm(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hm(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
  d.setAuthTag(ct.subarray(-16));
  const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), '{"a":1}');
  assert.equal(plain.at(-1), 2);
  assert.equal(Buffer.from(S.VAPID_PUB, 'base64url').length, 65);
});

test('zmiana hasła wylogowuje inne urządzenia; usunięcie konta kasuje dane; kopie', async () => {
  const drugie = (await api('/logowanie', { method: 'POST', body: { login: 'anna', haslo: 'tajnehaslo' } })).json.token;
  assert.equal((await api('/haslo', { method: 'POST', token: tokA, body: { stare: 'zle', nowe: 'nowehaslo1' } })).status, 403);
  assert.equal((await api('/haslo', { method: 'POST', token: tokA, body: { stare: 'tajnehaslo', nowe: 'nowehaslo1' } })).status, 200);
  assert.equal((await api('/konto', { token: drugie })).status, 401);
  assert.equal((await api('/konto', { token: tokA })).status, 200);
  const plik = S.zrobKopie(new Date('2026-11-21T03:00:00Z'));
  assert.ok(fs.existsSync(plik));
  assert.equal(S.zrobKopie(new Date('2026-11-21T05:00:00Z')), null, 'jedna kopia dziennie');
  assert.equal((await api('/konto', { method: 'DELETE', token: tokA, body: { haslo: 'zle' } })).status, 403);
  assert.equal((await api('/konto', { method: 'DELETE', token: tokA, body: { haslo: 'nowehaslo1' } })).status, 200);
  assert.equal(S.db.prepare("SELECT COUNT(*) AS n FROM konta WHERE login = 'anna'").get().n, 0);
  assert.equal(S.db.prepare('SELECT COUNT(*) AS n FROM dane').get().n, 0);
  assert.equal((await api('/dane', { token: tokA })).status, 401);
});
