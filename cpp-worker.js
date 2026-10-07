// C++ 編譯器（Clang/LLD 的 WebAssembly 版本），在背景執行緒中運作。
// 編譯器檔案約 23 MB，第一次下載後存在瀏覽器的 Cache Storage，之後開網頁不必再下載。
import * as common from './cpp-common.mjs';

const CLANG_CACHE = 'cj-clang-' + common.CLANG_VERSION;
const PCH_CACHE = 'cj-pch';
const realFetch = self.fetch.bind(self);
const hasCaches = typeof caches !== 'undefined';

// 攔截編譯器檔案的下載：先找快取，沒有才從 CDN 下載並存起來
self.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!hasCaches || !/\/@yowasp\//.test(url)) return realFetch(input, init);
  try {
    const cache = await caches.open(CLANG_CACHE);
    const hit = await cache.match(url);
    if (hit) return hit;
    const resp = await realFetch(url, init);
    if (resp.ok) { try { await cache.put(url, resp.clone()); } catch (e) { /* 空間不足就算了 */ } }
    return resp;
  } catch (e) {
    return realFetch(input, init);
  }
};

let clang = null;      // @yowasp/clang 模組
let pch = null;        // 預先編譯標頭（Uint8Array）
let pchLoading = null;

const post = (m, transfer) => self.postMessage(m, transfer || []);
const decoder = () => { const d = new TextDecoder(); return b => (b ? d.decode(b, { stream: true }) : ''); };

async function runClang(args, tree) {
  let stderr = '';
  const dec = decoder();
  try {
    const files = await clang.runClang(args, tree, { stderr: b => { stderr += dec(b); } });
    return { ok: true, files, stderr };
  } catch (e) {
    if (e && e.files) return { ok: false, stderr };
    throw e;
  }
}

async function init() {
  // 清掉舊版本編譯器的快取
  if (hasCaches) {
    for (const k of await caches.keys()) if (k.startsWith('cj-clang-') && k !== CLANG_CACHE) caches.delete(k);
  }
  clang = await import(common.CLANG_CDN);
  let last = 0;
  const t0 = performance.now();
  // 編譯一個空程式，讓編譯器完成下載與初始化
  await clang.runClang(['clang++', '-fsyntax-only', 'w.cpp'], { 'w.cpp': 'int main() { return 0; }' }, {
    stderr: () => { },
    fetchProgress: ({ totalLength, doneLength }) => {
      const now = performance.now();
      if (now - last > 250 || doneLength === totalLength) { last = now; post({ type: 'progress', done: doneLength, total: totalLength }); }
    },
  });
  post({ type: 'progress', done: 1, total: 1, ms: Math.round(performance.now() - t0) });
  loadPch();
}

// 背景下載預先編譯標頭（約 9 MB），讓之後每次編譯從約 1.5 秒縮短到 0.3 秒
function loadPch() {
  if (pchLoading) return pchLoading;
  pchLoading = (async () => {
    if (typeof DecompressionStream === 'undefined') return;
    const url = new URL('stdcpp.pch.gz?k=' + common.PCH_KEY, import.meta.url).href;
    let resp = null, cache = null;
    if (hasCaches) {
      cache = await caches.open(PCH_CACHE);
      resp = await cache.match(url);
    }
    if (!resp) {
      resp = await realFetch(url);
      if (!resp.ok) return;
      if (cache) {
        for (const k of await cache.keys()) if (k.url !== url) cache.delete(k);
        try { await cache.put(url, resp.clone()); } catch (e) { }
      }
    }
    const buf = await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    pch = new Uint8Array(buf);
    post({ type: 'pch' });
  })().catch(e => { console.warn('PCH 載入失敗', e); });
  return pchLoading;
}

async function compile(code, syntaxOnly) {
  const t0 = performance.now();
  const usePch = !!pch && common.canUsePch(code);
  let r = await runClang(common.compileArgs({ pch: usePch, syntaxOnly }), common.makeTree(code, usePch ? pch : null));
  // 使用 PCH 失敗時（例如變數名稱和標準函式庫衝突），改用一般方式再編譯一次，結果才會和一般編譯器一致
  if (!r.ok && usePch) r = await runClang(common.compileArgs({ pch: false, syntaxOnly }), common.makeTree(code));
  const diags = common.parseDiagnostics(r.stderr);
  const out = { success: r.ok, diags, stderr: r.stderr.slice(0, 8000), ms: Math.round(performance.now() - t0), pch: usePch };
  if (r.ok && !syntaxOnly) out.wasm = r.files['main.wasm'];
  return out;
}

// 一次只處理一個工作
let queue = Promise.resolve();
self.onmessage = ev => {
  const { id, type, code } = ev.data;
  queue = queue.then(async () => {
    try {
      if (type === 'init') { await init(); post({ id, ok: true }); }
      else if (type === 'compile' || type === 'lint') {
        const result = await compile(code, type === 'lint');
        post({ id, ok: true, result }, result.wasm ? [result.wasm.buffer] : []);
      }
    } catch (e) {
      post({ id, ok: false, error: String(e && e.message || e) });
    }
  });
};
