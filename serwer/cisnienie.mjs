// Ciśnienie — serwer kont, danych, kopii i przypomnień.
// Bez zewnętrznych bibliotek: node:http, node:sqlite, node:crypto.
// Każdy użytkownik ma własne konto i widzi wyłącznie swoje pomiary.
// Pomiary są w bazie zaszyfrowane (AES-256-GCM, klucz poza bazą).
// Uruchomienie: PORT=18945 CISNIENIE_DANE=/var/lib/cisnienie node cisnienie.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
// logika pomiarów wspólna z aplikacją (ten sam, przetestowany plik js/core.js)
const C = (() => { try { return require('./core.cjs'); } catch { return require('../js/core.js'); } })();

export const WERSJA = '1.1.0';
const PORT = Number(process.env.PORT || 18945);
const DANE = process.env.CISNIENIE_DANE || './dane';
const ORIGINS = (process.env.CISNIENIE_ORIGINS || 'https://lewym90.github.io,http://localhost:8080,http://127.0.0.1:8080,http://localhost:8091').split(',');
const MAX_BODY = 4 * 1024 * 1024;
const OKNO_PRZYP = 90; // minut po ustawionej godzinie (nadrabia np. restart serwera)
const PRZED = 120; // pomiar z 2 godzin przed przypomnieniem „zalicza” porę

fs.mkdirSync(DANE, { recursive: true });
fs.mkdirSync(path.join(DANE, 'kopie'), { recursive: true });

// ---------- klucz szyfrowania (poza bazą) ----------
function wczytajKlucz() {
  if (process.env.CISNIENIE_KLUCZ) return Buffer.from(process.env.CISNIENIE_KLUCZ, 'hex');
  const pliki = [];
  if (process.env.CREDENTIALS_DIRECTORY) pliki.push(path.join(process.env.CREDENTIALS_DIRECTORY, 'klucz'));
  if (process.env.CISNIENIE_KLUCZ_PLIK) pliki.push(process.env.CISNIENIE_KLUCZ_PLIK);
  for (const p of pliki) {
    try { const k = Buffer.from(fs.readFileSync(p, 'utf8').trim(), 'hex'); if (k.length === 32) return k; } catch { /* następny */ }
  }
  throw new Error('Brak klucza szyfrowania (32 bajty hex). Uruchom install.sh jeszcze raz.');
}
const KLUCZ = wczytajKlucz();
if (KLUCZ.length !== 32) throw new Error('Klucz szyfrowania musi mieć 32 bajty.');

export function szyfruj(tekst) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KLUCZ, iv);
  const enc = Buffer.concat([c.update(tekst, 'utf8'), c.final()]);
  return 'CS1|' + iv.toString('base64') + '|' + c.getAuthTag().toString('base64') + '|' + enc.toString('base64');
}
export function odszyfruj(zapis) {
  const [tag0, iv, tag, enc] = String(zapis).split('|');
  if (tag0 !== 'CS1') throw new Error('Nieznany format');
  const d = crypto.createDecipheriv('aes-256-gcm', KLUCZ, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

// ---------- baza ----------
export const db = new DatabaseSync(path.join(DANE, 'cisnienie.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 4000;
  CREATE TABLE IF NOT EXISTS konta (
    id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, imie TEXT NOT NULL DEFAULT '',
    haslo TEXT NOT NULL, utworzone INTEGER NOT NULL, ostatnio INTEGER NOT NULL, tz TEXT NOT NULL DEFAULT 'Europe/Warsaw');
  CREATE TABLE IF NOT EXISTS sesje (
    id INTEGER PRIMARY KEY, konto_id INTEGER NOT NULL REFERENCES konta(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, urzadzenie TEXT NOT NULL, utworzona INTEGER NOT NULL, ostatnio INTEGER NOT NULL, push TEXT);
  CREATE TABLE IF NOT EXISTS dane (
    konto_id INTEGER PRIMARY KEY REFERENCES konta(id) ON DELETE CASCADE, dane TEXT NOT NULL, zmienione INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wyslane (
    konto_id INTEGER NOT NULL REFERENCES konta(id) ON DELETE CASCADE, dzien TEXT NOT NULL, pora TEXT NOT NULL,
    PRIMARY KEY (konto_id, dzien, pora));
  CREATE TABLE IF NOT EXISTS ustawienia (klucz TEXT PRIMARY KEY, wartosc TEXT NOT NULL);
`);

const teraz = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function ust(k) { const r = db.prepare('SELECT wartosc FROM ustawienia WHERE klucz = ?').get(k); return r ? r.wartosc : null; }
function ustaw(k, v) { db.prepare('INSERT INTO ustawienia (klucz, wartosc) VALUES (?, ?) ON CONFLICT(klucz) DO UPDATE SET wartosc = excluded.wartosc').run(k, v); }

// ---------- hasła (scrypt) ----------
export function hashHasla(haslo) {
  const sol = crypto.randomBytes(16);
  const h = crypto.scryptSync(haslo, sol, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sol.toString('base64')}$${h.toString('base64')}`;
}
function sprawdzHaslo(haslo, zapis) {
  const [alg, s, h] = String(zapis).split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const oczek = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(haslo), Buffer.from(s, 'base64'), oczek.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(oczek, got);
}

// Kod zaproszenia: jeden, wspólny, ustawia go administrator (polecenie cisnienie-kod).
// Bez niego nikt obcy nie założy konta.
export function kodZaproszenia() { return ust('kod_zaproszenia'); }
export function ustawKod(k) { ustaw('kod_zaproszenia', String(k).trim()); }
const zgodnyKod = (a, b) => !!b && String(a || '').trim().toLowerCase() === String(b).trim().toLowerCase();

// ---------- ochrona przed zgadywaniem ----------
const proby = new Map();
function zablokowany(k, limit = 8) {
  const t = teraz();
  const l = (proby.get(k) || []).filter((x) => t - x < 15 * 60 * 1000);
  proby.set(k, l);
  return l.length >= limit;
}
function nieudana(k) { (proby.get(k) || proby.set(k, []).get(k)).push(teraz()); }

// ---------- Web Push (VAPID + aes128gcm, RFC 8291/8292) bez bibliotek ----------
if (!ust('vapid_priv')) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  ustaw('vapid_priv', privateKey.export({ format: 'pem', type: 'pkcs8' }));
  ustaw('vapid_pub', publicKey.export({ format: 'der', type: 'spki' }).subarray(-65).toString('base64url'));
}
const VAPID_PRIV = crypto.createPrivateKey(ust('vapid_priv'));
export const VAPID_PUB = ust('vapid_pub');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

export function szyfrujPush(dane, p256dh, auth) {
  const ua = Buffer.from(p256dh, 'base64url');
  const sekret = Buffer.from(auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const wspolny = ecdh.computeSecret(ua);
  const prkKey = hmac(sekret, wspolny);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const sol = crypto.randomBytes(16);
  const prk = hmac(sol, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const zaszyfr = Buffer.concat([c.update(Buffer.concat([Buffer.from(dane), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const naglowek = Buffer.alloc(21);
  sol.copy(naglowek, 0); naglowek.writeUInt32BE(4096, 16); naglowek[20] = 65;
  return Buffer.concat([naglowek, asPub, zaszyfr]);
}

function jwtVapid(aud) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tresc = b64({ typ: 'JWT', alg: 'ES256' }) + '.' + b64({ aud, exp: Math.floor(teraz() / 1000) + 12 * 3600, sub: 'mailto:cisnienie@users.noreply.github.com' });
  const sig = crypto.sign('sha256', Buffer.from(tresc), { key: VAPID_PRIV, dsaEncoding: 'ieee-p1363' });
  return tresc + '.' + sig.toString('base64url');
}

// wysyłka do jednej sesji (urządzenia); zwraca true, gdy przyjęte
export let wyslijPushDo = async function (sesjaRow, dane) {
  let sub; try { sub = JSON.parse(sesjaRow.push); } catch { return false; }
  try {
    const u = new URL(sub.endpoint);
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${jwtVapid(u.origin)}, k=${VAPID_PUB}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'normal' },
      body: szyfrujPush(JSON.stringify(dane), sub.keys.p256dh, sub.keys.auth),
      signal: AbortSignal.timeout(15000)
    });
    if (r.status === 404 || r.status === 410) { db.prepare('UPDATE sesje SET push = NULL WHERE id = ?').run(sesjaRow.id); return false; }
    return r.ok;
  } catch { return false; }
};
export function ustawWysylke(fn) { wyslijPushDo = fn; } // do testów

// ---------- dane użytkownika ----------
export function wczytajDane(kontoId) {
  const r = db.prepare('SELECT dane, zmienione FROM dane WHERE konto_id = ?').get(kontoId);
  if (!r) return { data: C.emptyData(), zmienione: 0 };
  return { data: C.parseSerialized(odszyfruj(r.dane)).data, zmienione: r.zmienione };
}
function zapiszDane(kontoId, data) {
  const t = teraz();
  db.prepare('INSERT INTO dane (konto_id, dane, zmienione) VALUES (?, ?, ?) ON CONFLICT(konto_id) DO UPDATE SET dane = excluded.dane, zmienione = excluded.zmienione')
    .run(kontoId, szyfruj(C.serialize(data)), t);
  return t;
}

// ---------- czas w strefie użytkownika ----------
export function czasLokalny(date, tz) {
  let f;
  try {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }
  const o = {};
  f.formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  return { dzien: `${o.year}-${o.month}-${o.day}`, minuty: Number(o.hour) * 60 + Number(o.minute) };
}

/** Treść przypomnienia zależna od pory. */
function trescPrzyp(t) {
  const m = C.parseTime(t);
  if (m >= 240 && m < 720) return 'Pora na poranny pomiar ciśnienia. Najlepiej przed lekami i śniadaniem.';
  if (m >= 1020) return 'Pora na wieczorny pomiar ciśnienia. Najlepiej przed kolacją.';
  return 'Pora na pomiar ciśnienia.';
}

/**
 * Które przypomnienia wysłać teraz temu użytkownikowi. wyslaneDzis: Set godzin „GG:MM” już wysłanych dziś.
 * Przypomnienie o godzinie T idzie od T do T+90 min (nadrabia np. restart serwera), jeśli od T−2 h nie było pomiaru.
 */
export function przypomnieniaDo(data, wyslaneDzis, now, tz) {
  const { dzien, minuty } = czasLokalny(now, tz);
  const cfg = C.getCfg(data);
  const dzis = C.listReadings(data, dzien, dzien);
  const out = [];
  (cfg.rp || []).forEach((t) => {
    const start = C.parseTime(t);
    if (start === null || minuty < start || minuty >= start + OKNO_PRZYP) return;
    if (wyslaneDzis.has(t)) return;
    if (dzis.some((r) => { const m = C.parseTime(r.h); return m >= start - PRZED && m <= minuty; })) return;
    const p = C.protocol(data, dzien);
    const pre = p && !p.done && !p.notStarted ? `Tydzień pomiarów: dzień ${p.dayNo} z ${C.PROTO_DAYS}. ` : '';
    out.push({ pora: t, dzien, tresc: { title: 'Ciśnienie', body: pre + trescPrzyp(t), url: './', tag: 'cisnienie-' + t.replace(':', '') } });
  });
  return out;
}

let przypTrwa = false;
export async function sprawdzPrzypomnienia(now = new Date()) {
  if (przypTrwa) return 0;
  przypTrwa = true;
  let wyslano = 0;
  try {
    const konta = db.prepare('SELECT DISTINCT k.id, k.tz FROM konta k JOIN sesje s ON s.konto_id = k.id WHERE s.push IS NOT NULL').all();
    for (const k of konta) {
      let data;
      try { data = wczytajDane(k.id).data; } catch { continue; }
      const { dzien } = czasLokalny(now, k.tz);
      const wys = new Set(db.prepare('SELECT pora FROM wyslane WHERE konto_id = ? AND dzien = ?').all(k.id, dzien).map((r) => r.pora));
      for (const p of przypomnieniaDo(data, wys, now, k.tz)) {
        const sesje = db.prepare('SELECT id, push FROM sesje WHERE konto_id = ? AND push IS NOT NULL').all(k.id);
        let ok = false;
        for (const s of sesje) { if (await wyslijPushDo(s, p.tresc)) { ok = true; wyslano++; } }
        if (ok) db.prepare('INSERT OR IGNORE INTO wyslane (konto_id, dzien, pora) VALUES (?, ?, ?)').run(k.id, p.dzien, p.pora);
      }
    }
    db.prepare('DELETE FROM wyslane WHERE dzien < ?').run(C.addDays(C.todayKey(now), -10));
  } finally { przypTrwa = false; }
  return wyslano;
}

// ---------- kopie bazy (codziennie, 30 dni) ----------
export function zrobKopie(now = new Date()) {
  const dir = path.join(DANE, 'kopie');
  const plik = path.join(dir, `cisnienie-${C.todayKey(now)}.db`);
  if (fs.existsSync(plik)) return null;
  db.exec(`VACUUM INTO '${plik.replace(/'/g, "''")}'`);
  const stare = fs.readdirSync(dir).filter((f) => /^cisnienie-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  while (stare.length > 30) fs.rmSync(path.join(dir, stare.shift()), { force: true });
  return plik;
}

// ---------- sprzątanie: sesje nieużywane rok ----------
function sprzataj() {
  db.prepare('DELETE FROM sesje WHERE ostatnio < ?').run(teraz() - 365 * 24 * 3600 * 1000);
}

// ---------- HTTP ----------
class Blad extends Error { constructor(kodHttp, msg, kod) { super(msg); this.kodHttp = kodHttp; this.kod = kod || ''; } }

function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function czytajJson(req) {
  return new Promise((ok, zle) => {
    let n = 0; const k = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { zle(new Blad(413, 'Za duże dane.')); req.destroy(); } else k.push(c); });
    req.on('end', () => {
      if (!n) return ok({});
      try { ok(JSON.parse(Buffer.concat(k).toString('utf8'))); } catch { zle(new Blad(400, 'Niepoprawne dane.')); }
    });
    req.on('error', zle);
  });
}

function odpowiedz(res, kodHttp, obj) {
  res.writeHead(kodHttp, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}

function ip(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }

function sesja(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) throw new Blad(401, 'Zaloguj się.', 'auth');
  const s = db.prepare('SELECT s.id AS sid, s.push, k.id, k.login, k.imie, k.tz FROM sesje s JOIN konta k ON k.id = s.konto_id WHERE s.token = ?').get(sha(t));
  if (!s) throw new Blad(401, 'Zaloguj się ponownie.', 'auth');
  const t0 = teraz();
  db.prepare('UPDATE sesje SET ostatnio = ? WHERE id = ?').run(t0, s.sid);
  db.prepare('UPDATE konta SET ostatnio = ? WHERE id = ?').run(t0, s.id);
  return s;
}

function nowaSesja(kontoId, urzadzenie) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = teraz();
  db.prepare('INSERT INTO sesje (konto_id, token, urzadzenie, utworzona, ostatnio) VALUES (?, ?, ?, ?, ?)').run(kontoId, sha(token), String(urzadzenie || 'urządzenie').slice(0, 40), t, t);
  return token;
}

const LOGIN_RE = /^[a-z0-9._-]{3,30}$/i;
function czystyTekst(s, max) { return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function poprawnaStrefa(tz) { if (typeof tz !== 'string' || !tz || tz.length > 60) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }

function konto(s) { return { login: s.login, imie: s.imie }; }

async function obsluz(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.replace(/\/+$/, '') || '/';

  if (p === '/zdrowie' && req.method === 'GET') {
    return odpowiedz(res, 200, { ok: true, wersja: WERSJA, kod: !!kodZaproszenia(), konta: db.prepare('SELECT COUNT(*) AS n FROM konta').get().n });
  }
  if (p === '/vapid' && req.method === 'GET') return odpowiedz(res, 200, { klucz: VAPID_PUB });

  if (p === '/rejestracja' && req.method === 'POST') {
    const b = await czytajJson(req);
    const kk = 'r:' + ip(req);
    if (zablokowany(kk)) throw new Blad(429, 'Za dużo prób. Spróbuj za 15 minut.');
    const login = String(b.login || '').trim();
    const haslo = String(b.haslo || '');
    const imie = czystyTekst(b.imie, 50);
    if (!kodZaproszenia()) throw new Blad(403, 'Rejestracja jest jeszcze wyłączona. Poproś administratora o kod zaproszenia.');
    if (!zgodnyKod(b.kod, kodZaproszenia())) { nieudana(kk); throw new Blad(403, 'Nieprawidłowy kod zaproszenia.'); }
    if (!LOGIN_RE.test(login)) throw new Blad(400, 'Login: od 3 do 30 znaków, tylko litery bez polskich znaków, cyfry, kropka, minus i podkreślnik.');
    if (haslo.length < 8) throw new Blad(400, 'Hasło musi mieć co najmniej 8 znaków.');
    if (db.prepare('SELECT 1 FROM konta WHERE login = ?').get(login)) throw new Blad(409, 'Ten login jest już zajęty. Wybierz inny.');
    const t = teraz();
    const tz = poprawnaStrefa(b.tz) ? b.tz : 'Europe/Warsaw';
    const id = Number(db.prepare('INSERT INTO konta (login, imie, haslo, utworzone, ostatnio, tz) VALUES (?, ?, ?, ?, ?, ?)').run(login, imie, hashHasla(haslo), t, t, tz).lastInsertRowid);
    return odpowiedz(res, 200, { token: nowaSesja(id, b.urzadzenie), konto: { login, imie } });
  }

  if (p === '/logowanie' && req.method === 'POST') {
    const b = await czytajJson(req);
    const login = String(b.login || '').trim();
    const kk = 'l:' + ip(req) + ':' + login.toLowerCase();
    if (zablokowany(kk) || zablokowany('i:' + ip(req), 30)) throw new Blad(429, 'Za dużo nieudanych prób. Spróbuj za 15 minut.');
    const k = db.prepare('SELECT * FROM konta WHERE login = ?').get(login);
    if (!k || !sprawdzHaslo(String(b.haslo || ''), k.haslo)) {
      nieudana(kk); nieudana('i:' + ip(req));
      throw new Blad(401, 'Zły login lub hasło.');
    }
    return odpowiedz(res, 200, { token: nowaSesja(k.id, b.urzadzenie), konto: { login: k.login, imie: k.imie } });
  }

  // od tego miejsca tylko zalogowani
  const s = sesja(req);

  if (p === '/konto' && req.method === 'GET') {
    const n = db.prepare('SELECT COUNT(*) AS n FROM sesje WHERE konto_id = ?').get(s.id).n;
    return odpowiedz(res, 200, { konto: konto(s), urzadzenia: n });
  }
  if (p === '/wyloguj' && req.method === 'POST') {
    db.prepare('DELETE FROM sesje WHERE id = ?').run(s.sid);
    return odpowiedz(res, 200, { ok: true });
  }
  if (p === '/haslo' && req.method === 'POST') {
    const b = await czytajJson(req);
    const k = db.prepare('SELECT haslo FROM konta WHERE id = ?').get(s.id);
    if (!sprawdzHaslo(String(b.stare || ''), k.haslo)) throw new Blad(403, 'Obecne hasło jest nieprawidłowe.');
    if (String(b.nowe || '').length < 8) throw new Blad(400, 'Nowe hasło musi mieć co najmniej 8 znaków.');
    db.prepare('UPDATE konta SET haslo = ? WHERE id = ?').run(hashHasla(String(b.nowe)), s.id);
    db.prepare('DELETE FROM sesje WHERE konto_id = ? AND id <> ?').run(s.id, s.sid); // inne urządzenia muszą zalogować się nowym hasłem
    return odpowiedz(res, 200, { ok: true });
  }
  if (p === '/konto' && req.method === 'DELETE') {
    const b = await czytajJson(req);
    const k = db.prepare('SELECT haslo FROM konta WHERE id = ?').get(s.id);
    if (!sprawdzHaslo(String(b.haslo || ''), k.haslo)) throw new Blad(403, 'Hasło jest nieprawidłowe.');
    db.prepare('DELETE FROM konta WHERE id = ?').run(s.id);
    return odpowiedz(res, 200, { ok: true });
  }

  if (p === '/dane' && req.method === 'GET') {
    const r = db.prepare('SELECT zmienione FROM dane WHERE konto_id = ?').get(s.id);
    const zm = r ? r.zmienione : 0;
    if (u.searchParams.get('znane') && Number(u.searchParams.get('znane')) === zm) return odpowiedz(res, 200, { zmiana: false, zmienione: zm });
    const w = wczytajDane(s.id);
    return odpowiedz(res, 200, { zmiana: true, zmienione: w.zmienione, dane: JSON.parse(C.serialize(w.data)) });
  }
  if (p === '/dane' && req.method === 'POST') {
    const b = await czytajJson(req);
    const przych = C.validate(b.dane || {});
    if (przych.foreign) throw new Blad(400, 'To nie są dane aplikacji Ciśnienie.');
    if (b.tz && poprawnaStrefa(b.tz) && b.tz !== s.tz) db.prepare('UPDATE konta SET tz = ? WHERE id = ?').run(b.tz, s.id);
    const w = wczytajDane(s.id);
    const scalone = C.merge(w.data, przych.data);
    let zm = w.zmienione;
    if (!w.zmienione || !C.sameData(scalone, w.data)) zm = zapiszDane(s.id, scalone);
    return odpowiedz(res, 200, { zmienione: zm, dane: JSON.parse(C.serialize(scalone)) });
  }

  if (p === '/push' && req.method === 'POST') {
    const b = await czytajJson(req);
    const sub = b.sub || {};
    if (typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
      throw new Blad(400, 'Niepoprawna subskrypcja powiadomień.');
    }
    db.prepare('UPDATE sesje SET push = ? WHERE id = ?').run(JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), s.sid);
    return odpowiedz(res, 200, { ok: true });
  }
  if (p === '/push' && req.method === 'DELETE') {
    db.prepare('UPDATE sesje SET push = NULL WHERE id = ?').run(s.sid);
    return odpowiedz(res, 200, { ok: true });
  }
  if (p === '/push/test' && req.method === 'POST') {
    const row = db.prepare('SELECT id, push FROM sesje WHERE id = ?').get(s.sid);
    if (!row.push) throw new Blad(400, 'Przypomnienia nie są włączone na tym urządzeniu.');
    const ok = await wyslijPushDo(row, { title: 'Ciśnienie', body: 'Próbne przypomnienie. Tak będą wyglądać przypomnienia o pomiarze.', url: './', tag: 'cisnienie-test' });
    if (!ok) throw new Blad(502, 'Nie udało się wysłać powiadomienia. Wyłącz i włącz przypomnienia jeszcze raz.');
    return odpowiedz(res, 200, { ok: true });
  }

  throw new Blad(404, 'Nie ma takiego adresu.');
}

export const serwer = http.createServer((req, res) => {
  obsluz(req, res).catch((e) => {
    if (e instanceof Blad) return odpowiedz(res, e.kodHttp, { blad: e.message, kod: e.kod });
    console.error(e);
    odpowiedz(res, 500, { blad: 'Błąd serwera. Spróbuj za chwilę.' });
  });
});

if (process.env.CISNIENIE_BEZ_STARTU !== '1') {
  serwer.listen(PORT, '127.0.0.1', () => console.log(`Ciśnienie ${WERSJA} nasłuchuje na 127.0.0.1:${PORT}`));
  const minuta = () => { sprawdzPrzypomnienia().catch((e) => console.error('przypomnienia', e)); };
  setTimeout(minuta, 5000);
  setInterval(minuta, 60 * 1000);
  const codziennie = () => { try { zrobKopie(); sprzataj(); } catch (e) { console.error('kopia', e); } };
  setTimeout(codziennie, 30 * 1000);
  setInterval(codziennie, 60 * 60 * 1000);
}
