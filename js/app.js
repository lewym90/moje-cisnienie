/* Ciśnienie – interfejs aplikacji. */
(function () {
  'use strict';

  var C = window.SCCore;
  var Store = window.SCStore;
  var Sync = window.SCSync;
  var APP_NAME = 'Ciśnienie';
  var APP_VERSION = '1.1.0';
  // repozytorium z kodem aplikacji (zadanie przypomnień pobiera z niego skrypt); na GitHub Pages ustalane z adresu strony
  var DEFAULT_CODE_REPO = 'lewym90/moje-cisnienie';
  // klucz publiczny powiadomień; klucz prywatny jest tylko w sekrecie VAPID_PRIVATE_KEY repozytorium z danymi
  var VAPID_PUBLIC = 'BEahPklFMcijRTytaw3_t_eqw_KAWEt2w-Yx6X01DJsXP9KDMIyu82wdaW19ilM1b5xZ4yk573hlfqOfwlWt_ew';

  /* ---------- Narzędzia ---------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var ICONS = {
    bars3: '<rect x="4.5" y="12" width="3.6" height="8" rx="1.2" fill="currentColor" stroke="none"/><rect x="10.2" y="7.5" width="3.6" height="12.5" rx="1.2" fill="currentColor" stroke="none"/><rect x="15.9" y="3.5" width="3.6" height="16.5" rx="1.2" fill="currentColor" stroke="none"/>',
    calDots: '<rect x="3.8" y="5.5" width="16.4" height="14.5" rx="3"/><path d="M3.8 10h16.4M8.5 3.5v4M15.5 3.5v4"/><path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 16.8h.01M12 16.8h.01M16 16.8h.01" stroke-width="2.4"/>',
    home: '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 10v9.5h4V15h3v4.5h4V10"/>',
    heartPulse: '<path d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/><path d="M7.5 12.5h2.5l1.2-2.5 1.8 4.5 1.2-2h2.3"/>',
    user: '<circle cx="12" cy="8.5" r="3.7"/><path d="M4.8 20c.9-3.8 3.7-5.7 7.2-5.7s6.3 1.9 7.2 5.7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.4 1.4-1 2.5 1 2.5-2.4 1.4-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.4-1.4 1-2.5-1-2.5 2.4-1.4.6-2.7 2.7.6z"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.3 1.8M5 4.5L3 6.5M19 4.5l2 2"/>',
    drop: '<path d="M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>',
    checkCircle: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7.8 12.3l2.8 2.8 5.6-5.6" stroke="#fff" stroke-width="2.4"/>',
    heart: '<path d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/>',
    heartFill: '<path fill="currentColor" stroke="none" d="M12 21s-8.6-5-8.6-11.4A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 8.6 3C20.6 16 12 21 12 21z"/>',
    pulse: '<path d="M3 12.5h4l2-5 3.5 10 2.5-6.5 1.5 1.5H21"/>',
    list: '<path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.6 7h.01M4.6 12h.01M4.6 17h.01"/>',
    chart: '<path d="M6 19.5v-7M12 19.5V5M18 19.5v-10"/><path d="M3.5 19.5h17"/>',
    sliders: '<path d="M4.5 7h8M17 7h2.5M4.5 17h2.5M11.5 17h8"/><circle cx="14.8" cy="7" r="2.2"/><circle cx="9.2" cy="17" r="2.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 4.2l9 15.6H3z"/><path d="M12 10v4.4M12 17.2h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    download: '<path d="M12 4v11M7.5 10.8L12 15.3l4.5-4.5M5 19.5h14"/>',
    upload: '<path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M5 19.5h14"/>',
    trash: '<path d="M5 7h14M9.8 7V4.8h4.4V7M7 7l.9 12.2h8.2L17 7M10.5 11v5M13.5 11v5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    shield: '<path d="M12 3.5l7 2.6v5.4c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6.1z"/><path d="M9 12.2l2.2 2.2 3.8-4"/>',
    print: '<path d="M7 9V4.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.5h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z"/>',
    spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
    back: '<path d="M10 7H20v10H10l-5.5-5z"/><path d="M12.5 10l4 4M16.5 10l-4 4"/>',
    doctor: '<path d="M7 4v5a4 4 0 0 0 8 0V4M7 4H5.5M15 4h1.5M11 13v2.5a4 4 0 0 0 8 0V13"/><circle cx="19" cy="11" r="2"/>',
    edit: '<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>'
  };

  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }

  function catOf(r) { return C.classify(r.s, r.di); }

  /* ---------- Stan ---------- */

  var p0 = C.parseKey(C.todayKey());
  var state = {
    data: C.emptyData(),
    settings: Store.loadSettings(),
    view: 'home',
    today: C.todayKey(),
    hist: { y: p0.y, m: p0.m },
    period: 'd7',
    push: { status: 'checking', busy: false, error: '' },
    version: 0,
    sync: { state: 'off', lastSync: 0, error: '', code: '' },
    storageOk: true,
    editor: null,
    installPrompt: null,
    connecting: false
  };

  function cfg() { return C.getCfg(state.data); }
  function target() { var c = cfg(); return { ts: c.ts, td: c.td }; }

  function commit(newData) {
    state.data = newData;
    state.version++;
    state.storageOk = Store.save(newData);
    Store.setDirty(true);
    Sync.schedule();
  }

  function updateCfg(patch) {
    commit(C.setCfg(state.data, patch, Date.now()));
  }

  /* ---------- Teksty pomocnicze ---------- */

  function greeting() {
    var h = new Date().getHours();
    var name = cfg().nm ? cfg().nm.split(' ')[0] : '';
    var g = h >= 18 || h < 4 ? 'Dobry wieczór' : 'Dzień dobry';
    return g + (name ? ', ' + name : '');
  }

  function timeOf(ms) {
    try { return new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function dayLabel(key) {
    if (key === state.today) return 'Dziś';
    if (key === C.addDays(state.today, -1)) return 'Wczoraj';
    var p = C.parseKey(key);
    var s = C.WEEKDAYS_SHORT[C.weekday(p.y, p.m, p.d)] + ', ' + p.d + ' ' + C.MONTHS_SHORT[p.m];
    if (p.y !== C.parseKey(state.today).y) s += ' ' + p.y;
    return s;
  }

  function dayHeading(key) {
    if (key === state.today) return 'Dziś';
    if (key === C.addDays(state.today, -1)) return 'Wczoraj';
    var p = C.parseKey(key);
    return cap(C.WEEKDAYS[C.weekday(p.y, p.m, p.d)]) + ', ' + p.d + ' ' + C.MONTHS_GEN[p.m];
  }

  function bp(s, di) { return s + '/' + di; }
  function nPomiar(n) { return n + ' ' + C.plural(n, 'pomiar', 'pomiary', 'pomiarów'); }

  /* ---------- Wykresy (SVG) ---------- */

  /** Skala kategorii z zaznaczonym poziomem (−1 = bez znacznika). */
  function scaleSvg(level, label) {
    var w = 40, h = '';
    C.CATS.forEach(function (c, i) {
      var on = i === level;
      h += '<rect class="cf-' + c.id + (level >= 0 && !on ? ' dim' : '') + '" x="' + (i * w + 1.5) + '" y="' + (on ? 11 : 13) + '" width="' + (w - 3) + '" height="' + (on ? 10 : 6) + '" rx="' + (on ? 5 : 3) + '"/>';
    });
    if (level >= 0) {
      var cx = level * w + w / 2;
      h += '<path class="mark" d="M' + (cx - 6) + ' 1.5h12l-6 7z"/>';
    }
    return '<svg class="scale" viewBox="0 0 280 24" role="img" aria-label="' + esc(label || 'Skala kategorii ciśnienia') + '">' + h + '</svg>';
  }

  function niceLo(v) { return Math.floor(v / 10) * 10; }
  function niceHi(v) { return Math.ceil(v / 10) * 10; }

  /** Wykres zakresów: dla każdego punktu „kapsułka” od rozkurczowego do skurczowego, w kolorze kategorii. */
  function rangeChart(points, t, unit) {
    var W = 340, H = 210, L = 30, R = 30, T = 10, B = 26;
    var lo = Math.min.apply(null, points.map(function (p) { return p.di; }).concat([t.td - 10, 60]));
    var hi = Math.max.apply(null, points.map(function (p) { return p.s; }).concat([t.ts + 10, 150]));
    lo = Math.max(20, niceLo(lo - 5)); hi = niceHi(hi + 5);
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var h = '';
    for (var g = Math.ceil(lo / 20) * 20; g <= hi; g += 20) {
      h += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (y(g) + 4).toFixed(1) + '" text-anchor="end">' + g + '</text>';
    }
    h += '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t.ts).toFixed(1) + '" y2="' + y(t.ts).toFixed(1) + '"/>' +
      '<text class="tgt-l" x="' + (W - R + 4) + '" y="' + (y(t.ts) + 4).toFixed(1) + '">' + t.ts + '</text>' +
      '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t.td).toFixed(1) + '" y2="' + y(t.td).toFixed(1) + '"/>' +
      '<text class="tgt-l" x="' + (W - R + 4) + '" y="' + (y(t.td) + 4).toFixed(1) + '">' + t.td + '</text>';
    var n = points.length;
    var step = (W - L - R) / n;
    var bw = Math.max(3, Math.min(12, step * 0.56));
    points.forEach(function (p, i) {
      var cx = L + step * (i + 0.5);
      var y1 = y(p.s), y2 = y(p.di);
      var hh = Math.max(y2 - y1, bw);
      h += '<rect class="cf-' + C.classify(p.s, p.di).id + '" x="' + (cx - bw / 2).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="' + (bw / 2).toFixed(1) + '"><title>' + esc(p.label + ': ' + bp(p.s, p.di) + (p.n > 1 ? ' (średnia z ' + p.n + ')' : '')) + '</title></rect>';
    });
    var labels = Math.min(n, 5);
    var used = {};
    for (var k = 0; k < labels; k++) {
      var idx = labels === 1 ? 0 : Math.round(k * (n - 1) / (labels - 1));
      if (used[idx]) continue;
      used[idx] = 1;
      var lx = L + step * (idx + 0.5);
      var txt = unit === 'reading' ? points[idx].label.split(' ')[0] + ' ' + points[idx].label.split(' ')[1] : points[idx].label;
      h += '<text class="axis" x="' + lx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 && n > 1 ? 'start' : k === labels - 1 && n > 1 ? 'end' : 'middle') + '">' + esc(txt) + '</text>';
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Wykres ciśnienia: ' + n + ' ' + C.plural(n, 'punkt', 'punkty', 'punktów') + '">' + h + '</svg>';
  }

  /** Wykres tętna (linia). */
  function pulseChart(points) {
    var pts = points.filter(function (p) { return p.p > 0; });
    if (pts.length < 2) return '';
    var W = 340, H = 120, L = 30, R = 30, T = 10, B = 18;
    var lo = niceLo(Math.min.apply(null, pts.map(function (p) { return p.p; })) - 5);
    var hi = niceHi(Math.max.apply(null, pts.map(function (p) { return p.p; })) + 5);
    if (hi - lo < 30) { var mid = (hi + lo) / 2; lo = niceLo(mid - 15); hi = niceHi(mid + 15); }
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var n = points.length, step = (W - L - R) / n;
    var h = '';
    [lo, Math.round((lo + hi) / 2 / 10) * 10, hi].forEach(function (g) {
      h += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (y(g) + 4).toFixed(1) + '" text-anchor="end">' + g + '</text>';
    });
    var d = '', dots = '';
    points.forEach(function (p, i) {
      if (!(p.p > 0)) return;
      var x = (L + step * (i + 0.5)).toFixed(1), yy = y(p.p).toFixed(1);
      d += (d ? 'L' : 'M') + x + ' ' + yy;
      dots += '<circle class="pdot" cx="' + x + '" cy="' + yy + '" r="' + (n > 40 ? 2 : 3) + '"><title>' + esc(p.label + ': ' + p.p + '/min') + '</title></circle>';
    });
    h += '<path class="pline" d="' + d + '"/>' + dots;
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Wykres tętna">' + h + '</svg>';
  }

  /** Pasek z udziałem kategorii. */
  function distBar(st) {
    var x = 0, h = '';
    C.CATS.forEach(function (c) {
      var n = st.cats[c.id];
      if (!n) return;
      var w = n * 300 / st.n;
      h += '<rect class="cf-' + c.id + '" x="' + x.toFixed(2) + '" y="0" width="' + w.toFixed(2) + '" height="14"/>';
      x += w;
    });
    return '<svg class="dist" viewBox="0 0 300 14" preserveAspectRatio="none" role="img" aria-label="Udział kategorii">' + h + '</svg>';
  }

  /** Wykres liniowy jak na ekranie Statystyki: skurczowe (czerwone) i rozkurczowe (niebieskie) z wypełnieniem. */
  function lineChart(points, t) {
    var W = 340, H = 220, L = 32, R = 14, T = 12, B = 28;
    var lo = Math.min.apply(null, points.map(function (p) { return p.di; }).concat([t.td]));
    var hi = Math.max.apply(null, points.map(function (p) { return p.s; }).concat([t.ts]));
    lo = Math.max(20, niceLo(lo - 8)); hi = niceHi(hi + 8);
    var stepY = hi - lo > 90 ? 20 : 10;
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var n = points.length;
    var step = (W - L - R) / Math.max(n, 1);
    function x(i) { return L + step * (i + 0.5); }
    var h = '<defs><linearGradient id="lc-gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs-a"/><stop offset="1" class="gs-b"/></linearGradient>' +
      '<linearGradient id="lc-gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gd-a"/><stop offset="1" class="gd-b"/></linearGradient></defs>';
    for (var g = Math.ceil(lo / stepY) * stepY; g <= hi; g += stepY) {
      h += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '"/>' +
        '<text class="axis" x="' + (L - 7) + '" y="' + (y(g) + 3.5).toFixed(1) + '" text-anchor="end">' + g + '</text>';
    }
    h += '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t.ts).toFixed(1) + '" y2="' + y(t.ts).toFixed(1) + '"/>' +
      '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t.td).toFixed(1) + '" y2="' + y(t.td).toFixed(1) + '"/>';
    function series(key, cls, grad) {
      if (!n) return '';
      var d = '', dots = '';
      points.forEach(function (p, i) {
        d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1);
        dots += '<circle class="dot ' + cls + '" cx="' + x(i).toFixed(1) + '" cy="' + y(p[key]).toFixed(1) + '" r="' + (n > 40 ? 2.2 : n > 16 ? 3 : 4) + '"><title>' + esc(p.label + ': ' + bp(p.s, p.di) + (p.n > 1 ? ' (średnia z ' + p.n + ')' : '')) + '</title></circle>';
      });
      var area = n > 1 ? '<path fill="url(#' + grad + ')" d="' + d + 'L' + x(n - 1).toFixed(1) + ' ' + (H - B) + 'L' + x(0).toFixed(1) + ' ' + (H - B) + 'Z"/>' : '';
      return area + '<path class="ln ' + cls + '" d="' + d + '"/>' + dots;
    }
    h += series('di', 'dia', 'lc-gd') + series('s', 'sys', 'lc-gs');
    var labels = Math.min(n, 7), used = {};
    for (var k = 0; k < labels; k++) {
      var idx = labels === 1 ? 0 : Math.round(k * (n - 1) / (labels - 1));
      if (used[idx]) continue;
      used[idx] = 1;
      h += '<text class="axis" x="' + x(idx).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(points[idx].label) + '</text>';
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Wykres ciśnienia: skurczowe i rozkurczowe">' + h + '</svg>';
  }

  /* ---------- Szkielet ---------- */

  var NAV = [
    { view: 'home', label: 'Start', icon: 'home' },
    { view: 'history', label: 'Pomiary', icon: 'heartPulse' },
    { view: 'charts', label: 'Statystyki', icon: 'chart' },
    { view: 'settings', label: 'Profil', icon: 'user' }
  ];

  function navButtons() {
    return NAV.map(function (n) {
      return '<button class="nav-btn" data-action="nav" data-view="' + n.view + '">' + icon(n.icon) + '<span>' + n.label + '</span></button>';
    }).join('');
  }

  function buildShell() {
    $('app').innerHTML =
      '<div class="shell">' +
        '<aside class="side" aria-label="Menu"><div class="brand"><img src="icons/logo-256.png" alt="" width="40" height="40"><span>' + APP_NAME + '<small>Dziennik pomiarów</small></span></div>' +
          '<button class="btn red side-add" data-action="add">' + icon('plus') + 'Dodaj pomiar</button>' +
          navButtons() + '<div class="spacer"></div><div id="pill-side"></div></aside>' +
        '<div class="main"><main id="view" class="view" tabindex="-1"></main></div>' +
        '<nav class="tabbar" aria-label="Główna nawigacja">' + navButtons() + '</nav>' +
        '<div id="toasts" class="toasts" role="status" aria-live="polite"></div>' +
        '<div id="modal-root"></div>' +
        '<div id="confirm-root"></div>' +
      '</div>';
  }

  function renderNav() {
    var cur = state.view === 'tips' ? 'home' : state.view;
    var btns = document.querySelectorAll('[data-action="nav"]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].closest('.tabbar, .side') && btns[i].getAttribute('data-view') === cur) btns[i].setAttribute('aria-current', 'page');
      else btns[i].removeAttribute('aria-current');
    }
  }

  function pillInfo() {
    var s = state.sync;
    if (!state.storageOk) return { cls: 'error', text: 'Błąd zapisu' };
    if (s.state === 'off') return { cls: 'off', text: 'Kopia wyłączona' };
    if (s.state === 'syncing') return { cls: 'pending syncing', text: 'Wysyłam kopię…' };
    if (s.state === 'pending') return { cls: 'pending', text: 'Kopia czeka' };
    if (s.state === 'error') return { cls: 'error', text: 'Kopia: uwaga' };
    return { cls: 'ok', text: 'Kopia zapisana' + (s.lastSync ? ' · ' + timeOf(s.lastSync) : '') };
  }

  function pillHtml() {
    var i = pillInfo();
    return '<button class="pill ' + i.cls + '" data-action="goto-backup"><span class="dot"></span>' + esc(i.text) + '</button>';
  }

  function renderPill() {
    var els = document.querySelectorAll('.pill-slot');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = pillHtml();
    if ($('pill-side')) $('pill-side').innerHTML = pillHtml();
  }

  function applyTheme() {
    var t = state.settings.theme;
    var root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    var meta = $('theme-color');
    if (meta) {
      var v = state.view === 'home' ? '--home-top' : '--bg';
      var bg = getComputedStyle(root).getPropertyValue(v).trim();
      if (bg) meta.setAttribute('content', bg);
    }
  }

  /** Pasek tytułu podstrony (wyśrodkowany tytuł, opcjonalnie „wstecz” i przycisk po prawej). */
  function pageBar(title, back, right) {
    return '<header class="bar">' +
      (back ? '<button class="bar-btn" data-action="nav" data-view="' + back + '" aria-label="Wróć">' + icon('chevL') + '</button>' : '<span class="bar-btn" aria-hidden="true"></span>') +
      '<h1>' + esc(title) + '</h1>' + (right || '<span class="bar-btn" aria-hidden="true"></span>') + '</header>';
  }

  /* ---------- Elementy wspólne ---------- */

  function statusBanners() {
    var h = '';
    var s = state.sync;
    if (!state.storageOk) {
      h += '<div class="banner error">' + icon('alert') + '<div class="grow"><strong>Dane nie zapisują się na tym urządzeniu</strong>' +
        'Przeglądarka blokuje zapis (np. tryb prywatny). Pobierz kopię w Profilu i nie zamykaj aplikacji.</div></div>';
    }
    if (s.state === 'error') {
      h += '<div class="banner error">' + icon('alert') + '<div class="grow"><strong>Kopia na GitHubie nie działa</strong>' + esc(s.error) +
        '<div class="btn-row"><button class="btn small" data-action="sync-now">Spróbuj ponownie</button>' +
        '<button class="btn small ghost" data-action="goto-backup">Ustawienia kopii</button></div></div></div>';
    } else if (s.state === 'pending' && s.error) {
      h += '<div class="banner warn">' + icon('info') + '<div class="grow"><strong>Kopia czeka na wysłanie</strong>' + esc(s.error) +
        ' Pomiary są bezpieczne na tym urządzeniu.</div></div>';
    }
    return h;
  }

  function tagsLine(r) {
    var parts = [];
    if (r.a) parts.push(r.a === 'L' ? 'lewa ręka' : 'prawa ręka');
    (r.g || []).forEach(function (g) { parts.push(C.tagLabel(g).toLowerCase()); });
    if (r.n) parts.push(r.n);
    return parts.join(' · ');
  }

  /** Wiersz pomiaru. withDay – pokazuje dzień (lista ostatnich). */
  function readingRow(r, withDay) {
    var c = catOf(r);
    var sub = (withDay ? dayLabel(r.d) + ', ' : '') + r.h + ' · ' + c.label;
    var extra = tagsLine(r);
    var flag = r.g && r.g.indexOf('arytmia') >= 0 ? '<span class="flag" title="Nieregularne bicie">' + icon('pulse') + '</span>' : '';
    return '<button class="rrow" data-action="edit" data-id="' + esc(r.id) + '">' +
      '<span class="rdot cb-' + c.id + '" aria-hidden="true"></span>' +
      '<span class="rmain"><span class="rbp num">' + r.s + ' / ' + r.di + '<small>mmHg</small></span>' +
      '<span class="rsub">' + esc(sub) + '</span>' + (extra ? '<span class="rnote">' + esc(extra) + '</span>' : '') + '</span>' +
      flag +
      (r.p ? '<span class="rpulse num">' + icon('heartFill') + r.p + '</span>' : '') +
      '</button>';
  }

  function catPill(c, cls) {
    return '<span class="cat-pill cb-' + c.id + (cls ? ' ' + cls : '') + '">' + esc(c.label) + '</span>';
  }

  /** Zielona/żółta/czerwona plakietka stanu jak na renderze („✓ Prawidłowe ciśnienie”). */
  function statusChip(c) {
    var ic = c.level >= 1 && c.level <= 2 ? 'checkCircle' : c.level >= 4 ? 'alert' : 'info';
    return '<span class="status-chip cb-' + c.id + '">' + icon(ic) + esc(c.long) + '</span>';
  }

  /* ---------- Widok: Start ---------- */

  var LOGO = '<svg class="logo" viewBox="0 0 120 104" aria-hidden="true"><defs>' +
    '<linearGradient id="lg-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a86"/><stop offset=".55" stop-color="#ff2a3e"/><stop offset="1" stop-color="#c80f26"/></linearGradient>' +
    '<radialGradient id="lg-f" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#6a0a16"/><stop offset="1" stop-color="#2a0308"/></radialGradient>' +
    '<filter id="lg-g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter></defs>' +
    '<path d="M60 94S12 66 12 34A23 23 0 0 1 60 21.5 23 23 0 0 1 108 34c0 32-48 60-48 60z" fill="none" stroke="#ff1f35" stroke-width="9" opacity=".75" filter="url(#lg-g)"/>' +
    '<path d="M60 94S12 66 12 34A23 23 0 0 1 60 21.5 23 23 0 0 1 108 34c0 32-48 60-48 60z" fill="url(#lg-f)" stroke="url(#lg-s)" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M22 54h20l7-15 11 30 9-23 6 8h23" fill="none" stroke="#ff3045" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".7" filter="url(#lg-g)"/>' +
    '<path d="M22 54h20l7-15 11 30 9-23 6 8h23" fill="none" stroke="#ff4a5c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M22 54h20l7-15 11 30 9-23 6 8h23" fill="none" stroke="#ffd2d7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ECG_D = 'M-10 152C60 150 120 146 190 140S300 132 330 131h20l9-22 11 52 13-118 13 92 9-17h22c30 0 60 1 120 4';
  var HOME_ECG = '<svg class="home-ecg" viewBox="0 0 560 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>' +
    '<linearGradient id="ecg-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a3e" stop-opacity="0"/><stop offset=".35" stop-color="#ff2a3e" stop-opacity=".55"/><stop offset=".62" stop-color="#ff3346"/><stop offset="1" stop-color="#ff2a3e" stop-opacity=".35"/></linearGradient>' +
    '<filter id="ecg-g" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
    '<path d="' + ECG_D + '" fill="none" stroke="url(#ecg-s)" stroke-width="10" filter="url(#ecg-g)" opacity=".9"/>' +
    '<path d="' + ECG_D + '" fill="none" stroke="url(#ecg-s)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="' + ECG_D + '" fill="none" stroke="#ffc9cf" stroke-width="1" stroke-linejoin="round" opacity=".55"/></svg>';

  function nextReminder() {
    var c = cfg();
    var hNow = new Date().getHours() * 60 + new Date().getMinutes();
    var hours = [c.rm, c.re].filter(function (h) { return h >= 0; }).sort(function (a, b) { return a - b; });
    if (!hours.length) return 'Przypomnienia wyłączone';
    for (var i = 0; i < hours.length; i++) if (hours[i] * 60 > hNow) return 'Dziś, ' + C.pad(hours[i]) + ':00';
    return 'Jutro, ' + C.pad(hours[0]) + ':00';
  }

  function lastCard() {
    var last = C.lastReading(state.data);
    if (!last) {
      return '<section class="last-card empty-last"><h2>Brak pomiarów</h2><p>Usiądź wygodnie, odpocznij 5 minut i zapisz pierwszy wynik z ciśnieniomierza. Aplikacja policzy średnie, narysuje wykresy i przygotuje raport dla lekarza.</p>' +
        '<button class="btn red block big" data-action="add">' + icon('plus') + 'Dodaj pomiar</button></section>';
    }
    var c = catOf(last);
    return '<section class="last-card">' +
      '<div class="lc-head"><h2>Ostatni pomiar</h2><span>' + esc(dayLabel(last.d) + ', ' + last.h) + '</span></div>' +
      '<div class="lc-row"><button class="lc-bp num" data-action="edit" data-id="' + esc(last.id) + '" aria-label="Ostatni pomiar ' + last.s + ' na ' + last.di + ' mmHg, popraw">' +
      '<span class="big">' + last.s + '<i> / </i>' + last.di + '</span><span class="u">mmHg</span></button>' +
      (last.p ? '<div class="lc-pulse">' + icon('heart', 'beat') + '<b class="num">' + last.p + '</b><span>ud./min</span></div>' : '') + '</div>' +
      '<div class="lc-status">' + statusChip(c) + '</div>' +
      '<button class="btn red block big" data-action="add">' + icon('plus') + 'Dodaj pomiar</button></section>';
  }

  function crisisBanner() {
    var last = C.lastReading(state.data);
    if (!last || !C.isCrisis(last.s, last.di) || last.d !== state.today) return '';
    return '<div class="banner error">' + icon('alert') + '<div class="grow"><strong>Bardzo wysokie ciśnienie: ' + bp(last.s, last.di) + '</strong>' +
      'Usiądź, odpocznij 5 minut i zmierz ponownie. Jeśli wynik się powtarza, skontaktuj się z lekarzem. Gdy pojawia się ból w klatce piersiowej, duszność, silny ból głowy, zaburzenia mowy, widzenia lub osłabienie ręki – dzwoń pod <b>112</b>.</div></div>';
  }

  function todayCard() {
    var l = C.listReadings(state.data, state.today, state.today);
    function slot(part, ic, label) {
      var rs = C.filterPart(l, part);
      var body;
      if (rs.length) {
        var lr = rs[rs.length - 1];
        body = '<b class="num">' + bp(lr.s, lr.di) + '</b><span>' + nPomiar(rs.length) + ' · ostatni ' + lr.h + '</span>';
      } else {
        body = '<b class="muted">—</b><span>' + (part === 'rano' ? 'Przed lekami i śniadaniem' : 'Przed kolacją') + '</span>';
      }
      return '<div class="slot' + (rs.length ? ' done' : '') + '"><div class="slot-h">' + icon(ic) + label + (rs.length ? icon('check', 'ok-ic') : '') + '</div>' + body + '</div>';
    }
    var other = l.filter(function (r) { var p = C.dayPart(r.h); return p !== 'rano' && p !== 'wieczor'; }).length;
    return '<div class="card"><div class="card-head"><h2>Dziś</h2></div>' +
      '<div class="slots">' + slot('rano', 'sun', 'Rano') + slot('wieczor', 'moon', 'Wieczorem') + '</div>' +
      (other ? '<p class="help">Oraz ' + nPomiar(other) + ' w ciągu dnia.</p>' : '') + '</div>';
  }

  function protoCard(compact) {
    var p = C.protocol(state.data, state.today, target());
    if (!p) {
      if (compact) return '';
      return '<div class="card proto"><div class="card-head"><h2>' + icon('doctor') + 'Tydzień pomiarów przed wizytą</h2></div>' +
        '<p class="help">Lekarze zalecają przed wizytą 7 dni pomiarów: codziennie rano (przed lekami i śniadaniem) i wieczorem (przed kolacją) po 2 pomiary, jeden po drugim w odstępie 1–2 minut. Aplikacja poprowadzi Cię dzień po dniu i policzy średnią z dni 2–7, tak jak robi to lekarz.</p>' +
        '<div class="btn-row"><button class="btn red" data-action="proto-start">' + icon('calendar') + 'Rozpocznij od dziś</button></div></div>';
    }
    var h = '<div class="card proto"><div class="card-head"><h2>' + icon('doctor') + 'Tydzień pomiarów</h2>';
    if (p.notStarted) {
      return h + '</div><p class="help">Zaczyna się ' + esc(C.longDate(p.start)) + '.</p><div class="btn-row"><button class="btn small danger" data-action="proto-stop">Anuluj</button></div></div>';
    }
    h += '<span class="muted small">' + (p.done ? 'zakończony' : 'dzień ' + p.dayNo + ' z ' + C.PROTO_DAYS) + '</span></div>';
    h += '<div class="proto-days">' + p.days.map(function (d) {
      var cls = d.key > state.today ? 'future' : (d.rano >= 2 && d.wieczor >= 2 ? 'full' : (d.all ? 'part' : (d.key < state.today ? 'miss' : '')));
      if (d.key === state.today) cls += ' now';
      return '<div class="pd ' + cls + '" title="Dzień ' + d.no + ': rano ' + d.rano + ', wieczorem ' + d.wieczor + '"><b>' + d.no + '</b><span>' + Math.min(d.rano, 2) + '+' + Math.min(d.wieczor, 2) + '</span></div>';
    }).join('') + '</div>';
    if (!p.done) {
      var td = p.days[p.dayNo - 1];
      h += '<p class="help">Dziś: rano <b>' + Math.min(td.rano, 2) + '/2</b>, wieczorem <b>' + Math.min(td.wieczor, 2) + '/2</b>.' + (p.dayNo === 1 ? ' Pierwszy dzień to rozgrzewka – lekarz go nie liczy, ale warto mierzyć.' : '') + '</p>';
    }
    var r = p.result;
    if (r.n) {
      h += '<div class="proto-res"><span>Średnia z dni 2–7 (' + nPomiar(r.n) + ')</span><b class="num">' + bp(r.s, r.di) + ' <small>mmHg</small></b>' +
        (p.done || p.enough ? '<em class="' + (p.above ? 'bad' : 'good') + '">' + (p.above ? 'Na granicy progu 135/85 lub powyżej – pokaż wynik lekarzowi.' : 'Poniżej progu 135/85 dla pomiarów domowych.') + '</em>' : '') + '</div>';
      if (p.done && !p.enough) h += '<p class="help">Zalecane jest co najmniej 12 pomiarów z dni 2–7, tu jest ' + r.n + '.</p>';
    }
    h += '<div class="btn-row">' + (compact ? '<button class="btn small" data-action="nav" data-view="charts">Szczegóły</button>' : '') +
      (r.n ? '<button class="btn small" data-action="print-proto">' + icon('print') + 'Raport dla lekarza</button>' : '') +
      '<button class="btn small ghost" data-action="proto-stop">' + (p.done ? 'Zamknij' : 'Przerwij') + '</button></div></div>';
    return h;
  }

  function homeView() {
    var pushOn = state.push.status === 'on';
    var h = '<div class="home">' +
      '<header class="home-top">' + HOME_ECG + '<div class="home-glow" aria-hidden="true"></div>' +
      '<div class="home-icons"><button class="round-btn" data-action="nav" data-view="settings" aria-label="Profil i ustawienia">' + icon('gear') + '</button>' +
      '<button class="round-btn" data-action="goto-remind" aria-label="Przypomnienia">' + icon('bell') + (pushOn ? '<span class="bell-dot"></span>' : '') + '</button></div>' +
      '<div class="home-bokeh" aria-hidden="true"></div>' + LOGO + '<h1>' + APP_NAME + '</h1><p>Dziennik pomiarów</p></header>' +
      '<div class="home-body stack">';
    h += statusBanners();
    h += lastCard();
    h += crisisBanner();
    h += '<div class="tiles">' +
      '<button class="tile" data-action="nav" data-view="charts">' + icon('bars3') + '<span>Statystyki</span></button>' +
      '<button class="tile" data-action="nav" data-view="history">' + icon('calDots') + '<span>Historia</span></button>' +
      '<button class="tile" data-action="goto-remind">' + icon('bell') + '<span>Przypomnienia</span></button>' +
      '<button class="tile" data-action="nav" data-view="tips">' + icon('heartPulse') + '<span>Porady</span></button></div>';
    h += '<div class="next-card">' + icon('alarm', 'nc-ic') + '<div class="grow"><b>Kolejny pomiar</b><span>' + esc(nextReminder()) + '</span></div>' +
      '<label class="switch"><input id="push-toggle" type="checkbox" role="switch" aria-label="Przypomnienia na tym urządzeniu"' + (pushOn ? ' checked' : '') + (state.push.busy ? ' disabled' : '') + '><i></i></label></div>';
    var all = C.listReadings(state.data);
    if (all.length) {
      h += protoCard(true);
      h += todayCard();
      var recent = all.slice(-5).reverse();
      h += '<div class="section-head"><h2 class="section-title">Ostatnie pomiary</h2><button class="btn small ghost on-dark" data-action="nav" data-view="history">Wszystkie' + icon('chevR') + '</button></div>';
      h += '<div class="list">' + recent.map(function (r) { return readingRow(r, true); }).join('') + '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------- Widok: Porady ---------- */

  function tipsView() {
    var h = pageBar('Porady', 'home') + '<div class="stack">';
    h += '<div class="card"><h2>' + icon('heartPulse') + 'Jak prawidłowo mierzyć ciśnienie</h2><ol class="tips-list">' +
      '<li>Przez 30 minut przed pomiarem nie pij kawy, nie pal i nie ćwicz.</li>' +
      '<li>Usiądź i odpocznij 5 minut. Plecy oparte, stopy płasko na podłodze, nogi nieskrzyżowane.</li>' +
      '<li>Mankiet na gołym ramieniu, na wysokości serca. Ręka swobodnie podparta.</li>' +
      '<li>Nie rozmawiaj i nie ruszaj się w trakcie pomiaru.</li>' +
      '<li>Zrób 2 pomiary w odstępie 1–2 minut i zapisz oba.</li>' +
      '<li>Mierz rano (po wstaniu, przed lekami i śniadaniem) i wieczorem (przed kolacją).</li>' +
      '<li>Mierz na ręce, na której ciśnienie jest wyższe. Aplikacja zapamięta, którą wybierasz.</li></ol></div>';
    h += '<div class="card"><h2>' + icon('info') + 'Kategorie ciśnienia (ESH 2023)</h2><div class="tips-scale">' + scaleSvg(-1) + '</div>' +
      '<ul class="cat-list scale-list">' + C.CATS.map(function (c) {
        return '<li><span class="mdot cb-' + c.id + '"></span><span class="grow">' + esc(c.long) + '</span><em class="num">' + esc(c.range) + '</em></li>';
      }).join('') + '</ul>' +
      '<p class="help small">O kategorii decyduje wyższa z dwóch wartości. Dla średniej z pomiarów domowych granicą nadciśnienia jest 135/85 mmHg – dlatego to domyślny cel w aplikacji.</p></div>';
    h += '<div class="card danger-card"><h2>' + icon('alert') + 'Kiedy dzwonić pod 112</h2><p class="help">Gdy ciśnienie wynosi 180/110 mmHg lub więcej i towarzyszy mu ból w klatce piersiowej, duszność, silny ból głowy, zaburzenia mowy lub widzenia, osłabienie ręki albo nogi. Bez tych objawów: odpocznij 5 minut, zmierz ponownie i skontaktuj się z lekarzem.</p></div>';
    h += protoCard(false);
    return h + '</div>';
  }

  /* ---------- Widok: Historia ---------- */

  function historyView() {
    var y = state.hist.y, m = state.hist.m;
    var from = C.dateKey(y, m, 1), to = C.dateKey(y, m, C.daysInMonth(y, m));
    var list = C.listReadings(state.data, from, to);
    var cur = C.parseKey(state.today);
    var isNow = y === cur.y && m === cur.m;
    var first = C.firstDate(state.data);
    var canPrev = first ? from > first : false;
    var h = pageBar('Pomiary', 'home', '<button class="bar-btn add" data-action="add" aria-label="Dodaj pomiar">' + icon('plus') + '</button>') + '<div class="stack">';
    h += '<div class="month-nav"><button class="icon-btn" data-action="hist-prev" aria-label="Poprzedni miesiąc"' + (canPrev ? '' : ' disabled') + '>' + icon('chevL') + '</button>' +
      '<div class="label">' + cap(C.MONTHS[m]) + ' ' + y + '</div>' +
      '<button class="icon-btn" data-action="hist-next" aria-label="Następny miesiąc"' + (isNow ? ' disabled' : '') + '>' + icon('chevR') + '</button></div>';
    if (!list.length) {
      h += '<div class="card empty">' + icon('calendar', 'big') + '<b>Brak pomiarów w tym miesiącu</b>' +
        (isNow ? '<span>Dodaj pomiar przyciskiem „+”.</span>' : '') + '</div>';
      return h + '</div>';
    }
    var st = C.stats(list, target());
    var c = C.classify(st.s, st.di);
    h += '<div class="card month-sum"><div><span class="k">Średnia miesiąca</span><b class="num">' + bp(st.s, st.di) + '<small>mmHg</small></b>' + catPill(c) + '</div>' +
      '<div class="ms-grid"><div><span>Pomiary</span><b class="num">' + st.n + '</b></div><div><span>W celu</span><b class="num">' + st.inTargetPct + '%</b></div>' +
      '<div><span>Najwyższe</span><b class="num">' + st.maxS + '/' + st.maxDi + '</b></div><div><span>Tętno</span><b class="num">' + (st.pn ? st.p : '—') + '</b></div></div></div>';
    var byDay = {}, order = [];
    list.forEach(function (r) { if (!byDay[r.d]) { byDay[r.d] = []; order.push(r.d); } byDay[r.d].push(r); });
    order.sort().reverse();
    order.forEach(function (d) {
      var rs = byDay[d].slice().reverse();
      var ds = C.stats(rs);
      h += '<section class="day-group"><div class="day-head"><h3>' + esc(dayHeading(d)) + '</h3>' +
        (rs.length > 1 ? '<span class="num">średnio ' + bp(ds.s, ds.di) + '</span>' : '') + '</div>' +
        '<div class="list">' + rs.map(function (r) { return readingRow(r, false); }).join('') + '</div></section>';
    });
    h += '<div class="btn-row center"><button class="btn small" data-action="print-month">' + icon('print') + 'Raport z miesiąca (PDF)</button></div>';
    return h + '</div>';
  }

  /* ---------- Widok: Statystyki ---------- */

  function periodSeg() {
    return '<div class="seg full red" role="radiogroup" aria-label="Okres">' + C.PERIODS.map(function (p) {
      return '<button role="radio" aria-checked="' + (state.period === p.id) + '" data-action="period" data-p="' + p.id + '">' + p.label + '</button>';
    }).join('') + '</div>';
  }

  function chartsView() {
    var t = target();
    var h = pageBar('Statystyki', 'home') + '<div class="stack">';
    h += periodSeg();
    var rg = C.periodRange(state.period, state.today, state.data);
    var list = C.listReadings(state.data, rg.from, rg.to);
    if (!list.length) {
      h += '<div class="card empty">' + icon('chart', 'big') + '<b>Brak pomiarów w tym okresie</b><span>Po kilku pomiarach zobaczysz tu średnie i wykresy.</span>' +
        '<div class="btn-row center"><button class="btn red" data-action="add">' + icon('plus') + 'Dodaj pomiar</button></div></div>';
      h += protoCard(false);
      return h + '</div>';
    }
    var st = C.stats(list, t);
    var c = C.classify(st.s, st.di);
    var cp = C.chartPoints(list, rg.from, rg.to);
    var unitTxt = { day: 'średnie dzienne', week: 'średnie tygodniowe', month: 'średnie miesięczne' }[cp.unit];
    h += '<div class="card"><h2>Średnie wartości</h2><div class="avg-tiles">' +
      '<div class="avg-t">' + icon('drop') + '<div><b class="num">' + st.s + ' / ' + st.di + '</b><span>mmHg</span></div></div>' +
      '<div class="avg-t">' + icon('heart') + '<div><b class="num">' + (st.pn ? st.p : '—') + '</b><span>ud./min</span></div></div></div>' +
      lineChart(cp.points, t) +
      '<p class="legend"><span class="lg sys"></span>Skurczowe<span class="lg dia"></span>Rozkurczowe<span class="lg-tgt"></span>cel ' + t.ts + '/' + t.td + '</p>' +
      '<p class="help small center">' + unitTxt + ' · ' + nPomiar(st.n) + ' · ' + catPill(c) + '</p></div>';
    var hl = C.headline(list, t, rg.from, rg.to, { d7: 'w ostatnim tygodniu', d30: 'w ostatnim miesiącu', d90: 'w ostatnich 3 miesiącach', y1: 'w ostatnim roku' }[state.period]);
    if (hl) h += '<div class="headline ' + hl.kind + '">' + icon(hl.kind === 'ok' ? 'checkCircle' : 'alert') + '<div><b>' + esc(hl.title) + '</b><span>' + esc(hl.text) + '</span></div></div>';
    var pc = pulseChart(cp.points);
    if (pc) h += '<div class="card"><div class="card-head"><h2>Tętno</h2><span class="muted small">' + (st.pn ? 'od ' + st.minP + ' do ' + st.maxP : '') + '</span></div>' + pc + '</div>';
    var mor = C.stats(C.filterPart(list, 'rano'), t), eve = C.stats(C.filterPart(list, 'wieczor'), t);
    h += '<div class="card"><h2>Rano i wieczorem</h2><div class="pair">' +
      '<div class="pair-i">' + icon('sun') + '<span>Rano</span><b class="num">' + (mor.n ? bp(mor.s, mor.di) : '—') + '</b><em>' + (mor.n ? nPomiar(mor.n) : 'brak') + '</em></div>' +
      '<div class="pair-i">' + icon('moon') + '<span>Wieczorem</span><b class="num">' + (eve.n ? bp(eve.s, eve.di) : '—') + '</b><em>' + (eve.n ? nPomiar(eve.n) : 'brak') + '</em></div></div>' +
      '<div class="kv"><div><span>Najwyższe</span><b class="num">' + st.maxS + '/' + st.maxDi + '</b></div><div><span>Najniższe</span><b class="num">' + st.minS + '/' + st.minDi + '</b></div>' +
      '<div><span>W celu (poniżej ' + t.ts + '/' + t.td + ')</span><b class="num">' + st.inTargetPct + '%</b></div></div></div>';
    h += '<div class="card"><h2>Kategorie pomiarów</h2>' + distBar(st) + '<ul class="cat-list">' + C.CATS.map(function (cc) {
      var n = st.cats[cc.id];
      if (!n) return '';
      return '<li><span class="mdot cb-' + cc.id + '"></span><span class="grow">' + esc(cc.label) + '</span><b class="num">' + n + '</b><em class="num">' + Math.round(n * 100 / st.n) + '%</em></li>';
    }).join('') + '</ul></div>';
    var ins = C.insights(list, t, rg.from, rg.to);
    if (ins.length) {
      h += '<div class="card"><h2>Wnioski</h2><ul class="insights">' + ins.map(function (i) {
        return '<li class="' + i.kind + '">' + icon(i.kind === 'warn' ? 'alert' : i.kind === 'ok' ? 'check' : 'spark') + '<span>' + esc(i.text) + '</span></li>';
      }).join('') + '</ul><p class="help small">Wnioski opisują Twoje pomiary. O leczeniu decyduje lekarz.</p></div>';
    }
    h += protoCard(false);
    h += '<div class="card"><h2>' + icon('print') + 'Raport dla lekarza</h2><p class="help">Wszystkie pomiary z wybranego okresu, średnie (także rano i wieczorem), wykres i tabela. Wydrukuj albo zapisz jako PDF i wyślij.</p>' +
      '<div class="btn-row"><button class="btn red" data-action="print-period">' + icon('print') + 'Utwórz raport</button></div></div>';
    return h + '</div>';
  }

  /* ---------- Widok: Ustawienia ---------- */

  function stepper(field, value, label) {
    return '<div class="stepper"><span class="st-l">' + label + '</span><div class="st-c">' +
      '<button class="icon-btn" data-action="tgt" data-f="' + field + '" data-d="-5" aria-label="' + label + ' mniej">−</button>' +
      '<b class="num">' + value + '</b>' +
      '<button class="icon-btn" data-action="tgt" data-f="' + field + '" data-d="5" aria-label="' + label + ' więcej">+</button></div></div>';
  }

  function hourSelect(id, value, hours) {
    return '<select id="' + id + '" class="input select">' + '<option value="-1"' + (value === -1 ? ' selected' : '') + '>wyłączone</option>' +
      hours.map(function (hh) { return '<option value="' + hh + '"' + (value === hh ? ' selected' : '') + '>' + C.pad(hh) + ':00</option>'; }).join('') + '</select>';
  }

  /* ----- Powiadomienia ----- */

  var PUSH_EP_KEY = 'cisnienie.push.ep';
  var WF_KEY = 'cisnienie.workflow';

  function isIosDevice() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandaloneApp() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function vapidKey() {
    var b64 = VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function swReady() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 4000); })
    ]);
  }

  function deviceLabel() {
    var ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    return 'urządzenie';
  }

  /** Repozytorium z kodem aplikacji (z niego zadanie przypomnień pobiera skrypt). */
  function codeRepo() {
    var m = /^([A-Za-z0-9-]+)\.github\.io$/i.exec(location.hostname || '');
    if (m) {
      var seg = (location.pathname || '/').split('/').filter(Boolean)[0];
      if (seg && !/\./.test(seg)) return m[1] + '/' + seg;
      return m[1] + '/' + m[1] + '.github.io';
    }
    return DEFAULT_CODE_REPO;
  }

  function workflowText() {
    return fetch('tools/przypomnienia.yml', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Nie udało się pobrać zadania przypomnień. Sprawdź internet.');
      return r.text();
    }, function () { throw new Error('Brak internetu. Spróbuj ponownie po połączeniu.'); }).then(function (t) {
      return t.split('__CODE_REPO__').join(codeRepo()).split('__VAPID_PUBLIC__').join(VAPID_PUBLIC);
    });
  }

  function installWorkflow() {
    return workflowText().then(function (t) { return Sync.ensureWorkflow(t); }).then(function (r) {
      Store.lsSet(WF_KEY, APP_VERSION);
      return r;
    });
  }

  function refreshPushState() {
    var p = state.push;
    if (!pushSupported()) {
      p.status = isIosDevice() && !isStandaloneApp() ? 'ios-install' : 'unsupported';
      return Promise.resolve();
    }
    if (Notification.permission === 'denied') { p.status = 'denied'; return Promise.resolve(); }
    return swReady().then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (!sub || Notification.permission !== 'granted') { p.status = 'off'; return; }
      p.status = 'on';
      if (!Sync.getConfig()) return;
      var jobs = [];
      if (Store.lsGet(PUSH_EP_KEY) !== sub.endpoint) {
        jobs.push(Sync.addSubscription(sub.toJSON(), deviceLabel()).then(function () { Store.lsSet(PUSH_EP_KEY, sub.endpoint); }, function () { /* przy następnym uruchomieniu */ }));
      }
      // po aktualizacji aplikacji odśwież zadanie przypomnień w repozytorium (po cichu)
      if (Store.lsGet(WF_KEY) !== APP_VERSION) jobs.push(installWorkflow().then(null, function () { /* spróbuje później */ }));
      return Promise.all(jobs);
    }).catch(function () { p.status = 'off'; });
  }

  function afterPushChange() {
    state.push.busy = false;
    if (state.view === 'settings') refresh();
  }

  function enablePush() {
    var p = state.push;
    if (p.busy) return;
    if (!Sync.getConfig()) {
      showToast('Najpierw włącz kopię na GitHubie (sekcja wyżej). Przypomnienia wysyła Twoje repozytorium z danymi.', { kind: 'error' });
      return;
    }
    p.busy = true; p.error = '';
    refresh();
    // zgoda musi być poproszona od razu po dotknięciu przycisku
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') {
        p.status = perm === 'denied' ? 'denied' : 'off';
        throw new Error(perm === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach telefonu lub przeglądarki.' : 'Nie udzielono zgody na powiadomienia.');
      }
      return swReady();
    }).then(function (reg) {
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });
    }).then(function (sub) {
      return installWorkflow().then(function () {
        return Sync.addSubscription(sub.toJSON(), deviceLabel());
      }).then(function () {
        Store.lsSet(PUSH_EP_KEY, sub.endpoint);
        p.status = 'on';
        showToast('Przypomnienia włączone');
      }, function (e) {
        // zapis w repozytorium się nie udał – wycofaj, żeby stan był spójny
        return sub.unsubscribe().then(null, function () {}).then(function () { throw e; });
      });
    }).then(afterPushChange, function (e) {
      p.error = e && e.message ? e.message : 'Nie udało się włączyć przypomnień.';
      if (p.status === 'on') p.status = 'off';
      afterPushChange();
    });
  }

  function disablePush() {
    var p = state.push;
    if (p.busy) return;
    p.busy = true; p.error = '';
    refresh();
    swReady().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return null;
      var done = function () { Store.lsSet(PUSH_EP_KEY, ''); return sub.unsubscribe(); };
      return Sync.getConfig() ? Sync.removeSubscription(sub.endpoint).then(done) : done();
    }).then(function () {
      p.status = 'off';
      showToast('Przypomnienia wyłączone na tym urządzeniu');
      afterPushChange();
    }, function (e) {
      p.error = e && e.message ? e.message : 'Nie udało się wyłączyć przypomnień.';
      afterPushChange();
    });
  }

  function testPush() {
    swReady().then(function (reg) {
      return reg.showNotification(APP_NAME, {
        body: 'Pora na wieczorny pomiar ciśnienia. Tak będzie wyglądać przypomnienie.',
        icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'cisnienie-test'
      });
    }).then(function () { showToast('Pokazano próbne powiadomienie'); }, function () {
      showToast('Nie udało się pokazać powiadomienia na tym urządzeniu.', { kind: 'error' });
    });
  }

  function remindCard() {
    var p = state.push, c = cfg();
    var h = '<div class="card" id="push-card"><h2>' + icon('bell') + 'Przypomnienia o pomiarze</h2>' +
      '<p class="help">Jeśli o wybranej godzinie nie będzie świeżego pomiaru (z ostatnich 2 godzin), telefon pokaże przypomnienie. Zwykle przychodzi w ciągu kilkunastu minut od tej godziny.</p>' +
      '<div class="hours"><label class="hour">' + icon('sun') + '<span>Rano</span>' + hourSelect('rm-select', c.rm, C.RM_HOURS) + '</label>' +
      '<label class="hour">' + icon('moon') + '<span>Wieczorem</span>' + hourSelect('re-select', c.re, C.RE_HOURS) + '</label></div>';
    if (p.status === 'ios-install') {
      h += '<p class="help">Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu początkowego (Safari → Udostępnij → „Do ekranu początkowego”) i wymagają iOS 16.4 lub nowszego. Otwórz aplikację z ikony i wróć tutaj.</p>';
    } else if (p.status === 'unsupported') {
      h += '<p class="help">Ta przeglądarka nie obsługuje powiadomień z aplikacji.</p>';
    } else if (p.status === 'denied') {
      h += '<div class="banner warn">' + icon('alert') + '<div class="grow">Powiadomienia są zablokowane w ustawieniach telefonu lub przeglądarki dla tej aplikacji. Zezwól na nie i wróć tutaj.</div></div>';
    } else if (p.status === 'on') {
      h += '<div class="banner info">' + icon('check') + '<div class="grow"><strong>Włączone na tym urządzeniu</strong>Godziny wyżej obowiązują na wszystkich Twoich urządzeniach.</div></div>' +
        '<div class="btn-row"><button class="btn small" data-action="push-test">Pokaż próbne powiadomienie</button>' +
        '<button class="btn small danger" data-action="push-disable"' + (p.busy ? ' disabled' : '') + '>Wyłącz</button></div>';
    } else if (p.status === 'checking') {
      h += '<p class="help">Sprawdzam…</p>';
    } else {
      if (!Sync.getConfig()) h += '<p class="help">Wymaga włączonej kopii na GitHubie (sekcja niżej). Przypomnienia wysyła Twoje prywatne repozytorium z danymi.</p>';
      h += '<div class="btn-row"><button class="btn primary" data-action="push-enable"' + (p.busy ? ' disabled' : '') + '>' + icon('bell') + (p.busy ? 'Włączam…' : 'Włącz przypomnienia') + '</button></div>';
    }
    if (p.error) h += '<p class="hint err" role="alert">' + esc(p.error) + '</p>';
    h += '<details class="how"><summary>Jednorazowa konfiguracja (5 minut)</summary><ol>' +
      '<li>Najpierw połącz kopię na GitHubie (sekcja „Kopia bezpieczeństwa”). Token musi mieć dwa uprawnienia: <b>Contents</b> i <b>Workflows</b>, oba „Read and write”.</li>' +
      '<li>W repozytorium z danymi na GitHubie wejdź w <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>.</li>' +
      '<li>W polu <b>Name</b> wpisz <code>VAPID_PRIVATE_KEY</code>, w polu <b>Secret</b> wklej klucz prywatny powiadomień i dotknij <b>Add secret</b>.</li>' +
      '<li>Wróć tutaj i dotknij „Włącz przypomnienia”. Aplikacja sama doda do repozytorium zadanie, które co godzinę sprawdza, czy jest pomiar.</li>' +
      '<li>Test: w repozytorium z danymi otwórz <b>Actions</b> → „Przypomnienia o pomiarze” → <b>Run workflow</b>, zaznacz „Wyślij próbne powiadomienie” i dotknij zielonego <b>Run workflow</b>.</li></ol></details>';
    return h + '</div>';
  }

  function backupCard() {
    var s = state.sync;
    var conf = Sync.getConfig();
    var h = '<div class="card" id="backup"><h2>' + icon('shield') + 'Kopia bezpieczeństwa w GitHub</h2>';
    if (!conf) {
      h += '<p class="help">Po każdym pomiarze aplikacja wyśle kopię do Twojego <b>prywatnego</b> repozytorium. Dzięki temu pomiary są bezpieczne i takie same na telefonie, tablecie i komputerze.</p>';
      h += '<div class="stack" id="connect-form">' +
        '<div class="field"><label for="repo-input">Repozytorium (login/nazwa)</label><input id="repo-input" class="input" type="text" placeholder="lewym90/cisnienie-dane" autocomplete="off" autocapitalize="none" spellcheck="false"></div>' +
        '<div class="field"><label for="token-input">Token dostępu</label><input id="token-input" class="input" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="none" spellcheck="false"></div>' +
        '<p class="hint err" id="connect-error" role="alert"></p>' +
        '<div class="btn-row"><button class="btn primary" data-action="sync-connect">' + icon('shield') + 'Połącz i wyślij kopię</button></div></div>';
      h += '<details class="how"><summary>Jak to ustawić (5 minut)</summary><ol>' +
        '<li>Na <a href="https://github.com/new" target="_blank" rel="noopener noreferrer">github.com/new</a> wpisz nazwę, np. <code>cisnienie-dane</code>, wybierz <b>Private</b>, zaznacz „Add a README file” i dotknij <b>Create repository</b>.</li>' +
        '<li>Otwórz <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">tworzenie tokenu</a>. Nazwa dowolna, np. „Dane ciśnienia”. <b>Expiration</b>: najdłuższy możliwy czas.</li>' +
        '<li><b>Repository access</b> → „Only select repositories” → wybierz <code>cisnienie-dane</code>.</li>' +
        '<li><b>Permissions</b> → „Repository permissions”: <b>Contents</b> → „Read and write” oraz <b>Workflows</b> → „Read and write” (to drugie jest dla przypomnień).</li>' +
        '<li>Dotknij <b>Generate token</b>, skopiuj token i wklej go powyżej razem z nazwą repozytorium (login/nazwa). Na drugim urządzeniu wpisz to samo.</li></ol></details>';
    } else {
      var stateText = { synced: 'Kopia aktualna', pending: 'Czeka na wysłanie', syncing: 'Wysyłanie…', error: 'Wymaga uwagi', off: 'Wyłączona' }[s.state] || '';
      h += '<div class="kv"><div><span>Repozytorium</span><b>' + esc(conf.owner + '/' + conf.repo) + '</b></div>' +
        '<div><span>Stan</span><b>' + stateText + '</b></div>' +
        '<div><span>Ostatnia kopia</span><b>' + (s.lastSync ? esc(new Date(s.lastSync).toLocaleString('pl-PL')) : '—') + '</b></div></div>';
      if (s.error) h += '<div class="banner ' + (s.state === 'error' ? 'error' : 'warn') + '">' + icon('alert') + '<div class="grow">' + esc(s.error) + '</div></div>';
      h += '<p class="help">Każda zmiana to osobny zapis w historii repozytorium, więc można wrócić do dowolnej wcześniejszej wersji.</p>';
      h += '<div class="btn-row"><button class="btn primary" data-action="sync-now">' + icon('refresh') + 'Wyślij kopię teraz</button>' +
        '<button class="btn danger" data-action="sync-disconnect">Odłącz</button></div>';
    }
    return h + '</div>';
  }

  function dataCard() {
    var n = C.countReadings(state.data);
    return '<div class="card"><h2>Twoje dane</h2><p class="help">Zapisanych pomiarów: <b>' + n + '</b>. Kopia (JSON) zawiera wszystko: pomiary, okoliczności, notatki i ustawienia. CSV otworzysz w Excelu. „Wczytaj z pliku” przyjmuje kopię JSON oraz CSV (kolumny: data; godzina; skurczowe; rozkurczowe; tętno) i niczego nie dubluje.</p>' +
      '<div class="btn-row"><button class="btn" data-action="export-json">' + icon('download') + 'Pobierz kopię (JSON)</button>' +
      '<button class="btn" data-action="export-csv"' + (n ? '' : ' disabled') + '>' + icon('download') + 'Pomiary (CSV)</button>' +
      '<button class="btn" data-action="import-pick">' + icon('upload') + 'Wczytaj z pliku</button></div>' +
      '<input id="import-file" class="hidden-file" type="file" accept=".json,.csv,application/json,text/csv,text/plain" tabindex="-1" aria-hidden="true"></div>';
  }

  function installCard() {
    var h = '<div class="card"><h2>Instalacja na tym urządzeniu</h2>';
    if (isStandaloneApp()) {
      h += '<p class="help">Aplikacja jest zainstalowana i działa także bez internetu.</p>';
    } else if (state.installPrompt) {
      h += '<p class="help">Zainstaluj aplikację jak zwykłą aplikację – z ikoną na ekranie i pełnym ekranem.</p><div class="btn-row"><button class="btn primary" data-action="install">Zainstaluj aplikację</button></div>';
    } else if (isIosDevice()) {
      h += '<p class="help">Otwórz tę stronę w Safari, dotknij przycisku Udostępnij (kwadrat ze strzałką), przewiń w dół i wybierz „Do ekranu początkowego”, a potem „Dodaj”.</p>';
    } else {
      h += '<p class="help">W menu przeglądarki wybierz „Zainstaluj aplikację” (komputer) albo „Dodaj do ekranu głównego” (Android).</p>';
    }
    return h + '</div>';
  }

  function scaleCard() {
    return '<details class="card tips"><summary>' + icon('info') + '<span>Kategorie ciśnienia (ESH 2023)</span>' + icon('chevR', 'chev') + '</summary>' +
      '<ul class="cat-list scale-list">' + C.CATS.map(function (c) {
        return '<li><span class="mdot cb-' + c.id + '"></span><span class="grow">' + esc(c.long) + '</span><em class="num">' + esc(c.range) + '</em></li>';
      }).join('') + '</ul>' +
      '<p class="help small">O kategorii decyduje wyższa z dwóch wartości. Kategorie dotyczą pojedynczego pomiaru. Dla średniej z pomiarów domowych granicą nadciśnienia jest 135/85 mmHg – dlatego to domyślny cel w aplikacji.</p></details>';
  }

  function settingsView() {
    var st = state.settings, c = cfg();
    var h = pageBar('Profil', 'home') + '<div class="stack"><div class="center-row"><span class="pill-slot">' + pillHtml() + '</span></div>';
    h += '<div class="card"><h2>Twój cel</h2><p class="help">Pomiar jest „w celu”, gdy oba ciśnienia są poniżej tych wartości. Domyślnie 135/85 – granica dla pomiarów domowych. Jeśli lekarz ustalił inny cel, wpisz go tutaj.</p>' +
      '<div class="steppers">' + stepper('ts', c.ts, 'Skurczowe') + stepper('td', c.td, 'Rozkurczowe') + '</div>' +
      (c.ts !== 135 || c.td !== 85 ? '<div class="btn-row"><button class="btn small ghost" data-action="tgt-reset">Przywróć 135/85</button></div>' : '') + '</div>';
    h += remindCard();
    h += backupCard();
    h += '<div class="card"><h2>Imię i nazwisko</h2><p class="help">Opcjonalnie. Pojawia się na raporcie dla lekarza i w powitaniu.</p>' +
      '<input id="name-input" class="input" type="text" maxlength="' + C.NAME_MAX + '" autocomplete="name" placeholder="np. Jan Kowalski" value="' + esc(c.nm) + '"></div>';
    h += '<div class="card"><h2>Wygląd</h2><p class="help">Automatycznie dopasowuje się do ustawień telefonu.</p>' +
      '<div class="seg full" role="radiogroup" aria-label="Motyw">' +
      [['auto', 'Automatyczny'], ['light', 'Jasny'], ['dark', 'Ciemny']].map(function (t) {
        return '<button role="radio" aria-checked="' + (st.theme === t[0]) + '" data-action="theme" data-theme="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div></div>';
    h += dataCard();
    h += scaleCard();
    h += installCard();
    h += '<div class="card"><h2>O aplikacji</h2><div class="kv"><div><span>Wersja</span><b>' + APP_VERSION + '</b></div>' +
      '<div><span>Dane</span><b>Na tym urządzeniu i w Twoim repozytorium</b></div></div>' +
      '<p class="help small">Aplikacja ' + APP_NAME + ' to dzienniczek pomiarów. Nie stawia diagnozy i nie zastępuje porady lekarza.</p></div>';
    h += '</div>';
    return h;
  }

  /* ---------- Raporty do druku ---------- */

  function reportHtml(from, to, title) {
    var t = target(), c = cfg();
    var list = C.listReadings(state.data, from, to);
    var st = C.stats(list, t);
    var mor = C.stats(C.filterPart(list, 'rano')), eve = C.stats(C.filterPart(list, 'wieczor'));
    var cp = C.chartPoints(list, from, to);
    var h = '<div class="rep">';
    h += '<header class="rep-head"><div><h1>' + esc(title) + '</h1><p>' + (c.nm ? '<b>' + esc(c.nm) + '</b> · ' : '') + esc(C.plDate(from) + ' – ' + C.plDate(to)) + '</p></div>' +
      '<div class="rep-brand">' + APP_NAME + '<span>wydruk ' + esc(C.plDate(state.today)) + '</span></div></header>';
    if (!list.length) return h + '<p>Brak pomiarów w tym okresie.</p></div>';
    h += '<table class="rep-sum"><tr><th>Średnia</th><th>Rano</th><th>Wieczorem</th><th>Najwyższe</th><th>Najniższe</th><th>Tętno</th><th>Pomiary</th></tr>' +
      '<tr><td><b>' + bp(st.s, st.di) + '</b></td><td>' + (mor.n ? bp(mor.s, mor.di) : '—') + '</td><td>' + (eve.n ? bp(eve.s, eve.di) : '—') + '</td>' +
      '<td>' + st.maxS + '/' + st.maxDi + '</td><td>' + st.minS + '/' + st.minDi + '</td><td>' + (st.pn ? st.p + ' (' + st.minP + '–' + st.maxP + ')' : '—') + '</td><td>' + st.n + '</td></tr></table>';
    h += '<p class="rep-note">Ciśnienie w mmHg, tętno w uderzeniach na minutę. Cel: poniżej ' + t.ts + '/' + t.td + ' (w celu ' + st.inTargetPct + '% pomiarów). ' +
      C.CATS.filter(function (cc) { return st.cats[cc.id]; }).map(function (cc) { return cc.label + ': ' + st.cats[cc.id]; }).join(', ') + '.</p>';
    h += '<div class="rep-chart">' + rangeChart(cp.points, t, cp.unit) + '</div>';
    h += '<table class="rep-table"><thead><tr><th>Data</th><th>Godzina</th><th>Ciśnienie</th><th>Tętno</th><th>Kategoria</th><th>Uwagi</th></tr></thead><tbody>';
    var prevD = '';
    list.forEach(function (r) {
      var cc = catOf(r);
      h += '<tr' + (r.d !== prevD ? ' class="nd"' : '') + '><td>' + (r.d !== prevD ? esc(C.WEEKDAYS_SHORT[C.weekdayOfKey(r.d)] + ' ' + C.plDate(r.d)) : '') + '</td><td>' + r.h + '</td>' +
        '<td><b>' + bp(r.s, r.di) + '</b></td><td>' + (r.p || '') + '</td><td><span class="rd cb-' + cc.id + '"></span>' + esc(cc.label) + '</td><td>' + esc(tagsLine(r)) + '</td></tr>';
      prevD = r.d;
    });
    h += '</tbody></table>';
    h += '<p class="rep-foot">Kategorie według wytycznych ESH 2023. Granica nadciśnienia dla średniej z pomiarów domowych: 135/85 mmHg. Dzienniczek prowadzony w aplikacji ' + APP_NAME + '.</p>';
    return h + '</div>';
  }

  function protoReportHtml() {
    var p = C.protocol(state.data, state.today, target());
    if (!p) return '';
    var c = cfg();
    var h = '<div class="rep"><header class="rep-head"><div><h1>Tydzień domowych pomiarów ciśnienia</h1><p>' + (c.nm ? '<b>' + esc(c.nm) + '</b> · ' : '') +
      esc(C.plDate(p.start) + ' – ' + C.plDate(p.end)) + '</p></div><div class="rep-brand">' + APP_NAME + '<span>wydruk ' + esc(C.plDate(state.today)) + '</span></div></header>';
    var r = p.result;
    h += '<table class="rep-sum"><tr><th>Średnia z dni 2–7</th><th>Liczba pomiarów (dni 2–7)</th><th>Tętno</th></tr><tr><td><b>' + (r.n ? bp(r.s, r.di) : '—') + '</b></td><td>' + r.n + '</td><td>' + (r.pn ? r.p : '—') + '</td></tr></table>';
    h += '<p class="rep-note">Protokół: 7 dni, rano i wieczorem po 2 pomiary. Pierwszy dzień nie jest liczony do średniej. Granica nadciśnienia dla pomiarów domowych: 135/85 mmHg.</p>';
    h += '<table class="rep-table"><thead><tr><th>Dzień</th><th>Data</th><th>Rano</th><th>Wieczorem</th><th>Inne</th></tr></thead><tbody>';
    p.days.forEach(function (d) {
      var l = C.listReadings(state.data, d.key, d.key);
      function cell(part) {
        return C.filterPart(l, part).map(function (x) { return x.h + ' <b>' + bp(x.s, x.di) + '</b>' + (x.p ? ' · ' + x.p : ''); }).join('<br>') || '—';
      }
      var other = l.filter(function (x) { var pp = C.dayPart(x.h); return pp !== 'rano' && pp !== 'wieczor'; })
        .map(function (x) { return x.h + ' <b>' + bp(x.s, x.di) + '</b>'; }).join('<br>');
      h += '<tr class="nd"><td>' + d.no + (d.no === 1 ? ' (nie liczony)' : '') + '</td><td>' + esc(C.WEEKDAYS_SHORT[C.weekdayOfKey(d.key)] + ' ' + C.plDate(d.key)) + '</td><td>' + cell('rano') + '</td><td>' + cell('wieczor') + '</td><td>' + (other || '—') + '</td></tr>';
    });
    h += '</tbody></table><p class="rep-foot">Dzienniczek prowadzony w aplikacji ' + APP_NAME + '. Ciśnienie w mmHg, tętno w uderzeniach na minutę.</p></div>';
    return h;
  }

  function isIosStandalone() { return window.navigator.standalone === true; }

  /** Drukuje raport (z druku można zapisać PDF). Na iPhonie w trybie aplikacji druk nie działa, więc pobierany jest plik do otwarcia w Safari. */
  function printReport(html, title) {
    if (isIosStandalone()) {
      fetch('css/report.css').then(function (r) { return r.text(); }).then(function (css) {
        var doc = '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<title>' + esc(title) + '</title><style>' + css + '</style></head><body class="doc">' + html +
          '<p class="noprint">Aby zapisać PDF albo wydrukować: dotknij Udostępnij i wybierz „Drukuj”, potem rozsuń podgląd dwoma palcami i wybierz Udostępnij → „Zachowaj w Plikach”.</p></body></html>';
        download(title.replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ\-]+/g, '-') + '.html', doc, 'text/html');
      }, function () { showToast('Nie udało się przygotować raportu.', { kind: 'error' }); });
      return;
    }
    var root = $('print-root');
    if (!root) return;
    root.innerHTML = html;
    document.body.classList.add('printing');
    var prevTitle = document.title;
    document.title = title;
    var done = function () {
      document.body.classList.remove('printing');
      document.title = prevTitle;
      root.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); showToast('Drukowanie nie jest dostępne w tej przeglądarce.', { kind: 'error' }); }
  }

  /* ---------- Rysowanie ---------- */

  var VIEWS = { home: homeView, history: historyView, charts: chartsView, settings: settingsView, tips: tipsView };

  function renderView() {
    var v = $('view');
    if (!v) return;
    v.className = 'view view-' + state.view;
    document.body.classList.toggle('on-home', state.view === 'home');
    v.innerHTML = VIEWS[state.view]();
    renderNav();
    renderPill();
    startBeats();
  }

  /** Serce bije w rytmie ostatnio zmierzonego tętna. */
  function startBeats() {
    var last = C.lastReading(state.data);
    var p = last && last.p ? last.p : 66;
    var els = document.querySelectorAll('.beat');
    for (var i = 0; i < els.length; i++) els[i].style.animationDuration = (60 / p).toFixed(3) + 's';
  }

  /** Odświeża bieżący widok, nie zmieniając przewijania i nie przerywając pisania w polu tekstowym. */
  function refresh() {
    var a = document.activeElement;
    if (a && a.id && /^(repo-input|token-input|name-input)$/.test(a.id)) { renderPill(); state.deferred = true; return; }
    var y = window.scrollY;
    renderView();
    if (y) window.scrollTo(0, y);
  }

  function go(view) {
    state.view = view;
    renderView();
    applyTheme();
    window.scrollTo(0, 0);
  }

  /* ---------- Ekran dodawania pomiaru ---------- */

  var ignorePop = 0;
  var lastFocus = null;
  var FIELDS = ['s', 'di', 'p'];
  var FIELD_UI = {
    s: { label: 'Ciśnienie skurczowe', sub: 'górne · SYS', unit: 'mmHg', ph: '120' },
    di: { label: 'Ciśnienie rozkurczowe', sub: 'dolne · DIA', unit: 'mmHg', ph: '80' },
    p: { label: 'Puls', sub: 'opcjonalnie', unit: 'ud./min', ph: '70' }
  };

  var MONITOR = '<img class="monitor-img" src="icons/cisnieniomierz.jpg" alt="" width="800" height="420" decoding="async">';

  function openEditor(id) {
    var r = id ? C.getReading(state.data, id) : null;
    if (id && !r) return;
    lastFocus = document.activeElement;
    var now = new Date();
    state.editor = r ? {
      id: id, isNew: false, d: r.d, h: r.h, vals: { s: String(r.s), di: String(r.di), p: r.p ? String(r.p) : '' },
      arm: r.a || '', g: (r.g || []).slice(), n: r.n || '', when: false, err: '', errField: ''
    } : {
      id: null, isNew: true, d: C.todayKey(now), h: C.nowTime(now), vals: { s: '', di: '', p: '' },
      arm: state.settings.arm || '', g: [], n: '', when: false, err: '', errField: ''
    };
    try { history.pushState({ scModal: true }, ''); } catch (e) { /* ignoruj */ }
    renderModal();
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    var first = $('ed-in-s');
    if (fine && first) first.focus();
    else { var pg = document.querySelector('#modal-root .page-modal'); if (pg) pg.focus(); }
  }

  function closeEditor() {
    if (!state.editor) return;
    stopRepeat();
    state.editor = null;
    if (history.state && history.state.scModal) {
      ignorePop++;
      history.back();
    }
    renderModal();
    if (lastFocus && document.body.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignoruj */ } }
  }

  function whenLabel(e) {
    return (e.d === state.today ? 'Dziś' : dayLabel(e.d)) + ', ' + e.h;
  }

  function fieldRow(f) {
    var u = FIELD_UI[f], e = state.editor;
    var last = C.lastReading(state.data);
    var ph = last ? (f === 'p' ? (last.p ? String(last.p) : '–') : String(last[f])) : u.ph;
    return '<div class="frow" id="ed-row-' + f + '"><div class="f-l"><span>' + u.label + '</span>' + icon('heart', 'f-ic') + '<em>' + u.sub + '</em></div>' +
      '<button type="button" class="stp" data-f="' + f + '" data-d="-1" aria-label="' + u.label + ': mniej">−</button>' +
      '<label class="f-v"><input id="ed-in-' + f + '" class="f-in num" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" enterkeyhint="' + (f === 'p' ? 'done' : 'next') + '" placeholder="' + ph + '" aria-label="' + u.label + ' (' + u.unit + ')" value="' + esc(e.vals[f]) + '"><span>' + u.unit + '</span></label>' +
      '<button type="button" class="stp" data-f="' + f + '" data-d="1" aria-label="' + u.label + ': więcej">+</button></div>';
  }

  function renderModal() {
    var root = $('modal-root');
    var e = state.editor;
    if (!e) { root.innerHTML = ''; document.body.classList.remove('modal-open'); return; }
    document.body.classList.add('modal-open');
    root.innerHTML =
      '<div class="page-modal" role="dialog" aria-modal="true" aria-labelledby="ed-title" tabindex="-1">' +
      '<header class="bar"><button class="bar-btn" data-action="editor-cancel" aria-label="Wróć">' + icon('chevL') + '</button>' +
      '<h1 id="ed-title">' + (e.isNew ? 'Dodaj pomiar' : 'Popraw pomiar') + '</h1>' +
      (e.isNew ? '<span class="bar-btn" aria-hidden="true"></span>' : '<button class="bar-btn danger" data-action="editor-delete" aria-label="Usuń pomiar">' + icon('trash') + '</button>') + '</header>' +
      '<div class="pm-body">' +
      '<div class="monitor-wrap">' + MONITOR + '</div>' +
      '<div class="fcard">' + fieldRow('s') + fieldRow('di') + fieldRow('p') + '</div>' +
      '<div class="preview" id="ed-preview" aria-live="polite"></div>' +
      '<div class="f-sec"><span class="f-cap">Data i godzina</span>' +
      '<button class="when-btn" data-action="ed-when" aria-expanded="' + e.when + '">' + icon('calendar') + '<span id="ed-when-l">' + esc(whenLabel(e)) + '</span>' + icon('chevR', 'chev') + '</button>' +
      '<div class="when-row" id="ed-when-row"' + (e.when ? '' : ' hidden') + '>' +
      '<label><span>Data</span><input id="ed-date" class="input" type="date" max="' + state.today + '" value="' + e.d + '"></label>' +
      '<label><span>Godzina</span><input id="ed-time" class="input" type="time" value="' + e.h + '"></label></div></div>' +
      '<div class="f-sec"><span class="f-cap">Notatka (opcjonalnie)</span>' +
      '<label class="note-wrap">' + icon('edit') + '<input id="ed-note" class="note-in" type="text" maxlength="' + C.NOTE_MAX + '" autocomplete="off" enterkeyhint="done" placeholder="np. po treningu" value="' + esc(e.n) + '" aria-label="Notatka"></label></div>' +
      '<div class="f-sec"><span class="f-cap">Okoliczności (opcjonalnie)</span><div class="chips" id="ed-tags">' + tagChips(e.g) + '</div></div>' +
      '<div class="f-sec ex-row"><span class="f-cap">Ręka</span><div class="seg small" role="radiogroup" aria-label="Ręka">' +
      [['L', 'Lewa'], ['P', 'Prawa']].map(function (a) {
        return '<button role="radio" aria-checked="' + (e.arm === a[0]) + '" data-action="ed-arm" data-a="' + a[0] + '">' + a[1] + '</button>';
      }).join('') + '</div></div>' +
      '</div>' +
      '<div class="pm-foot"><button class="btn red block big" data-action="editor-save" id="ed-save">' + icon('check') + 'Zapisz pomiar</button></div>' +
      '</div>';
    updateEditor();
  }

  function tagChips(g) {
    return C.TAGS.map(function (t) {
      return '<button type="button" class="chip tiny' + (t.id === 'arytmia' ? ' warnish' : '') + '" data-action="ed-tag" data-tag="' + t.id + '" aria-pressed="' + (g.indexOf(t.id) >= 0) + '">' + t.label + '</button>';
    }).join('');
  }

  function edInt(v) { return v === '' ? null : parseInt(v, 10); }

  /** Podgląd kategorii i komunikat błędu (bez przebudowy ekranu, więc pole nie traci fokusu). */
  function updateEditor() {
    var e = state.editor;
    if (!e) return;
    var s = edInt(e.vals.s), di = edInt(e.vals.di), p = edInt(e.vals.p);
    FIELDS.forEach(function (f) {
      var row = $('ed-row-' + f);
      if (row) row.classList.toggle('bad', e.errField === f);
    });
    var pv = $('ed-preview');
    if (!pv) return;
    var ok = s !== null && di !== null && C.checkValues(s, di, p).ok;
    if (e.err) {
      pv.className = 'preview err';
      pv.innerHTML = icon('alert') + '<span>' + esc(e.err) + '</span>';
    } else if (ok) {
      pv.className = 'preview';
      pv.innerHTML = statusChip(C.classify(s, di));
    } else {
      pv.className = 'preview hint-only';
      pv.innerHTML = '<span>' + (C.lastReading(state.data) ? 'Szare liczby to Twój ostatni pomiar. Wpisz nowy wynik albo użyj − i +.' : 'Wpisz wynik z ciśnieniomierza albo użyj − i +.') + '</span>';
    }
  }

  /** Wpisywanie w pole liczby: tylko cyfry, bez zera na początku; pełna liczba przenosi do następnego pola. */
  function onFieldInput(inp) {
    var e = state.editor;
    if (!e) return;
    var f = inp.id.slice(6);
    var v = inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3);
    if (v !== inp.value) inp.value = v;
    e.vals[f] = v;
    e.err = ''; e.errField = '';
    updateEditor();
    var i = FIELDS.indexOf(f);
    if (v && i < 2 && (v.length === 3 || parseInt(v, 10) * 10 > C.LIMITS[f].max)) {
      var next = $('ed-in-' + FIELDS[i + 1]);
      if (next) { next.focus(); try { next.select(); } catch (er) { /* ignoruj */ } }
    }
  }

  /** Krok przycisku − / +. Puste pole zaczyna od ostatniego pomiaru (albo 120/80/70). */
  function stepField(f, d) {
    var e = state.editor;
    if (!e) return;
    var inp = $('ed-in-' + f);
    var v = edInt(e.vals[f]);
    if (v === null || isNaN(v)) {
      var last = C.lastReading(state.data);
      var base = { s: last ? last.s : 120, di: last ? last.di : 80, p: last && last.p ? last.p : 70 }[f];
      v = base;
    } else {
      v = Math.max(C.LIMITS[f].min, Math.min(C.LIMITS[f].max, v + d));
    }
    e.vals[f] = String(v);
    if (inp) inp.value = e.vals[f];
    e.err = ''; e.errField = '';
    updateEditor();
  }

  var repeat = { t1: null, t2: null };
  function stopRepeat() {
    clearTimeout(repeat.t1); clearInterval(repeat.t2);
    repeat.t1 = repeat.t2 = null;
  }
  function startRepeat(f, d) {
    stopRepeat();
    stepField(f, d);
    repeat.t1 = setTimeout(function () {
      repeat.t2 = setInterval(function () { stepField(f, d); }, 70);
    }, 420);
  }

  function readWhen() {
    var e = state.editor;
    var di = $('ed-date'), ti = $('ed-time');
    if (e.when && di && ti) {
      if (C.parseKey(di.value)) e.d = di.value;
      if (C.parseTime(ti.value) !== null) e.h = ti.value;
    }
  }

  function readFields() {
    var e = state.editor;
    FIELDS.forEach(function (f) {
      var inp = $('ed-in-' + f);
      if (inp) e.vals[f] = inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3);
    });
  }

  function editorSave() {
    var e = state.editor;
    if (!e) return;
    readWhen();
    readFields();
    e.n = $('ed-note') ? $('ed-note').value : e.n;
    var s = edInt(e.vals.s), di = edInt(e.vals.di), p = edInt(e.vals.p);
    var chk = C.checkValues(s, di, p);
    if (!chk.ok) {
      e.err = chk.error;
      e.errField = chk.field;
      updateEditor();
      var row = $('ed-row-' + chk.field);
      if (row) { bumpEl(row); if (row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    var now = new Date();
    var today = C.todayKey(now);
    if (e.d > today || (e.d === today && C.parseTime(e.h) > C.parseTime(C.nowTime(now)) + 5)) {
      e.err = 'Pomiar nie może być z przyszłości. Popraw datę lub godzinę.';
      e.errField = '';
      e.when = true;
      renderModal();
      return;
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var proceed = C.unusualValues(s, di, p || 0) ? confirmDialog({
      title: 'Sprawdź wynik',
      text: 'Wynik ' + bp(s, di) + (p ? ', puls ' + p : '') + ' jest nietypowy. Upewnij się, że wpisano go bez pomyłki.',
      ok: 'Zapisz', cancel: 'Popraw'
    }) : Promise.resolve(true);
    proceed.then(function (yes) {
      if (!yes || state.editor !== e) return;
      var id = e.id || C.newId(Date.now());
      var before = state.data.r[id] || null;
      var rec = { d: e.d, h: e.h, s: s, di: di, p: p || 0, a: e.arm, g: e.g, n: e.n };
      commit(C.setReading(state.data, id, rec, Date.now()));
      if (e.arm && e.arm !== state.settings.arm) { state.settings.arm = e.arm; Store.saveSettings(state.settings); }
      closeEditor();
      var pk = C.parseKey(e.d);
      state.hist = { y: pk.y, m: pk.m };
      refresh();
      showToast((e.isNew ? 'Zapisano ' : 'Poprawiono ') + bp(s, di), { undo: function () { restore(id, before); } });
      if (C.isCrisis(s, di)) {
        confirmDialog({
          title: 'Bardzo wysokie ciśnienie',
          text: 'Usiądź, odpocznij 5 minut i zmierz ponownie. Jeśli wynik się powtarza, skontaktuj się z lekarzem. Gdy towarzyszy mu ból w klatce piersiowej, duszność, silny ból głowy, zaburzenia mowy lub widzenia albo osłabienie ręki – natychmiast dzwoń pod 112.',
          ok: 'Rozumiem', cancel: null, danger: true
        });
      }
    });
  }

  function restore(id, before) {
    var d;
    if (before && !before.x) d = C.setReading(state.data, id, before, Date.now());
    else d = C.setReading(state.data, id, null, Date.now());
    commit(d);
    refresh();
    showToast('Cofnięto');
  }

  function editorDelete() {
    var e = state.editor;
    if (!e || !e.id) return;
    var before = state.data.r[e.id];
    var r = C.getReading(state.data, e.id);
    commit(C.setReading(state.data, e.id, null, Date.now()));
    closeEditor();
    refresh();
    showToast('Usunięto ' + bp(r.s, r.di), { undo: function () { restore(e.id, before); } });
  }

  /* ---------- Okno potwierdzenia ---------- */

  var confirmResolve = null;

  function confirmDialog(o) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      var root = $('confirm-root');
      root.innerHTML =
        '<div class="backdrop top-layer" id="cf-backdrop"><div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-text">' +
        '<div class="grab"></div><h2 id="cf-title">' + esc(o.title) + '</h2><p class="sub" id="cf-text">' + esc(o.text) + '</p>' +
        '<div class="actions"><button class="btn ' + (o.danger ? 'danger solid' : 'primary') + ' block" data-action="confirm-yes">' + esc(o.ok) + '</button>' +
        (o.cancel === null ? '' : '<button class="btn ghost block" data-action="confirm-no">' + esc(o.cancel || 'Anuluj') + '</button>') + '</div></div></div>';
      var first = root.querySelector('[data-action="confirm-no"]') || root.querySelector('[data-action="confirm-yes"]');
      if (first) first.focus();
    });
  }

  function closeConfirm(result) {
    $('confirm-root').innerHTML = '';
    var r = confirmResolve;
    confirmResolve = null;
    if (r) r(result);
  }

  /* ---------- Komunikaty ---------- */

  var toastSeq = 0;
  var toastActions = {};

  function showToast(msg, o) {
    o = o || {};
    var root = $('toasts');
    if (!root) return;
    for (var i = root.children.length - 1; i >= 0; i--) {
      if (root.children[i].id !== 'update-toast') root.removeChild(root.children[i]);
    }
    var id = 't' + (++toastSeq);
    var el = document.createElement('div');
    el.className = 'toast' + (o.kind === 'error' ? ' error' : '');
    el.id = id;
    var html = '<span class="msg">' + esc(msg) + '</span>';
    if (o.undo) {
      toastActions[id] = o.undo;
      html += '<button data-action="toast-undo" data-id="' + id + '">Cofnij</button>';
    }
    el.innerHTML = html;
    root.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      delete toastActions[id];
    }, o.undo ? 7000 : (o.kind === 'error' ? 9000 : 3800));
  }

  /* ---------- Pliki ---------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && navigator.canShare && typeof File !== 'undefined') {
      try {
        var f = new File([blob], filename, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: filename }).catch(function () { /* anulowano */ });
          return;
        }
      } catch (e) { /* zwykłe pobranie */ }
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Plik jest za duży (maks. 5 MB).', { kind: 'error' }); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var isJson = /^\s*\{/.test(text);
      if (isJson) {
        var parsed;
        try { parsed = C.validate(JSON.parse(text)); } catch (e) { parsed = { error: true }; }
        if (parsed.error) { showToast('To nie jest poprawny plik kopii.', { kind: 'error' }); return; }
        if (parsed.foreign) { showToast('To kopia innej aplikacji.', { kind: 'error' }); return; }
        var before = C.countReadings(state.data);
        var merged = C.merge(state.data, parsed.data);
        if (C.sameData(merged, state.data)) { showToast('Wszystkie pomiary z pliku już są w aplikacji.'); return; }
        commit(merged);
        refresh();
        var added = C.countReadings(merged) - before;
        showToast('Wczytano kopię' + (added > 0 ? ': ' + nPomiar(added) + ' więcej' : '') + (parsed.dropped ? ' (pominięto ' + parsed.dropped + ' błędnych)' : ''));
        return;
      }
      var r = C.parseCsv(text);
      if (r.error) { showToast(r.error, { kind: 'error' }); return; }
      var res = C.addEntries(state.data, r.entries, Date.now());
      if (res.added) { commit(res.data); refresh(); }
      var msg = res.added ? 'Dodano ' + nPomiar(res.added) : 'Nic nowego do dodania';
      if (res.existing) msg += ', ' + res.existing + ' już było';
      if (r.skipped.length) msg += '. Pominięto wiersze: ' + r.skipped.slice(0, 8).join(', ') + (r.skipped.length > 8 ? '…' : '');
      showToast(msg + '.', r.skipped.length ? { kind: 'error' } : undefined);
    };
    reader.onerror = function () { showToast('Nie udało się odczytać pliku.', { kind: 'error' }); };
    reader.readAsText(file);
  }

  /* ---------- Kopia: łączenie ---------- */

  function setHint(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('err', !!isError);
  }

  function connect() {
    if (state.connecting) return;
    var repo = Sync.parseRepo($('repo-input').value);
    var token = $('token-input').value;
    var err = $('connect-error');
    if (!repo) { setHint(err, 'Wpisz repozytorium w formie login/nazwa, np. lewym90/cisnienie-dane.', true); return; }
    if (!token.trim()) { setHint(err, 'Wklej token dostępu.', true); return; }
    state.connecting = true;
    setHint(err, 'Łączę z GitHubem…', false);
    var btn = document.querySelector('[data-action="sync-connect"]');
    if (btn) btn.disabled = true;
    Sync.connect(repo.owner, repo.repo, token).then(function () {
      state.connecting = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      showToast('Kopia połączona i wysłana');
      refreshPushState().then(refresh, refresh);
    }, function (e) {
      state.connecting = false;
      if (btn) btn.disabled = false;
      setHint($('connect-error'), e && e.message ? e.message : 'Nie udało się połączyć.', true);
    });
  }

  /* ---------- Zdarzenia ---------- */

  function handleAction(el) {
    var a = el.getAttribute('data-action');
    switch (a) {
      case 'nav': go(el.getAttribute('data-view')); break;
      case 'goto-charts': go('charts'); break;
      case 'goto-backup':
        go('settings');
        if ($('backup') && $('backup').scrollIntoView) $('backup').scrollIntoView({ block: 'start' });
        break;
      case 'add': openEditor(null); break;
      case 'edit': openEditor(el.getAttribute('data-id')); break;
      case 'goto-remind':
        go('settings');
        if ($('push-card') && $('push-card').scrollIntoView) $('push-card').scrollIntoView({ block: 'start' });
        break;
      case 'ed-arm':
        state.editor.arm = state.editor.arm === el.getAttribute('data-a') ? '' : el.getAttribute('data-a');
        var arms = document.querySelectorAll('[data-action="ed-arm"]');
        for (var i = 0; i < arms.length; i++) arms[i].setAttribute('aria-checked', String(arms[i].getAttribute('data-a') === state.editor.arm));
        break;
      case 'ed-tag':
        var g = state.editor.g, tg = el.getAttribute('data-tag');
        var at = g.indexOf(tg);
        if (at >= 0) g.splice(at, 1);
        else {
          g.push(tg);
          // „przed lekami” i „po lekach” wykluczają się
          if (tg === 'przed' && g.indexOf('po') >= 0) g.splice(g.indexOf('po'), 1);
          if (tg === 'po' && g.indexOf('przed') >= 0) g.splice(g.indexOf('przed'), 1);
        }
        state.editor.g = C.cleanTags(g);
        $('ed-tags').innerHTML = tagChips(state.editor.g);
        break;
      case 'ed-when':
        var ed = state.editor;
        ed.when = !ed.when;
        var row = $('ed-when-row');
        if (row) row.hidden = !ed.when;
        el.setAttribute('aria-expanded', String(ed.when));
        break;
      case 'editor-save': editorSave(); break;
      case 'editor-cancel': closeEditor(); break;
      case 'editor-delete': editorDelete(); break;
      case 'confirm-yes': closeConfirm(true); break;
      case 'confirm-no': closeConfirm(false); break;
      case 'toast-undo':
        var tid = el.getAttribute('data-id');
        var fn = toastActions[tid];
        delete toastActions[tid];
        var t = $(tid);
        if (t) t.remove();
        if (fn) fn();
        break;
      case 'hist-prev':
        state.hist.m--; if (state.hist.m < 0) { state.hist.m = 11; state.hist.y--; }
        renderView();
        break;
      case 'hist-next':
        state.hist.m++; if (state.hist.m > 11) { state.hist.m = 0; state.hist.y++; }
        renderView();
        break;
      case 'period': state.period = el.getAttribute('data-p'); refresh(); break;
      case 'proto-start':
        updateCfg({ ps: state.today });
        refresh();
        showToast('Tydzień pomiarów rozpoczęty. Dziś dzień 1 z 7.');
        break;
      case 'proto-stop':
        var pr = C.protocol(state.data, state.today, target());
        var stop = function () { updateCfg({ ps: '' }); refresh(); };
        if (pr && !pr.done && !pr.notStarted) {
          confirmDialog({ title: 'Przerwać tydzień pomiarów?', text: 'Pomiary zostaną w historii, zniknie tylko licznik dni.', ok: 'Przerwij', cancel: 'Wróć', danger: true })
            .then(function (yes) { if (yes) stop(); });
        } else stop();
        break;
      case 'print-period':
        var rg = C.periodRange(state.period, state.today, state.data);
        printReport(reportHtml(rg.from, rg.to, 'Dzienniczek pomiarów ciśnienia'), 'Ciśnienie ' + C.plDate(rg.from) + '-' + C.plDate(rg.to));
        break;
      case 'print-month':
        var y = state.hist.y, m = state.hist.m;
        var f = C.dateKey(y, m, 1), to = C.dateKey(y, m, C.daysInMonth(y, m));
        if (to > state.today) to = state.today;
        printReport(reportHtml(f, to, 'Dzienniczek pomiarów ciśnienia – ' + C.MONTHS[m] + ' ' + y), 'Ciśnienie ' + C.MONTHS[m] + ' ' + y);
        break;
      case 'print-proto':
        printReport(protoReportHtml(), 'Tydzień pomiarów ciśnienia');
        break;
      case 'tgt':
        var c = cfg(), fld = el.getAttribute('data-f'), d = +el.getAttribute('data-d');
        var patch = {};
        patch[fld] = c[fld] + d;
        if (fld === 'ts' && (patch.ts < 100 || patch.ts > 180 || patch.ts <= c.td + 10)) { bumpEl(el); break; }
        if (fld === 'td' && (patch.td < 60 || patch.td > 110 || patch.td >= c.ts - 10)) { bumpEl(el); break; }
        updateCfg(patch);
        refresh();
        break;
      case 'tgt-reset': updateCfg({ ts: 135, td: 85 }); refresh(); break;
      case 'theme':
        state.settings.theme = el.getAttribute('data-theme');
        Store.saveSettings(state.settings);
        applyTheme();
        refresh();
        break;
      case 'push-enable': enablePush(); break;
      case 'push-disable': disablePush(); break;
      case 'push-test': testPush(); break;
      case 'sync-connect': connect(); break;
      case 'sync-now':
        Store.setDirty(true);
        Sync.run();
        break;
      case 'sync-disconnect':
        confirmDialog({ title: 'Odłączyć kopię?', text: 'Pomiary zostaną na tym urządzeniu i w repozytorium, ale nowe nie będą wysyłane. Przypomnienia przestaną działać na tym urządzeniu.', ok: 'Odłącz', danger: true })
          .then(function (yes) { if (yes) { Sync.disconnect(); refresh(); } });
        break;
      case 'export-json':
        download(C.APP_ID + '-kopia-' + state.today + '.json', C.serialize(state.data), 'application/json');
        break;
      case 'export-csv':
        download(C.APP_ID + '-pomiary-' + state.today + '.csv', C.toCsv(C.listReadings(state.data)), 'text/csv');
        break;
      case 'import-pick': if ($('import-file')) $('import-file').click(); break;
      case 'install':
        if (state.installPrompt) {
          state.installPrompt.prompt();
          state.installPrompt.userChoice.then(function () { state.installPrompt = null; refresh(); }, function () {});
        }
        break;
      case 'reload': location.reload(); break;
    }
  }

  function bumpEl(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function trapFocus(ev, root) {
    var f = root.querySelectorAll('button:not([disabled]), input:not([disabled]), select, [href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.id === 'ed-backdrop') { closeEditor(); return; }
      if (t.id === 'cf-backdrop') { closeConfirm(false); return; }
      var el = t.closest ? t.closest('[data-action]') : null;
      if (el && !el.disabled) handleAction(el);
    });

    // przyciski − / + : przytrzymanie zmienia wartość szybciej
    document.addEventListener('pointerdown', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.stp') : null;
      if (!b || !state.editor) return;
      ev.preventDefault();
      startRepeat(b.getAttribute('data-f'), +b.getAttribute('data-d'));
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(function (n) {
      (n === 'blur' ? window : document).addEventListener(n, stopRepeat);
    });
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.stp') : null;
      if (b && state.editor && ev.detail === 0) stepField(b.getAttribute('data-f'), +b.getAttribute('data-d')); // klawiatura
    });

    document.addEventListener('input', function (ev) {
      if (/^ed-in-/.test(ev.target.id)) onFieldInput(ev.target);
    });

    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.id === 'push-toggle') {
        if (t.checked) {
          if (state.push.status === 'ios-install' || state.push.status === 'unsupported' || state.push.status === 'denied' || !Sync.getConfig()) {
            t.checked = false;
            showToast(!Sync.getConfig() ? 'Najpierw połącz kopię na GitHubie (Profil). Stamtąd wysyłane są przypomnienia.' :
              state.push.status === 'ios-install' ? 'Na iPhonie dodaj aplikację do ekranu początkowego, a potem włącz przypomnienia.' :
              state.push.status === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach telefonu.' : 'To urządzenie nie obsługuje powiadomień.', { kind: 'error' });
            return;
          }
          enablePush();
        } else disablePush();
        return;
      }
      if (t.id === 'import-file') {
        importFile(t.files && t.files[0]);
        t.value = '';
      } else if (t.id === 'rm-select' || t.id === 're-select') {
        var patch = {};
        patch[t.id === 'rm-select' ? 'rm' : 're'] = parseInt(t.value, 10);
        updateCfg(patch);
        showToast(patch.rm === -1 || patch.re === -1 ? 'Przypomnienie wyłączone' : 'Zapisano godzinę przypomnienia');
      } else if (t.id === 'name-input') {
        var nm = C.normalizeName(t.value);
        if (nm !== cfg().nm) { updateCfg({ nm: nm }); showToast(nm ? 'Zapisano imię i nazwisko' : 'Usunięto imię i nazwisko'); }
      } else if ((t.id === 'ed-date' || t.id === 'ed-time') && state.editor) {
        readWhen();
        state.editor.err = '';
        var l = $('ed-when-l');
        if (l) l.textContent = whenLabel(state.editor);
        updateEditor();
      }
    });

    document.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (ev.key === 'Escape') {
        if ($('confirm-root').firstChild) { closeConfirm(false); ev.preventDefault(); return; }
        if (state.editor) { closeEditor(); ev.preventDefault(); return; }
      }
      if (ev.key === 'Tab') {
        var cf = $('confirm-root').querySelector('.sheet');
        var md = $('modal-root').querySelector('.page-modal');
        if (cf) trapFocus(ev, cf); else if (md) trapFocus(ev, md);
        return;
      }
      if (state.editor && !$('confirm-root').firstChild && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (t.id === 'ed-note' && ev.key === 'Enter') { ev.preventDefault(); t.blur(); return; }
        if (ev.key === 'Enter' && /^ed-in-/.test(t.id)) {
          ev.preventDefault();
          var fi = FIELDS.indexOf(t.id.slice(6));
          if (fi < 2) { var nx = $('ed-in-' + FIELDS[fi + 1]); if (nx) nx.focus(); } else editorSave();
          return;
        }
      }
      if (ev.key === 'Enter' && (t.id === 'repo-input' || t.id === 'token-input')) { ev.preventDefault(); connect(); }
      if (ev.key === 'Enter' && t.id === 'name-input') { ev.preventDefault(); t.blur(); }
    });

    document.addEventListener('focusout', function (ev) {
      var t = ev.target;
      if (t && /^(repo-input|token-input|name-input)$/.test(t.id) && state.deferred) {
        setTimeout(function () {
          var a = document.activeElement;
          if (state.deferred && !(a && /^(repo-input|token-input|name-input)$/.test(a.id))) { state.deferred = false; refresh(); }
        }, 250);
      }
    });

    window.addEventListener('popstate', function () {
      if (ignorePop > 0) { ignorePop--; return; }
      if (state.editor) { state.editor = null; renderModal(); }
    });

    window.addEventListener('storage', function (ev) {
      if (ev.key === 'cisnienie.data.v1' && ev.newValue) {
        state.data = C.merge(state.data, C.parseSerialized(ev.newValue).data);
        if (!state.editor) refresh();
      }
    });

    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      state.installPrompt = ev;
      if (state.view === 'settings') refresh();
    });

    var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
  }

  /* ---------- Zmiana dnia i tryb offline ---------- */

  function checkDayChange() {
    var nt = C.todayKey();
    if (nt === state.today) return;
    state.today = nt;
    if (!state.editor) refresh();
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      var root = $('toasts');
      if (!root || $('update-toast')) return;
      var el = document.createElement('div');
      el.className = 'toast';
      el.id = 'update-toast';
      el.innerHTML = '<span class="msg">Dostępna nowa wersja aplikacji</span><button data-action="reload">Odśwież</button>';
      root.appendChild(el);
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') reg.update().catch(function () { /* offline */ });
      });
    }).catch(function () { /* aplikacja działa także bez trybu offline */ });
  }

  /* ---------- Start ---------- */

  function finishStart() {
    renderView();
    applyTheme();
    if (Sync.getConfig()) Sync.run();
    Store.requestPersistence();
    refreshPushState().then(function () { if (state.view === 'settings' && !state.editor) refresh(); });
  }

  function start() {
    buildShell();
    bindEvents();
    applyTheme();
    Sync.init({
      getData: function () { return state.data; },
      getVersion: function () { return state.version; },
      applyRemote: function (d) {
        state.data = C.merge(state.data, d);
        state.storageOk = Store.save(state.data) && state.storageOk;
        if (!state.editor) refresh();
      },
      onStatus: function (s) {
        state.sync = s;
        renderPill();
        if (!state.editor && (state.view === 'settings' || state.view === 'home')) refresh();
      }
    });

    state.data = Store.loadSync();
    var started = false;
    function begin(data) {
      if (data) state.data = C.merge(state.data, data);
      if (started) { if (!state.editor) refresh(); return; }
      started = true;
      finishStart();
    }
    var timeout = setTimeout(function () { begin(null); }, 1500);
    Store.load().then(function (d) { clearTimeout(timeout); begin(d); }, function () { clearTimeout(timeout); begin(null); });

    setInterval(checkDayChange, 30000);
    setInterval(function () {
      if (document.visibilityState === 'visible') Sync.poll();
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkDayChange();
    });
    registerWorker();
  }

  start();
})();
