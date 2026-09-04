(() => {
  window.__hist = { replace: 0, push: 0, stack: [] };
  const origReplace = History.prototype.replaceState;
  const origPush = History.prototype.pushState;
  History.prototype.replaceState = function (...a) {
    window.__hist.replace++;
    if (window.__hist.stack.length < 3) {
      window.__hist.stack.push(String(new Error().stack).split('\n').slice(1, 5).join(' | ').slice(0, 300));
    }
    return origReplace.apply(this, a);
  };
  History.prototype.pushState = function (...a) { window.__hist.push++; return origPush.apply(this, a); };
})()
