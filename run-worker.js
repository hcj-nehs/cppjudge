// 執行學生的程式。超過時間限制時，主程式會直接終止這個 Worker。
importScripts('wasi-run.js');
self.onmessage = ev => {
  const { id, module, input } = ev.data;
  try {
    self.postMessage({ id, ok: true, result: CJWasi.runWasm(module, input) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
