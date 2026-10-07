// 可重現的亂數產生器：大型測資只存「產生程式 + 種子」，在瀏覽器產生，結果和出題工具（tools/build.mjs）完全相同。
(function (root) {
  'use strict';
  function makeRng(seedText) {
    let h = 2166136261;
    for (const c of String(seedText)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    let s = h >>> 0;
    const next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const R = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: a => a[Math.floor(next() * a.length)],
      arr: (n, lo, hi) => Array.from({ length: n }, () => R.int(lo, hi)),
      rep: (n, f) => Array.from({ length: n }, (_, i) => f(i)),
      shuffle: a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
      str: (n, chars = 'abcdefghijklmnopqrstuvwxyz') => Array.from({ length: n }, () => R.pick(chars)).join(''),
      real: (lo, hi, d = 1) => (lo + next() * (hi - lo)).toFixed(d),
    };
    return R;
  }
  // gen：產生測資的函式原始碼（字串），只能使用參數 R
  function runGen(gen, seed) {
    const f = new Function('return (' + gen + ');')();
    let s = String(f(makeRng(seed)));
    return s && !s.endsWith('\n') ? s + '\n' : s;
  }
  const api = { makeRng, runGen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CJGen = api;
})(typeof self !== 'undefined' ? self : this);
