// Runs before the first paint (blocking script in <head>): applies the visitor's saved theme, if any.
// No saved choice = no data-theme attribute = the CSS follows the device setting.
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.dataset.theme = t;
    // keep the browser UI colour in step (same values as --color-bg in tokens.css)
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.content = t === 'dark' ? '#1a1b26' : '#f4f5f9'; });
  }
  // Hero intro (src/scripts/intro/): not after a click from this site or Back/Forward, and only if motion is OK.
  var nav = performance.getEntriesByType('navigation')[0];
  if (document.referrer.indexOf(location.origin) !== 0 && !(nav && nav.type === 'back_forward') && matchMedia('(prefers-reduced-motion: no-preference)').matches) document.documentElement.dataset.intro = '';
} catch (e) {
  // storage blocked: fall back to the device setting, no intro
}
