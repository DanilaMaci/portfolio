// Card image <-> project image morph (cross-document view transition). A render-blocking classic script in <head>
// (like theme-init.js), not part of the deferred module: pagereveal fires at the first frame, and on a slow network
// a module would run after it, so the new page would never be named and the image would only fade.
// The one image of the pair carries data-morph (CSS: view-transition-name: card-image) during the transition only.
// The old page names its image on pageswap, the new page on pagereveal, both before the snapshots are taken.
// The home page is the only partner of a project page. No name (plain crossfade) when the image is off screen:
// arriving home, the card must be fully visible (else the image would fly across the screen edge). Back morphs
// because the browser has restored the scroll position by then; the `cd ../projects` link (/#projects) is scrolled
// into view here first. Nothing happens with reduced motion.
(function () {
  var motionOK = matchMedia('(prefers-reduced-motion: no-preference)');
  var named;
  function clear() {
    if (named) named.removeAttribute('data-morph');
    named = undefined;
  }
  function morph(url, vt, arriving) {
    if (!url || !vt || !motionOK.matches) return;
    var home = location.pathname === '/';
    if (arriving && home && location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });
    }
    var el = home
      ? document.querySelector('.project:has(.card-title a[href="' + new URL(url).pathname + '"]) .card-image')
      : document.querySelector('.project-image, .project-image-fallback');
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (arriving && home ? r.top < 0 || r.bottom > innerHeight : r.bottom <= 0 || r.top >= innerHeight) return;
    el.setAttribute('data-morph', '');
    named = el;
    vt.finished.then(clear, clear); // aborted transitions reject: still clear, no unhandled rejection
  }
  addEventListener('pageswap', function (e) {
    morph(e.activation && e.activation.entry && e.activation.entry.url, e.viewTransition, false);
  });
  addEventListener('pagereveal', function (e) {
    var nav = window.navigation;
    morph(nav && nav.activation && nav.activation.from && nav.activation.from.url, e.viewTransition, true);
  });
  addEventListener('pageshow', clear); // restored from the back/forward cache with a name still set
})();
