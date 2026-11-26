/* Ustawia motyw jeszcze przed pierwszym rysowaniem strony, żeby nie było błysku innego tła. Domyślnie jasny. */
(function () {
  var t = 'light';
  try {
    var s = JSON.parse(localStorage.getItem('cisnienie.settings.v1') || '{}');
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto') t = s.theme;
  } catch (e) { /* domyślny */ }
  if (t !== 'auto') document.documentElement.setAttribute('data-theme', t);
})();
