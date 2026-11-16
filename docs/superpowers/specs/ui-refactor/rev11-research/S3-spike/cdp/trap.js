(() => {
  const P = Element.prototype;
  if (P.animate.__trap) return;
  const orig = P.animate;
  const wrapped = function (...a) { (window.__ledger ||= []).push(["animate", performance.now()]); return orig.apply(this, a); };
  wrapped.__trap = true;
  P.animate = wrapped;
  window.__trapAt = location.href;
})();
