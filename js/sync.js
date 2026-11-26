/*
 * Ciśnienie – konto i synchronizacja z serwerem.
 *
 * Każdy użytkownik ma własne konto; serwer przechowuje (zaszyfrowane) tylko jego pomiary.
 * Zasady:
 *  - Pomiary zawsze najpierw zapisują się na urządzeniu (działa bez internetu).
 *  - Wysyłka scala dane urządzenia z danymi z serwera (wygrywa nowsza wersja każdego pomiaru),
 *    więc kilka urządzeń jednej osoby ma zawsze to samo.
 *  - Flaga „niewysłane zmiany” znika dopiero, gdy serwer potwierdzi zapis.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./store.js'));
  } else {
    root.SCSync = factory(root.SCCore, root.SCStore);
  }
})(typeof self !== 'undefined' ? self : this, function (C, Store) {
  'use strict';

  var API = 'https://188-68-247-201.sslip.io/cisnienie-api';
  var KEY = 'cisnienie.konto.v1';
  var TIMEOUT = 20000;

  var hooks = null;
  var status = { state: 'off', lastSync: 0, error: '', code: '' };
  var running = false, again = false, timer = null, retryTimer = null, retryDelay = 5000;

  function SyncError(code, message) {
    var e = new Error(message);
    e.name = 'SyncError';
    e.code = code;
    return e;
  }

  /* ---------- konto zapisane na urządzeniu ---------- */

  function loadAccount() {
    var raw = Store.lsGet(KEY);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.token === 'string' && o.token && typeof o.login === 'string') {
        return { token: o.token, login: o.login, imie: typeof o.imie === 'string' ? o.imie : '', lastSync: +o.lastSync || 0, zmienione: +o.zmienione || 0 };
      }
    } catch (e) { /* uszkodzony zapis */ }
    return null;
  }

  function saveAccount(a) { return Store.lsSet(KEY, JSON.stringify(a)); }

  function getAccount() {
    var a = loadAccount();
    return a ? { login: a.login, imie: a.imie, lastSync: a.lastSync } : null;
  }

  function strefa() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'; } catch (e) { return 'Europe/Warsaw'; }
  }

  function urzadzenie() {
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    return 'urządzenie';
  }

  /* ---------- zapytania do serwera ---------- */

  /** Zapytanie do serwera. auth = true dołącza token konta. Zwraca Promise<json>. */
  function req(path, opts) {
    opts = opts || {};
    var a = loadAccount();
    var headers = { 'Content-Type': 'application/json' };
    if (opts.auth !== false) {
      if (!a) return Promise.reject(SyncError('auth', 'Zaloguj się.'));
      headers.Authorization = 'Bearer ' + a.token;
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
    return fetch(API + path, {
      method: opts.method || 'GET', headers: headers, cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (t) clearTimeout(t);
      return res.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        if (res.ok) return json || {};
        var msg = json && json.blad ? json.blad : 'Serwer odpowiedział błędem (' + res.status + ').';
        if (res.status === 401 && opts.auth !== false) {
          Store.lsSet(KEY, '');
          if (hooks && hooks.onAuthLost) hooks.onAuthLost(msg);
          throw SyncError('auth', msg);
        }
        if (res.status === 429) throw SyncError('rate', msg);
        if (res.status >= 500) throw SyncError('server', 'Serwer chwilowo nie odpowiada. Spróbuję ponownie.');
        throw SyncError('other', msg);
      });
    }, function () {
      if (t) clearTimeout(t);
      throw SyncError('offline', 'Brak połączenia z internetem.');
    });
  }

  /* ---------- stan ---------- */

  function setStatus(s) {
    Object.keys(s).forEach(function (k) { status[k] = s[k]; });
    if (hooks && hooks.onStatus) hooks.onStatus(Object.assign({}, status));
  }

  function getStatus() { return Object.assign({}, status); }

  /* ---------- konto ---------- */

  function afterAuth(r) {
    if (!r || !r.token) throw SyncError('other', 'Serwer nie potwierdził logowania.');
    saveAccount({ token: r.token, login: r.konto.login, imie: r.konto.imie || '', lastSync: 0, zmienione: 0 });
    Store.setDirty(true); // pomiary z urządzenia (jeśli są) trafią na konto
    setStatus({ state: 'pending', error: '', code: '' });
    return run().then(function () { return getAccount(); });
  }

  function register(o) {
    return req('/rejestracja', { method: 'POST', auth: false, body: { login: o.login, haslo: o.haslo, imie: o.imie, kod: o.kod, tz: strefa(), urzadzenie: urzadzenie() } }).then(afterAuth);
  }

  function login(o) {
    return req('/logowanie', { method: 'POST', auth: false, body: { login: o.login, haslo: o.haslo, urzadzenie: urzadzenie() } }).then(afterAuth);
  }

  /** Wylogowanie z tego urządzenia (sesja na serwerze jest usuwana, gdy jest internet). */
  function logout() {
    var done = function () {
      Store.lsSet(KEY, '');
      Store.setDirty(false);
      setStatus({ state: 'off', lastSync: 0, error: '', code: '' });
    };
    if (!loadAccount()) { done(); return Promise.resolve(); }
    return req('/wyloguj', { method: 'POST' }).then(done, done);
  }

  function changePassword(stare, nowe) { return req('/haslo', { method: 'POST', body: { stare: stare, nowe: nowe } }); }

  function deleteAccount(haslo) {
    return req('/konto', { method: 'DELETE', body: { haslo: haslo } }).then(function () {
      Store.lsSet(KEY, '');
      Store.setDirty(false);
      setStatus({ state: 'off', lastSync: 0, error: '', code: '' });
    });
  }

  /* ---------- synchronizacja ---------- */

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { retryDelay = Math.min(retryDelay * 2, 5 * 60 * 1000); run(); }, retryDelay);
  }

  function applyServer(dane) {
    var remote = C.validate(dane || {}).data;
    var local = hooks.getData();
    var merged = C.merge(local, remote);
    if (!C.sameData(merged, local)) hooks.applyRemote(remote);
  }

  /** Wysyła dane urządzenia i scala z serwerem. */
  function run() {
    var a = loadAccount();
    if (!a || !hooks) { setStatus({ state: 'off' }); return Promise.resolve(); }
    if (running) { again = true; return Promise.resolve(); }
    running = true;
    setStatus({ state: 'syncing', error: '', code: '' });
    var startVersion = hooks.getVersion();
    return req('/dane', { method: 'POST', body: { dane: JSON.parse(C.serialize(hooks.getData())), tz: strefa() } }).then(function (r) {
      applyServer(r.dane);
      var cur = loadAccount();
      if (cur) { cur.lastSync = Date.now(); cur.zmienione = r.zmienione || 0; saveAccount(cur); }
      if (hooks.getVersion() === startVersion) Store.setDirty(false);
      retryDelay = 5000;
      setStatus({ state: Store.isDirty() ? 'pending' : 'synced', lastSync: cur ? cur.lastSync : 0, error: '', code: '' });
    }).catch(function (e) {
      var code = e && e.code ? e.code : 'other';
      if (code === 'auth') { setStatus({ state: 'off', error: '', code: code }); return; }
      if (code === 'offline' || code === 'server' || code === 'rate') {
        setStatus({ state: 'pending', error: code === 'offline' ? 'Brak internetu. Pomiary wyślą się same, gdy wróci połączenie.' : e.message, code: code });
        scheduleRetry();
      } else {
        setStatus({ state: 'error', error: e && e.message ? e.message : 'Nie udało się zapisać na serwerze.', code: code });
      }
    }).then(function () {
      running = false;
      if (again) { again = false; schedule(300); }
    });
  }

  /** Wysyłka chwilę po zmianie (kilka szybkich zmian = jedna wysyłka). */
  function schedule(delay) {
    if (!loadAccount()) return;
    clearTimeout(timer);
    timer = setTimeout(run, delay == null ? 1200 : delay);
  }

  /** Ciche sprawdzenie, czy inne urządzenie tej osoby coś dodało (co minutę, gdy aplikacja jest otwarta). */
  function poll() {
    var a = loadAccount();
    if (!a || running) return Promise.resolve();
    if (Store.isDirty()) return run();
    return req('/dane?znane=' + encodeURIComponent(a.zmienione || 0)).then(function (r) {
      if (!r.zmiana) return;
      applyServer(r.dane);
      var cur = loadAccount();
      if (cur) { cur.zmienione = r.zmienione || 0; cur.lastSync = Date.now(); saveAccount(cur); setStatus({ state: 'synced', lastSync: cur.lastSync, error: '', code: '' }); }
    }, function () { /* spróbuje przy następnym sprawdzeniu */ });
  }

  function init(h) {
    hooks = h;
    var a = loadAccount();
    setStatus(a ? { state: Store.isDirty() ? 'pending' : 'synced', lastSync: a.lastSync } : { state: 'off' });
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', function () { if (loadAccount()) run(); });
    }
  }

  /* ---------- przypomnienia (push) ---------- */

  function pushKey() { return req('/vapid', { auth: false }).then(function (r) { return r.klucz; }); }
  function savePush(sub) { return req('/push', { method: 'POST', body: { sub: sub } }); }
  function deletePush() { return req('/push', { method: 'DELETE' }); }
  function testPush() { return req('/push/test', { method: 'POST' }); }

  return {
    API: API, init: init, getAccount: getAccount, register: register, login: login, logout: logout,
    changePassword: changePassword, deleteAccount: deleteAccount,
    run: run, schedule: schedule, poll: poll, getStatus: getStatus,
    pushKey: pushKey, savePush: savePush, deletePush: deletePush, testPush: testPush
  };
});
