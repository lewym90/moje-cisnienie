// Ciśnienie — polecenia administratora (uruchamiane przez cisnienie-kod i cisnienie-konta).
// Użycie: node admin.mjs kod [NOWY] | konta | usun LOGIN | reset LOGIN
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DANE = process.env.CISNIENIE_DANE || './dane';
const db = new DatabaseSync(path.join(DANE, 'cisnienie.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
const [, , cmd, arg] = process.argv;
const ust = (k) => { try { const r = db.prepare('SELECT wartosc FROM ustawienia WHERE klucz = ?').get(k); return r ? r.wartosc : null; } catch { return null; } };
const data = (t) => t ? new Date(t).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '—';

function hashHasla(haslo) {
  const sol = crypto.randomBytes(16);
  const h = crypto.scryptSync(haslo, sol, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sol.toString('base64')}$${h.toString('base64')}`;
}

if (cmd === 'kod') {
  if (arg) {
    const k = String(arg).trim();
    if (k.length < 4) { console.error('Kod musi mieć co najmniej 4 znaki.'); process.exit(1); }
    db.prepare("INSERT INTO ustawienia (klucz, wartosc) VALUES ('kod_zaproszenia', ?) ON CONFLICT(klucz) DO UPDATE SET wartosc = excluded.wartosc").run(k);
    console.log(`Kod zaproszenia ustawiony: ${k}`);
  } else {
    console.log(ust('kod_zaproszenia') ? `Obecny kod zaproszenia: ${ust('kod_zaproszenia')}` : 'Kod zaproszenia nie jest jeszcze ustawiony.');
  }
} else if (cmd === 'konta') {
  const l = db.prepare('SELECT k.login, k.imie, k.utworzone, k.ostatnio, (SELECT COUNT(*) FROM sesje s WHERE s.konto_id = k.id) AS urz, (SELECT COUNT(*) FROM sesje s WHERE s.konto_id = k.id AND s.push IS NOT NULL) AS push FROM konta k ORDER BY k.utworzone').all();
  if (!l.length) console.log('Nie ma jeszcze żadnych kont.');
  for (const k of l) console.log(`${k.login.padEnd(20)} ${String(k.imie || '').padEnd(22)} urządzenia: ${k.urz}, przypomnienia: ${k.push}, założone: ${data(k.utworzone)}, ostatnio: ${data(k.ostatnio)}`);
} else if (cmd === 'usun' && arg) {
  const r = db.prepare('DELETE FROM konta WHERE login = ?').run(arg);
  console.log(r.changes ? `Usunięto konto ${arg} razem z pomiarami.` : `Nie ma konta ${arg}.`);
} else if (cmd === 'reset' && arg) {
  const k = db.prepare('SELECT id FROM konta WHERE login = ?').get(arg);
  if (!k) { console.log(`Nie ma konta ${arg}.`); process.exit(1); }
  const AL = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(10);
  let h = ''; for (let i = 0; i < 10; i++) h += AL[b[i] % AL.length];
  db.prepare('UPDATE konta SET haslo = ? WHERE id = ?').run(hashHasla(h), k.id);
  db.prepare('DELETE FROM sesje WHERE konto_id = ?').run(k.id);
  console.log(`Nowe hasło dla ${arg}: ${h}`);
  console.log('Przekaż je tej osobie. Po zalogowaniu może je zmienić w Profilu. Pomiary zostały nienaruszone.');
} else {
  console.log('Użycie: cisnienie-kod [NOWY_KOD] | cisnienie-konta | cisnienie-konta usun LOGIN | cisnienie-konta reset LOGIN');
}
