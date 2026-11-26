/*
 * Ciśnienie – rdzeń logiki (bez DOM-u, działa w przeglądarce i w Node.js).
 *
 * Zasady:
 *  1. Każdy pomiar ma własny identyfikator i znacznik czasu ostatniej zmiany `t`.
 *     Przy scalaniu danych z kilku urządzeń wygrywa nowsza wersja (scalanie jest przemienne i idempotentne).
 *  2. Usunięcie pomiaru zostawia „znacznik usunięcia”, więc drugie urządzenie nie przywróci go przy synchronizacji.
 *  3. Średnie i statystyki są zawsze wyliczane z pomiarów, nigdy zapisywane.
 *  4. Kategorie ciśnienia według wytycznych PTNT/PTK 2024 i ESC 2024 (decyduje wyższa z kategorii skurczowego i rozkurczowego).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SCCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP_ID = 'cisnienie';
  var MIN_YEAR = 2000;
  var MAX_YEAR = 2100;

  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
    'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  var WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var WEEKDAYS_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

  /* ---------- Daty ---------- */

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  function daysInMonth(y, m) {
    return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < (len || 2)) s = '0' + s;
    return s;
  }

  /** m: 0–11, d: 1–31 → "RRRR-MM-DD" */
  function dateKey(y, m, d) { return pad(y, 4) + '-' + pad(m + 1) + '-' + pad(d); }

  /** "RRRR-MM-DD" → {y, m (0–11), d} albo null */
  function parseKey(key) {
    var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!r) return null;
    var y = +r[1], m = +r[2] - 1, d = +r[3];
    if (y < MIN_YEAR || y > MAX_YEAR || m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null;
    return { y: y, m: m, d: d };
  }

  /** 0 = niedziela … 6 = sobota (liczone w UTC, odporne na zmianę czasu) */
  function weekday(y, m, d) { return new Date(Date.UTC(y, m, d)).getUTCDay(); }

  function weekdayOfKey(key) {
    var p = parseKey(key);
    return p ? weekday(p.y, p.m, p.d) : -1;
  }

  function toDate(now) {
    return now instanceof Date ? now : (now != null ? new Date(now) : new Date());
  }

  /** Dzisiejsza data w lokalnej strefie czasowej urządzenia. */
  function todayKey(now) {
    var d = toDate(now);
    return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Bieżąca godzina „GG:MM”. */
  function nowTime(now) {
    var d = toDate(now);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function addDays(key, delta) {
    var p = parseKey(key);
    if (!p) return key;
    var t = new Date(Date.UTC(p.y, p.m, p.d + delta));
    return dateKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }

  /** Liczba dni od a do b (b − a). */
  function daysBetween(a, b) {
    var pa = parseKey(a), pb = parseKey(b);
    if (!pa || !pb) return 0;
    return Math.round((Date.UTC(pb.y, pb.m, pb.d) - Date.UTC(pa.y, pa.m, pa.d)) / 86400000);
  }

  function longDate(key) {
    var p = parseKey(key);
    if (!p) return '';
    return WEEKDAYS[weekday(p.y, p.m, p.d)] + ', ' + p.d + ' ' + MONTHS_GEN[p.m] + ' ' + p.y;
  }

  /** „25 lis” */
  function shortDate(key) {
    var p = parseKey(key);
    return p ? p.d + ' ' + MONTHS_SHORT[p.m] : '';
  }

  /** „25.11.2026” */
  function plDate(key) {
    var p = parseKey(key);
    return p ? pad(p.d) + '.' + pad(p.m + 1) + '.' + p.y : '';
  }

  /** „GG:MM” → minuty od północy albo null */
  function parseTime(s) {
    var r = /^(\d{2}):(\d{2})$/.exec(s);
    if (!r) return null;
    var h = +r[1], m = +r[2];
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  /** Polska odmiana: plural(2,'pomiar','pomiary','pomiarów') */
  function plural(n, one, few, many) {
    n = Math.abs(n);
    if (n === 1) return one;
    var last = n % 10, last2 = n % 100;
    if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return few;
    return many;
  }

  /** Pora dnia pomiaru: rano 4:00–11:59, dzień 12:00–16:59, wieczór 17:00–23:59, noc 0:00–3:59. */
  function dayPart(h) {
    var m = parseTime(h);
    if (m === null) return 'dzien';
    if (m >= 240 && m < 720) return 'rano';
    if (m >= 720 && m < 1020) return 'dzien';
    if (m >= 1020) return 'wieczor';
    return 'noc';
  }

  var PART_LABEL = { rano: 'Rano', dzien: 'W ciągu dnia', wieczor: 'Wieczorem', noc: 'W nocy' };

  /* ---------- Wartości i kategorie ---------- */

  var LIMITS = {
    s: { min: 50, max: 300, label: 'Ciśnienie skurczowe (górne)', unit: 'mmHg' },
    di: { min: 30, max: 200, label: 'Ciśnienie rozkurczowe (dolne)', unit: 'mmHg' },
    p: { min: 30, max: 250, label: 'Tętno', unit: 'uderzeń na minutę' }
  };

  function inRange(v, f) { return Number.isInteger(v) && v >= LIMITS[f].min && v <= LIMITS[f].max; }

  /**
   * Sprawdza wpisane wartości. p = 0 lub null oznacza brak tętna.
   * Zwraca { ok:true } albo { ok:false, field, error }.
   */
  function checkValues(s, di, p) {
    if (s == null || s === '') return { ok: false, field: 's', error: 'Wpisz ciśnienie skurczowe (górne).' };
    if (!inRange(s, 's')) return { ok: false, field: 's', error: 'Ciśnienie skurczowe musi być w zakresie ' + LIMITS.s.min + '–' + LIMITS.s.max + ' mmHg.' };
    if (di == null || di === '') return { ok: false, field: 'di', error: 'Wpisz ciśnienie rozkurczowe (dolne).' };
    if (!inRange(di, 'di')) return { ok: false, field: 'di', error: 'Ciśnienie rozkurczowe musi być w zakresie ' + LIMITS.di.min + '–' + LIMITS.di.max + ' mmHg.' };
    if (s <= di) return { ok: false, field: 'di', error: 'Ciśnienie skurczowe (górne) musi być wyższe niż rozkurczowe (dolne).' };
    if (p != null && p !== 0 && p !== '' && !inRange(p, 'p')) return { ok: false, field: 'p', error: 'Tętno musi być w zakresie ' + LIMITS.p.min + '–' + LIMITS.p.max + ' uderzeń na minutę.' };
    return { ok: true };
  }

  /** Wartości możliwe, ale nietypowe – warto upewnić się, że to nie literówka. */
  function unusualValues(s, di, p) {
    return s >= 230 || s < 75 || di >= 140 || di < 40 || (s - di) < 15 || (!!p && (p < 40 || p > 180));
  }

  // Klasyfikacja PTNT/PTK 2024 (zgodna z ESC 2024): optymalne < 120/70, podwyższone 120–139/70–89, nadciśnienie ≥ 140/90.
  // „Niskie” (< 90/60) to dodatkowa, praktyczna kategoria aplikacji – wytyczne jej nie definiują.
  var CATS = [
    { id: 'low', label: 'Niskie', long: 'Niskie ciśnienie', range: 'poniżej 90/60' },
    { id: 'opt', label: 'Optymalne', long: 'Optymalne ciśnienie', range: 'poniżej 120/70' },
    { id: 'elev', label: 'Podwyższone', long: 'Podwyższone ciśnienie', range: '120–139 / 70–89' },
    { id: 'ht', label: 'Nadciśnienie', long: 'Nadciśnienie', range: '140/90 i więcej' }
  ];
  var GUIDE = 'PTNT/PTK 2024';

  function catLevel(s, di) {
    if (s >= 140 || di >= 90) return 3;
    if (s >= 120 || di >= 70) return 2;
    if (s < 90 || di < 60) return 0;
    return 1;
  }

  /** Kategoria pomiaru (PTNT/PTK 2024): { id, label, long, range, level 0–3 }. */
  function classify(s, di) {
    var l = catLevel(s, di);
    var c = CATS[l];
    return { id: c.id, label: c.label, long: c.long, range: c.range, level: l };
  }

  /** Bardzo wysokie ciśnienie (≥180 lub ≥110) – aplikacja pokazuje wtedy wskazówki. */
  function isCrisis(s, di) { return s >= 180 || di >= 110; }

  /* ---------- Okoliczności pomiaru ---------- */

  var TAGS = [
    { id: 'przed', label: 'Przed lekami' },
    { id: 'po', label: 'Po lekach' },
    { id: 'arytmia', label: 'Nieregularne bicie' },
    { id: 'wysilek', label: 'Po wysiłku' },
    { id: 'stres', label: 'Stres' },
    { id: 'kawa', label: 'Po kawie' },
    { id: 'glowa', label: 'Ból głowy' },
    { id: 'zle', label: 'Złe samopoczucie' },
    { id: 'gabinet', label: 'U lekarza' }
  ];
  var TAG_IDS = TAGS.map(function (t) { return t.id; });

  function tagLabel(id) {
    for (var i = 0; i < TAGS.length; i++) if (TAGS[i].id === id) return TAGS[i].label;
    return id;
  }

  function cleanTags(g) {
    if (!Array.isArray(g)) return [];
    var out = [];
    TAG_IDS.forEach(function (id) { if (g.indexOf(id) >= 0) out.push(id); });
    return out;
  }

  var NOTE_MAX = 80;

  function normalizeNote(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim();
  }

  var NAME_MAX = 50;
  function normalizeName(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  }

  /* ---------- Dane ----------
   * data = { v: 1, r: { "<id>": rekord }, cfg?: ustawienia wspólne }
   * Rekord pomiaru: { d: "RRRR-MM-DD", h: "GG:MM", s, di, p (0 = brak), a?: "L"|"P", g?: [okoliczności], n?: notatka, t }
   * Znacznik usunięcia: { x: 1, t }
   * cfg = { ts, td: cel (poniżej), rp: godziny przypomnień ["GG:MM", …] (pusta lista = wyłączone),
   *         nm: imię i nazwisko do raportu, ps: początek tygodnia pomiarów ("" = brak), t }
   */

  var ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

  var CFG_DEFAULT = { ts: 135, td: 85, rp: ['08:00', '20:00'], nm: '', ps: '', t: 0 };
  var MAX_RP = 6;

  /** Lista godzin przypomnień: poprawne „GG:MM”, bez powtórzeń, posortowana, najwyżej 6. */
  function cleanTimes(a) {
    if (!Array.isArray(a)) return null;
    var out = [];
    a.forEach(function (t) { if (typeof t === 'string' && parseTime(t) !== null && out.indexOf(t) < 0) out.push(t); });
    out.sort();
    return out.slice(0, MAX_RP);
  }

  function emptyData() { return { v: 1, r: {} }; }

  function pack(r, cfg) {
    var o = { v: 1, r: r };
    if (cfg) o.cfg = cfg;
    return o;
  }

  function getCfg(data) {
    var c = data && data.cfg;
    var o = {};
    Object.keys(CFG_DEFAULT).forEach(function (k) { o[k] = c && c[k] !== undefined ? c[k] : CFG_DEFAULT[k]; });
    o.rp = (o.rp || []).slice();
    return o;
  }

  function cleanCfg(c) {
    if (!c || typeof c !== 'object') return null;
    var o = {};
    o.ts = Number.isInteger(c.ts) && c.ts >= 90 && c.ts <= 200 ? c.ts : CFG_DEFAULT.ts;
    o.td = Number.isInteger(c.td) && c.td >= 50 && c.td <= 130 ? c.td : CFG_DEFAULT.td;
    if (o.td >= o.ts) { o.ts = CFG_DEFAULT.ts; o.td = CFG_DEFAULT.td; }
    var rp = cleanTimes(c.rp);
    if (!rp) {
      // dane z wersji 1.0–1.2: godzina rano (rm) i wieczorem (re), −1 = wyłączone
      rp = [];
      [c.rm, c.re].forEach(function (h) { if (Number.isInteger(h) && h >= 0 && h <= 23) rp.push(pad(h) + ':00'); });
      if (c.rm === undefined && c.re === undefined) rp = CFG_DEFAULT.rp.slice();
      rp = cleanTimes(rp);
    }
    o.rp = rp;
    o.nm = normalizeName(c.nm);
    o.ps = typeof c.ps === 'string' && parseKey(c.ps) ? c.ps : '';
    o.t = Number.isFinite(c.t) && c.t >= 0 ? Math.floor(c.t) : 0;
    return o;
  }

  /** Nowe dane ze zmienionymi ustawieniami wspólnymi (patch: część pól cfg). */
  function setCfg(data, patch, now) {
    var cur = getCfg(data);
    Object.keys(patch).forEach(function (k) { if (k !== 't') cur[k] = patch[k]; });
    cur.t = now;
    var cfg = cleanCfg(cur);
    if (data.cfg && cfg.t <= data.cfg.t) cfg.t = data.cfg.t + 1;
    return pack(data.r, cfg);
  }

  function cfgString(c) {
    return [c.ts, c.td, (c.rp || []).join(','), c.nm, c.ps, c.t].join('|');
  }

  function recString(r) {
    if (r.x) return 'x|' + r.t;
    return [r.d, r.h, r.s, r.di, r.p, r.a || '', (r.g || []).join(','), r.n || '', r.t].join('|');
  }

  /** Sprawdza jeden rekord pomiaru z zewnątrz. Zwraca poprawiony rekord albo null. */
  function cleanRec(r) {
    if (!r || typeof r !== 'object') return null;
    var t = Number.isFinite(r.t) && r.t >= 0 ? Math.floor(r.t) : 0;
    if (r.x) return { x: 1, t: t };
    if (!parseKey(r.d) || parseTime(r.h) === null) return null;
    if (!checkValues(r.s, r.di, r.p || 0).ok) return null;
    var o = { d: r.d, h: r.h, s: r.s, di: r.di, p: r.p || 0, t: t };
    if (r.a === 'L' || r.a === 'P') o.a = r.a;
    var g = cleanTags(r.g);
    if (g.length) o.g = g;
    var n = normalizeNote(r.n);
    if (n) o.n = n;
    return o;
  }

  /** Sprawdza dane z zewnątrz (plik, GitHub, pamięć). Nigdy nie rzuca wyjątku. Zwraca { data, dropped }. */
  function validate(raw) {
    var out = emptyData();
    var dropped = 0;
    if (!raw || typeof raw !== 'object' || (raw.app && raw.app !== APP_ID)) {
      return { data: out, dropped: raw ? 1 : 0, foreign: !!(raw && raw.app && raw.app !== APP_ID) };
    }
    if (raw.r && typeof raw.r === 'object') {
      Object.keys(raw.r).forEach(function (id) {
        if (!ID_RE.test(id)) { dropped++; return; }
        var c = cleanRec(raw.r[id]);
        if (!c) { dropped++; return; }
        out.r[id] = c;
      });
    }
    if (raw.cfg) {
      var cc = cleanCfg(raw.cfg);
      if (cc) out.cfg = cc; else dropped++;
    }
    return { data: out, dropped: dropped };
  }

  function sortKey(id, r) {
    return r.x ? '~' + id : r.d + ' ' + r.h + ' ' + id;
  }

  /** Stały, czytelny zapis JSON (posortowane pomiary, jeden wiersz na pomiar – czytelna historia zmian w git). */
  function serialize(data) {
    var ids = Object.keys(data.r).sort(function (a, b) {
      var ka = sortKey(a, data.r[a]), kb = sortKey(b, data.r[b]);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    var lines = ids.map(function (id) {
      var r = data.r[id];
      if (r.x) return '    "' + id + '": {"x": 1, "t": ' + r.t + '}';
      return '    "' + id + '": {"d": "' + r.d + '", "h": "' + r.h + '", "s": ' + r.s + ', "di": ' + r.di + ', "p": ' + r.p +
        (r.a ? ', "a": "' + r.a + '"' : '') +
        (r.g && r.g.length ? ', "g": ' + JSON.stringify(r.g) : '') +
        (r.n ? ', "n": ' + JSON.stringify(r.n) : '') + ', "t": ' + r.t + '}';
    });
    var cfgBlock = '';
    if (data.cfg) {
      var c = data.cfg;
      cfgBlock = ',\n  "cfg": {"ts": ' + c.ts + ', "td": ' + c.td + ', "rp": ' + JSON.stringify(c.rp || []) +
        ', "nm": ' + JSON.stringify(c.nm) + ', "ps": ' + JSON.stringify(c.ps) + ', "t": ' + c.t + '}';
    }
    return '{\n  "app": "' + APP_ID + '",\n  "v": 1,\n  "r": {\n' + lines.join(',\n') + (lines.length ? '\n' : '') + '  }' + cfgBlock + '\n}\n';
  }

  function parseSerialized(text) {
    try {
      return validate(JSON.parse(text));
    } catch (e) {
      return { data: emptyData(), dropped: 1, error: true };
    }
  }

  function sameData(a, b) { return serialize(a) === serialize(b); }

  /** Scala dwa zbiory danych. Dla każdego pomiaru wygrywa nowsza wersja. */
  function merge(a, b) {
    var r = {};
    var ids = {};
    Object.keys(a.r).forEach(function (k) { ids[k] = 1; });
    Object.keys(b.r).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (k) {
      var x = a.r[k], y = b.r[k];
      if (!x) r[k] = y;
      else if (!y) r[k] = x;
      else if (x.t !== y.t) r[k] = x.t > y.t ? x : y;
      else r[k] = recString(x) >= recString(y) ? x : y;
    });
    var cfg = a.cfg || b.cfg;
    if (a.cfg && b.cfg) {
      cfg = a.cfg.t !== b.cfg.t ? (a.cfg.t > b.cfg.t ? a.cfg : b.cfg) : (cfgString(a.cfg) >= cfgString(b.cfg) ? a.cfg : b.cfg);
    }
    return pack(r, cfg);
  }

  /** Nowy identyfikator pomiaru. */
  function newId(now, rand) {
    var r = rand != null ? rand : Math.random();
    return Math.floor(now).toString(36) + Math.floor(r * 1679616).toString(36);
  }

  /** Aktywny pomiar albo null. */
  function getReading(data, id) {
    var r = data.r[id];
    return r && !r.x ? r : null;
  }

  /**
   * Nowe dane z zapisanym pomiarem. rec = null usuwa pomiar (zostawia znacznik usunięcia).
   * Rzuca wyjątek przy niepoprawnych danych (interfejs sprawdza je wcześniej).
   */
  function setReading(data, id, rec, now) {
    if (!ID_RE.test(id)) throw new Error('Niepoprawny identyfikator');
    var out;
    if (rec === null) {
      out = { x: 1, t: now };
    } else {
      out = cleanRec({ d: rec.d, h: rec.h, s: rec.s, di: rec.di, p: rec.p || 0, a: rec.a, g: rec.g, n: rec.n, t: now });
      if (!out || out.x) throw new Error('Niepoprawny pomiar');
    }
    var prev = data.r[id];
    if (prev && out.t <= prev.t) out.t = prev.t + 1;
    var r = {};
    Object.keys(data.r).forEach(function (k) { r[k] = data.r[k]; });
    r[id] = out;
    return pack(r, data.cfg);
  }

  /** Lista aktywnych pomiarów (od–do włącznie, daty opcjonalne), posortowana od najstarszego. Każdy ma pole id. */
  function listReadings(data, from, to) {
    var out = [];
    Object.keys(data.r).forEach(function (id) {
      var r = data.r[id];
      if (r.x) return;
      if (from && r.d < from) return;
      if (to && r.d > to) return;
      out.push({ id: id, d: r.d, h: r.h, s: r.s, di: r.di, p: r.p, a: r.a || '', g: r.g || [], n: r.n || '', t: r.t });
    });
    out.sort(function (x, y) {
      var kx = x.d + ' ' + x.h + ' ' + x.id, ky = y.d + ' ' + y.h + ' ' + y.id;
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    return out;
  }

  function countReadings(data) {
    var n = 0;
    Object.keys(data.r).forEach(function (k) { if (!data.r[k].x) n++; });
    return n;
  }

  function lastReading(data) {
    var l = listReadings(data);
    return l.length ? l[l.length - 1] : null;
  }

  /** Najwcześniejsza data pomiaru albo null. */
  function firstDate(data) {
    var first = null;
    Object.keys(data.r).forEach(function (k) {
      var r = data.r[k];
      if (!r.x && (first === null || r.d < first)) first = r.d;
    });
    return first;
  }

  /* ---------- Statystyki ---------- */

  function avgInt(sum, n) { return n ? Math.round(sum / n) : 0; }

  /**
   * Statystyki listy pomiarów. target: { ts, td } – „w celu” oznacza oba poniżej celu.
   * Zwraca { n, s, di, p, pn, minS, maxS, minDi, maxDi, minP, maxP, inTarget, inTargetPct, cats: {id: n}, crisis, arrhythmia }.
   */
  function stats(list, target) {
    var ts = target && target.ts ? target.ts : CFG_DEFAULT.ts;
    var td = target && target.td ? target.td : CFG_DEFAULT.td;
    var o = { n: list.length, s: 0, di: 0, p: 0, pn: 0, minS: 0, maxS: 0, minDi: 0, maxDi: 0, minP: 0, maxP: 0, inTarget: 0, inTargetPct: 0, cats: {}, crisis: 0, arrhythmia: 0 };
    CATS.forEach(function (c) { o.cats[c.id] = 0; });
    if (!list.length) return o;
    var ss = 0, sd = 0, sp = 0;
    o.minS = Infinity; o.minDi = Infinity; o.minP = Infinity;
    list.forEach(function (r) {
      ss += r.s; sd += r.di;
      if (r.s < o.minS) o.minS = r.s;
      if (r.s > o.maxS) o.maxS = r.s;
      if (r.di < o.minDi) o.minDi = r.di;
      if (r.di > o.maxDi) o.maxDi = r.di;
      if (r.p) {
        sp += r.p; o.pn++;
        if (r.p < o.minP) o.minP = r.p;
        if (r.p > o.maxP) o.maxP = r.p;
      }
      if (r.s < ts && r.di < td) o.inTarget++;
      o.cats[classify(r.s, r.di).id]++;
      if (isCrisis(r.s, r.di)) o.crisis++;
      if (r.g && r.g.indexOf('arytmia') >= 0) o.arrhythmia++;
    });
    o.s = avgInt(ss, list.length);
    o.di = avgInt(sd, list.length);
    o.p = avgInt(sp, o.pn);
    if (!o.pn) { o.minP = 0; }
    o.inTargetPct = Math.round(o.inTarget * 100 / list.length);
    return o;
  }

  function filterPart(list, part) {
    return list.filter(function (r) { return dayPart(r.h) === part; });
  }

  /* ---------- Okresy i grupowanie do wykresów ---------- */

  var PERIODS = [
    { id: 'd7', label: 'Tydzień', days: 7 },
    { id: 'd30', label: 'Miesiąc', days: 30 },
    { id: 'd90', label: '3 miesiące', days: 90 },
    { id: 'y1', label: 'Rok', days: 365 }
  ];

  /** Zakres dat okresu: { from, to } (from = null dla „Wszystko”). */
  function periodRange(id, today, data) {
    var p = null;
    for (var i = 0; i < PERIODS.length; i++) if (PERIODS[i].id === id) p = PERIODS[i];
    if (!p) p = PERIODS[1];
    if (!p.days) return { from: data ? firstDate(data) : null, to: today };
    return { from: addDays(today, -(p.days - 1)), to: today };
  }

  /** Poniedziałek tygodnia, w którym jest dana data. */
  function weekStart(key) {
    var wd = weekdayOfKey(key);
    return addDays(key, -((wd + 6) % 7));
  }

  /**
   * Grupuje pomiary do wykresu, tak żeby słupków było niewiele i były czytelne.
   * Zwraca { unit: 'day'|'week'|'month', points: [{ key, label, s, di, p, n, from, to }] }.
   */
  function chartPoints(list, from, to) {
    var unit;
    var span = from && to ? daysBetween(from, to) + 1 : 0;
    if (span <= 46) unit = 'day';
    else if (span <= 400) unit = 'week';
    else unit = 'month';
    var groups = {}, order = [];
    list.forEach(function (r) {
      var k = unit === 'day' ? r.d : unit === 'week' ? weekStart(r.d) : r.d.slice(0, 7);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });
    order.sort();
    return {
      unit: unit, points: order.map(function (k) {
        var g = groups[k];
        var st = stats(g);
        var label;
        if (unit === 'day') label = span <= 8 ? WEEKDAYS_SHORT[weekdayOfKey(k)] : shortDate(k);
        else if (unit === 'week') label = shortDate(k);
        else { var pk = parseKey(k + '-01'); label = MONTHS_SHORT[pk.m] + ' ' + String(pk.y).slice(2); }
        var lastDay = unit === 'day' ? k : unit === 'week' ? addDays(k, 6) : k + '-' + pad(daysInMonth(+k.slice(0, 4), +k.slice(5, 7) - 1));
        return { key: k, label: label, s: st.s, di: st.di, p: st.p, n: g.length, from: unit === 'month' ? k + '-01' : k, to: lastDay };
      })
    };
  }

  /* ---------- Tydzień pomiarów przed wizytą (zalecenia PTNT/PTK, ESH) ---------- */

  var PROTO_DAYS = 7;

  /**
   * Stan tygodnia pomiarów. Zalecenie: przez 7 dni rano i wieczorem po 2 pomiary.
   * Wynik to średnia z dni 2–7 (pierwszy dzień się pomija). Zwraca null, gdy tydzień nie jest rozpoczęty.
   */
  function protocol(data, today, target) {
    var cfg = getCfg(data);
    if (!cfg.ps) return null;
    var start = cfg.ps;
    var end = addDays(start, PROTO_DAYS - 1);
    var dayNo = daysBetween(start, today) + 1;
    var days = [];
    for (var i = 0; i < PROTO_DAYS; i++) {
      var k = addDays(start, i);
      var l = listReadings(data, k, k);
      days.push({ key: k, no: i + 1, rano: filterPart(l, 'rano').length, wieczor: filterPart(l, 'wieczor').length, all: l.length });
    }
    var used = listReadings(data, addDays(start, 1), end);
    var st = stats(used, target || { ts: cfg.ts, td: cfg.td });
    var done = today > end;
    return {
      start: start, end: end, dayNo: Math.max(1, Math.min(dayNo, PROTO_DAYS)), rawDayNo: dayNo,
      days: days, done: done, notStarted: dayNo < 1,
      result: st, enough: st.n >= 12,
      above: st.n ? (st.s >= 135 || st.di >= 85) : false
    };
  }

  /* ---------- Wnioski słowne ---------- */

  /**
   * Krótkie wnioski z pomiarów w okresie. Opisują dane, nie stawiają diagnozy.
   * Zwraca listę { kind: 'ok'|'warn'|'info', text }.
   */
  function insights(list, target, from, to) {
    var out = [];
    if (!list.length) return out;
    var st = stats(list, target);
    var tgt = target.ts + '/' + target.td;
    if (st.n >= 3) {
      if (st.s < target.ts && st.di < target.td) {
        out.push({ kind: 'ok', text: 'Średnia z ' + st.n + ' ' + plural(st.n, 'pomiaru', 'pomiarów', 'pomiarów') + ' to ' + st.s + '/' + st.di + ' mmHg, czyli poniżej Twojego celu (' + tgt + ').' });
      } else {
        out.push({ kind: 'warn', text: 'Średnia z ' + st.n + ' pomiarów to ' + st.s + '/' + st.di + ' mmHg, czyli nie mieści się w Twoim celu (poniżej ' + tgt + ').' });
      }
      out.push({ kind: st.inTargetPct >= 70 ? 'ok' : 'info', text: st.inTargetPct + '% pomiarów mieści się w celu (' + st.inTarget + ' z ' + st.n + ').' });
    }
    if (from && to && daysBetween(from, to) >= 13) {
      var mid = addDays(from, Math.floor((daysBetween(from, to) + 1) / 2));
      var a = stats(list.filter(function (r) { return r.d < mid; }));
      var b = stats(list.filter(function (r) { return r.d >= mid; }));
      if (a.n >= 3 && b.n >= 3) {
        var d = b.s - a.s;
        if (d <= -5) out.push({ kind: 'ok', text: 'W drugiej połowie okresu ciśnienie skurczowe spadło średnio o ' + (-d) + ' mmHg (z ' + a.s + ' do ' + b.s + ').' });
        else if (d >= 5) out.push({ kind: 'warn', text: 'W drugiej połowie okresu ciśnienie skurczowe wzrosło średnio o ' + d + ' mmHg (z ' + a.s + ' do ' + b.s + ').' });
        else out.push({ kind: 'ok', text: 'Ciśnienie jest stabilne: średnie w obu połowach okresu różnią się o mniej niż 5 mmHg.' });
      }
    }
    if (st.pn >= 3) {
      out.push({ kind: 'info', text: 'Średnie tętno: ' + st.p + ' uderzeń na minutę (od ' + st.minP + ' do ' + st.maxP + ').' });
    }
    if (from && to) {
      var daysIn = daysBetween(from, to) + 1;
      var measured = {};
      list.forEach(function (r) { measured[r.d] = 1; });
      var md = Object.keys(measured).length;
      if (daysIn >= 7) {
        out.push({ kind: md * 2 >= daysIn ? 'ok' : 'info', text: 'Pomiary w ' + md + ' z ' + daysIn + ' ' + plural(daysIn, 'dnia', 'dni', 'dni') + ' tego okresu.' });
      }
    }
    return out;
  }

  /**
   * Główny wniosek do karty na ekranie Statystyki: { kind: 'ok'|'warn', title, text }.
   */
  function headline(list, target, from, to, phrase) {
    if (!list.length) return null;
    var st = stats(list, target);
    var inT = st.s < target.ts && st.di < target.td;
    var title = inT ? 'Wartości w normie' : 'Wartości powyżej celu';
    if (from && to && daysBetween(from, to) >= 5) {
      var mid = addDays(from, Math.floor((daysBetween(from, to) + 1) / 2));
      var a = stats(list.filter(function (r) { return r.d < mid; }));
      var b = stats(list.filter(function (r) { return r.d >= mid; }));
      if (a.n >= 2 && b.n >= 2) {
        var d = b.s - a.s;
        title = d <= -5 ? 'Ciśnienie spada' : d >= 5 ? 'Ciśnienie rośnie' : 'Stabilne wartości';
      }
    }
    var text = 'Twoje ciśnienie' + (phrase ? ' ' + phrase : '') + (inT ? ' jest w normie' : ' jest powyżej celu') +
      ' (średnio ' + st.s + '/' + st.di + ' mmHg, cel: poniżej ' + target.ts + '/' + target.td + ').';
    return { kind: inT ? 'ok' : 'warn', title: title, text: text };
  }

  /* ---------- Analiza serii pomiarów (wskazówki, nie diagnoza) ---------- */

  var HOME_S = 135, HOME_D = 85; // granica nadciśnienia dla średniej z pomiarów domowych (PTNT/PTK, ESH, ESC)
  var OFFICE_S = 140, OFFICE_D = 90; // granica dla pomiarów w gabinecie
  var MIN_N = 12, MIN_DAYS = 4; // tydzień pomiarów: co najmniej 12 pomiarów; tu dodatkowo z co najmniej 4 dni

  function isOffice(r) { return (r.g || []).indexOf('gabinet') >= 0; }
  function above(st, s, d) { return st.s >= s || st.di >= d; }
  function bpTxt(st) { return st.s + '/' + st.di + ' mmHg'; }

  /**
   * Analiza serii pomiarów według progów z wytycznych. Zwraca wskazówki do pokazania lekarzowi – nie diagnozę.
   * Pomiary oznaczone „U lekarza” są liczone osobno (porównanie gabinet / dom).
   * Zwraca { enough, n, days, needN, needDays, home, findings: [{ kind: 'ok'|'info'|'warn', title, text }] }.
   */
  function analysis(list) {
    var home = list.filter(function (r) { return !isOffice(r); });
    var office = list.filter(isOffice);
    var days = {};
    home.forEach(function (r) { days[r.d] = 1; });
    var nDays = Object.keys(days).length;
    var st = stats(home);
    var out = { enough: st.n >= MIN_N && nDays >= MIN_DAYS, n: st.n, days: nDays, needN: MIN_N, needDays: MIN_DAYS, home: st, findings: [] };
    var f = out.findings;

    // bezpieczeństwo – zawsze, niezależnie od liczby pomiarów
    var crisis = list.filter(function (r) { return isCrisis(r.s, r.di); });
    if (crisis.length) {
      f.push({ kind: 'warn', title: 'Bardzo wysokie wartości', text: 'Ciśnienie ' + crisis.length + ' ' + plural(crisis.length, 'raz osiągnęło', 'razy osiągnęło', 'razy osiągnęło') + ' 180/110 mmHg lub więcej. Takie wyniki warto jak najszybciej omówić z lekarzem.' });
    }
    var arr = list.filter(function (r) { return (r.g || []).indexOf('arytmia') >= 0; });
    if (arr.length) {
      f.push({ kind: 'warn', title: 'Nieregularne bicie serca', text: 'Zaznaczono je ' + arr.length + ' ' + plural(arr.length, 'raz', 'razy', 'razy') + '. Ciśnieniomierz pokazuje taki symbol, gdy rytm serca podczas pomiaru jest nierówny – jedną z możliwych przyczyn jest migotanie przedsionków. Powiedz o tym lekarzowi; może zlecić EKG.' });
    }
    var lowSym = list.filter(function (r) { return classify(r.s, r.di).id === 'low' && ((r.g || []).indexOf('zle') >= 0 || (r.g || []).indexOf('glowa') >= 0); });
    if (lowSym.length) {
      f.push({ kind: 'info', title: 'Niskie ciśnienie z objawami', text: 'Niskie ciśnienie (poniżej 90/60) ze złym samopoczuciem lub bólem głowy zaznaczono ' + lowSym.length + ' ' + plural(lowSym.length, 'raz', 'razy', 'razy') + '. Warto o tym wspomnieć lekarzowi, szczególnie jeśli przyjmujesz leki na ciśnienie.' });
    }

    if (!out.enough) {
      f.push({ kind: 'info', title: 'Za mało pomiarów do analizy', text: 'Analiza potrzebuje co najmniej ' + MIN_N + ' pomiarów domowych z co najmniej ' + MIN_DAYS + ' dni (jest ' + st.n + ' ' + plural(st.n, 'pomiar', 'pomiary', 'pomiarów') + ' z ' + nDays + ' ' + plural(nDays, 'dnia', 'dni', 'dni') + '). Najlepiej zrób „Tydzień pomiarów przed wizytą”.' });
      return out;
    }

    // 1. średnia z pomiarów domowych a granica 135/85
    if (above(st, HOME_S, HOME_D)) {
      var sysOnly = st.s >= HOME_S && st.di < HOME_D, diaOnly = st.di >= HOME_D && st.s < HOME_S;
      f.push({ kind: 'warn', title: 'Średnia powyżej granicy dla pomiarów domowych',
        text: 'Średnia z ' + st.n + ' pomiarów domowych to ' + bpTxt(st) + '. Według wytycznych średnia z pomiarów w domu wynosząca 135/85 mmHg lub więcej przemawia za nadciśnieniem tętniczym' +
          (sysOnly ? ' – u Ciebie podwyższone jest głównie ciśnienie skurczowe (górne)' : diaOnly ? ' – u Ciebie podwyższone jest głównie ciśnienie rozkurczowe (dolne)' : '') +
          '. Pokaż te pomiary lekarzowi.' });
    } else {
      f.push({ kind: 'ok', title: 'Średnia poniżej granicy dla pomiarów domowych', text: 'Średnia z ' + st.n + ' pomiarów domowych to ' + bpTxt(st) + ', czyli poniżej 135/85 mmHg – granicy nadciśnienia dla pomiarów w domu.' });
    }

    // 2. rano a wieczorem
    var mor = stats(filterPart(home, 'rano')), eve = stats(filterPart(home, 'wieczor'));
    if (mor.n >= 4 && eve.n >= 4) {
      if (above(mor, HOME_S, HOME_D) && !above(eve, HOME_S, HOME_D)) {
        f.push({ kind: 'warn', title: 'Wyższe ciśnienie rano', text: 'Rano średnio ' + bpTxt(mor) + ', wieczorem ' + bpTxt(eve) + '. Poranna średnia 135/85 lub wyższa to tzw. nadciśnienie poranne. Jeśli bierzesz leki, lekarz może chcieć sprawdzić, czy działają przez całą dobę.' });
      } else if (above(eve, HOME_S, HOME_D) && !above(mor, HOME_S, HOME_D)) {
        f.push({ kind: 'info', title: 'Wyższe ciśnienie wieczorem', text: 'Wieczorem średnio ' + bpTxt(eve) + ', rano ' + bpTxt(mor) + '. Pokaż lekarzowi ten rozkład pomiarów.' });
      } else if (Math.abs(mor.s - eve.s) >= 10) {
        f.push({ kind: 'info', title: 'Duża różnica rano – wieczór', text: 'Ciśnienie skurczowe rano i wieczorem różni się średnio o ' + Math.abs(mor.s - eve.s) + ' mmHg (' + bpTxt(mor) + ' rano, ' + bpTxt(eve) + ' wieczorem).' });
      } else {
        f.push({ kind: 'ok', title: 'Podobne ciśnienie rano i wieczorem', text: 'Rano średnio ' + bpTxt(mor) + ', wieczorem ' + bpTxt(eve) + '.' });
      }
    }

    // 3. gabinet a dom (biały fartuch / nadciśnienie maskowane)
    if (office.length) {
      var of = stats(office);
      var homeHigh = above(st, HOME_S, HOME_D), offHigh = above(of, OFFICE_S, OFFICE_D);
      if (offHigh && !homeHigh) {
        f.push({ kind: 'info', title: 'Możliwy efekt białego fartucha', text: 'U lekarza średnio ' + bpTxt(of) + ' (' + office.length + ' ' + plural(office.length, 'pomiar', 'pomiary', 'pomiarów') + '), w domu ' + bpTxt(st) + '. Wyższe ciśnienie w gabinecie (140/90 i więcej) przy prawidłowym w domu (poniżej 135/85) to tzw. nadciśnienie białego fartucha. Ocenia je lekarz.' });
      } else if (!offHigh && homeHigh) {
        f.push({ kind: 'warn', title: 'Możliwe nadciśnienie maskowane', text: 'U lekarza średnio ' + bpTxt(of) + ', a w domu ' + bpTxt(st) + '. Prawidłowe ciśnienie w gabinecie (poniżej 140/90) przy podwyższonym w domu (135/85 i więcej) to tzw. nadciśnienie maskowane – łatwo je przeoczyć. Pokaż lekarzowi pomiary domowe.' });
      } else {
        f.push({ kind: 'ok', title: 'Pomiary u lekarza zgodne z domowymi', text: 'U lekarza średnio ' + bpTxt(of) + ', w domu ' + bpTxt(st) + '.' });
      }
    }

    // 4. przed lekami a po lekach
    var przed = stats(home.filter(function (r) { return (r.g || []).indexOf('przed') >= 0; }));
    var po = stats(home.filter(function (r) { return (r.g || []).indexOf('po') >= 0; }));
    if (przed.n >= 3 && po.n >= 3) {
      var dd = przed.s - po.s;
      f.push({ kind: 'info', title: 'Przed lekami i po lekach', text: 'Przed lekami średnio ' + bpTxt(przed) + ', po lekach ' + bpTxt(po) + ' (różnica ' + (dd >= 0 ? dd : -dd) + ' mmHg ciśnienia skurczowego' + (dd < 0 ? ', po lekach wyżej' : '') + ').' });
    }

    // 5. tętno spoczynkowe (definicje: tachykardia > 100/min, wyraźna bradykardia < 50/min)
    if (st.pn >= 6) {
      if (st.p > 100) f.push({ kind: 'warn', title: 'Szybkie tętno', text: 'Średnie tętno w spoczynku to ' + st.p + ' uderzeń na minutę (powyżej 100). Powiedz o tym lekarzowi.' });
      else if (st.p < 50) f.push({ kind: 'info', title: 'Wolne tętno', text: 'Średnie tętno w spoczynku to ' + st.p + ' uderzeń na minutę (poniżej 50). U osób wytrenowanych bywa to normalne – jeśli masz zawroty głowy lub osłabienie, powiedz lekarzowi.' });
    }
    return out;
  }

  /* ---------- CSV ---------- */

  function csvCell(v) {
    var s = String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  var CSV_HEAD = ['Data', 'Godzina', 'Skurczowe', 'Rozkurczowe', 'Tętno', 'Ręka', 'Kategoria', 'Okoliczności', 'Notatka'];

  /** Eksport do CSV (średnik, dla polskiego Excela). */
  function toCsv(list) {
    var rows = [CSV_HEAD.join(';')];
    list.forEach(function (r) {
      rows.push([
        plDate(r.d), r.h, r.s, r.di, r.p || '', r.a === 'L' ? 'lewa' : r.a === 'P' ? 'prawa' : '',
        classify(r.s, r.di).label, (r.g || []).map(tagLabel).join(', '), r.n || ''
      ].map(csvCell).join(';'));
    });
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  function splitCsvLine(line, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** Data RRRR-MM-DD, DD.MM.RRRR, DD-MM-RRRR lub DD/MM/RRRR → klucz albo null. */
  function parseDateCell(s) {
    s = String(s).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/.exec(s);
      if (!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3];
    }
    if (mo < 1 || mo > 12 || y < MIN_YEAR || y > MAX_YEAR || d < 1 || d > daysInMonth(y, mo - 1)) return null;
    return dateKey(y, mo - 1, d);
  }

  function parseTimeCell(s) {
    var m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(String(s).trim());
    if (!m) return null;
    var t = pad(+m[1]) + ':' + m[2];
    return parseTime(t) === null ? null : t;
  }

  function intCell(s) {
    var t = String(s).trim();
    if (!t) return 0;
    return /^\d{1,3}$/.test(t) ? +t : NaN;
  }

  var TAG_BY_LABEL = {};
  TAGS.forEach(function (t) { TAG_BY_LABEL[t.label.toLowerCase()] = t.id; });

  /**
   * Czyta CSV z pomiarami: eksport tej aplikacji albo prosty plik „data;godzina;skurczowe;rozkurczowe;tętno”.
   * Zwraca { entries: [rekord bez t], skipped: [nr wiersza], error? }.
   */
  function parseCsv(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { entries: [], skipped: [], error: 'Plik jest pusty.' };
    var delim = lines[0].indexOf(';') >= 0 ? ';' : lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    var entries = [], skipped = [];
    lines.forEach(function (line, i) {
      var c = splitCsvLine(line, delim).map(function (x) { return x.trim(); });
      var d = parseDateCell(c[0] || '');
      if (!d) { if (i > 0) skipped.push(i + 1); return; } // pierwszy wiersz to zwykle nagłówek
      var h = parseTimeCell(c[1] || '');
      var s = intCell(c[2] || ''), di = intCell(c[3] || ''), p = intCell(c[4] || '');
      if (!h || !checkValues(s, di, p).ok) { skipped.push(i + 1); return; }
      var rec = { d: d, h: h, s: s, di: di, p: p };
      var arm = (c[5] || '').toLowerCase();
      if (arm === 'lewa' || arm === 'l') rec.a = 'L';
      else if (arm === 'prawa' || arm === 'p') rec.a = 'P';
      if (c[7]) {
        var g = [];
        c[7].split(',').forEach(function (x) { var id = TAG_BY_LABEL[x.trim().toLowerCase()]; if (id && g.indexOf(id) < 0) g.push(id); });
        if (g.length) rec.g = cleanTags(g);
      }
      var n = normalizeNote(c[8] || '');
      if (n) rec.n = n;
      entries.push(rec);
    });
    if (!entries.length && !skipped.length) return { entries: [], skipped: [], error: 'Nie znaleziono pomiarów. Pierwsze kolumny to: data; godzina; skurczowe; rozkurczowe; tętno.' };
    return { entries: entries, skipped: skipped };
  }

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  /**
   * Dopisuje pomiary z importu. Pomiar, który już jest (ta sama data, godzina i wartości), nie jest dodawany drugi raz,
   * więc ponowne wczytanie tego samego pliku niczego nie dubluje. Zwraca { data, added, existing }.
   */
  function addEntries(data, entries, now) {
    var have = {};
    listReadings(data).forEach(function (r) { have[r.d + '|' + r.h + '|' + r.s + '|' + r.di + '|' + (r.p || 0)] = 1; });
    var added = 0, existing = 0;
    var out = data;
    entries.forEach(function (e) {
      var key = e.d + '|' + e.h + '|' + e.s + '|' + e.di + '|' + (e.p || 0);
      if (have[key]) { existing++; return; }
      have[key] = 1;
      var id = 'i' + fnv(key);
      var n = 1;
      while (out.r[id + (n > 1 ? '-' + n : '')] && !out.r[id + (n > 1 ? '-' + n : '')].x) n++;
      out = setReading(out, id + (n > 1 ? '-' + n : ''), e, now);
      added++;
    });
    return { data: out, added: added, existing: existing };
  }

  return {
    APP_ID: APP_ID, MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, MONTHS_SHORT: MONTHS_SHORT, WEEKDAYS: WEEKDAYS, WEEKDAYS_SHORT: WEEKDAYS_SHORT,
    isLeap: isLeap, daysInMonth: daysInMonth, pad: pad, dateKey: dateKey, parseKey: parseKey, weekday: weekday, weekdayOfKey: weekdayOfKey,
    todayKey: todayKey, nowTime: nowTime, addDays: addDays, daysBetween: daysBetween, longDate: longDate, shortDate: shortDate, plDate: plDate,
    parseTime: parseTime, plural: plural, dayPart: dayPart, PART_LABEL: PART_LABEL,
    LIMITS: LIMITS, checkValues: checkValues, unusualValues: unusualValues, CATS: CATS, GUIDE: GUIDE, classify: classify, isCrisis: isCrisis,
    TAGS: TAGS, tagLabel: tagLabel, cleanTags: cleanTags, NOTE_MAX: NOTE_MAX, normalizeNote: normalizeNote, NAME_MAX: NAME_MAX, normalizeName: normalizeName,
    CFG_DEFAULT: CFG_DEFAULT, MAX_RP: MAX_RP, cleanTimes: cleanTimes, getCfg: getCfg, setCfg: setCfg,
    emptyData: emptyData, validate: validate, serialize: serialize, parseSerialized: parseSerialized, sameData: sameData, merge: merge,
    newId: newId, getReading: getReading, setReading: setReading, listReadings: listReadings, countReadings: countReadings,
    lastReading: lastReading, firstDate: firstDate,
    stats: stats, filterPart: filterPart, PERIODS: PERIODS, periodRange: periodRange, weekStart: weekStart, chartPoints: chartPoints,
    PROTO_DAYS: PROTO_DAYS, protocol: protocol, insights: insights, headline: headline, analysis: analysis,
    toCsv: toCsv, parseCsv: parseCsv, addEntries: addEntries
  };
});
