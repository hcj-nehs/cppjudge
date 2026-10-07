// 執行編譯好的 C++ 程式（WebAssembly + 最小化的 WASI）。瀏覽器的 run-worker.js 與 tools/build.mjs 共用這個檔案。
(function (root) {
  'use strict';
  const ESUCCESS = 0, EBADF = 8, EINVAL = 28, ENOSYS = 52;
  class ExitSignal { constructor(code) { this.code = code; } }
  class OutputLimit { }

  // module：WebAssembly.Module；input：字串；回傳 { status: 'OK'|'RE'|'OLE', stdout, stderr, exitCode, timeMs, error }
  function runWasm(module, input, opts) {
    opts = opts || {};
    const outLimit = opts.outLimit || 200000;
    const stdin = new TextEncoder().encode(String(input || ''));
    let inPos = 0;
    const out = [], err = [];
    let outLen = 0, errLen = 0;
    let memory = null;
    const mem8 = () => new Uint8Array(memory.buffer);
    const view = () => new DataView(memory.buffer);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const wasi = {
      fd_write(fd, iovs, iovsLen, nwritten) {
        if (fd !== 1 && fd !== 2) return EBADF;
        const dv = view(), m = mem8();
        let n = 0;
        for (let i = 0; i < iovsLen; i++) {
          const ptr = dv.getUint32(iovs + i * 8, true), len = dv.getUint32(iovs + i * 8 + 4, true);
          if (!len) continue;
          const chunk = m.slice(ptr, ptr + len);
          if (fd === 1) { outLen += len; if (outLen > outLimit) throw new OutputLimit(); out.push(chunk); }
          else if (errLen < 20000) { errLen += len; err.push(chunk); }
          n += len;
        }
        dv.setUint32(nwritten, n, true);
        return ESUCCESS;
      },
      fd_read(fd, iovs, iovsLen, nread) {
        if (fd !== 0) return EBADF;
        const dv = view(), m = mem8();
        let n = 0;
        for (let i = 0; i < iovsLen && inPos < stdin.length; i++) {
          const ptr = dv.getUint32(iovs + i * 8, true), len = dv.getUint32(iovs + i * 8 + 4, true);
          const take = Math.min(len, stdin.length - inPos);
          m.set(stdin.subarray(inPos, inPos + take), ptr);
          inPos += take; n += take;
        }
        dv.setUint32(nread, n, true);
        return ESUCCESS;
      },
      fd_close: () => ESUCCESS,
      fd_seek: () => ESUCCESS,
      fd_sync: () => ESUCCESS,
      fd_fdstat_get(fd, buf) {
        if (fd > 2) return EBADF;
        const dv = view();
        for (let i = 0; i < 24; i++) dv.setUint8(buf + i, 0);
        dv.setUint8(buf, 2); // character device
        return ESUCCESS;
      },
      fd_fdstat_set_flags: () => ESUCCESS,
      fd_prestat_get: () => EBADF,
      fd_prestat_dir_name: () => EBADF,
      environ_sizes_get(cnt, size) { const dv = view(); dv.setUint32(cnt, 0, true); dv.setUint32(size, 0, true); return ESUCCESS; },
      environ_get: () => ESUCCESS,
      args_sizes_get(cnt, size) { const dv = view(); dv.setUint32(cnt, 1, true); dv.setUint32(size, 5, true); return ESUCCESS; },
      args_get(argv, buf) { const dv = view(); dv.setUint32(argv, buf, true); mem8().set([109, 97, 105, 110, 0], buf); return ESUCCESS; },
      clock_time_get(id, precision, out) {
        const ns = BigInt(Math.round((id === 0 ? Date.now() : now()) * 1e6));
        view().setBigUint64(out, ns, true);
        return ESUCCESS;
      },
      clock_res_get(id, out) { view().setBigUint64(out, 1000n, true); return ESUCCESS; },
      random_get(buf, len) { const m = mem8(); for (let i = 0; i < len; i++) m[buf + i] = (Math.random() * 256) | 0; return ESUCCESS; },
      sched_yield: () => ESUCCESS,
      poll_oneoff: () => ENOSYS,
      proc_exit(code) { throw new ExitSignal(code); },
      proc_raise: () => ENOSYS,
    };
    const imports = { wasi_snapshot_preview1: new Proxy(wasi, { get: (t, k) => t[k] || (() => ENOSYS) }) };

    const decode = parts => {
      let len = 0; for (const p of parts) len += p.length;
      const all = new Uint8Array(len); let o = 0;
      for (const p of parts) { all.set(p, o); o += p.length; }
      return new TextDecoder().decode(all);
    };
    const t0 = now();
    let status = 'OK', exitCode = 0, error = null;
    try {
      const inst = new WebAssembly.Instance(module, imports);
      memory = inst.exports.memory;
      inst.exports._start();
    } catch (e) {
      if (e instanceof ExitSignal) {
        exitCode = e.code;
        if (exitCode !== 0) { status = 'RE'; error = { type: 'exit', msg: `程式結束代碼 ${exitCode}` }; }
      } else if (e instanceof OutputLimit) {
        status = 'OLE';
      } else {
        status = 'RE';
        error = { type: 'trap', msg: String(e && e.message || e) };
      }
    }
    const timeMs = Math.round(now() - t0);
    return { status, stdout: decode(out), stderr: decode(err), exitCode, timeMs, error };
  }

  const api = { runWasm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CJWasi = api;
})(typeof self !== 'undefined' ? self : this);
