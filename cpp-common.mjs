// C++ 編譯設定：瀏覽器（cpp-worker.js）與出題工具（tools/build.mjs）共用，確保兩邊結果一致。
export const CLANG_VERSION = '21.1.4-3';
export const CLANG_CDN = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${CLANG_VERSION}/gen/bundle.js`;

// 內建的 <bits/stdc++.h>（libc++ 沒有這個檔案），同時也是預先編譯標頭（PCH）的內容
export const STD_HEADERS = ['cstdio', 'cstdlib', 'cstring', 'cmath', 'climits', 'cfloat', 'cctype', 'ctime', 'cassert', 'cstdint',
  'iostream', 'iomanip', 'sstream', 'string', 'vector', 'algorithm', 'map', 'set', 'queue', 'stack', 'deque', 'list',
  'numeric', 'utility', 'functional', 'bitset', 'unordered_map', 'unordered_set', 'array', 'tuple', 'iterator', 'limits', 'random'];
export const STDCPP_H = '#pragma once\n' + STD_HEADERS.map(h => `#include <${h}>`).join('\n') + '\n';
const ALSO_OK = ['bits/stdc++.h', 'math.h', 'stdio.h', 'stdlib.h', 'string.h', 'ctype.h', 'time.h', 'limits.h', 'stdint.h', 'assert.h', 'float.h'];

// -fno-finite-loops：沒有副作用的無窮迴圈不要被最佳化掉（學生才會看到「執行超時」而不是奇怪的錯誤）
const BASE = ['-std=c++17', '-O1', '-fno-exceptions', '-fno-finite-loops','-Wparentheses', '-Wuninitialized', '-Wsometimes-uninitialized', '-Wformat', '-Wreturn-type', '-fno-color-diagnostics', '-Iinc'];
export const PCH_PATH = 'inc/bits/stdc++.h.pch';
// PCH 的版本代號：編譯器版本、標頭或參數改變時就會不同（瀏覽器依此決定要不要重新下載）
export const PCH_KEY = CLANG_VERSION + '-' + [...(STDCPP_H + BASE.join(' '))].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);
export const pchBuildArgs = () => ['clang++', '-x', 'c++-header', ...BASE, 'inc/bits/stdc++.h', '-o', PCH_PATH];
export function compileArgs({ pch, syntaxOnly } = {}) {
  const a = ['clang++', ...BASE];
  if (pch) a.push('-Xclang', '-fno-validate-pch', '-include-pch', PCH_PATH);
  a.push('main.cpp');
  if (syntaxOnly) a.push('-fsyntax-only');
  else a.push('-o', 'main.wasm', '-Wl,-z,stack-size=8388608');
  return a;
}
export function makeTree(code, pchBytes) {
  const bits = { 'stdc++.h': STDCPP_H };
  if (pchBytes) bits['stdc++.h.pch'] = pchBytes;
  return { 'main.cpp': code, inc: { bits } };
}
// 程式裡的 #include 都在 PCH 裡才使用 PCH（否則照一般方式編譯）
export function canUsePch(code) {
  const incs = [...String(code).matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)].map(m => m[1].trim());
  return incs.every(h => STD_HEADERS.includes(h) || ALSO_OK.includes(h));
}

// 解析 clang 的錯誤訊息：main.cpp:3:5: error: ...
export function parseDiagnostics(text) {
  const list = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^main\.cpp:(\d+):(\d+): (error|warning|fatal error): (.*)$/);
    if (m) {
      const d = { line: +m[1], col: +m[2], kind: m[3] === 'warning' ? 'warning' : 'error', msg: m[4], snippet: '' };
      if (lines[i + 1] && !/^\S+:\d+:\d+:/.test(lines[i + 1])) d.snippet = lines[i + 1] + (lines[i + 2] && /^\s*[\^~ ]+$/.test(lines[i + 2]) ? '\n' + lines[i + 2] : '');
      list.push(d);
    } else if (/^wasm-ld: error: (.*)$/.test(lines[i])) {
      list.push({ line: 0, col: 0, kind: 'error', msg: lines[i].replace(/^wasm-ld: error: (\S+\.o: )?/, ''), snippet: '', linker: true });
    }
  }
  return list;
}
