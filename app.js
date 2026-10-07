/* NEHS C++ Judge 前端
 * 題目資料（problems.js）都在網站上，學生看題目、切換頁面都不需要連到 Google；
 * 只有「登入」與「送出評測」（以及看老師留言）才會呼叫後端。 */
'use strict';

// ============ 共用工具 ============
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');
const CFG = window.CJ_CONFIG || {};
const DATA = window.CJ_DATA || { problems: [], series: {}, topics: {} };
const PROBS = DATA.problems;
const PMAP = Object.fromEntries(PROBS.map(p => [p.id, p]));
const SERIES_KEYS = Object.keys(DATA.series);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
let pageTimers = [];
const clearPageTimers = () => { pageTimers.forEach(clearInterval); pageTimers = []; };
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function fmtTime(ts, short) {
  if (!ts) return '';
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  if (short && today) return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const VERDICT = { AC: '通過', WA: '答案錯誤', TLE: '執行超時', RE: '執行錯誤', CE: '編譯錯誤', OLE: '輸出過多' };
const vBadge = v => `<span class="v ${esc(v)}" title="${esc(VERDICT[v] || v)}">${esc(v)}</span>`;
const stars = n => `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 3 - n))}</span>`;
const rankBadge = r => `<span class="rank r${Math.min(r, 4)}">${r <= 3 ? ['🥇', '🥈', '🥉'][r - 1] : ''}第 ${r} 名</span>`;
const seat2 = n => String(n || '').padStart(2, '0');
const normalize = s => String(s || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(text)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ============ 登入狀態（存在瀏覽器，重新整理不用再登入） ============
let S = store.json('cj-state', null);
const isTeacher = () => S && S.user && S.user.role === 'teacher';
const saveState = () => { if (S) { trimSubs(); store.set('cj-state', JSON.stringify(S)); } };
// 只保留最近 300 筆提交的程式碼，避免瀏覽器空間不夠
function trimSubs() { (S.subs || []).forEach((s, i) => { if (i >= 300) delete s.code; }); }
function applySync(d) {
  S.user = d.user; S.hidden = d.hidden || []; S.serverVersion = d.version; S.syncedAt = Date.now();
  S.serverOffset = d.serverTime ? d.serverTime - Date.now() : 0;
  if (isTeacher()) { S.classes = d.classes || []; S.notifs = d.notifs || []; }
  else {
    S.mine = d.mine || {}; S.cls = d.cls || {}; S.ranks = d.ranks || {}; S.classmates = d.classmates || {}; S.comments = d.comments || [];
    if (d.subs) {
      const codes = Object.fromEntries((S.subs || []).filter(s => s.code).map(s => [s.id, s]));
      S.subs = d.subs.map(s => Object.assign({}, codes[s.id] || {}, s)).sort((a, b) => b.id - a.id);
    }
  }
  saveState();
}
const hiddenSet = () => new Set(S && S.hidden || []);
const isHidden = p => { const h = hiddenSet(); return h.has(p.id) || h.has(p.series) || h.has(p.topic); };
const visibleProbs = () => isTeacher() ? PROBS : PROBS.filter(p => !isHidden(p));

// ============ 後端 ============
// Google 偶爾會把 POST 轉址成 GET，後端只會回「API 運作中」而沒有處理請求——這種情況一定可以安全地重送。
// 其他非 JSON 的錯誤網頁：讀取類的請求才重試；「送出評測」「留言」不自動重試，避免重複送出。
const NO_RETRY = /^\/api\/(submit|submissions\/\d+\/comments)$/;
async function api(path, body, opt = {}) {
  let data = null, lastErr = '';
  for (let i = 0; i < 4 && !data; i++) {
    if (i) await new Promise(r => setTimeout(r, 700 * i));
    let text;
    try {
      const r = await fetch(CFG.API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
        body: JSON.stringify({ method: opt.method || 'POST', path, query: opt.query || {}, body: body || null, token: S && S.token }),
      });
      text = await r.text();
    } catch (e) { lastErr = '無法連線到後端，請檢查網路後再試一次'; if (NO_RETRY.test(path)) break; continue; }
    try { data = JSON.parse(text); }
    catch {
      console.warn('後端回應不是 JSON：', path, text.slice(0, 500));
      if (/API 運作中/.test(text)) { lastErr = 'Google 伺服器暫時忙碌，請稍等幾秒再試一次'; continue; }   // 請求沒被處理，重送
      if (NO_RETRY.test(path)) i = 99;
      lastErr = path === '/api/submit'
        ? 'Google 伺服器暫時沒有正確回應。你的程式可能已經送出，請到「我的紀錄」或按右上角 🔄 確認，沒有的話再送一次。'
        : 'Google 伺服器暫時忙碌，請稍等幾秒再試一次';
    }
  }
  if (!data) throw new Error(lastErr);
  if (data.status === 401 && path !== '/api/login') {
    S = null; store.del('cj-state'); location.hash = '#/login';
    throw new Error('登入已過期，請重新登入');
  }
  if (data.error) throw new Error(data.error);
  return data.data;
}
const apiGet = (path, query) => api(path, null, { method: 'GET', query });

// 背景同步：網頁打開時，距離上次同步超過 10 分鐘才做；不會擋住畫面
let syncing = null;
function backgroundSync(force) {
  if (!S || syncing) return syncing;
  if (!force && Date.now() - (S.syncedAt || 0) < 10 * 60000) return null;
  syncing = api('/api/sync', { full: !!force }).then(d => {
    applySync(d); renderNav();
    const page = location.hash.split('?')[0].split('/')[1] || '';
    if (!isTeacher() && ['problems', 'submissions'].includes(page)) router();
  }).catch(e => { if (force) toast(e.message); }).finally(() => { syncing = null; });
  return syncing;
}

// ============ C++ 編譯與執行 ============
const Judge = {
  cw: null, runner: null, status: 'idle', progress: null, pch: false, seq: 0, pending: new Map(), listeners: new Set(),
  lastCompile: null,   // { code, result }：程式沒改就不重新編譯
  inputCache: new Map(),
  onStatus(fn) { this.listeners.add(fn); fn(this); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(f => f(this)); },
  start() {
    if (this.cw) return this.ready;
    this.status = 'loading'; this.emit();
    this.cw = new Worker('cpp-worker.js', { type: 'module' });
    this.cw.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') { this.progress = m; this.emit(); return; }
      if (m.type === 'pch') { this.pch = true; this.emit(); return; }
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
    };
    this.cw.onerror = e => { this.status = 'error'; this.emit(); console.error(e); };
    this.newRunner();
    this.ready = this.call({ type: 'init' }).then(() => { this.status = 'ready'; this.emit(); })
      .catch(e => { this.status = 'error'; this.error = e.message; this.emit(); throw e; });
    return this.ready;
  },
  call(msg) {
    return new Promise((resolve, reject) => { const id = ++this.seq; this.pending.set(id, { resolve, reject }); this.cw.postMessage({ ...msg, id }); });
  },
  newRunner() {
    if (this.runner) this.runner.terminate();
    this.runner = new Worker('run-worker.js');
  },
  async compile(code) {
    if (this.lastCompile && this.lastCompile.code === code) return this.lastCompile.result;
    await this.start();
    const r = await this.call({ type: 'compile', code });
    if (r.success) r.module = await WebAssembly.compile(r.wasm);
    delete r.wasm;
    this.lastCompile = { code, result: r };
    return r;
  },
  lintBusy: false,
  async lint(code) {
    if (this.status !== 'ready' || this.lintBusy) return null;
    this.lintBusy = true;
    try { return await this.call({ type: 'lint', code }); } finally { this.lintBusy = false; }
  },
  run(module, input, timeLimitMs) {
    return new Promise(resolve => {
      const w = this.runner, id = ++this.seq;
      const timer = setTimeout(() => { w.onmessage = null; this.newRunner(); resolve({ status: 'TLE', stdout: '', timeMs: timeLimitMs, killed: true }); }, timeLimitMs + 700);
      w.onmessage = e => {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        const r = e.data.ok ? e.data.result : { status: 'RE', stdout: '', stderr: '', timeMs: 0, error: { type: 'trap', msg: e.data.error } };
        if (r.status === 'OK' && r.timeMs > timeLimitMs) r.status = 'TLE';
        resolve(r);
      };
      w.postMessage({ id, module, input });
    });
  },
  testInput(p, i) {
    const t = p.tests[i];
    if (t.input !== undefined) return t.input;
    const k = p.id + '#' + i;
    if (!this.inputCache.has(k)) this.inputCache.set(k, CJGen.runGen(t.gen, t.seed));
    return this.inputCache.get(k);
  },
  // 依題目全部測資評測，回傳要送到伺服器的資料
  async judgeAll(code, p, onProgress) {
    const c = await this.compile(code);
    if (!c.success) {
      const d = c.diags.find(x => x.kind === 'error') || { msg: c.stderr.split('\n')[0] || '編譯失敗', line: 0 };
      return { compile: c, payload: { compileError: { msg: friendlyCE(d), line: d.line } } };
    }
    const runs = [], local = [];
    for (let i = 0; i < p.tests.length; i++) {
      onProgress && onProgress(i + 1, p.tests.length);
      const r = await this.run(c.module, this.testInput(p, i), p.timeLimitMs);
      const status = r.status === 'OK' ? 'OK' : r.status;
      runs.push({ status, timeMs: r.timeMs || 0, hash: status === 'OK' ? await sha(r.stdout) : '', out: (r.stdout || '').slice(0, 300), error: r.error ? { msg: friendlyRE(r) } : null });
      local.push(r);
    }
    return { compile: c, payload: { runs }, local };
  },
};

// ============ 友善的錯誤說明（中文） ============
const FULLWIDTH = { '（': '(', '）': ')', '，': ',', '：': ':', '＝': '=', '＂': '"', '＇': "'", '“': '"', '”': '"', '‘': "'", '’': "'", '＋': '+', '－': '-', '＊': '*', '／': '/', '；': ';', '［': '[', '］': ']', '｛': '{', '｝': '}', '＜': '<', '＞': '>', '。': '.', '．': '.', '　': '半形空白', '＃': '#', '＆': '&', '｜': '|', '！': '!', '％': '%' };
const STD_NAMES = ['cout', 'cin', 'endl', 'string', 'vector', 'sort', 'swap', 'max', 'min', 'abs', 'setprecision', 'fixed', 'getline', 'pair', 'queue', 'stack', 'map', 'set', 'reverse', 'sqrt', 'pow', 'setw', 'setfill', 'printf', 'scanf', 'greater', 'ws'];
function friendlyCE(d) {
  if (!d) return '';
  const m = d.msg || '', at = d.line ? `第 ${d.line} 行：` : '';
  let r;
  if ((r = m.match(/(?:character|unexpected character) <U\+([0-9A-F]+)>/)) || /non-ASCII characters are not allowed/.test(m)) {
    const ch = r ? String.fromCodePoint(parseInt(r[1], 16)) : '';
    return `${at}出現全形符號${ch ? `「${ch}」` : ''}。程式的符號都要用半形${FULLWIDTH[ch] ? `，請改成「${FULLWIDTH[ch]}」` : ''}（切換到英數模式再打）。`;
  }
  if (/^expected ';'/.test(m)) return `${at}少了分號「;」。每個敘述的結尾都要加分號（錯誤常常是在上一行的結尾）。`;
  if ((r = m.match(/use of undeclared identifier '(\w+)'(?:; did you mean '(\w+)'\?)?/))) {
    if (r[2]) return `${at}「${r[1]}」沒有宣告。你是不是要寫「${r[2]}」？（C++ 有分大小寫）`;
    if (STD_NAMES.includes(r[1])) return `${at}「${r[1]}」沒有定義：是不是忘了寫 using namespace std;，或少了對應的 #include（例如 #include <iostream>）？`;
    return `${at}「${r[1]}」沒有宣告。變數使用前要先宣告型態（例如 int ${r[1]};），也請檢查拼字和大小寫。`;
  }
  if ((r = m.match(/unknown type name '(\w+)'/))) return `${at}不認識的型態「${r[1]}」。請檢查拼字（例如 int、double、string），或是否少了 #include、using namespace std;。`;
  if ((r = m.match(/'(.+)' file not found/))) return `${at}找不到標頭檔 <${r[1]}>，請檢查 #include 的名稱是否拼對。`;
  if ((r = m.match(/reference to '(\w+)' is ambiguous/))) return `${at}名稱「${r[1]}」和 C++ 內建的名稱衝突了，請把這個變數或函式換一個名字（例如 cnt、total、myMax）。`;
  if ((r = m.match(/redefinition of '(\w+)'/))) return `${at}「${r[1]}」重複宣告了。同一個範圍裡，一個名稱只能宣告一次。`;
  if (/missing terminating '"' character/.test(m)) return `${at}字串少了結尾的雙引號 "。`;
  if (/missing terminating ' character/.test(m)) return `${at}字元少了結尾的單引號 '。字串（好幾個字）要用雙引號 "…"。`;
  if (/extraneous closing brace/.test(m)) return `${at}多了一個右大括號「}」。`;
  if (/^expected '}'/.test(m)) return `${at}大括號 { } 沒有成對，少了右大括號「}」。`;
  if (/^expected '\)'/.test(m)) return `${at}小括號 ( ) 沒有成對，少了右括號「)」。`;
  if (/^expected '\]'/.test(m)) return `${at}中括號 [ ] 沒有成對，少了「]」。`;
  if ((r = m.match(/^expected '\(' after '(\w+)'/))) return `${at}${r[1]} 後面的條件要用小括號包起來，例如 ${r[1]} (x > 0)。`;
  if (/^expected expression/.test(m)) return `${at}運算式不完整，這裡少了東西（或多了一個符號）。`;
  if (/^expected unqualified-id/.test(m)) return `${at}語法錯誤：可能多了符號、少了大括號，或把程式寫在函式外面。`;
  if (/invalid operands to binary expression/.test(m)) {
    if (/istream/.test(m)) return `${at}cin 要用 >>（資料流進變數），cout 才用 <<。方向是不是寫反了？`;
    if (/ostream/.test(m)) return `${at}cout 要用 <<（資料流向螢幕），不是 >>；或是這個資料不能直接輸出。`;
    return `${at}這兩個資料的型態不能做這個運算（${m.replace('invalid operands to binary expression ', '')}）。`;
  }
  if ((r = m.match(/invalid suffix '(\w+)' on (?:integer|floating) constant/))) return `${at}數字後面直接接了文字「${r[1]}」。變數名稱不能用數字開頭（例如 1a 不行，a1 可以），乘法要寫 *。`;
  if ((r = m.match(/no matching function for call to '(\w+)'/))) return `${at}呼叫函式「${r[1]}」時，參數的數量或型態不對。`;
  if (/too (few|many) arguments to function call/.test(m)) return `${at}呼叫函式時參數的數量不對（太${/few/.test(m) ? '少' : '多'}了）。`;
  if (/non-void function does not return a value/.test(m)) return `${at}這個函式的最後要用 return 傳回一個值。`;
  if (/using the result of an assignment as a condition/.test(m)) return `${at}條件裡用了「=」（指定）。判斷「是否相等」要用「==」。`;
  if ((r = m.match(/variable '(\w+)' is (?:uninitialized|used uninitialized)/))) return `${at}變數 ${r[1]} 還沒有設定初始值就拿來用了，例如 int ${r[1]} = 0;`;
  if (/format specifies type/.test(m)) return `${at}printf / scanf 的格式（%d、%lf…）和變數的型態不一致。`;
  if (/cannot use '(throw|try)' with exceptions disabled/.test(m)) return `${at}本系統不支援例外處理（try / throw），請改用 if 判斷。`;
  if (/undefined symbol: main/.test(m)) return '找不到 main 函式。每個 C++ 程式都要有 int main() { … }，請檢查拼字。';
  if ((r = m.match(/undefined symbol: (.+)/))) return `函式「${r[1]}」只有宣告、沒有寫內容。`;
  if (/expected function body after function declarator/.test(m)) return `${at}函式宣告後面要接 { … }，或結尾加分號。`;
  if (/is not assignable/.test(m)) return `${at}等號左邊必須是可以存放資料的變數。判斷相等要用 ==。`;
  if (/array subscript is not an integer/.test(m)) return `${at}陣列的索引必須是整數。`;
  return `${at}${m}`;
}
function friendlyRE(r) {
  const e = r.error || {}, m = String(e.msg || '');
  if (e.type === 'exit') return `程式結束時傳回 ${r.exitCode}（main 最後應該 return 0;）`;
  if (/divide by zero|division by zero|remainder by zero/i.test(m)) return '除以 0 了！（整數不能除以 0，也不能 % 0）';
  if (/out of bounds|memory access/i.test(m)) return '存取到不屬於程式的記憶體：陣列的索引可能超出範圍（例如 a[n] 或負的索引），或陣列宣告得太小。';
  if (/call stack|stack size|too much recursion/i.test(m)) return '函式呼叫太多層了：遞迴是不是沒有結束條件？（在瀏覽器裡遞迴大約只能到 8000 層，太深的 DFS 請改用 BFS 或自己用 stack）';
  if (/unreachable/i.test(m)) return '程式不正常結束：可能是有傳回值的函式最後少了 return、使用了還沒設定值的變數，或呼叫了 abort。' + (r.stderr ? '\n' + r.stderr.slice(0, 200) : '');
  if (/unrepresentable|float.*integer/i.test(m)) return '小數轉換成整數時超出範圍。';
  if (/memory|allocation/i.test(m)) return '記憶體不足：陣列或 vector 是不是開太大了？';
  return '執行錯誤：' + m;
}

// ============ 程式編輯器 ============
const CPP_WORDS = [
  ['cout', '輸出', 'v'], ['cin', '輸入', 'v'], ['endl', '換行', 'v'], ['int', '整數', 'k'], ['double', '小數', 'k'], ['long long', '很大的整數', 'k'],
  ['char', '字元', 'k'], ['bool', '真假', 'k'], ['string', '字串', 'k'], ['void', '沒有傳回值', 'k'], ['const', '常數', 'k'], ['auto', '自動判斷型態', 'k'],
  ['if', '如果', 'k'], ['else', '否則', 'k'], ['for', '迴圈（計數）', 'k'], ['while', '迴圈（條件）', 'k'], ['do', 'do-while 迴圈', 'k'], ['switch', '多選一', 'k'],
  ['case', '情況', 'k'], ['default', '其他情況', 'k'], ['break', '跳出', 'k'], ['continue', '下一圈', 'k'], ['return', '傳回', 'k'], ['true', '真', 'k'], ['false', '假', 'k'],
  ['struct', '結構', 'k'], ['include', '載入標頭檔', 'k'], ['using namespace std;', '使用標準名稱空間', 'k'], ['main', '主程式', 'f'],
  ['setprecision', '小數位數（iomanip）', 'f'], ['fixed', '固定小數點', 'v'], ['setw', '欄寬（iomanip）', 'f'], ['getline', '讀一整行', 'f'],
  ['sqrt', '開根號（cmath）', 'f'], ['pow', '次方（cmath）', 'f'], ['abs', '絕對值', 'f'], ['max', '較大值', 'f'], ['min', '較小值', 'f'], ['swap', '交換', 'f'],
  ['sort', '排序（algorithm）', 'f'], ['reverse', '反轉（algorithm）', 'f'], ['printf', '格式化輸出', 'f'], ['scanf', '格式化輸入', 'f'],
  ['vector', '動態陣列', 'k'], ['push_back', '加到最後', 'f'], ['size', '大小', 'f'], ['length', '字串長度', 'f'], ['substr', '取子字串', 'f'],
  ['iostream', '輸出入標頭檔', 'k'], ['iomanip', '輸出格式標頭檔', 'k'], ['cmath', '數學標頭檔', 'k'], ['algorithm', '演算法標頭檔', 'k'],
  ['isdigit', '是不是數字', 'f'], ['isalpha', '是不是字母', 'f'], ['toupper', '轉大寫', 'f'], ['tolower', '轉小寫', 'f'], ['memset', '設定記憶體', 'f'],
  ['lower_bound', '二分搜尋（第一個 >=）', 'f'], ['upper_bound', '二分搜尋（第一個 >）', 'f'], ['queue', '佇列', 'k'], ['stack', '堆疊', 'k'], ['pair', '一對資料', 'k'],
];
function cppHint(cm) {
  const cur = cm.getCursor(), line = cm.getLine(cur.line);
  let start = cur.ch; while (start > 0 && /\w/.test(line[start - 1])) start--;
  const word = line.slice(start, cur.ch);
  if (!word) return null;
  const lw = word.toLowerCase();
  const seen = new Set(CPP_WORDS.map(w => w[0]));
  const vars = [];
  const text = cm.getValue().replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/gm, '');
  for (const m of text.matchAll(/\b([A-Za-z_]\w*)\b/g)) if (!seen.has(m[1]) && m[1] !== word) { seen.add(m[1]); vars.push([m[1], '變數', 'var']); }
  const list = [...CPP_WORDS, ...vars].filter(([w]) => w.toLowerCase().startsWith(lw) && w !== word)
    .sort((a, b) => (a[0].startsWith(word) ? 0 : 1) - (b[0].startsWith(word) ? 0 : 1) || a[0].length - b[0].length);
  if (!list.length) return null;
  return {
    from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, cur.ch),
    list: list.slice(0, 12).map(([w, desc]) => ({ text: w, render(el) { el.innerHTML = `${esc(w)}<span class="hd">${esc(desc)}</span>`; } })),
  };
}
function createEditor(el, value, { onChange, readOnly } = {}) {
  const cm = CodeMirror(el, {
    value, mode: 'text/x-c++src', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
    matchBrackets: true, autoCloseBrackets: !readOnly, styleActiveLine: !readOnly, readOnly: !!readOnly,
    gutters: ['err-gutter', 'CodeMirror-linenumbers'],
    extraKeys: {
      Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('    '),
      'Shift-Tab': cm => cm.indentSelection('subtract'),
      'Ctrl-Space': cm => cm.showHint({ hint: cppHint, completeSingle: false }),
    },
  });
  if (!readOnly) {
    cm.on('inputRead', (cm, change) => {
      if (cm.state.completionActive || !/^[A-Za-z_]$/.test(change.text[0])) return;
      const tok = cm.getTokenAt(cm.getCursor());
      if (/string|comment|meta/.test(tok.type || '')) return;
      cm.showHint({ hint: cppHint, completeSingle: false });
    });
    if (onChange) cm.on('change', () => onChange(cm));
  }
  return cm;
}
// 標示錯誤行、警告行與全形符號
function markErrors(cm, diags) {
  cm.clearGutter('err-gutter');
  (cm._lines || []).forEach(([l, c]) => cm.removeLineClass(l, 'background', c));
  (cm._fw || []).forEach(m => m.clear());
  cm._lines = []; cm._fw = [];
  cm.eachLine(lh => {
    const ln = cm.getLineNumber(lh);
    for (const tok of cm.getLineTokens(ln)) {
      if (/string|comment/.test(tok.type || '')) continue;
      for (let i = 0; i < tok.string.length; i++) {
        const f = FULLWIDTH[tok.string[i]];
        if (f) cm._fw.push(cm.markText({ line: ln, ch: tok.start + i }, { line: ln, ch: tok.start + i + 1 }, { className: 'cm-fullwidth', title: `全形符號，請改成半形「${f}」` }));
      }
    }
  });
  const done = new Set();
  for (const d of diags || []) {
    if (!d.line || done.has(d.line)) continue;
    done.add(d.line);
    const l = Math.min(d.line - 1, cm.lineCount() - 1), cls = d.kind === 'error' ? 'cm-error-line' : 'cm-warn-line';
    cm.addLineClass(l, 'background', cls); cm._lines.push([l, cls]);
    const mk = document.createElement('span'); mk.className = 'err-marker ' + d.kind; mk.textContent = '●'; mk.title = friendlyCE(d);
    cm.setGutterMarker(l, 'err-gutter', mk);
  }
}
function diagHtml(diags, max = 4) {
  const errs = diags.filter(d => d.kind === 'error'), warns = diags.filter(d => d.kind === 'warning');
  const show = (errs.length ? errs : warns).slice(0, max);
  return show.map(d => `<div class="diag ${d.kind}"><b>${d.kind === 'error' ? '✘ 錯誤' : '⚠ 提醒'}</b> ${esc(friendlyCE(d))}
    <details><summary>原始訊息</summary><pre>${esc(`第 ${d.line} 行第 ${d.col} 字：${d.msg}${d.snippet ? '\n' + d.snippet : ''}`)}</pre></details></div>`).join('')
    + (errs.length > max ? `<div class="muted small">…還有 ${errs.length - max} 個錯誤（先改第一個，後面的常常會跟著消失）</div>` : '');
}

// ============ 版面 ============
function renderNav() {
  const r = location.hash.split('?')[0].split('/')[1] || '';
  const links = !S ? [] : [
    ['problems', '題目'], ['submissions', isTeacher() ? '解題動態' : '我的紀錄'],
    ...(isTeacher() ? [['scoreboard', '成績總表'], ['admin', '管理']] : []),
  ];
  $('#nav').innerHTML = links.map(([k, t]) => `<a href="#/${k}" class="${r === k || (r === 'problem' && k === 'problems') || (r === 'submission' && k === 'submissions') ? 'on' : ''}">${t}</a>`).join('');
  if (!S) { $('#userbox').innerHTML = ''; return; }
  const n = notifList().length;
  $('#userbox').innerHTML = `
    <button class="bell" id="bell" title="老師的回饋">🔔<span class="dot" ${n ? '' : 'style="display:none"'}>${n}</span></button>
    ${isTeacher() ? '' : `<button class="bell" id="syncBtn" title="重新整理成績與留言">🔄</button>`}
    <a href="#/me" class="who">${isTeacher() ? '👩‍🏫 ' : ''}${S.user.cls ? esc(S.user.cls) + ' ' : ''}${esc(S.user.name)}</a>
    <button class="btn sm" id="logout">登出</button>`;
  $('#logout').onclick = logout;
  $('#bell').onclick = toggleNotif;
  if ($('#syncBtn')) $('#syncBtn').onclick = async () => {
    const b = $('#syncBtn'); b.classList.add('spin');
    await backgroundSync(true); toast('已更新成績與留言');
  };
}
function notifList() {
  if (!S) return [];
  if (isTeacher()) return S.notifs || [];
  return (S.comments || []).filter(c => c.role === 'teacher' && !c.read);
}
function toggleNotif() {
  const old = $('.notif-pop'); if (old) { old.remove(); return; }
  const list = notifList();
  const pid = id => { const s = (S.subs || []).find(x => x.id === id); return s ? s.pid : ''; };
  const pop = document.createElement('div'); pop.className = 'notif-pop';
  pop.innerHTML = list.length ? list.map(n => `<a href="#/submission/${n.submissionId}">
      <b>${esc(n.authorName)}</b> 在提交 #${n.submissionId} ${esc(pid(n.submissionId))} 留言${n.line ? `（第 ${n.line} 行）` : ''}：<br><span class="muted small">${esc(String(n.text).slice(0, 80))}</span></a>`).join('')
    : `<div style="padding:14px" class="muted">目前沒有新的回饋${isTeacher() ? '' : '<br><span class="small">按 🔄 可以檢查老師有沒有新的留言</span>'}</div>`;
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', function h(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', h); } }), 0);
}
async function logout() {
  S = null; store.del('cj-state');
  try { google.accounts.id.disableAutoSelect(); } catch { }
  location.hash = '#/login'; renderNav();
}

// ============ 路由 ============
async function router() {
  clearPageTimers();
  $('.notif-pop')?.remove();
  const [, page = '', arg = ''] = location.hash.split('?')[0].split('/');
  if (!CFG.API_URL || /請貼上/.test(CFG.API_URL)) {
    app().innerHTML = '<div class="card"><h2>尚未設定</h2><p>請編輯 <code>config.js</code>，填入 Apps Script 網址（API_URL）。</p></div>';
    return;
  }
  if (!S && page !== 'login') { location.hash = '#/login'; return; }
  renderNav();
  const views = { login: viewLogin, problems: viewProblems, problem: viewProblem, submissions: viewSubmissions, submission: viewSubmission, scoreboard: viewScoreboard, admin: viewAdmin, me: viewMe };
  const v = views[page];
  if (!v) { location.hash = '#/problems'; return; }
  if (['scoreboard', 'admin'].includes(page) && !isTeacher()) { location.hash = '#/problems'; return; }
  try { await v(decodeURIComponent(arg)); }
  catch (e) {
    app().innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div><button class="btn primary" id="retryPage" style="margin-top:10px">↻ 重新載入</button></div>`;
    $('#retryPage').onclick = router;
    console.error(e);
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

// ============ 登入 ============
function viewLogin() {
  if (S) { location.hash = '#/problems'; return; }
  app().innerHTML = `<div class="login-wrap"><div class="card" style="text-align:center">
    <h1>NEHS C++ Judge</h1><div class="muted">資訊科技 · C++ 線上解題系統</div>
    <div class="series-intro">${SERIES_KEYS.map(k => `<div><b>${esc(DATA.series[k].name)}</b><span>${PROBS.filter(p => p.series === k).length} 題</span></div>`).join('')}</div>
    <p style="margin:20px 0 12px">請使用<b>學校的 Google 帳號</b>登入${CFG.DOMAIN ? `<br><span class="muted small">（@${esc(CFG.DOMAIN)}）</span>` : ''}</p>
    <div id="gbtn" style="display:flex;justify-content:center;min-height:44px"><span class="muted">Google 登入按鈕載入中…</span></div>
    ${CFG.DEV_LOGIN ? '<div class="row" style="justify-content:center;margin-top:12px"><input type="text" id="devMail" placeholder="測試用 Email" style="width:220px"><button class="btn" id="devGo">測試登入</button></div>' : ''}
    <div class="err" id="lerr"></div>
  </div></div>`;
  // 先叫醒後端（Apps Script 第一次呼叫比較慢），等學生按完 Google 登入時就已經準備好了
  fetch(CFG.API_URL, { mode: 'no-cors' }).catch(() => { });
  const finish = async credential => {
    $('#lerr').textContent = ''; $('#gbtn').innerHTML = '<span class="muted">登入中…</span>';
    try {
      const d = await api('/api/login', { credential });
      S = { token: d.token, subs: [] };
      applySync(d);
      location.hash = '#/problems';
      Judge.start().catch(() => { });
    } catch (err) { $('#lerr').textContent = err.message; renderBtn(); }
  };
  const renderBtn = () => {
    if (!window.google || !google.accounts) return;
    $('#gbtn').innerHTML = '';
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW', width: 280 });
  };
  const init = (n = 0) => {
    if (!$('#gbtn')) return;
    if (!window.google || !google.accounts) { if (n < 50) setTimeout(() => init(n + 1), 200); else $('#gbtn').innerHTML = '<span class="err">Google 登入元件載入失敗，請重新整理</span>'; return; }
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: r => finish(r.credential), hd: CFG.DOMAIN || undefined, auto_select: true, ux_mode: 'popup' });
    renderBtn();
    google.accounts.id.prompt();
  };
  init();
  if (CFG.DEV_LOGIN) $('#devGo').onclick = () => finish('dev:' + $('#devMail').value.trim());
}

function viewMe() {
  const used = (() => { try { return Math.round(JSON.stringify(localStorage).length / 1024); } catch { return 0; } })();
  app().innerHTML = `<div class="login-wrap" style="max-width:560px"><div class="card">
    <h2>帳號資訊</h2>
    <p>${esc(S.user.name)}<br><span class="muted">${esc(S.user.email)}</span><br>${S.user.cls ? `${esc(S.user.cls)} 班 ${S.user.seat} 號` : '老師'}</p>
    <p class="muted small">使用學校 Google 帳號登入，${'登入狀態會保留 14 天'}；在公用電腦上使用完畢請記得按「登出」。<br>
      上次與伺服器同步：${S.syncedAt ? fmtTime(S.syncedAt) : '—'}</p>
    <h3>C++ 編譯器</h3>
    <p id="ccInfo" class="small"></p>
    <p class="muted small">編譯器（約 23 MB）第一次使用時下載，之後存在這台電腦的瀏覽器裡，不用再下載。如果編譯器一直出錯，可以清除後重新下載。這個瀏覽器目前為本網站存了約 ${used} KB 的資料（草稿、提交紀錄）。</p>
    <button class="btn" id="clearCC">清除編譯器快取</button>
  </div></div>`;
  const off = Judge.onStatus(j => {
    const el = $('#ccInfo'); if (!el) { off(); return; }
    el.innerHTML = j.status === 'ready' ? `● 已就緒${j.pch ? '（已啟用快速編譯）' : ''}` : j.status === 'loading' ? '載入中…' : j.status === 'error' ? '✘ 載入失敗：' + esc(j.error || '') : '尚未載入';
  });
  $('#clearCC').onclick = async () => {
    try { for (const k of await caches.keys()) if (k.startsWith('cj-')) await caches.delete(k); toast('已清除，重新整理後會重新下載'); } catch (e) { toast(e.message); }
  };
}

// ============ 題目列表 ============
function myStat(p) { return isTeacher() ? null : (S.mine || {})[p.id] || null; }
function statusCell(p) {
  const m = myStat(p);
  if (!m) return '<span class="muted">—</span>';
  if (m.ac) {
    const rk = rankOf(p.id);
    return `<span class="mine-ac">✔ 通過</span>${rk ? ' ' + rankBadge(rk) : ''}`;
  }
  return `<span class="mine-tried">✘ ${m.best} 分</span> <span class="muted small">(${m.tries} 次)</span>`;
}
function rankOf(pid) {
  const list = (S.ranks || {})[pid] || [];
  const i = list.findIndex(r => r[0] === S.user.seat);
  return i >= 0 ? i + 1 : null;
}
function viewProblems() {
  const probs = visibleProbs();
  const series = SERIES_KEYS.filter(k => probs.some(p => p.series === k));
  let cur = store.get('cj-series');
  if (!series.includes(cur)) cur = series[0];
  const onlyTodo = store.get('cj-todo') === '1';
  const acCount = list => list.filter(p => myStat(p) && myStat(p).ac).length;
  app().innerHTML = `
    <div class="card">
      <div class="series-tabs">${series.map(k => {
        const list = probs.filter(p => p.series === k), ac = acCount(list);
        return `<button data-s="${k}" class="${k === cur ? 'on' : ''}"><b>${esc(DATA.series[k].name)}</b>
          <span class="small">${esc(DATA.series[k].desc)}</span>
          ${isTeacher() ? `<span class="small muted">${list.length} 題${list.filter(isHidden).length ? `（${list.filter(isHidden).length} 題隱藏）` : ''}</span>`
            : `<span class="bar"><i style="width:${list.length ? ac / list.length * 100 : 0}%"></i></span><span class="small">已通過 ${ac} / ${list.length}</span>`}</button>`;
      }).join('')}</div>
      <div class="row" style="margin-top:12px">
        <input type="text" id="q" placeholder="搜尋題號、題目、標籤…" style="width:240px">
        ${isTeacher() ? '' : `<label class="small"><input type="checkbox" id="todo" ${onlyTodo ? 'checked' : ''}> 只顯示還沒通過的</label>`}
        <span class="spacer"></span>
        ${!isTeacher() && S.syncedAt ? `<span class="muted small">本班資料更新於 ${fmtTime(S.syncedAt, true)}</span>` : ''}
      </div>
    </div>
    <div id="plist"></div>`;
  const render = () => {
    const q = ($('#q').value || '').trim().toLowerCase(), todo = $('#todo') && $('#todo').checked;
    const list = probs.filter(p => p.series === cur && (!q || (p.id + p.title + p.tags.join(' ') + DATA.topics[p.topic].name).toLowerCase().includes(q)) && (!todo || !(myStat(p) && myStat(p).ac)));
    const topics = [...new Set(list.map(p => p.topic))];
    $('#plist').innerHTML = topics.map(t => {
      const tl = list.filter(p => p.topic === t), all = probs.filter(p => p.topic === t);
      return `<div class="card"><div class="row" style="margin-bottom:8px"><h3 style="margin:0">${esc(DATA.topics[t].name)}</h3>
        <span class="muted small">${isTeacher() ? `${all.length} 題${isHidden({ id: '', series: '', topic: t }) ? ' · <b class="mine-tried">隱藏中</b>' : ''}` : `已通過 ${acCount(all)} / ${all.length}`}</span></div>
        <div class="table-wrap"><table class="list plist"><thead><tr><th style="width:64px">題號</th><th>題目</th><th style="width:80px">難度</th>
          ${isTeacher() ? '<th style="width:90px">狀態</th>' : '<th style="width:110px">本班通過</th><th style="width:220px">我的狀態</th>'}</tr></thead><tbody>
        ${tl.map(p => `<tr data-go="${p.id}" class="${myStat(p) && myStat(p).ac ? 'done' : ''}">
          <td class="pid">${p.id}</td>
          <td><a href="#/problem/${p.id}"><b>${esc(p.title)}</b></a> ${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</td>
          <td>${stars(p.difficulty)}</td>
          ${isTeacher() ? `<td>${isHidden(p) ? '<span class="muted">隱藏</span>' : '公開'}</td>`
            : `<td>${((S.cls || {})[p.id] || {}).ac || 0} 人</td><td>${statusCell(p)}</td>`}
        </tr>`).join('')}</tbody></table></div></div>`;
    }).join('') || '<div class="card muted">沒有符合的題目。</div>';
    $$('tr[data-go]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = '#/problem/' + tr.dataset.go; });
  };
  $$('.series-tabs button').forEach(b => b.onclick = () => { cur = b.dataset.s; store.set('cj-series', cur); $$('.series-tabs button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $('#q').oninput = render;
  if ($('#todo')) $('#todo').onchange = () => { store.set('cj-todo', $('#todo').checked ? '1' : '0'); render(); };
  render();
}

// ============ 題目頁（解題） ============
const TEMPLATE = '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
let LESSON_CODES = [];
function renderLesson(text) {
  LESSON_CODES = [];
  const parts = String(text).split(/```(?:cpp|c\+\+)?\n?([\s\S]*?)```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/\n$/, ''), idx = LESSON_CODES.push(code) - 1;
      return `<div class="lcode"><div class="lcode-bar"><span>C++</span><span class="spacer"></span>
        <button class="btn sm" data-lcopy="${idx}">📋 複製</button><button class="btn sm" data-lput="${idx}">↪ 放到編輯器</button></div>
        <pre class="cm-s-default">${highlightCpp(code)}</pre></div>`;
    }
    const lines = part.replace(/^\n+|\n+$/g, '').split('\n');
    let html = '', buf = [], table = [];
    const flushP = () => { if (buf.length) html += `<p>${buf.map(esc).join('<br>')}</p>`; buf = []; };
    const flushT = () => {
      if (table.length) html += `<table class="ltable">${table.map((r, ri) => `<tr>${r.map(c => ri === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
      table = [];
    };
    for (const line of lines) {
      if (/^\s*\|/.test(line)) { flushP(); table.push(line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'))); }
      else if (!line.trim()) { flushT(); flushP(); }
      else { flushT(); buf.push(line); }
    }
    flushT(); flushP();
    return html;
  }).join('');
}
function highlightCpp(code) {
  if (!CodeMirror.runMode) return esc(code);
  let out = '';
  CodeMirror.runMode(code, 'text/x-c++src', (txt, style) => { out += style ? `<span class="cm-${style.split(' ').join(' cm-')}">${esc(txt)}</span>` : esc(txt); });
  return out;
}
function compilerStatusText(j) {
  if (j.status === 'ready') return { cls: 'ready', text: j.pch ? '● C++ 編譯器已就緒' : '● C++ 編譯器已就緒（快速編譯準備中）' };
  if (j.status === 'error') return { cls: 'bad', text: '✘ 編譯器載入失敗，請重新整理網頁' };
  const pg = j.progress;
  if (pg && pg.total > 1 && pg.done < pg.total) return { cls: '', text: `C++ 編譯器下載中 ${Math.floor(pg.done / pg.total * 100)}%（只有第一次需要下載）` };
  return { cls: '', text: 'C++ 編譯器準備中…' };
}

async function viewProblem(id) {
  const list = visibleProbs();
  const p = PMAP[id];
  if (!p || !list.includes(p)) { app().innerHTML = `<div class="card"><h2>找不到題目 ${esc(id)}</h2><p>這一題可能還沒有開放。</p><a class="btn" href="#/problems">← 回題目列表</a></div>`; return; }
  Judge.start().catch(() => { });
  const idx = list.indexOf(p), prev = list[idx - 1], next = list[idx + 1];
  const draftKey = `cj-draft-${S.user.email}-${p.id}`;
  const pendingLoad = sessionStorage.getItem('cj-load-code');
  sessionStorage.removeItem('cj-load-code');
  const initial = pendingLoad ?? store.get(draftKey) ?? p.template ?? TEMPLATE;
  const sameSeries = list.filter(x => x.series === p.series);
  const topic = DATA.topics[p.topic];
  const navBar = where => `<div class="pnav ${where}">
      <a class="btn" href="#/problems">← 題目列表</a>
      ${prev ? `<a class="btn" href="#/problem/${prev.id}" title="${esc(prev.id + ' ' + prev.title)}">‹ 上一題</a>` : '<span class="btn" disabled>‹ 上一題</span>'}
      ${next ? `<a class="btn ${where === 'bottom' ? 'primary' : ''}" href="#/problem/${next.id}" title="${esc(next.id + ' ' + next.title)}">下一題 ›</a>` : '<span class="btn" disabled>下一題 ›</span>'}
      <span class="spacer"></span>
      ${where === 'top' ? `<span class="muted small pcount">${esc(DATA.series[p.series].name)} 第 ${sameSeries.indexOf(p) + 1} / ${sameSeries.length} 題</span>
        <select class="jump" title="跳到其他題目">${sameSeries.map(x => `<option value="${x.id}" ${x === p ? 'selected' : ''}>${x.id} ${esc(x.title)}${myStat(x) && myStat(x).ac ? ' ✔' : ''}</option>`).join('')}</select>`
        : next ? `<span class="muted small">下一題：${next.id} ${esc(next.title)}</span>` : ''}
    </div>`;

  app().innerHTML = `
  ${navBar('top')}
  <div class="problem-layout">
    <div>
      <div class="card">
        <div class="ptitle"><span class="pid">${p.id}</span><h2 style="margin:0">${esc(p.title)}</h2>${myStat(p) && myStat(p).ac ? '<span class="mine-ac">✔ 已通過</span>' : ''}</div>
        <div class="muted small" style="margin:4px 0 10px">${esc(DATA.series[p.series].name)} · ${esc(topic.name)} · ${stars(p.difficulty)} · 時間限制 ${p.timeLimitMs / 1000} 秒 · ${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <details class="lesson" ${store.get('cj-lesson-' + p.topic) === 'open' ? 'open' : ''}><summary>📘 語法說明：${esc(topic.name)}</summary><div class="lesson-body">${renderLesson(topic.text)}</div></details>
        <h3>題目內容</h3><div class="pbody">${esc(p.content)}</div>
        <h3>輸入說明</h3><div class="pbody">${esc(p.inputDesc)}</div>
        <h3>輸出說明</h3><div class="pbody">${esc(p.outputDesc)}</div>
        ${p.samples.map((s, i) => `<h3>範例 ${i + 1}</h3><div class="sample">
          <div class="box"><div class="h">範例輸入<span class="spacer"></span><a href="javascript:void 0" data-copy-in="${i}">放到測試輸入</a></div><pre>${esc(s.input) || '<span class="muted">（無）</span>'}</pre></div>
          <div class="box"><div class="h">範例輸出</div><pre>${esc(s.output)}</pre></div></div>`).join('')}
        ${p.hint ? `<h3>提示</h3><div class="hintbox">${esc(p.hint)}</div>` : ''}
      </div>
      <div class="card">
        <div class="tabs" id="ptabs"><button data-t="mine" class="on">${isTeacher() ? '我的測試' : '我的提交'}</button><button data-t="rank">🏆 ${isTeacher() ? '完成名次' : '本班完成名次'}</button>${isTeacher() ? '<button data-t="students">全班狀況</button>' : ''}</div>
        <div id="ptab"></div>
      </div>
      ${navBar('bottom')}
    </div>
    <div>
      <div class="card editor-card">
        <div class="toolbar">
          <b>C++ 程式碼</b><span class="cc-status" id="ccst"></span><span class="spacer"></span>
          <button class="btn sm" id="btnReset" title="恢復成空白的程式架構">↺ 重設</button>
          <button class="btn" id="btnRun" title="Ctrl + Enter">▶ 執行測試</button>
          <button class="btn primary" id="btnSubmit">送出評測</button>
        </div>
        <div id="editor"></div>
        <div class="lint" id="lint"></div>
        <div class="io-grid">
          <div><label>測試輸入</label><textarea id="stdin" spellcheck="false">${esc(p.samples[0] ? p.samples[0].input : '')}</textarea></div>
          <div><label>執行結果 <span id="cmpRes"></span></label><pre class="out" id="stdout"></pre></div>
        </div>
        <div class="muted small" style="margin-top:4px">💡 打字時會自動提示關鍵字（Ctrl+空白鍵）；程式會自動存成草稿。「執行測試」不會記錄成績，「送出評測」才會。</div>
        <div id="result"></div>
      </div>
    </div>
  </div>`;

  $$('.jump').forEach(s => s.onchange = () => { location.hash = '#/problem/' + s.value; });
  const lessonEl = $('details.lesson');
  lessonEl.ontoggle = () => store.set('cj-lesson-' + p.topic, lessonEl.open ? 'open' : '');

  const cm = createEditor($('#editor'), initial, { onChange: cm => { store.set(draftKey, cm.getValue()); scheduleLint(); } });
  setTimeout(() => cm.refresh(), 0);

  // 停止打字 1.5 秒後檢查語法（編譯器空閒時才做）
  let lintTimer, lintSeq = 0;
  const lintBox = (diags, ok) => {
    const box = $('#lint'); if (!box) return;
    if (ok === null) { box.className = 'lint'; box.innerHTML = ''; return; }
    const errs = diags.filter(d => d.kind === 'error');
    if (errs.length) { box.className = 'lint bad'; box.innerHTML = diagHtml(diags, 2); }
    else if (diags.length) { box.className = 'lint warn'; box.innerHTML = diagHtml(diags, 2); }
    else { box.className = 'lint good'; box.textContent = '✔ 語法檢查通過'; }
  };
  async function lint() {
    const code = cm.getValue(), my = ++lintSeq;
    if (!code.trim()) { markErrors(cm, []); lintBox([], null); return; }
    const r = await Judge.lint(code).catch(() => null);
    if (!r || my !== lintSeq || cm.getValue() !== code) return;
    markErrors(cm, r.diags); lintBox(r.diags, r.success);
  }
  function scheduleLint() { clearTimeout(lintTimer); lintTimer = setTimeout(lint, 1500); }

  const off = Judge.onStatus(j => {
    const el = $('#ccst'); if (!el) { off(); return; }
    const st = compilerStatusText(j);
    el.className = 'cc-status ' + st.cls; el.textContent = st.text;
    if (j.status === 'ready' && !lint.done) { lint.done = true; lint(); }
  });

  $$('[data-copy-in]').forEach(a => a.onclick = () => { $('#stdin').value = p.samples[+a.dataset.copyIn].input; });
  $$('[data-lcopy]').forEach(b => b.onclick = async () => {
    const code = LESSON_CODES[+b.dataset.lcopy];
    try { await navigator.clipboard.writeText(code); } catch { const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast('已複製程式碼');
  });
  $$('[data-lput]').forEach(b => b.onclick = () => {
    const code = LESSON_CODES[+b.dataset.lput];
    if (cm.getValue().trim() && cm.getValue() !== TEMPLATE && !confirm('要用範例程式碼取代編輯器裡目前的程式嗎？\n（按「取消」則插入到游標位置）')) cm.replaceSelection(code);
    else cm.setValue(code);
    cm.focus(); toast('已放到編輯器，可以按「執行測試」試試看');
  });
  $('#btnReset').onclick = () => { if (confirm('確定要清除目前的程式，恢復成空白架構嗎？')) { cm.setValue(p.template || TEMPLATE); cm.setCursor(4, 4); cm.focus(); } };

  const busy = on => { $('#btnRun').disabled = $('#btnSubmit').disabled = on; };
  async function run() {
    const out = $('#stdout'); busy(true);
    $('#cmpRes').innerHTML = '';
    out.innerHTML = `<span class="muted">${Judge.status === 'ready' ? '編譯中…' : '等待編譯器載入…（第一次使用需要下載）'}</span>`;
    try {
      const code = cm.getValue();
      const c = await Judge.compile(code);
      markErrors(cm, c.diags); lintBox(c.diags, c.success);
      if (!c.success) { out.innerHTML = `<span class="e">✘ 編譯錯誤，請看程式碼下方的說明</span>`; return; }
      out.innerHTML = '<span class="muted">執行中…</span>';
      const input = $('#stdin').value;
      const r = await Judge.run(c.module, input, p.timeLimitMs);
      let html = esc(r.stdout || '');
      if (r.status === 'RE') html += `<span class="e">${html ? '\n' : ''}✘ 執行錯誤：${esc(friendlyRE(r))}</span>`;
      else if (r.status === 'TLE') html += `<span class="e">\n✘ 執行超過 ${p.timeLimitMs / 1000} 秒。可能是無窮迴圈，或程式在等待更多輸入資料（測試輸入不夠）。</span>`;
      else if (r.status === 'OLE') html += '<span class="e">\n✘ 輸出資料過多（是不是無窮迴圈一直輸出？）</span>';
      else if (!r.stdout) html = '<span class="muted">（程式沒有輸出任何東西）</span>';
      out.innerHTML = html + (r.status !== 'TLE' ? `\n<span class="muted">— 編譯 ${c.ms} ms · 執行 ${r.timeMs} ms</span>` : '');
      const sample = p.samples.find(s => normalize(s.input) === normalize(input));
      if (sample && r.status === 'OK') $('#cmpRes').innerHTML = normalize(r.stdout) === normalize(sample.output) ? '<span class="mine-ac">✔ 和範例輸出相同</span>' : '<span class="mine-tried">✘ 和範例輸出不同</span>';
    } catch (e) { out.innerHTML = `<span class="e">${esc(e.message)}</span>`; }
    finally { busy(false); }
  }
  $('#btnRun').onclick = run;
  cm.setOption('extraKeys', { ...cm.getOption('extraKeys'), 'Ctrl-Enter': run });

  $('#btnSubmit').onclick = async () => {
    const code = cm.getValue();
    if (!code.trim() || code === TEMPLATE) { toast('請先寫程式'); return; }
    busy(true);
    const res = $('#result');
    res.innerHTML = '<div class="result-box">編譯中…</div>';
    try {
      const j = await Judge.judgeAll(code, p, (i, n) => { res.innerHTML = `<div class="result-box">評測中… 第 ${i} / ${n} 組測資</div>`; });
      markErrors(cm, j.compile.diags); lintBox(j.compile.diags, j.compile.success);
      res.innerHTML = '<div class="result-box">上傳結果中…</div>';
      const d = await api('/api/submit', { problemId: p.id, code, version: DATA.version, ...j.payload });
      const sub = Object.assign(d.submission, { code, diags: j.compile.diags, local: (j.local || []).map(r => ({ stdout: (r.stdout || '').slice(0, 2000), stderr: (r.stderr || '').slice(0, 500), error: r.error, exitCode: r.exitCode })) });
      recordSubmission(p, sub, d.mine);
      res.innerHTML = renderResult(sub, p, next);
      res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      refreshTab();
    } catch (e) { res.innerHTML = `<div class="result-box err">${esc(e.message)}</div>`; }
    finally { busy(false); }
  };

  // 下方分頁
  let tab = 'mine';
  $$('#ptabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; $$('#ptabs button').forEach(x => x.classList.toggle('on', x === b)); refreshTab(); });
  let statusCache = null;
  async function refreshTab(fetch) {
    const el = $('#ptab'); if (!el) return;
    if (tab === 'mine') {
      const subs = (S.subs || []).filter(s => s.pid === p.id);
      const m = myStat(p), c = (S.cls || {})[p.id] || { ac: 0, tried: 0 }, rk = rankOf(p.id);
      el.innerHTML = (isTeacher() ? '' : `<div class="statgrid">
          <div class="stat"><b>${c.ac}</b><span>本班通過人數</span></div><div class="stat"><b>${c.tried}</b><span>本班嘗試人數</span></div>
          ${m ? `<div class="stat"><b class="${m.ac ? 'mine-ac' : 'mine-tried'}">${m.best}</b><span>我的最高分</span></div><div class="stat"><b>${m.tries}</b><span>我送出的次數</span></div>` : ''}
          ${rk ? `<div class="stat"><b>${rk <= 3 ? ['🥇', '🥈', '🥉'][rk - 1] : ''}${rk}</b><span>我在本班的完成名次</span></div>` : ''}</div>`)
        + (subs.length ? subTable(subs, { hideUser: true, hideProblem: true }) : '<p class="muted">還沒有送出過這一題。</p>');
    } else if (tab === 'rank') {
      if (isTeacher()) { await teacherStatus(fetch !== false, true); return; }
      const list = (S.ranks || {})[p.id] || [];
      el.innerHTML = `<p class="muted small">依「第一次通過的時間」排序，只顯示你們班。${S.syncedAt ? `（資料時間 ${fmtTime(S.syncedAt, true)}，按右上角 🔄 可以更新）` : ''}</p>` +
        (list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>名次</th><th>座號</th><th>姓名</th><th>完成時間</th><th>送出幾次才通過</th></tr></thead><tbody>
          ${list.map((r, i) => `<tr class="${r[0] === S.user.seat ? 'me-row' : ''}"><td>${rankBadge(i + 1)}</td><td>${seat2(r[0])}</td><td>${esc((S.classmates || {})[r[0]] || '')}${r[0] === S.user.seat ? '（我）' : ''}</td>
            <td>${fmtTime(r[1])}</td><td>${r[2]} 次</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有人完成這一題，加油！</p>');
    } else await teacherStatus(fetch !== false, false);
  }
  // 老師：全班狀況（每 20 秒自動更新）
  async function teacherStatus(doFetch, rankMode) {
    const el = $('#ptab');
    const cls = store.get('cj-cls') || '';
    if (!statusCache) el.innerHTML = '<div class="loading">載入中…</div>';
    if (doFetch || !statusCache) statusCache = await apiGet('/api/problem-status/' + p.id, { cls });
    if (!$('#ptab') || tab === 'mine') return;
    const d = statusCache;
    const sel = `<select id="clsSel"><option value="">全部班級</option>${d.classes.map(x => `<option ${x === cls ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    if (rankMode) {
      const list = d.students.filter(s => s.p && s.p.ac).sort((a, b) => a.cls.localeCompare(b.cls) || a.rank - b.rank);
      el.innerHTML = `<div class="row" style="margin-bottom:8px">班級：${sel}<span class="muted small">每 20 秒自動更新</span></div>` + (list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>名次</th><th>班級座號</th><th>姓名</th><th>完成時間</th><th>次數</th><th></th></tr></thead><tbody>
        ${list.map(s => `<tr><td>${rankBadge(s.rank)}</td><td>${esc(s.cls)}-${seat2(s.seat)}</td><td>${esc(s.name)}</td><td>${fmtTime(s.p.firstAC)}</td><td>${s.p.triesToAC}</td><td><a href="#/submission/${s.p.acId}">看程式碼</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有人完成。</p>');
    } else {
      const st = d.students, tried = st.filter(s => s.p).length, ac = st.filter(s => s.p && s.p.ac).length;
      el.innerHTML = `<div class="row" style="margin-bottom:8px">班級：${sel}<span class="muted small">點「看程式碼」可以檢視並留言 · 每 20 秒自動更新</span></div>
        <div class="statgrid"><div class="stat"><b>${ac}</b><span>通過人數</span></div><div class="stat"><b>${tried}</b><span>嘗試人數</span></div><div class="stat"><b>${st.length - tried}</b><span>還沒作答</span></div></div>
        <div class="table-wrap"><table class="list"><thead><tr><th>班級座號</th><th>姓名</th><th>狀態</th><th>最高分</th><th>送出次數</th><th>首次通過</th><th></th></tr></thead><tbody>
        ${st.map(s => `<tr><td>${esc(s.cls)}-${seat2(s.seat)}</td><td>${esc(s.name)}</td>
          <td>${!s.p ? '<span class="muted">未作答</span>' : s.p.ac ? vBadge('AC') : vBadge(s.p.lastVerdict)}</td>
          <td>${s.p ? s.p.best : ''}</td><td>${s.p ? s.p.tries : ''}</td><td>${s.p && s.p.ac ? fmtTime(s.p.firstAC) : ''}</td>
          <td>${s.p ? `<a href="#/submission/${s.p.lastId}">看程式碼</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    }
    $('#clsSel').onchange = e => { store.set('cj-cls', e.target.value); statusCache = null; refreshTab(); };
  }
  refreshTab(false);
  if (isTeacher()) pageTimers.push(setInterval(() => { if (tab !== 'mine' && !document.hidden) refreshTab(); }, 20000));
}

// 把送出的結果記在瀏覽器裡（不需要再向伺服器要資料）
function recordSubmission(p, sub, mine) {
  S.subs = S.subs || [];
  S.subs.unshift({ id: sub.id, pid: p.id, verdict: sub.verdict, score: sub.score, timeMs: sub.timeMs, time: sub.time, code: sub.code, tests: sub.tests, error: sub.error, diags: (sub.diags || []).slice(0, 5), local: sub.local });
  if (!isTeacher()) {
    const before = (S.mine || {})[p.id];
    S.mine = S.mine || {}; S.cls = S.cls || {}; S.ranks = S.ranks || {};
    const c = S.cls[p.id] || (S.cls[p.id] = { tried: 0, ac: 0 });
    if (!before) c.tried++;
    if (mine.firstAC && !(before && before.ac)) { c.ac++; (S.ranks[p.id] = S.ranks[p.id] || []).push([S.user.seat, mine.firstAC, mine.triesToAC]); S.ranks[p.id].sort((a, b) => a[1] - b[1]); }
    S.mine[p.id] = Object.assign({}, mine, { ac: !!mine.firstAC });
  }
  saveState();
}

function testMessage(p, sub, i) {
  const t = sub.tests[i], loc = (sub.local || [])[i] || {};
  if (t.status === 'AC') return '';
  if (t.status === 'TLE') return `執行超過時間限制（${p.timeLimitMs / 1000} 秒）：可能有無窮迴圈，或演算法太慢。`;
  if (t.status === 'OLE') return '輸出資料過多。';
  if (t.status === 'RE') return friendlyRE({ error: loc.error || (sub.error && sub.error.test === i + 1 ? { msg: sub.error.msg } : {}), exitCode: loc.exitCode, stderr: loc.stderr });
  const pt = p.tests[i], got = loc.stdout !== undefined ? loc.stdout : t.out;
  if (pt && pt.public && got !== undefined) {
    const gl = normalize(got).split('\n'), el = normalize(pt.output).split('\n');
    let line = 0; while (line < Math.max(gl.length, el.length) && gl[line] === el[line]) line++;
    return `第 ${line + 1} 行不一樣\n你的輸出：${gl[line] === undefined ? '（沒有這一行）' : gl[line] === '' ? '（空白行）' : gl[line]}\n正確答案：${el[line] === undefined ? '（不應該有這一行）' : el[line] === '' ? '（空白行）' : el[line]}`;
  }
  return '答案不正確（隱藏測資，請想想看還有哪些特殊情況）';
}
function renderResult(s, p, next) {
  p = p || PMAP[s.pid];
  const tests = s.tests || [];
  return `<div class="result-box">
    <div class="result-head">${vBadge(s.verdict)}<b class="vtext ${s.verdict}">${VERDICT[s.verdict] || s.verdict}</b>
      <span>分數 <b>${s.score}</b> / 100</span>${s.verdict !== 'CE' ? `<span class="muted">最長耗時 ${s.timeMs} ms</span>` : ''}
      <span class="spacer"></span>${s.id ? `<a href="#/submission/${s.id}">提交 #${s.id} →</a>` : ''}</div>
    ${s.verdict === 'CE' && s.error ? `<div class="friendly"><b>編譯錯誤：</b>${esc(s.error.msg)}</div>` : ''}
    ${tests.map((t, i) => `<div class="test-row"><span>#${i + 1}${p && p.tests[i] && p.tests[i].public ? '<small class="muted">範例</small>' : ''}</span>${vBadge(t.status)}<span class="muted" style="min-width:60px">${t.timeMs} ms</span><span style="min-width:44px">${t.score} 分</span><span class="msg">${p ? esc(testMessage(p, s, i)) : ''}</span></div>`).join('')}
    ${s.verdict === 'AC' ? `<div class="ac-banner">🎉 恭喜通過全部測資！${next ? `<a class="btn green" href="#/problem/${next.id}">挑戰下一題：${next.id} ${esc(next.title)} ›</a>` : ''}</div>` : ''}
  </div>`;
}
function subTable(list, { hideUser, hideProblem } = {}) {
  return `<div class="table-wrap"><table class="list"><thead><tr><th>編號</th>${hideUser ? '' : '<th>學生</th>'}${hideProblem ? '' : '<th>題目</th>'}<th>結果</th><th>分數</th><th>耗時</th><th>送出時間</th>${hideUser ? '' : '<th>留言</th>'}</tr></thead><tbody>
    ${list.map(s => `<tr>
      <td><a href="#/submission/${s.id}">#${s.id}</a></td>
      ${hideUser ? '' : `<td>${esc(s.cls)}-${seat2(s.seat)} ${esc(s.name)}</td>`}
      ${hideProblem ? '' : `<td><a href="#/problem/${esc(s.pid)}">${esc(s.pid)} ${esc((PMAP[s.pid] || {}).title || '')}</a></td>`}
      <td><a href="#/submission/${s.id}">${vBadge(s.verdict)}</a></td>
      <td>${s.score}</td><td>${s.verdict === 'CE' ? '-' : s.timeMs + ' ms'}</td>
      <td>${fmtTime(s.time, true)}</td>${hideUser ? '' : `<td>${s.comments ? `💬 ${s.comments}` : ''}</td>`}</tr>`).join('')}
  </tbody></table></div>`;
}

// ============ 我的紀錄 / 解題動態 ============
async function viewSubmissions() {
  if (!isTeacher()) {
    const subs = S.subs || [];
    const fp = new URLSearchParams(location.hash.split('?')[1] || '').get('problem') || '';
    const solved = Object.values(S.mine || {}).filter(m => m.ac).length;
    app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">我的提交紀錄</h2><span class="spacer"></span>
      <span>已通過 <b class="mine-ac">${solved}</b> 題 · 共送出 ${subs.length} 次</span>
      <select id="fprob"><option value="">全部題目</option>${[...new Set(subs.map(s => s.pid))].sort().map(id => `<option value="${id}" ${id === fp ? 'selected' : ''}>${id} ${esc((PMAP[id] || {}).title || '')}</option>`).join('')}</select></div></div>
      <div class="card" id="subs"></div>`;
    const render = () => {
      const f = $('#fprob').value, list = subs.filter(s => !f || s.pid === f);
      $('#subs').innerHTML = list.length ? subTable(list.slice(0, 300), { hideUser: true }) : '<p class="muted">還沒有提交紀錄。</p>';
    };
    $('#fprob').onchange = render; render();
    return;
  }
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  app().innerHTML = `<div class="card">
    <div class="row"><h2 style="margin:0">解題動態</h2><span class="spacer"></span>
      <select id="fcls"><option value="">全部班級</option>${(S.classes || []).map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <select id="fprob"><option value="">全部題目</option>${PROBS.map(p => `<option value="${p.id}">${p.id} ${esc(p.title)}</option>`).join('')}</select>
      <select id="fv"><option value="">全部結果</option>${Object.entries(VERDICT).map(([k, v]) => `<option value="${k}">${k} ${v}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="auto" checked> 每 20 秒自動更新</label>
    </div></div>
    <div class="card" id="subs"><div class="loading">載入中…</div></div>`;
  let page = 1;
  const f = { cls: q.cls ?? store.get('cj-cls') ?? '', problem: q.problem || '', verdict: q.verdict || '', account: q.account || '' };
  $('#fcls').value = f.cls; $('#fprob').value = f.problem; $('#fv').value = f.verdict;
  async function load() {
    const d = await apiGet('/api/feed', { ...f, page });
    if (!$('#subs')) return;
    $('#subs').innerHTML = (f.account ? `<p>只顯示 <b>${esc(f.account)}</b> 的提交 <a href="#/submissions">顯示全部</a></p>` : '') +
      (d.submissions.length ? subTable(d.submissions) : '<p class="muted">沒有資料</p>') +
      `<div class="pager">${page > 1 ? '<button class="btn sm" id="pgPrev">‹ 較新</button>' : ''}<span class="muted small">第 ${page} 頁</span>${d.more ? '<button class="btn sm" id="pgNext">較舊 ›</button>' : ''}</div>`;
    if ($('#pgPrev')) $('#pgPrev').onclick = () => { page--; load(); };
    if ($('#pgNext')) $('#pgNext').onclick = () => { page++; load(); };
  }
  $('#fcls').onchange = e => { f.cls = e.target.value; store.set('cj-cls', f.cls); page = 1; load(); };
  $('#fprob').onchange = e => { f.problem = e.target.value; page = 1; load(); };
  $('#fv').onchange = e => { f.verdict = e.target.value; page = 1; load(); };
  await load();
  pageTimers.push(setInterval(() => { if ($('#auto') && $('#auto').checked && page === 1 && !document.hidden) load().catch(() => { }); }, 20000));
}

// ============ 單筆提交（程式碼 + 留言） ============
async function viewSubmission(id) {
  id = +id;
  let s = !isTeacher() && (S.subs || []).find(x => x.id === id);
  let comments = !isTeacher() ? (S.comments || []).filter(c => c.submissionId === id) : null;
  if (!s || !s.code) {
    app().innerHTML = '<div class="loading">載入中…</div>';
    const d = await apiGet('/api/submissions/' + id);
    s = Object.assign({}, s || {}, d.submission);
    comments = d.comments;
    if (!isTeacher()) {   // 存起來，下次不用再下載
      const i = (S.subs || []).findIndex(x => x.id === id);
      if (i >= 0) S.subs[i] = Object.assign(S.subs[i], { code: s.code, tests: s.tests, error: s.error });
      comments.forEach(c => { if (!S.comments.some(x => x.id === c.id)) S.comments.push(c); });
      S.comments.forEach(c => { if (c.submissionId === id && c.role === 'teacher') c.read = true; });
      saveState(); renderNav();
    }
  } else {
    const unread = comments.filter(c => c.role === 'teacher' && !c.read);
    if (unread.length) {
      unread.forEach(c => c.read = true); saveState(); renderNav();
      api('/api/comments/read', { ids: unread.map(c => c.id) }).catch(() => { });
    }
  }
  if (isTeacher()) S.notifs = (S.notifs || []).filter(n => n.submissionId !== id);
  const p = PMAP[s.pid];
  let selLine = null;
  app().innerHTML = `
  <div class="card">
    <div class="row"><h2 style="margin:0">提交 #${s.id}</h2>${vBadge(s.verdict)}<b class="vtext ${s.verdict}">${VERDICT[s.verdict]}</b><span class="spacer"></span>
      <a class="btn" href="#/problem/${esc(s.pid)}">回到題目</a>
      <button class="btn" id="loadEd">在編輯器中開啟這份程式</button>
      ${isTeacher() ? '<button class="btn" id="rejudge">重新評測</button>' : ''}</div>
    <table class="list" style="margin-top:12px"><tr><th>學生</th><th>題目</th><th>分數</th><th>耗時</th><th>送出時間</th></tr>
      <tr><td>${s.name ? `${esc(s.cls)}-${seat2(s.seat)} ${esc(s.name)} <span class="muted small">${esc(s.account || '')}</span>` : esc(S.user.name)}${isTeacher() && s.account ? ` · <a href="#/submissions?account=${esc(s.account)}">他的所有提交</a>` : ''}</td>
      <td><a href="#/problem/${esc(s.pid)}">${esc(s.pid)} ${esc(p ? p.title : '')}</a></td>
      <td>${s.score} / 100</td><td>${s.verdict === 'CE' ? '-' : s.timeMs + ' ms'}</td><td>${fmtTime(s.time)}</td></tr></table>
  </div>
  <div class="problem-layout">
    <div class="card">
      <h3 style="margin-top:0">程式碼 ${isTeacher() ? '<span class="muted small">（點行號可以針對那一行留言）</span>' : ''}</h3>
      <div id="code" class="readonly ${isTeacher() ? 'teacher' : ''}"></div>
      <h3>評測結果</h3>
      <div id="resbox">${renderResult(s, p)}</div>
    </div>
    <div class="card comments">
      <h3 style="margin-top:0">💬 ${isTeacher() ? '給學生的回饋' : '老師的回饋'}</h3>
      <div id="clist"></div>
      <div style="margin-top:10px">
        <div class="row small" id="lineSel" style="margin-bottom:4px"></div>
        <textarea id="ctext" rows="4" placeholder="${isTeacher() ? '寫下錯誤說明或建議，學生會在 🔔 看到…' : '有問題可以在這裡回覆老師…'}" style="font-family:inherit"></textarea>
        <div class="row" style="margin-top:6px"><span class="spacer"></span><button class="btn primary" id="csend">送出留言</button></div>
      </div>
    </div>
  </div>`;
  const cm = createEditor($('#code'), s.code || '', { readOnly: true });
  setTimeout(() => cm.refresh(), 0);
  markErrors(cm, s.diags || (s.error && s.error.line ? [{ line: s.error.line, kind: 'error', msg: s.error.msg }] : []));
  const markComments = () => comments.forEach(c => c.line && c.line <= cm.lineCount() && cm.addLineClass(c.line - 1, 'background', 'cm-comment-line'));
  markComments();
  const showLineSel = () => {
    $('#lineSel').innerHTML = selLine ? `針對 <span class="linechip">第 ${selLine} 行</span> 留言 <a href="javascript:void 0" id="clrLine">取消</a>` : '';
    if (selLine) $('#clrLine').onclick = () => { selLine = null; showLineSel(); };
  };
  if (isTeacher()) cm.on('gutterClick', (cm, line) => { selLine = line + 1; showLineSel(); $('#ctext').focus(); });
  const renderComments = () => {
    $('#clist').innerHTML = comments.length ? comments.map(c => `<div class="c ${c.role}">
      <div class="meta">${c.role === 'teacher' ? '👩‍🏫 ' : ''}<b>${esc(c.authorName)}</b> · ${fmtTime(c.time)} ${c.line ? `· <span class="linechip" data-line="${c.line}">第 ${c.line} 行</span>` : ''}</div>
      <div class="txt">${esc(c.text)}</div></div>`).join('') : '<p class="muted">目前沒有留言。</p>';
    $$('[data-line]').forEach(el => el.onclick = () => { const l = +el.dataset.line - 1; cm.setCursor(l, 0); cm.scrollIntoView({ line: l, ch: 0 }, 80); });
  };
  renderComments();
  $('#csend').onclick = async () => {
    const text = $('#ctext').value.trim(); if (!text) return;
    const b = $('#csend'); b.disabled = true;
    try {
      const { comment } = await api(`/api/submissions/${s.id}/comments`, { text, line: selLine });
      comment.read = true;
      comments.push(comment);
      if (!isTeacher()) { S.comments.push(comment); saveState(); }
      $('#ctext').value = ''; selLine = null; showLineSel(); renderComments(); markComments();
      toast(isTeacher() ? '已送出，學生會在 🔔 看到' : '已送出');
    } catch (e) { toast(e.message); }
    b.disabled = false;
  };
  $('#loadEd').onclick = () => { sessionStorage.setItem('cj-load-code', s.code); location.hash = '#/problem/' + s.pid; };
  if (isTeacher()) $('#rejudge').onclick = async () => {
    const btn = $('#rejudge'); btn.disabled = true; btn.textContent = '評測中…';
    try {
      const j = await Judge.judgeAll(s.code, p);
      const r = await api(`/api/submissions/${s.id}/rejudge`, { version: DATA.version, ...j.payload });
      Object.assign(s, r.submission, { local: (j.local || []).map(x => ({ stdout: x.stdout, error: x.error, exitCode: x.exitCode, stderr: x.stderr })) });
      $('#resbox').innerHTML = renderResult(s, p); toast('重新評測完成：' + s.verdict);
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = '重新評測';
  };
}

// ============ 成績總表（老師，每 20 秒更新） ============
async function viewScoreboard() {
  let cls = store.get('cj-cls') ?? '';
  let series = store.get('cj-sb-series') || 'a';
  let topic = store.get('cj-sb-topic') || '';
  app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">成績總表</h2><span class="spacer"></span>
    <label class="small"><input type="checkbox" id="auto" checked> 每 20 秒自動更新</label>
    <button class="btn" id="csv">⬇ 匯出 CSV（Excel）</button>
    <button class="btn" id="toSheet">寫入 Google Sheet</button></div>
    <div class="tabs cls-tabs" id="clsTabs" style="margin:12px 0 0"></div>
    <div class="row" style="margin-top:8px">系列：<select id="sbSeries">${SERIES_KEYS.map(k => `<option value="${k}" ${k === series ? 'selected' : ''}>${esc(DATA.series[k].name)}</option>`).join('')}</select>
      單元：<select id="sbTopic"></select>
      <span class="muted small">綠＝通過、橘＝部分得分、紅＝0 分；格子內是最高分，點格子看最後一次的程式碼。<span class="online"></span>＝2 分鐘內有活動</span></div></div>
    <div id="sb"><div class="card loading">載入中…</div></div>`;
  const fillTopics = () => {
    const ts = Object.entries(DATA.topics).filter(([, t]) => t.series === series);
    if (!ts.some(([k]) => k === topic)) topic = '';
    $('#sbTopic').innerHTML = `<option value="">全部單元</option>` + ts.map(([k, t]) => `<option value="${k}" ${k === topic ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  };
  fillTopics();
  let last = null;
  const probsNow = () => PROBS.filter(p => p.series === series && (!topic || p.topic === topic));
  $('#csv').onclick = () => {
    if (!last) return;
    const ps = probsNow(), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['班級', '座號', '姓名', 'Email', ...ps.map(p => `${p.id} ${p.title}`), '通過題數', '總分'].map(q).join(',')];
    for (const r of last.students) {
      const cells = ps.map(p => r.cells[p.id] ? r.cells[p.id][0] : '');
      lines.push([r.cls, r.seat, r.name, r.email, ...cells, ps.filter(p => r.cells[p.id] && r.cells[p.id][2]).length, cells.reduce((a, b) => a + (+b || 0), 0)].map(q).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `成績_${cls || '全部'}_${DATA.series[series].name}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#toSheet').onclick = async () => {
    const b = $('#toSheet'); b.disabled = true;
    try { toast((await api('/api/scoreboard/sheet', { cls, problems: probsNow().map(p => p.id) })).msg, 4000); } catch (e) { toast(e.message); }
    b.disabled = false;
  };
  const online = t => t && Date.now() - t < 120000;
  const classTable = (c, rows) => {
    const ps = probsNow();
    const sum = r => ps.reduce((a, p) => a + (r.cells[p.id] ? r.cells[p.id][0] : 0), 0), acs = r => ps.filter(p => r.cells[p.id] && r.cells[p.id][2]).length;
    return `<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">${esc(c)} 班</h2>
      <span class="muted">${rows.length} 人 · 平均通過 ${rows.length ? (rows.reduce((a, r) => a + acs(r), 0) / rows.length).toFixed(1) : 0} 題</span></div>
    <div class="table-wrap"><table class="list sb"><thead><tr><th class="name">座號</th><th class="name">姓名</th><th>通過</th><th>總分</th>
      ${ps.map(p => `<th class="p" title="${esc(p.title)}"><a href="#/problem/${p.id}">${p.id.slice(1)}</a></th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr><td class="name">${seat2(r.seat)}</td>
        <td class="name"><span class="${online(r.lastSeen) ? 'online' : 'offline'}"></span><a href="#/submissions?account=${esc(r.account)}">${esc(r.name)}</a></td>
        <td><b>${acs(r)}</b></td><td>${sum(r)}</td>
        ${ps.map(p => { const x = r.cells[p.id]; return `<td>${x ? `<a class="cell ${x[2] ? 'ac' : x[0] > 0 ? 'part' : 'zero'}" href="#/submission/${x[3]}" title="${esc(p.id + ' ' + p.title)}｜送出 ${x[1]} 次${x[2] ? '｜首次通過 ' + fmtTime(x[2]) + '｜本班第 ' + x[4] + ' 名' : ''}">${x[2] ? '✔' : x[0]}</a>` : ''}</td>`; }).join('')}
      </tr>`).join('')}
      </tbody><tfoot><tr><th class="name" colspan="4">通過人數</th>${ps.map(p => `<th>${rows.filter(r => r.cells[p.id] && r.cells[p.id][2]).length}</th>`).join('')}</tr></tfoot></table></div></div>`;
  };
  const render = () => {
    const d = last; if (!d || !$('#clsTabs')) return;
    if (!d.classes.length) {
      $('#clsTabs').innerHTML = '';
      $('#sb').innerHTML = '<div class="card"><div class="friendly"><b>名單裡沒有任何學生。</b>請在 Google 試算表的「學生名單」工作表放入「班級、座號、姓名、Email」（或在 Code.gs 設定 ROSTER_SPREADSHEET_ID 讀取另一份試算表）。</div></div>';
      return;
    }
    $('#clsTabs').innerHTML = d.classes.map(c => `<button data-c="${esc(c)}" class="${c === cls ? 'on' : ''}">${esc(c)} 班</button>`).join('') +
      `<button data-c="" class="${cls ? '' : 'on'}">全部班級</button>`;
    $$('#clsTabs button').forEach(b => b.onclick = () => { cls = b.dataset.c; store.set('cj-cls', cls); last = null; $('#sb').innerHTML = '<div class="card loading">載入中…</div>'; load(); });
    const list = cls ? [cls] : d.classes;
    $('#sb').innerHTML = list.map(c => classTable(c, d.students.filter(r => r.cls === c))).join('');
  };
  async function load() {
    const d = await apiGet('/api/scoreboard', { cls, series });
    if (cls && !d.classes.includes(cls)) { cls = d.classes[0] || ''; store.set('cj-cls', cls); return load(); }
    if (store.get('cj-cls') === null && d.classes.length) { cls = d.classes[0]; store.set('cj-cls', cls); return load(); }
    last = d; render();
  }
  $('#sbSeries').onchange = e => { series = e.target.value; store.set('cj-sb-series', series); fillTopics(); last = null; $('#sb').innerHTML = '<div class="card loading">載入中…</div>'; load(); };
  $('#sbTopic').onchange = e => { topic = e.target.value; store.set('cj-sb-topic', topic); render(); };
  await load();
  pageTimers.push(setInterval(() => { if ($('#auto') && $('#auto').checked && !document.hidden) load().catch(() => { }); }, 20000));
}

// ============ 管理（老師） ============
async function viewAdmin() {
  app().innerHTML = `<div class="card"><div class="tabs" id="atabs"><button data-t="open" class="on">題目開放設定</button><button data-t="users">名單</button></div><div id="atab"></div></div>`;
  let tab = 'open';
  $$('#atabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; $$('#atabs button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  async function render() {
    const el = $('#atab');
    if (tab === 'open') {
      const h = hiddenSet();
      el.innerHTML = `<p class="muted small">取消勾選的系列或單元，學生就看不到（也不能送出）。設定會在學生下次同步時生效（最晚 10 分鐘，或學生按 🔄）。</p>
        ${SERIES_KEYS.map(k => `<div class="open-series"><label><input type="checkbox" data-h="${k}" ${h.has(k) ? '' : 'checked'}> <b>${esc(DATA.series[k].name)}</b>（${PROBS.filter(p => p.series === k).length} 題）</label>
          <div class="open-topics">${Object.entries(DATA.topics).filter(([, t]) => t.series === k).map(([tk, t]) => `<label><input type="checkbox" data-h="${tk}" ${h.has(tk) ? '' : 'checked'}> ${esc(t.name)}（${PROBS.filter(p => p.topic === tk).length}）</label>`).join('')}</div></div>`).join('')}
        <label style="display:block;margin-top:12px">另外要隱藏的題號（用逗號分隔，例如 a099, b050）：</label>
        <input type="text" id="hideIds" style="width:100%" value="${esc([...h].filter(x => PMAP[x]).join(', '))}">
        <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="saveOpen">儲存設定</button></div>
        ${S.serverVersion && S.serverVersion !== DATA.version ? `<div class="friendly" style="margin-top:12px"><b>注意：題目版本不一致。</b>網站的 problems.js 是 ${esc(DATA.version)}，Apps Script 的 Answers.gs 是 ${esc(S.serverVersion)}。請確認兩邊都上傳了最新版，學生才能正確評測。</div>` : ''}`;
      $('#saveOpen').onclick = async () => {
        const hidden = $$('[data-h]').filter(c => !c.checked).map(c => c.dataset.h).concat($('#hideIds').value.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(x => PMAP[x]));
        try { const r = await api('/api/settings', { hidden }); S.hidden = r.hidden; saveState(); toast('已儲存'); } catch (e) { toast(e.message); }
      };
    } else {
      el.innerHTML = '<div class="loading">載入中…</div>';
      const cls = store.get('cj-cls') || '';
      const d = await apiGet('/api/users', { cls });
      el.innerHTML = `<div class="row" style="margin-bottom:10px">班級：<select id="ucls"><option value="">全部</option>${d.classes.map(c => `<option ${c === cls ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <span class="spacer"></span><a class="btn" href="${esc(d.sheetUrl)}" target="_blank" rel="noopener">開啟名單所在的 Google Sheet ↗</a></div>
        <p class="muted small">學生用學校 Google 帳號登入，系統依 Email 對照名單判斷班級座號。名單直接在 Google Sheet 修改，10 分鐘內自動生效。</p>
        <div class="table-wrap"><table class="list"><thead><tr><th>身分</th><th>班級</th><th>座號</th><th>姓名</th><th>Email</th><th>最近活動</th></tr></thead><tbody>
        ${d.users.map(u => `<tr><td>${u.role === 'teacher' ? '老師' : '學生'}</td><td>${esc(u.cls)}</td><td>${u.seat || ''}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
          <td class="small">${u.lastSeen ? `<span class="${Date.now() - u.lastSeen < 120000 ? 'online' : 'offline'}"></span>${fmtTime(u.lastSeen, true)}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
      $('#ucls').onchange = e => { store.set('cj-cls', e.target.value); render(); };
    }
  }
  render();
}

// ============ 啟動 ============
if (S) {
  Judge.start().catch(() => { });   // 已登入：一打開網頁就在背景準備編譯器
  backgroundSync(false);
  if (isTeacher()) setInterval(() => backgroundSync(true), 60000);   // 老師：每分鐘檢查新留言
}
router();
