/**
 * The pointer-check diagnostic page (`docs/specs/gantt-coarse-pointer/`, M0-T2).
 *
 * It prints what the browser says about the input device, and it updates live, because the question
 * it exists to answer is whether folding the Surface's keyboard cover changes the answer
 * (ADR-0118 D7). It takes no input and makes no request (ADR-0140): it can describe nobody.
 *
 * An external file rather than an inline script because the web origin's Content-Security-Policy
 * carries no `'unsafe-inline'` (ADR-0074).
 */
(function () {
  var QUERIES = [
    ['pointer', '(pointer: fine)', '(pointer: coarse)', '(pointer: none)'],
    ['any-pointer', '(any-pointer: fine)', '(any-pointer: coarse)', '(any-pointer: none)'],
    ['hover', '(hover: hover)', '(hover: none)'],
    ['any-hover', '(any-hover: hover)', '(any-hover: none)'],
  ];

  function describe(queries) {
    var matched = [];
    for (var i = 1; i < queries.length; i += 1) {
      if (window.matchMedia(queries[i]).matches) {
        matched.push(queries[i].replace(/^\(.*: /, '').replace(/\)$/, ''));
      }
    }
    return matched.length > 0 ? matched.join(' + ') : 'unknown';
  }

  function show(id, text) {
    var el = document.getElementById(id);
    if (el !== null) el.textContent = text;
  }

  function render() {
    for (var i = 0; i < QUERIES.length; i += 1) {
      show(QUERIES[i][0], describe(QUERIES[i]));
    }
    show('device-pixel-ratio', String(window.devicePixelRatio));
    show('viewport', window.innerWidth + ' x ' + window.innerHeight);
  }

  render();
  window.addEventListener('resize', render);
  for (var i = 0; i < QUERIES.length; i += 1) {
    for (var j = 1; j < QUERIES[i].length; j += 1) {
      window.matchMedia(QUERIES[i][j]).addEventListener('change', render);
    }
  }
})();
