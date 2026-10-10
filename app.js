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
// 系統管理員在網頁上新增／修改的題目：伺服器版本號改變時才下載，存在瀏覽器裡
const BUILTIN = PROBS.slice();
function applyCustom(list) {
  PROBS.length = 0; PROBS.push(...BUILTIN);
  for (const c of list || []) {
    const i = PROBS.findIndex(p => p.id === c.id);
    if (c.deleted) continue;
    const p = Object.assign({ custom: true }, c);
    if (i >= 0) PROBS[i] = p; else PROBS.push(p);
  }
  PROBS.sort((a, b) => a.id.localeCompare(b.id));
  Object.keys(PMAP).forEach(k => delete PMAP[k]);
  PROBS.forEach(p => PMAP[p.id] = p);
  try { Judge.inputCache.clear(); } catch { }   // 程式剛啟動時 Judge 還沒建立
}
applyCustom((store.json('cj-custom', {}) || {}).list);
const customPv = () => (store.json('cj-custom', {}) || {}).pv || '';
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
const isAdmin = () => isTeacher() && !!S.user.admin;
const isGuest = () => S && S.user && S.user.role === 'guest';
const saveState = () => { if (S) { trimSubs(); store.set('cj-state', JSON.stringify(S)); } };
// 只保留最近 300 筆提交的程式碼，避免瀏覽器空間不夠
function trimSubs() { (S.subs || []).forEach((s, i) => { if (i >= 300) delete s.code; }); }
const toMine = c => Object.assign({}, c, { ac: !!c.firstAC });
// 套用伺服器回傳的同步資料。資料沒有變動時伺服器只回 same:true，瀏覽器沿用已存的資料。
function applySync(d) {
  S.user = d.user; S.serverVersion = d.version; S.syncedAt = Date.now(); S.schema = 2;
  if (d.custom) { store.set('cj-custom', JSON.stringify({ pv: d.pv, list: d.custom })); applyCustom(d.custom); }
  if (d.user.admin) S.pending = d.pending || 0;
  if (d.user.role === 'guest') { S.teacherApply = d.teacherApply; S.googleName = d.googleName || S.googleName; }
  else if (d.user.role === 'teacher') { S.classes = d.classes || []; S.notifs = d.notifs || []; S.hidden = []; }
  else {
    S.cid = d.cid; S.v = d.v;
    if (!d.same) {
      S.klass = d.cls; S.seat = d.seat; S.hidden = d.cls.hidden || [];
      S.mine = Object.fromEntries(Object.entries(d.mine || {}).map(([k, c]) => [k, toMine(c)]));
      S.cls = {}; S.ranks = {};
      for (const [pid, s] of Object.entries(d.sum || {})) { S.cls[pid] = { tried: s.t, ac: s.a }; S.ranks[pid] = s.r; }
      S.classmates = d.mates || {}; S.comments = d.comments || [];
    }
    if (S.klass) { S.user.cls = S.klass.name; S.user.seat = S.seat; }
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
  syncing = api('/api/sync', { cid: S.cid, v: S.v, pv: customPv() }).then(d => {
    const wasGuest = isGuest();
    applySync(d); renderNav();
    const page = location.hash.split('?')[0].split('/')[1] || '';
    if (wasGuest !== isGuest()) router();
    else if ((!d.same || d.custom) && !isTeacher() && ['problems', 'submissions'].includes(page)) router();
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
// 程式碼文字放大／縮小（講解時用）：只改程式碼區的字，不影響整個網頁的版面
const ZOOM_MIN = 12, ZOOM_MAX = 40;
const codeFont = () => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +store.get('cj-fs') || 16));
const zoomButtons = () => `<span class="zoom" title="程式碼文字大小"><button class="btn sm" data-zoom="-2">A−</button><span class="zoom-val">${codeFont()}</span><button class="btn sm" data-zoom="2">A+</button></span>`;
// targets()：回傳要調整的 CodeMirror 與其他元素（例如執行結果）
function bindZoom(targets) {
  const apply = () => {
    const fs = codeFont();
    for (const t of targets()) {
      if (!t) continue;
      if (t.getWrapperElement) { t.getWrapperElement().style.fontSize = fs + 'px'; t.refresh(); }
      else t.style.fontSize = Math.round(fs * 0.9) + 'px';
    }
    $$('.zoom-val').forEach(el => el.textContent = fs);
  };
  $$('[data-zoom]').forEach(b => b.onclick = () => { store.set('cj-fs', codeFont() + +b.dataset.zoom); apply(); });
  apply();
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
  const links = !S || isGuest() ? [] : [
    ['problems', '題目'], ['submissions', isTeacher() ? '解題動態' : '我的紀錄'],
    ...(isTeacher() ? [['scoreboard', '成績總表'], ['classes', '班級管理']] : []),
    ...(isAdmin() ? [['admin', '系統管理' + (S.pending ? ` <span class="dot-badge">${S.pending}</span>` : '')]] : []),
  ];
  $('#nav').innerHTML = links.map(([k, t]) => `<a href="#/${k}" class="${r === k || (r === 'problem' && k === 'problems') || (r === 'submission' && k === 'submissions') || (r === 'class' && k === 'classes') ? 'on' : ''}">${t}</a>`).join('');
  if (!S) { $('#userbox').innerHTML = ''; return; }
  if (isGuest()) { $('#userbox').innerHTML = `<span class="who">${esc(S.user.email)}</span><button class="btn sm" id="logout">登出</button>`; $('#logout').onclick = logout; return; }
  const n = notifList().length;
  $('#userbox').innerHTML = `
    <button class="bell" id="bell" title="${isTeacher() ? '學生的回覆' : '老師的回饋'}">🔔<span class="dot" ${n ? '' : 'style="display:none"'}>${n}</span></button>
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
  const views = { login: viewLogin, welcome: viewWelcome, problems: viewProblems, problem: viewProblem, submissions: viewSubmissions, submission: viewSubmission, scoreboard: viewScoreboard, classes: viewClasses, class: viewClass, admin: viewAdmin, me: viewMe, tests: viewTests, edit: viewEdit };
  const v = views[page];
  if (!v) { location.hash = '#/problems'; return; }
  if (isGuest() && !['welcome', 'login'].includes(page)) { location.hash = '#/welcome'; return; }
  if (!isGuest() && page === 'welcome') { location.hash = '#/problems'; return; }
  if (['scoreboard', 'classes', 'class'].includes(page) && !isTeacher()) { location.hash = '#/problems'; return; }
  if (['admin', 'edit'].includes(page) && !isAdmin()) { location.hash = '#/problems'; return; }
  if (page === 'tests' && !(S.user && S.user.canTests)) { location.hash = '#/problems'; return; }
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
    <p style="margin:20px 0 12px">請使用 <b>Google 帳號</b>登入${CFG.DOMAIN ? `<br><span class="muted small">（限 @${esc(CFG.DOMAIN)}）</span>` : '<br><span class="muted small">學生：加入老師的班級後就能解題　老師：可以申請帳號、建立自己的班級</span>'}</p>
    <div id="gbtn" style="display:flex;justify-content:center;min-height:44px"><span class="muted">Google 登入按鈕載入中…</span></div>
    ${CFG.DEV_LOGIN ? '<div class="row" style="justify-content:center;margin-top:12px"><input type="text" id="devMail" placeholder="測試用 Email" style="width:220px"><button class="btn" id="devGo">測試登入</button></div>' : ''}
    <div class="err" id="lerr"></div>
  </div></div>`;
  // 先叫醒後端（Apps Script 第一次呼叫比較慢），等學生按完 Google 登入時就已經準備好了
  fetch(CFG.API_URL, { mode: 'no-cors' }).catch(() => { });
  const finish = async credential => {
    $('#lerr').textContent = ''; $('#gbtn').innerHTML = '<span class="muted">登入中…</span>';
    try {
      const d = await api('/api/login', { credential, pv: customPv() });
      S = { token: d.token, subs: [] };
      applySync(d);
      location.hash = isGuest() ? '#/welcome' : '#/problems';
      if (!isGuest()) Judge.start().catch(() => { });
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
    <p>${esc(S.user.name)}<br><span class="muted">${esc(S.user.email)}</span><br>${isTeacher() ? (isAdmin() ? '系統管理員' : '老師') : `${esc(S.user.cls || '')} 班 ${S.user.seat || ''} 號`}</p>
    ${!isTeacher() && (S.user.classes || []).length > 1 ? `<p>切換班級：<select id="swCls">${S.user.classes.map(c => `<option value="${esc(c.cid)}" ${c.cid === S.cid ? 'selected' : ''}>${esc(c.name)}（${c.seat} 號）</option>`).join('')}</select></p>` : ''}
    ${!isTeacher() ? '<p><a href="javascript:void 0" id="joinMore">＋ 用代碼加入另一個班級</a></p>' : ''}
    <p class="muted small">登入狀態會保留 14 天；在公用電腦上使用完畢請記得按「登出」。<br>
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
  if ($('#swCls')) $('#swCls').onchange = async e => {
    S.cid = e.target.value; S.v = null;
    await backgroundSync(true); toast('已切換到 ' + (S.klass ? S.klass.name : '')); location.hash = '#/problems';
  };
  if ($('#joinMore')) $('#joinMore').onclick = () => { $('.login-wrap').insertAdjacentHTML('beforeend', joinCard()); bindJoin(); $('#jCode').focus(); };
}

// ============ 還沒有班級的帳號：加入班級或申請老師 ============
const joinCard = () => `<div class="card" id="joinCard"><h2>🎒 我是學生：加入班級</h2>
  <p class="muted small">向老師拿「班級代碼」（6 個字），再輸入你的座號和姓名。</p>
  <div class="form-grid"><label>班級代碼</label><input type="text" id="jCode" maxlength="8" style="text-transform:uppercase;width:160px">
    <label>座號</label><input type="number" id="jSeat" min="1" max="999" style="width:100px">
    <label>姓名</label><input type="text" id="jName" style="width:200px" value="${esc(S.googleName || '')}"></div>
  <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="jGo">加入班級</button></div><div class="err" id="jErr"></div></div>`;
function bindJoin() {
  $('#jGo').onclick = async () => {
    const b = $('#jGo'); b.disabled = true; $('#jErr').textContent = '';
    try {
      const d = await api('/api/join', { code: $('#jCode').value.trim(), seat: +$('#jSeat').value, name: $('#jName').value.trim() });
      applySync(d); toast(`已加入 ${S.klass ? S.klass.name : ''} 班`); Judge.start().catch(() => { });
      location.hash = '#/problems'; router();
    } catch (e) { $('#jErr').textContent = e.message; }
    b.disabled = false;
  };
}
function viewWelcome() {
  const ap = S.user.application;
  app().innerHTML = `<div class="login-wrap" style="max-width:620px">
    <div class="card"><h2>歡迎使用 NEHS C++ Judge</h2><p>你登入的帳號是 <b>${esc(S.user.email)}</b>，目前還沒有加入任何班級。</p>
      <p class="muted small">如果老師已經把你的 Email 放進班級名單，請按右下角「重新檢查」。</p>
      <div class="row"><span class="spacer"></span><button class="btn" id="recheck">↻ 重新檢查</button></div></div>
    ${joinCard()}
    ${ap ? `<div class="card"><h2>👩‍🏫 老師帳號申請</h2>${ap.status === 'pending' ? `<p>你在 ${fmtTime(ap.time)} 申請了老師帳號（${esc(ap.school)}），<b>正在等待系統管理員審核</b>。審核通過後按「重新檢查」即可。</p>`
      : ap.status === 'rejected' ? '<p class="mine-tried">你的老師帳號申請沒有通過，如有疑問請聯絡系統管理員。</p>' : `<p>帳號狀態：${esc(ap.status)}</p>`}</div>`
      : S.teacherApply ? `<div class="card"><h2>👩‍🏫 我是老師：申請帳號</h2>
      <p class="muted small">通過審核後，就可以建立自己的班級、匯入學生名單、查看成績。</p>
      <div class="form-grid"><label>姓名</label><input type="text" id="aName" style="width:220px" value="${esc(S.googleName || '')}">
        <label>學校</label><input type="text" id="aSchool" style="width:280px">
        <label>備註</label><input type="text" id="aNote" placeholder="任教科目、聯絡方式等（可不填）"></div>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" id="aGo">送出申請</button></div><div class="err" id="aErr"></div></div>` : ''}
  </div>`;
  bindJoin();
  $('#recheck').onclick = async () => { await backgroundSync(true); if (isGuest()) toast('還沒有加入班級'); };
  if ($('#aGo')) $('#aGo').onclick = async () => {
    const b = $('#aGo'); b.disabled = true; $('#aErr').textContent = '';
    try {
      const d = await api('/api/apply', { name: $('#aName').value.trim(), school: $('#aSchool').value.trim(), note: $('#aNote').value.trim() });
      applySync(d); toast(isTeacher() ? '已開通老師帳號' : '已送出申請，請等待審核'); router();
    } catch (e) { $('#aErr').textContent = e.message; b.disabled = false; }
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
        <div class="ptitle"><span class="pid">${p.id}</span><h2 style="margin:0">${esc(p.title)}</h2>${myStat(p) && myStat(p).ac ? '<span class="mine-ac">✔ 已通過</span>' : ''}
          ${p.custom ? '<span class="tag">自訂</span>' : ''}<span class="spacer"></span>
          ${S.user.canTests ? `<a class="btn sm" href="#/tests/${p.id}">🔍 測資與解答</a>` : ''}${isAdmin() ? ` <a class="btn sm" href="#/edit/${p.id}">✏ 編輯題目</a>` : ''}</div>
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
          ${zoomButtons()}
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
  bindZoom(() => [cm, $('#stdin'), $('#stdout')]);
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
      const d = await api('/api/submit', { problemId: p.id, code, version: DATA.version, pver: p.ver, cid: S.cid, ...j.payload });
      const sub = Object.assign(d.submission, { code, diags: j.compile.diags, local: (j.local || []).map(r => ({ stdout: (r.stdout || '').slice(0, 2000), stderr: (r.stderr || '').slice(0, 500), error: r.error, exitCode: r.exitCode })) });
      recordSubmission(p, sub, d);
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
    const cid = teacherCid();
    if (!cid) { el.innerHTML = '<p class="muted">你還沒有班級，請到「班級管理」建立班級。</p>'; return; }
    if (!statusCache) el.innerHTML = '<div class="loading">載入中…</div>';
    if (doFetch || !statusCache) statusCache = await apiGet('/api/problem-status/' + p.id, { cid });
    if (!$('#ptab') || tab === 'mine') return;
    const d = statusCache;
    const sel = classSelect('clsSel', cid);
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
    $('#clsSel').onchange = e => { store.set('cj-tcid', e.target.value); statusCache = null; refreshTab(); };
  }
  refreshTab(false);
  if (isTeacher()) pageTimers.push(setInterval(() => { if (tab !== 'mine' && !document.hidden) refreshTab(); }, 20000));
}

// 把送出的結果記在瀏覽器裡；伺服器同時回傳這一題最新的本班統計，不需要另外下載
function recordSubmission(p, sub, d) {
  S.subs = S.subs || [];
  S.subs.unshift({ id: sub.id, pid: p.id, verdict: sub.verdict, score: sub.score, timeMs: sub.timeMs, time: sub.time, code: sub.code, tests: sub.tests, error: sub.error, diags: (sub.diags || []).slice(0, 5), local: sub.local });
  if (!isTeacher() && d.mine) {
    S.mine = S.mine || {}; S.cls = S.cls || {}; S.ranks = S.ranks || {};
    S.mine[p.id] = toMine(d.mine);
    if (d.sum) { S.cls[p.id] = { tried: d.sum.t, ac: d.sum.a }; S.ranks[p.id] = d.sum.r; }
    if (d.v) S.v = d.v;
  }
  saveState();
}
// 老師目前選的班級
function teacherClasses() { return (S.classes || []).filter(c => !c.archived); }
function teacherCid() {
  const list = teacherClasses(), saved = store.get('cj-tcid');
  return (list.find(c => c.id === saved) || list[0] || {}).id || '';
}
const classSelect = (id, cid, withAll) => `<select id="${id}">${withAll ? '<option value="">我的全部班級</option>' : ''}${teacherClasses().map(c => `<option value="${esc(c.id)}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}${isAdmin() && c.owner !== S.user.email ? `（${esc(c.ownerName)}）` : ''}</option>`).join('')}</select>`;

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
      ${classSelect('fcls', '', true)}
      <select id="fprob"><option value="">全部題目</option>${PROBS.map(p => `<option value="${p.id}">${p.id} ${esc(p.title)}</option>`).join('')}</select>
      <select id="fv"><option value="">全部結果</option>${Object.entries(VERDICT).map(([k, v]) => `<option value="${k}">${k} ${v}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="auto" checked> 每 20 秒自動更新</label>
    </div></div>
    <div class="card" id="subs"><div class="loading">載入中…</div></div>`;
  let page = 1;
  const f = { cid: q.cid ?? store.get('cj-feedcid') ?? '', problem: q.problem || '', verdict: q.verdict || '', account: q.account || '' };
  if (f.cid && !teacherClasses().some(c => c.id === f.cid)) f.cid = '';
  $('#fcls').value = f.cid; $('#fprob').value = f.problem; $('#fv').value = f.verdict;
  async function load() {
    const d = await apiGet('/api/feed', { ...f, page });
    if (!$('#subs')) return;
    $('#subs').innerHTML = (f.account ? `<p>只顯示 <b>${esc(f.account)}</b> 的提交 <a href="#/submissions">顯示全部</a></p>` : '') +
      (d.submissions.length ? subTable(d.submissions) : '<p class="muted">沒有資料</p>') +
      `<div class="pager">${page > 1 ? '<button class="btn sm" id="pgPrev">‹ 較新</button>' : ''}<span class="muted small">第 ${page} 頁</span>${d.more ? '<button class="btn sm" id="pgNext">較舊 ›</button>' : ''}</div>`;
    if ($('#pgPrev')) $('#pgPrev').onclick = () => { page--; load(); };
    if ($('#pgNext')) $('#pgNext').onclick = () => { page++; load(); };
  }
  $('#fcls').onchange = e => { f.cid = e.target.value; store.set('cj-feedcid', f.cid); page = 1; load(); };
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
      <div class="row"><h3 style="margin:0">程式碼 ${isTeacher() ? '<span class="muted small">（點行號可以針對那一行留言）</span>' : ''}</h3><span class="spacer"></span>${zoomButtons()}</div>
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
  bindZoom(() => [cm]);
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

// ============ 成績總表（老師，每 20 秒檢查一次；沒有變動時伺服器只回「沒變」） ============
const GRADE_DEFAULT = { cond: 'ac', base: 60, bonus: 40, mode: 'linear', step: 2 };
const gradeCfg = () => Object.assign({}, GRADE_DEFAULT, store.json('cj-grade', {}));
// 換算一格的成績：有做 → 基本分；通過的再依本班完成名次加分
// cell = [最高分, 送出次數, 首次通過時間, 最後提交編號, 名次, 通過的提交編號]；n = 這一題本班通過人數
function gradeOf(cell, n, cfg) {
  if (!cell) return 0;
  const done = cfg.cond === 'ac' ? !!cell[2] : cfg.cond === 'score' ? cell[0] > 0 : cell[1] > 0;
  if (!done) return 0;
  let bonus = 0;
  if (cell[2] && cell[4]) bonus = cfg.mode === 'linear' ? (n <= 1 ? cfg.bonus : cfg.bonus * (n - cell[4]) / (n - 1)) : Math.max(0, cfg.bonus - (cell[4] - 1) * cfg.step);
  return Math.round((+cfg.base + bonus) * 10) / 10;
}
async function viewScoreboard() {
  if (!teacherClasses().length) { app().innerHTML = '<div class="card"><h2>成績總表</h2><p>你還沒有班級，請先到 <a href="#/classes">班級管理</a> 建立班級。</p></div>'; return; }
  let cid = teacherCid();
  let series = store.get('cj-sb-series') || 'a';
  let topic = store.get('cj-sb-topic') || '';
  let mode = store.get('cj-sb-mode') || 'raw';
  const cfg = gradeCfg();
  app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">成績總表</h2><span class="spacer"></span>
    <label class="small"><input type="checkbox" id="auto" checked> 每 20 秒自動更新</label>
    <button class="btn" id="csv">⬇ 下載 CSV（Excel）</button>
    <button class="btn" id="toSheet">寫入 Google Sheet</button></div>
    <div class="tabs cls-tabs" id="clsTabs" style="margin:12px 0 0">${teacherClasses().map(c => `<button data-c="${esc(c.id)}" class="${c.id === cid ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px">系列：<select id="sbSeries">${SERIES_KEYS.map(k => `<option value="${k}" ${k === series ? 'selected' : ''}>${esc(DATA.series[k].name)}</option>`).join('')}</select>
      單元：<select id="sbTopic"></select>
      顯示：<select id="sbMode"><option value="raw" ${mode === 'raw' ? 'selected' : ''}>原始分數</option><option value="grade" ${mode === 'grade' ? 'selected' : ''}>換算成績</option></select>
      <span class="muted small">綠＝通過、橘＝部分得分、紅＝0 分；點格子看最後一次的程式碼。<span class="online"></span>＝2 分鐘內有活動</span></div>
    <details class="grade-box" ${mode === 'grade' ? 'open' : ''}><summary>📊 成績換算設定（有做的給基本分，通過的再依完成名次加分）</summary>
      <div class="grade-grid">
        <label>怎樣算「有做」</label><select id="gCond"><option value="ac">通過（AC）</option><option value="score">有得分（部分正確也算）</option><option value="tried">有送出就算</option></select>
        <label>有做的基本分</label><input type="number" id="gBase" min="0" max="100" style="width:90px">
        <label>名次加分最多</label><input type="number" id="gBonus" min="0" max="100" style="width:90px">
        <label>名次加分方式</label><div><select id="gMode"><option value="linear">依名次比例：第 1 名加滿分，最後一位通過的加 0 分</option><option value="step">每差一名少幾分</option></select>
          <span id="gStepBox">　每名少 <input type="number" id="gStep" min="0" max="100" step="0.5" style="width:70px"> 分（最少 0 分）</span></div>
      </div>
      <p class="muted small" id="gExample"></p>
      <p class="muted small">名次依「本班第一次通過的時間」排序；只有通過（AC）的同學有名次加分。每一題換算後最高 ${'<b id="gMax"></b>'} 分，「平均」是目前選擇範圍內所有題目的平均。</p>
    </details></div>
    <div id="sb"><div class="card loading">載入中…</div></div>`;
  $('#gCond').value = cfg.cond; $('#gBase').value = cfg.base; $('#gBonus').value = cfg.bonus; $('#gMode').value = cfg.mode; $('#gStep').value = cfg.step;
  const readCfg = () => {
    const c = { cond: $('#gCond').value, base: +$('#gBase').value || 0, bonus: +$('#gBonus').value || 0, mode: $('#gMode').value, step: +$('#gStep').value || 0 };
    store.set('cj-grade', JSON.stringify(c));
    $('#gStepBox').style.display = c.mode === 'step' ? '' : 'none';
    $('#gMax').textContent = c.base + c.bonus;
    const ex = n => Array.from({ length: Math.min(n, 5) }, (_, i) => gradeOf([100, 1, 1, 0, i + 1], n, c));
    $('#gExample').textContent = `例：某題全班有 10 人通過 → 第 1～5 名分別得 ${ex(10).join('、')} 分…；沒通過但${c.cond === 'ac' ? '（不算有做）得 0 分' : '有做得 ' + c.base + ' 分'}；沒做 0 分。`;
    return c;
  };
  readCfg();
  const fillTopics = () => {
    const ts = Object.entries(DATA.topics).filter(([, t]) => t.series === series);
    if (!ts.some(([k]) => k === topic)) topic = '';
    $('#sbTopic').innerHTML = `<option value="">全部單元</option>` + ts.map(([k, t]) => `<option value="${k}" ${k === topic ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  };
  fillTopics();
  let last = null;
  const probsNow = () => PROBS.filter(p => p.series === series && (!topic || p.topic === topic));
  const acCountOf = pid => last.students.filter(r => r.cells[pid] && r.cells[pid][2]).length;
  // 表格資料（下載與寫入 Google Sheet 共用）
  const tableRows = () => {
    const ps = probsNow(), c = readCfg(), cls = last.cls.name;
    const n = Object.fromEntries(ps.map(p => [p.id, acCountOf(p.id)]));
    const head = ['班級', '座號', '姓名', 'Email', ...ps.map(p => `${p.id} ${p.title}`), '通過題數', '原始總分', `換算平均（每題 ${c.base + c.bonus} 分）`, '換算總分'];
    const rows = last.students.map(r => {
      const raw = ps.map(p => r.cells[p.id] ? r.cells[p.id][0] : ''), g = ps.map(p => gradeOf(r.cells[p.id], n[p.id], c));
      const gsum = g.reduce((a, b) => a + b, 0);
      return [cls, r.seat, r.name, r.email, ...(mode === 'grade' ? g : raw), ps.filter(p => r.cells[p.id] && r.cells[p.id][2]).length,
        raw.reduce((a, b) => a + (+b || 0), 0), ps.length ? Math.round(gsum / ps.length * 10) / 10 : 0, Math.round(gsum * 10) / 10];
    });
    return [head, ...rows];
  };
  $('#csv').onclick = () => {
    if (!last) return;
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + tableRows().map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `成績_${last.cls.name}_${DATA.series[series].name}${topic ? '_' + DATA.topics[topic].name : ''}_${mode === 'grade' ? '換算' : '原始'}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#toSheet').onclick = async () => {
    if (!last) return;
    const b = $('#toSheet'); b.disabled = true;
    try { toast((await api('/api/scoreboard/sheet', { cid, rows: tableRows() })).msg, 4000); } catch (e) { toast(e.message); }
    b.disabled = false;
  };
  const online = t => t && Date.now() - t < 120000;
  const render = () => {
    if (!last || !$('#sb')) return;
    const ps = probsNow(), rows = last.students, c = readCfg();
    const n = Object.fromEntries(ps.map(p => [p.id, acCountOf(p.id)]));
    const acs = r => ps.filter(p => r.cells[p.id] && r.cells[p.id][2]).length;
    const sum = r => mode === 'grade' ? Math.round(ps.reduce((a, p) => a + gradeOf(r.cells[p.id], n[p.id], c), 0) / Math.max(1, ps.length) * 10) / 10
      : ps.reduce((a, p) => a + (r.cells[p.id] ? r.cells[p.id][0] : 0), 0);
    $('#sb').innerHTML = !rows.length ? `<div class="card"><p>這個班級還沒有學生，請到 <a href="#/class/${esc(cid)}">班級管理</a> 匯入名單或開放學生用代碼加入。</p></div>` :
      `<div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">${esc(last.cls.name)}</h2>
      <span class="muted">${rows.length} 人 · 平均通過 ${(rows.reduce((a, r) => a + acs(r), 0) / rows.length).toFixed(1)} 題</span></div>
    <div class="table-wrap"><table class="list sb"><thead><tr><th class="name">座號</th><th class="name">姓名</th><th>通過</th><th>${mode === 'grade' ? '換算平均' : '總分'}</th>
      ${ps.map(p => `<th class="p" title="${esc(p.title)}"><a href="#/problem/${p.id}">${p.id.slice(1)}</a></th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr><td class="name">${seat2(r.seat)}</td>
        <td class="name"><span class="${online(r.lastSeen) ? 'online' : 'offline'}"></span>${r.account ? `<a href="#/submissions?account=${esc(r.account)}&cid=${esc(cid)}">${esc(r.name)}</a>` : `${esc(r.name)} <span class="muted small">（未登入過）</span>`}</td>
        <td><b>${acs(r)}</b></td><td>${sum(r)}</td>
        ${ps.map(p => {
          const x = r.cells[p.id]; if (!x) return '<td></td>';
          const g = gradeOf(x, n[p.id], c);
          return `<td><a class="cell ${x[2] ? 'ac' : x[0] > 0 ? 'part' : 'zero'}" href="#/submission/${x[3]}" title="${esc(p.id + ' ' + p.title)}｜最高 ${x[0]} 分｜送出 ${x[1]} 次${x[2] ? '｜首次通過 ' + fmtTime(x[2]) + '｜本班第 ' + x[4] + ' 名' : ''}｜換算 ${g} 分">${mode === 'grade' ? g : x[2] ? '✔' : x[0]}</a></td>`;
        }).join('')}
      </tr>`).join('')}
      </tbody><tfoot><tr><th class="name" colspan="4">通過人數</th>${ps.map(p => `<th>${n[p.id]}</th>`).join('')}</tr></tfoot></table></div></div>`;
  };
  async function load(full) {
    const d = await apiGet('/api/scoreboard', { cid, v: full || !last ? '' : last.v });
    if (d.same) {   // 沒有變動：只更新上線狀態
      const seen = Object.fromEntries(d.seen);
      last.students.forEach(r => r.lastSeen = seen[r.seat] || r.lastSeen);
      $$('#sb td.name span.online, #sb td.name span.offline').forEach((el, i) => { const r = last.students[i]; if (r) el.className = online(r.lastSeen) ? 'online' : 'offline'; });
      return;
    }
    last = d; render();
  }
  $$('#clsTabs button').forEach(b => b.onclick = () => { cid = b.dataset.c; store.set('cj-tcid', cid); $$('#clsTabs button').forEach(x => x.classList.toggle('on', x === b)); last = null; $('#sb').innerHTML = '<div class="card loading">載入中…</div>'; load(true); });
  $('#sbSeries').onchange = e => { series = e.target.value; store.set('cj-sb-series', series); fillTopics(); render(); };
  $('#sbTopic').onchange = e => { topic = e.target.value; store.set('cj-sb-topic', topic); render(); };
  $('#sbMode').onchange = e => { mode = e.target.value; store.set('cj-sb-mode', mode); if (mode === 'grade') $('.grade-box').open = true; render(); };
  ['gCond', 'gBase', 'gBonus', 'gMode', 'gStep'].forEach(id => $('#' + id).oninput = $('#' + id).onchange = render);
  await load(true);
  pageTimers.push(setInterval(() => { if ($('#auto') && $('#auto').checked && !document.hidden) load().catch(() => { }); }, 20000));
}

// ============ 班級管理（老師） ============
async function viewClasses() {
  const list = S.classes || [];
  app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">班級管理</h2><span class="spacer"></span>
      <input type="text" id="ncName" placeholder="新班級名稱，例如 901 或 七年級資訊社" style="width:280px"><button class="btn primary" id="ncGo">＋ 建立班級</button></div>
    <p class="muted small">建立班級後，可以「貼上名單」（座號、姓名、Email），或把「加入代碼」給學生，讓學生登入後自己加入。</p></div>
    <div class="card">${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>班級</th><th>人數</th><th>加入代碼</th><th>學生自行加入</th>${isAdmin() ? '<th>老師</th>' : ''}<th></th></tr></thead><tbody>
      ${list.map(c => `<tr class="${c.archived ? 'muted' : ''}"><td><a href="#/class/${esc(c.id)}"><b>${esc(c.name)}</b></a>${c.archived ? '（已封存）' : ''}</td><td>${c.count}</td>
        <td><code class="jcode">${esc(c.code)}</code></td><td>${c.allowJoin ? '開放' : '<span class="muted">關閉</span>'}</td>${isAdmin() ? `<td class="small">${esc(c.ownerName)}</td>` : ''}
        <td><a class="btn sm" href="#/class/${esc(c.id)}">管理名單與設定</a> <a class="btn sm" href="#/scoreboard" data-sb="${esc(c.id)}">成績</a></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">還沒有班級。</p>'}</div>`;
  $$('[data-sb]').forEach(a => a.onclick = () => store.set('cj-tcid', a.dataset.sb));
  $('#ncGo').onclick = async () => {
    const name = $('#ncName').value.trim(); if (!name) { toast('請輸入班級名稱'); return; }
    const b = $('#ncGo'); b.disabled = true;
    try { const d = await api('/api/class/create', { name }); S.classes = [...(S.classes || []), d.cls]; saveState(); location.hash = '#/class/' + d.cls.id; }
    catch (e) { toast(e.message); b.disabled = false; }
  };
}
// 解析貼上的名單：每一行「座號 姓名 Email」，用 Tab、逗號或空白分隔；Email 可以省略；第一行是標題也沒關係
function parseRoster(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.split(/[\t,，]+|\s{2,}|\s+(?=\S+@)/).map(s => s.trim()).filter(Boolean);
    const toks = parts.length >= 2 ? parts : line.trim().split(/\s+/);
    const email = toks.find(t => /@/.test(t)) || '';
    const seatTok = toks.find(t => /^\d{1,3}$/.test(t));
    if (!seatTok) continue;
    const name = toks.filter(t => t !== email && t !== seatTok && !/^\d+$/.test(t)).join(' ');
    rows.push({ seat: +seatTok, name, email });
  }
  return rows;
}
async function viewClass(cid) {
  app().innerHTML = '<div class="loading">載入中…</div>';
  const d = await apiGet('/api/class/members', { cid });
  const c = d.cls;
  const i = (S.classes || []).findIndex(x => x.id === c.id);
  if (i >= 0) { S.classes[i] = c; saveState(); }
  const h = new Set(c.hidden || []);
  app().innerHTML = `
  <div class="pnav"><a class="btn" href="#/classes">← 班級列表</a><a class="btn" href="#/scoreboard" id="toSb">成績總表</a></div>
  <div class="card"><div class="row"><h2 style="margin:0">${esc(c.name)}</h2>${c.archived ? '<span class="tag">已封存</span>' : ''}<span class="spacer"></span>
      <input type="text" id="cName" value="${esc(c.name)}" style="width:200px"><button class="btn sm" id="cRename">改名</button>
      <button class="btn sm ${c.archived ? '' : 'danger'}" id="cArchive">${c.archived ? '取消封存' : '封存班級'}</button></div>
    <div class="join-box"><div>加入代碼<code class="jcode big">${esc(c.code)}</code></div>
      <div><label><input type="checkbox" id="cJoin" ${c.allowJoin ? 'checked' : ''}> 開放學生用代碼自行加入</label><br>
        <span class="muted small">學生用 Google 帳號登入 → 輸入代碼、座號、姓名。名單上已經有座號但沒有 Email 的，學生輸入相同的座號和姓名就會綁定（不需要開放也可以）。</span></div>
      <button class="btn sm" id="cNewCode">換一個代碼</button></div></div>
  <div class="problem-layout">
    <div class="card"><h3 style="margin-top:0">學生名單（${d.members.length} 人）</h3>
      ${d.members.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>座號</th><th>姓名</th><th>Email</th><th>最近活動</th><th></th></tr></thead><tbody>
        ${d.members.map(m => `<tr><td>${seat2(m.seat)}</td><td>${esc(m.name)}</td><td class="small">${m.email ? esc(m.email) : '<span class="muted">尚未綁定（學生可用代碼綁定）</span>'}</td>
          <td class="small">${m.lastSeen ? `<span class="${Date.now() - m.lastSeen < 120000 ? 'online' : 'offline'}"></span>${fmtTime(m.lastSeen, true)}` : ''}</td>
          <td><button class="btn sm danger" data-rm="${m.seat}">移除</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有學生。</p>'}
    </div>
    <div>
      <div class="card"><h3 style="margin-top:0">匯入名單</h3>
        <p class="muted small">從 Excel 複製「座號、姓名、Email」三欄貼上（Email 可以先不填，學生之後用代碼綁定）。同座號的會更新姓名與 Email。</p>
        <textarea id="imp" rows="8" placeholder="1	王小明	s001@gmail.com&#10;2	李小華	s002@gmail.com&#10;3	陳大文"></textarea>
        <div class="row" style="margin-top:6px"><span class="muted small" id="impPrev"></span><span class="spacer"></span><button class="btn primary" id="impGo">匯入</button></div></div>
      <div class="card"><h3 style="margin-top:0">新增一位學生</h3>
        <div class="row"><input type="number" id="oSeat" placeholder="座號" style="width:80px" value="${(d.members.reduce((a, m) => Math.max(a, m.seat), 0)) + 1}">
          <input type="text" id="oName" placeholder="姓名" style="width:120px"><input type="text" id="oMail" placeholder="Email（可不填）" style="flex:1;min-width:160px">
          <button class="btn" id="oGo">新增</button></div></div>
      <div class="card"><h3 style="margin-top:0">本班開放的題目</h3>
        <p class="muted small">取消勾選的系列或單元，這個班的學生就看不到、也不能送出。</p>
        ${SERIES_KEYS.map(k => `<div class="open-series"><label><input type="checkbox" data-h="${k}" ${h.has(k) ? '' : 'checked'}> <b>${esc(DATA.series[k].name)}</b></label>
          <div class="open-topics">${Object.entries(DATA.topics).filter(([, t]) => t.series === k).map(([tk, t]) => `<label><input type="checkbox" data-h="${tk}" ${h.has(tk) ? '' : 'checked'}> ${esc(t.name)}</label>`).join('')}</div></div>`).join('')}
        <label style="display:block;margin-top:8px" class="small">另外要隱藏的題號（逗號分隔）：</label>
        <input type="text" id="hideIds" style="width:100%" value="${esc([...h].filter(x => PMAP[x]).join(', '))}">
        <div class="row" style="margin-top:8px"><span class="spacer"></span><button class="btn primary" id="saveOpen">儲存開放設定</button></div></div>
    </div>
  </div>`;
  const update = async (body, msg) => {
    try { const r = await api('/api/class/update', Object.assign({ cid }, body)); const k = (S.classes || []).findIndex(x => x.id === cid); if (k >= 0) S.classes[k] = r.cls; saveState(); toast(msg); viewClass(cid); }
    catch (e) { toast(e.message); }
  };
  $('#toSb').onclick = () => store.set('cj-tcid', cid);
  $('#cRename').onclick = () => update({ name: $('#cName').value.trim() }, '已改名');
  $('#cArchive').onclick = () => { if (c.archived || confirm('封存後學生就不能再進入這個班級（成績資料會保留，之後可以取消封存）。確定嗎？')) update({ archived: !c.archived }, c.archived ? '已取消封存' : '已封存'); };
  $('#cJoin').onchange = e => update({ allowJoin: e.target.checked }, e.target.checked ? '已開放自行加入' : '已關閉自行加入');
  $('#cNewCode').onclick = () => { if (confirm('換代碼後，舊的代碼就不能用了。確定嗎？')) update({ newCode: true }, '已換新代碼'); };
  $('#saveOpen').onclick = () => update({ hidden: $$('[data-h]').filter(x => !x.checked).map(x => x.dataset.h).concat($('#hideIds').value.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(x => PMAP[x])) }, '已儲存，學生下次同步時生效');
  $('#imp').oninput = () => { const r = parseRoster($('#imp').value); $('#impPrev').textContent = r.length ? `讀到 ${r.length} 人：${r.slice(0, 3).map(x => x.seat + ' ' + x.name).join('、')}${r.length > 3 ? '…' : ''}` : ''; };
  const save = async rows => {
    try { const r = await api('/api/class/members/save', { cid, rows }); toast(`新增 ${r.added} 人、更新 ${r.updated} 人`); viewClass(cid); } catch (e) { toast(e.message, 4000); }
  };
  $('#impGo').onclick = () => { const rows = parseRoster($('#imp').value); if (!rows.length) { toast('沒有讀到資料，每一行要有座號'); return; } save(rows); };
  $('#oGo').onclick = () => { if (!+$('#oSeat').value || !$('#oName').value.trim()) { toast('請輸入座號和姓名'); return; } save([{ seat: +$('#oSeat').value, name: $('#oName').value.trim(), email: $('#oMail').value.trim() }]); };
  $$('[data-rm]').forEach(b => b.onclick = async () => {
    if (!confirm(`確定要把座號 ${b.dataset.rm} 移出名單嗎？（成績會保留，重新加入同座號會恢復）`)) return;
    try { await api('/api/class/members/remove', { cid, seat: +b.dataset.rm }); toast('已移除'); viewClass(cid); } catch (e) { toast(e.message); }
  });
}

// ============ 系統管理（最高管理者） ============
async function viewAdmin() {
  app().innerHTML = '<div class="loading">載入中…</div>';
  const d = await apiGet('/api/admin/overview');
  const pending = d.users.filter(u => u.status === 'pending'), others = d.users.filter(u => u.status !== 'pending' && !d.admins.includes(u.email));
  const ST = { active: '✔ 使用中', pending: '等待審核', rejected: '已拒絕', disabled: '已停用' };
  app().innerHTML = `
  <div class="card"><h2>系統管理</h2>
    <div class="statgrid"><div class="stat"><b>${d.classes.length}</b><span>班級</span></div><div class="stat"><b>${d.classes.reduce((a, c) => a + c.count, 0)}</b><span>學生</span></div>
      <div class="stat"><b>${others.filter(u => u.status === 'active').length}</b><span>老師</span></div><div class="stat"><b>${d.stats.submissions}</b><span>提交總數</span></div>
      <div class="stat"><b>${PROBS.length}</b><span>題目</span></div></div>
    ${S.serverVersion && S.serverVersion !== DATA.version ? `<div class="friendly"><b>注意：題目版本不一致。</b>網站的 problems.js 是 ${esc(DATA.version)}，Apps Script 的 Answers.gs 是 ${esc(S.serverVersion)}。</div>` : ''}
    <div class="row"><a class="btn primary" href="#/edit/">＋ 新增題目</a><span class="muted small">在題目頁也可以按「編輯題目」或「測資與解答」。</span></div></div>
  <div class="card"><h3 style="margin-top:0">老師帳號申請 ${pending.length ? `<span class="dot-badge">${pending.length}</span>` : ''}</h3>
    ${pending.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>姓名</th><th>學校</th><th>Email</th><th>備註</th><th>申請時間</th><th></th></tr></thead><tbody>
      ${pending.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.school)}</td><td>${esc(u.email)}</td><td class="small">${esc(u.note)}</td><td class="small">${fmtTime(u.time)}</td>
        <td><button class="btn sm green" data-st="active" data-em="${esc(u.email)}">核准</button> <button class="btn sm danger" data-st="rejected" data-em="${esc(u.email)}">拒絕</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">目前沒有待審核的申請。（有新申請時會寄 Email 通知系統管理員）</p>'}</div>
  <div class="card"><h3 style="margin-top:0">老師</h3>
    <div class="table-wrap"><table class="list"><thead><tr><th>姓名</th><th>學校</th><th>Email</th><th>狀態</th><th>可以看測資與解答</th><th>班級</th><th></th></tr></thead><tbody>
      ${d.admins.map(e => `<tr><td colspan="3">${esc(e)}</td><td>系統管理員</td><td>✔</td><td>${d.classes.filter(c => c.owner === e).length}</td><td></td></tr>`).join('')}
      ${others.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.school)}</td><td>${esc(u.email)}</td><td>${ST[u.status] || esc(u.status)}</td>
        <td><label><input type="checkbox" data-perm="${esc(u.email)}" ${u.perm === 'tests' ? 'checked' : ''} ${u.status === 'active' ? '' : 'disabled'}> 允許</label></td>
        <td>${d.classes.filter(c => c.owner === u.email).length}</td>
        <td>${u.status === 'active' ? `<button class="btn sm danger" data-st="disabled" data-em="${esc(u.email)}">停用</button>` : `<button class="btn sm" data-st="active" data-em="${esc(u.email)}">啟用</button>`}</td></tr>`).join('')}
    </tbody></table></div></div>
  <div class="card"><h3 style="margin-top:0">所有班級</h3>
    <div class="table-wrap"><table class="list"><thead><tr><th>班級</th><th>老師</th><th>人數</th><th>加入代碼</th><th>建立時間</th></tr></thead><tbody>
      ${d.classes.map(c => `<tr class="${c.archived ? 'muted' : ''}"><td><a href="#/class/${esc(c.id)}">${esc(c.name)}</a>${c.archived ? '（封存）' : ''}</td><td>${esc(c.ownerName)}</td><td>${c.count}</td><td><code>${esc(c.code)}</code></td><td class="small">${fmtTime(c.time)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-st]').forEach(b => b.onclick = async () => {
    if (b.dataset.st !== 'active' && !confirm('確定嗎？')) return;
    try { await api('/api/admin/teacher', { email: b.dataset.em, status: b.dataset.st }); toast('已更新'); viewAdmin(); } catch (e) { toast(e.message); }
  });
  $$('[data-perm]').forEach(cb => cb.onchange = async () => {
    try { await api('/api/admin/teacher', { email: cb.dataset.perm, perm: cb.checked ? 'tests' : '' }); toast(cb.checked ? '已允許看測資與解答' : '已取消權限'); } catch (e) { toast(e.message); cb.checked = !cb.checked; }
  });
}

// ============ 測資與解答（系統管理員、有權限的老師） ============
const clip = (s, n = 3000) => s.length > n ? s.slice(0, n) + `\n…（共 ${s.length} 字，請按下載看完整內容）` : s;
function downloadText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 用參考解答跑出每組測資的正確輸出
async function runSolution(solution, p, tests, onProgress) {
  const c = await Judge.compile(solution);
  if (!c.success) return { error: diagHtml(c.diags, 3) || esc(c.stderr) };
  const outs = [];
  for (let i = 0; i < tests.length; i++) {
    onProgress && onProgress(i + 1, tests.length);
    const t = tests[i];
    const input = t.input !== undefined ? t.input : CJGen.runGen(t.gen, t.seed);
    const r = await Judge.run(c.module, input, Math.max(5000, p.timeLimitMs || 1000));
    outs.push({ input, status: r.status, output: normalize(r.stdout || ''), timeMs: r.timeMs, error: r.error ? friendlyRE(r) : '' });
  }
  return { outs };
}
async function viewTests(id) {
  const p = PMAP[id];
  if (!p) { app().innerHTML = '<div class="card">找不到題目</div>'; return; }
  if (!S.user.canTests) { app().innerHTML = '<div class="card"><h2>沒有權限</h2><p>查看測資與解答需要系統管理員開放權限。</p></div>'; return; }
  app().innerHTML = '<div class="loading">載入中…</div>';
  const d = await apiGet('/api/problem-admin/' + id);
  Judge.start().catch(() => { });
  app().innerHTML = `
  <div class="pnav"><a class="btn" href="#/problem/${id}">← 回到題目</a>${isAdmin() ? `<a class="btn" href="#/edit/${id}">✏ 編輯題目</a>` : ''}<span class="spacer"></span>${zoomButtons()}</div>
  <div class="card"><div class="ptitle"><span class="pid">${id}</span><h2 style="margin:0">${esc(p.title)}：測資與解答</h2>${p.custom ? '<span class="tag">自訂</span>' : ''}</div>
    <p class="muted small">共 ${p.tests.length} 組測資（每組 ${Math.floor(100 / p.tests.length)} 分左右）。「公開」的測資學生看得到（範例與答錯時的比對），「隱藏」的學生看不到。正確答案是用下面的參考解答在你的瀏覽器裡算出來的。</p>
    <h3>參考解答</h3><div id="sol" class="readonly"></div>
    <div class="row" style="margin-top:6px"><button class="btn" id="cpSol">📋 複製參考解答</button><button class="btn" id="dlAll">⬇ 下載全部測資（文字檔）</button><span class="muted small" id="runMsg"></span></div></div>
  <div id="tlist"><div class="card loading">正在用參考解答計算正確答案…（第一次使用需要先下載編譯器）</div></div>`;
  const cm = createEditor($('#sol'), d.solution || '（沒有參考解答）', { readOnly: true });
  bindZoom(() => [cm, ...$$('#tlist pre')]);
  $('#cpSol').onclick = async () => { try { await navigator.clipboard.writeText(d.solution || ''); toast('已複製'); } catch { toast('複製失敗'); } };
  let result = null;
  const r = await runSolution(d.solution || '', p, p.tests, (i, n) => { if ($('#runMsg')) $('#runMsg').textContent = `計算中 ${i} / ${n}`; });
  if (!$('#tlist')) return;
  if (r.error) { $('#tlist').innerHTML = `<div class="card"><div class="friendly"><b>參考解答編譯失敗：</b>${r.error}</div></div>`; return; }
  result = r.outs;
  $('#runMsg').textContent = '✔ 已算出全部正確答案';
  $('#tlist').innerHTML = result.map((o, i) => `<div class="card test-card"><div class="row"><h3 style="margin:0">#${i + 1}</h3>
      ${p.tests[i].public ? '<span class="tag">公開</span>' : '<span class="tag hid">隱藏</span>'}${p.tests[i].gen ? '<span class="tag">程式產生的大型測資</span>' : ''}
      <span class="muted small">${p.tests[i].score || ''} 分 · 參考解答執行 ${o.timeMs} ms${o.status !== 'OK' ? ' · <b class="mine-tried">' + o.status + ' ' + esc(o.error) + '</b>' : ''}</span><span class="spacer"></span>
      <button class="btn sm" data-dl="${i}" data-k="in">⬇ 輸入</button><button class="btn sm" data-dl="${i}" data-k="out">⬇ 正確輸出</button></div>
    <div class="sample"><div class="box"><div class="h">輸入（${o.input.length} 字）</div><pre>${esc(clip(o.input)) || '<span class="muted">（無）</span>'}</pre></div>
      <div class="box"><div class="h">正確輸出（${o.output.length} 字）</div><pre>${esc(clip(o.output))}</pre></div></div></div>`).join('');
  bindZoom(() => [cm, ...$$('#tlist pre')]);
  $$('[data-dl]').forEach(b => b.onclick = () => { const o = result[+b.dataset.dl]; downloadText(`${id}_${+b.dataset.dl + 1}.${b.dataset.k}.txt`, b.dataset.k === 'in' ? o.input : o.output + '\n'); });
  $('#dlAll').onclick = () => downloadText(`${id}_全部測資.txt`, result.map((o, i) => `===== 第 ${i + 1} 組（${p.tests[i].public ? '公開' : '隱藏'}）輸入 =====\n${o.input}\n===== 第 ${i + 1} 組 正確輸出 =====\n${o.output}\n`).join('\n'));
}

// ============ 新增／編輯題目（系統管理員） ============
async function viewEdit(id) {
  if (!isAdmin()) { app().innerHTML = '<div class="card">只有系統管理員可以編輯題目。</div>'; return; }
  const old = id ? PMAP[id] : null;
  if (id && !old) { app().innerHTML = '<div class="card">找不到題目</div>'; return; }
  app().innerHTML = '<div class="loading">載入中…</div>';
  const d = old ? await apiGet('/api/problem-admin/' + id) : { solution: TEMPLATE };
  Judge.start().catch(() => { });
  const nextId = s => { let n = 1; while (PMAP[s + String(n).padStart(3, '0')]) n++; return s + String(n).padStart(3, '0'); };
  const p = old ? JSON.parse(JSON.stringify(old)) : { id: nextId('a'), title: '', series: 'a', topic: 'a-mix', tags: [], difficulty: 1, timeLimitMs: 1000, content: '', inputDesc: '', outputDesc: '', hint: '', tests: [{ input: '', public: true }] };
  let tests = p.tests.map(t => t.gen ? { gen: t.gen, seed: t.seed, public: false } : { input: t.input || '', public: !!t.public });
  let gen = null;   // 用參考解答產生的答案：{ outputs, hashes }
  const builtIn = old && BUILTIN.some(x => x.id === id);
  app().innerHTML = `
  <div class="pnav"><a class="btn" href="${old ? '#/problem/' + id : '#/admin'}">← ${old ? '回到題目' : '系統管理'}</a><span class="spacer"></span>
    ${old && old.custom ? `<button class="btn danger" id="delP">${builtIn ? '↺ 恢復成內建的原始版本' : '🗑 刪除這一題'}</button>` : ''}</div>
  <div class="card"><h2>${old ? '編輯題目 ' + esc(id) : '新增題目'}</h2>
    ${builtIn ? '<p class="friendly">這是內建題目。儲存後會以你的版本取代內建版本（學生的成績保留）；之後可以按「恢復成內建的原始版本」。</p>' : ''}
    <div class="form-grid">
      <label>系列 / 單元</label><div class="row"><select id="eSeries">${SERIES_KEYS.map(k => `<option value="${k}" ${k === p.series ? 'selected' : ''}>${esc(DATA.series[k].name)}</option>`).join('')}</select><select id="eTopic"></select></div>
      <label>題號</label><div class="row"><input type="text" id="eId" value="${esc(p.id)}" style="width:120px" ${old ? 'disabled' : ''}><span class="muted small">英文小寫開頭，例如 a101（建議用系列字母開頭）</span></div>
      <label>題目名稱</label><input type="text" id="eTitle" value="${esc(p.title)}">
      <label>難度 / 時間限制</label><div class="row"><select id="eDiff">${[1, 2, 3].map(n => `<option value="${n}" ${n === p.difficulty ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select>
        <input type="number" id="eTime" value="${p.timeLimitMs}" style="width:90px"> 毫秒　標籤 <input type="text" id="eTags" value="${esc((p.tags || []).join(', '))}" placeholder="用逗號分隔" style="width:220px"></div>
      <label>題目內容</label><textarea id="eContent" rows="5" style="font-family:inherit">${esc(p.content)}</textarea>
      <label>輸入說明</label><textarea id="eIn" rows="2" style="font-family:inherit">${esc(p.inputDesc)}</textarea>
      <label>輸出說明</label><textarea id="eOut" rows="2" style="font-family:inherit">${esc(p.outputDesc)}</textarea>
      <label>提示</label><textarea id="eHint" rows="2" style="font-family:inherit">${esc(p.hint)}</textarea>
      <label>參考解答<br><span class="muted small">學生看不到</span></label><div><div id="eSol"></div></div>
    </div></div>
  <div class="card"><div class="row"><h3 style="margin:0">測資</h3><span class="muted small">第 1 組和勾選「公開」的會當作範例給學生看；分數由系統平均分配（總分 100）。</span><span class="spacer"></span><button class="btn" id="addT">＋ 新增一組</button></div>
    <div id="eTests"></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="genAns">▶ 用參考解答產生答案</button><span id="genMsg" class="small"></span><span class="spacer"></span>
      <button class="btn green" id="saveP" disabled>💾 儲存題目</button></div></div>`;
  const sol = createEditor($('#eSol'), d.solution || TEMPLATE, { onChange: () => { gen = null; showTests(); } });
  sol.setSize(null, 300);
  const fillTopic = () => {
    const s = $('#eSeries').value;
    $('#eTopic').innerHTML = Object.entries(DATA.topics).filter(([, t]) => t.series === s).map(([k, t]) => `<option value="${k}" ${k === p.topic ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    if (!old) { $('#eId').value = nextId(s); }
  };
  $('#eSeries').onchange = fillTopic; fillTopic();
  const showTests = () => {
    $('#eTests').innerHTML = tests.map((t, i) => `<div class="testcase2"><b>#${i + 1}</b>
      <div><div class="small muted">輸入 <label><input type="checkbox" data-pub="${i}" ${t.public ? 'checked' : ''} ${t.gen ? 'disabled' : ''}> 公開</label></div>
        ${t.gen ? `<div class="muted small genbox">程式產生的大型測資（只能在出題工具 tools 裡修改），種子 ${esc(t.seed)}</div>` : `<textarea data-in="${i}" rows="3">${esc(t.input)}</textarea>`}</div>
      <div><div class="small muted">正確輸出 ${gen ? (gen.status[i] === 'OK' ? '<span class="mine-ac">✔</span>' : `<b class="mine-tried">${esc(gen.status[i])}</b>`) : '（按下方按鈕產生）'}</div>
        <pre class="genout">${gen ? esc(clip(gen.outputs[i], 1500)) : ''}</pre></div>
      <button class="btn sm danger" data-rm="${i}" title="刪除這組">✕</button></div>`).join('');
    $$('[data-in]').forEach(el => el.oninput = () => { tests[+el.dataset.in].input = el.value; if (gen) { gen = null; $('#saveP').disabled = true; $('#genMsg').textContent = '測資改了，請重新產生答案'; } });
    $$('[data-pub]').forEach(el => el.onchange = () => { tests[+el.dataset.pub].public = el.checked; });
    $$('[data-rm]').forEach(b => b.onclick = () => { if (tests.length > 1) { tests.splice(+b.dataset.rm, 1); gen = null; showTests(); } });
    $('#saveP').disabled = !gen || gen.status.some(s => s !== 'OK');
  };
  showTests();
  $('#addT').onclick = () => { tests.push({ input: '', public: false }); gen = null; showTests(); };
  $('#genAns').onclick = async () => {
    const b = $('#genAns'); b.disabled = true; $('#genMsg').textContent = '編譯中…';
    try {
      const r = await runSolution(sol.getValue(), { timeLimitMs: +$('#eTime').value }, tests, (i, n) => $('#genMsg').textContent = `執行中 ${i} / ${n}`);
      if (r.error) { $('#genMsg').innerHTML = '<span class="mine-tried">參考解答編譯失敗</span>' + r.error; gen = null; }
      else {
        gen = { outputs: r.outs.map(o => o.output), status: r.outs.map(o => o.status), hashes: await Promise.all(r.outs.map(o => sha(o.output))) };
        const bad = gen.status.filter(s => s !== 'OK').length;
        $('#genMsg').innerHTML = bad ? `<span class="mine-tried">有 ${bad} 組執行失敗，請修正參考解答</span>` : '<span class="mine-ac">✔ 已產生全部答案，請檢查後儲存</span>';
      }
    } catch (e) { $('#genMsg').textContent = e.message; }
    b.disabled = false; showTests();
  };
  $('#saveP').onclick = async () => {
    const problem = {
      id: $('#eId').value.trim().toLowerCase(), title: $('#eTitle').value.trim(), series: $('#eSeries').value, topic: $('#eTopic').value,
      tags: $('#eTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean), difficulty: +$('#eDiff').value, timeLimitMs: +$('#eTime').value,
      content: $('#eContent').value, inputDesc: $('#eIn').value, outputDesc: $('#eOut').value, hint: $('#eHint').value,
      solution: sol.getValue(), tests, outputs: gen.outputs, hashes: gen.hashes,
    };
    if (!old && PMAP[problem.id]) { toast('題號已經存在'); return; }
    const b = $('#saveP'); b.disabled = true;
    try {
      await api('/api/problems/save', { problem });
      await backgroundSync(true);   // 下載新的題目資料
      toast('已儲存，學生下次同步時就會看到'); location.hash = '#/problem/' + problem.id;
    } catch (e) { toast(e.message, 4000); b.disabled = false; }
  };
  if ($('#delP')) $('#delP').onclick = async () => {
    if (!confirm(builtIn ? '確定要恢復成內建的原始版本嗎？' : '確定要刪除這一題嗎？（學生的提交紀錄會保留）')) return;
    try { await api('/api/problems/delete', { id }); await backgroundSync(true); toast('完成'); location.hash = builtIn ? '#/problem/' + id : '#/problems'; } catch (e) { toast(e.message); }
  };
}

// ============ 啟動 ============
if (S) {
  if (!isGuest()) Judge.start().catch(() => { });   // 已登入：一打開網頁就在背景準備編譯器
  backgroundSync(S.schema !== 2);   // 舊版網頁留下的登入資料：立刻同步一次換成新格式（登入狀態保留）
  if (isTeacher()) setInterval(() => backgroundSync(true), 60000);   // 老師：每分鐘檢查新留言
}
router();
