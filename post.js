/* 栗尾郵局：最後一封信 —— 3D 實境解謎測驗
 *   #/post   學生：規則 → 進入郵局（3D）；老師：開始／收卷／加時／提示／全班狀況／匯出，也可以「老師試玩」
 * 題目、標準答案、計分都在伺服器（Post.gs），瀏覽器只拿到場景線索與程式卡。
 * 3D 用 three.js r128（cdnjs），人物和道具都用基本形狀組成，不下載模型；不支援 3D 的電腦自動改用 2D 模式。
 * 使用 app.js 的共用工具：$、$$、esc、api、apiGet、S、toast、isTeacher、teacherClasses、teacherCid、store、fmtTime、seat2、downloadCsv、app、pageTimers */
'use strict';
(function () {
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let threeP = null;
  const loadThree = () => threeP || (threeP = new Promise((res, rej) => {
    if (window.THREE) return res(window.THREE);
    const s = document.createElement('script'); s.src = THREE_URL;
    s.onload = () => res(window.THREE); s.onerror = () => { threeP = null; rej(new Error('3D 引擎載入失敗')); };
    document.head.appendChild(s);
  }));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
  const ROOM0 = { id: 0, name: '大廳（練習區）', topic: '不計分' }, ROOM6 = { id: 6, name: '信庫', topic: '' };

  // ============ 館長歐爾（原創角色：戴單片眼鏡與小禮帽的貓頭鷹） ============
  const OWL_SVG = `<svg viewBox="0 0 120 130" class="po-owl-svg">
    <rect x="38" y="2" width="44" height="22" rx="3" fill="#2b2140"/><rect x="30" y="20" width="60" height="7" rx="3" fill="#2b2140"/><rect x="38" y="15" width="44" height="5" fill="#b8325a"/>
    <path d="M22 40 L30 22 L42 34 Z M98 40 L90 22 L78 34 Z" fill="#6d4c7d"/>
    <ellipse cx="60" cy="80" rx="44" ry="46" fill="#6d4c7d"/><ellipse cx="60" cy="95" rx="28" ry="30" fill="#e8d6b8"/>
    <path d="M44 88 q4 4 8 0 M56 96 q4 4 8 0 M68 88 q4 4 8 0 M50 106 q4 4 8 0 M62 106 q4 4 8 0" stroke="#b49a7a" stroke-width="2" fill="none"/>
    <circle cx="42" cy="56" r="17" fill="#fff8e6" stroke="#f2b134" stroke-width="4"/><circle cx="78" cy="56" r="17" fill="#fff8e6" stroke="#f2b134" stroke-width="4"/>
    <g class="po-owl-eyes"><circle cx="45" cy="58" r="7" fill="#1d1428"/><circle cx="75" cy="58" r="7" fill="#1d1428"/><circle cx="47" cy="55" r="2.4" fill="#fff"/><circle cx="77" cy="55" r="2.4" fill="#fff"/></g>
    <path d="M28 44 L56 50" stroke="#1d1428" stroke-width="4" stroke-linecap="round"/><path d="M92 44 L64 50" stroke="#1d1428" stroke-width="4" stroke-linecap="round"/>
    <circle cx="78" cy="56" r="20" fill="none" stroke="#d9a520" stroke-width="3"/><path d="M96 64 q6 20 -4 34" stroke="#d9a520" stroke-width="1.5" fill="none"/>
    <path class="po-owl-beak" d="M54 68 L66 68 L60 80 Z" fill="#f39c12"/>
    <path d="M18 80 q-10 24 8 38 q6 -18 2 -36 Z M102 80 q10 24 -8 38 q-6 -18 -2 -36 Z" fill="#553a63"/>
  </svg>`;
  const OWL = {
    hello: ['我是栗尾郵局的館長歐爾。小刺蝟的信？想拿到它，先過我的五個房間再說。', '又一隻松鼠郵差？上一隻在 if 那間哭著回家了，呵呵。'],
    room: {
      0: ['這裡是練習區，錯幾次都不扣分——反正正式的時候你還是會錯，哈。', '先在這裡熱身吧。走到作答台，或按下面的「📝 作答」。'],
      1: ['值班室。變數而已，別告訴我你連等號是什麼意思都不知道。', '值班室的東西都會說話——前提是你有走過去看。'],
      2: ['失物教室。if 和 else，選錯一邊，就永遠找不到鑰匙。', '這裡的燈只認得一種傘。你的傘是什麼顏色？自己去看啊。'],
      3: ['打孔室。機器跑 for 迴圈從不出錯——出錯的永遠是你。', '先印還是先加？順序錯一步，密碼全錯，嘻嘻。'],
      4: ['暗房。印個金字塔而已，看你會印出什麼怪東西。', '空白也是字元喔，數錯一格，山就歪了。'],
      5: ['霧河玻璃橋。一排兩塊，只有一塊是真的。陣列從 0 開始，記住了沒？', '我最愛聽「撲通」的聲音了。'],
      6: ['……你、你居然走到信庫了。'],
    },
    idle: ['你在等陣列自己從 1 開始數嗎？', '發呆也不會讓答案自己跑出來喔。', '午夜鐘還在走，滴答、滴答。', '要不要我幫你……哈，騙你的。', '那邊的東西你調查過了嗎？還是只會站著？', '別一直看我，看線索啦。'],
    wrong: ['午夜鐘倒轉了～我就說你辦不到。', '嘖嘖，差一點點？差一點點也是錯。', '新題目來了，這次可別再丟臉囉。', '我已經幫你準備好下一題了，不用謝。'],
    fail2: ['兩次都沒過？……哼，丟你一把備用鑰匙，可憐你的。去下一關吧，分數照算你拿到的。', '唉，看不下去了。這把備用鑰匙拿去，往前走吧。'],
    right: ['……哼，運氣而已。', '算你厲害。下一關你就知道了。', '嗯？居然對了？我得出更難的題目。', '不、不可能……好吧，過。'],
    skip: ['跳過？逃跑也是一種選擇。記得要回來喔，呵呵。', '先跳過？好啊，反正它不會跑掉。'],
    time10: ['剩不到十分鐘了。滴答、滴答。'], time3: ['三分鐘！你的信還在我手上喔！'],
    fall: ['撲通！哈哈哈哈！我就愛聽這個聲音。換一座橋給你。', '掉下去了吧～霧河的水很冰喔。'],
    locked: ['門鎖著。先把這間的三關過完（或先跳過）再說。'],
    door: ['門開了……別得意，下一間更難。'],
    poke: ['戳我也沒用，答案不在我身上。', '我的單片眼鏡很貴，別碰。', '你知道嗎？大部分松鼠都卡在第三間。'],
    hint: '（館長很不甘願地）……老師叫我轉告你們：',
    partial: ['……路線居然對了？可是你的推理有錯（或沒填），只能拿部分分數，哼。', '答案對了，推理卻沒寫好。這次先放過你，換一題吧。', '結果是對的……但推理那幾格不及格喔。'],
    hunt: ['抓到你了！回起點重來吧，嘿嘿。', '貓頭鷹的晚餐……開玩笑的，回去重想！', '答錯的松鼠，一律由本館長親自送回起點。'],
    timeout: ['時間到！慢吞吞的松鼠郵差～這次多給你一點時間，還附提示，快感謝我。', '太慢啦！再給你一次機會，時間加長了，別再浪費。'],
    boom: ['砰！哈哈哈哈！你的尾巴焦掉了。', '剪錯了吧～換一顆新的炸彈給你。'],
    end: ['……你居然把信送到了。今晚就算你贏。', '哼，下次我會把信藏得更深。'],
  };

  // ============ 聲音：音效、背景音樂、館長語音 ============
  let actx = null, musicT = null, musicMode = 'xylo';
  const soundOff = () => store.get('cj-po-mute') === '1';
  const voiceOn = () => store.get('cj-po-voice') !== '0';
  function tone(freq, dur, type, vol, delay) {
    if (soundOff()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + (delay || 0);
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }
  const SFX = {
    step: () => tone(220 + Math.random() * 40, 0.05, 'triangle', 0.03),
    open: () => [660, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, i * 0.07)),
    card: () => tone(990, 0.06, 'square', 0.04),
    right: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.09)),
    wrong: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.05, i * 0.16)),
    clock: () => [1046, 784, 1046, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.06, i * 0.25)),
    door: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.08)),
    hop: () => tone(520, 0.1, 'sine', 0.08),
    crash: () => { for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1500, 0.08, 'square', 0.03, i * 0.03); tone(80, 0.6, 'sine', 0.15, 0.1); },
    melody: () => [523, 587, 659, 784, 880, 784, 1046, 880, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.09, i * 0.18)),
    boom: () => { noise(1.2, 0.5, 400); tone(55, 0.9, 'sine', 0.3); },
    siren: () => { for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, 0.25, 'square', 0.05, i * 0.25); },
    steam: () => noise(1.6, 0.25, 3000),
    flash: () => [1568, 2093].forEach((f, i) => tone(f, 0.4, 'sine', 0.08, i * 0.1)),
    fog: () => tone(70, 1.5, 'sine', 0.2),
    swoop: () => { try { if (soundOff()) return; actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime; o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.6); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.75); } catch (e) { } },
    pick: () => [880, 1320].forEach((f, i) => tone(f, 0.08, 'triangle', 0.07, i * 0.05)),
    drop: () => [660, 440].forEach((f, i) => tone(f, 0.1, 'square', 0.05, i * 0.06)),
    tick: () => tone(1500, 0.04, 'square', 0.03),
  };
  function noise(dur, vol, freq) {
    if (soundOff()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
    } catch (e) { }
  }
  // 每一章（房間）時間到的劇情
  const ROOMFX = {
    0: { icon: '⏰', warn: '練習時間只剩 30 秒！', fx: 'flash', emo: '⏰', cap: '練習時間到！換一題再試試。' },
    1: { icon: '🚨', warn: '值班鬧鐘再 30 秒就要響了！', fx: 'siren', emo: '🚨', cap: '值班鬧鐘大作！警衛把你趕出了值班室……' },
    2: { icon: '💣', warn: '炸彈只剩 30 秒！快！', fx: 'boom', emo: '💥', cap: '轟！炸彈爆炸了！' },
    3: { icon: '♨️', warn: '打孔機快過熱了！還有 30 秒！', fx: 'steam', emo: '♨️', cap: '打孔機過熱，蒸氣噴得滿屋子都是！' },
    4: { icon: '💡', warn: '有人要開燈了！還有 30 秒！', fx: 'flash', emo: '💡', cap: '燈突然亮了！底片全部曝光……' },
    5: { icon: '🌫️', warn: '濃霧要湧上來了！還有 30 秒！', fx: 'fog', emo: '🌫️', cap: '濃霧吞沒了玻璃橋……' },
  };
  const WIRE_COLOR = { '紅線': 0xe63946, '藍線': 0x1d76db, '黃線': 0xf2c14e, '綠線': 0x2a9d8f, '白線': 0xf1f1f1 };
  const PENTA = [523, 587, 659, 784, 880, 1046, 1175];
  function musicStart() {
    musicStop();
    let k = 0;
    musicT = setInterval(() => {
      if (soundOff() || document.hidden) return;
      k++;
      if (musicMode === 'bridge') { if (k % 2 === 0) tone(k % 8 < 4 ? 98 : 87, 0.35, 'sine', 0.07); if (k % 4 === 1) tone(196, 0.08, 'triangle', 0.025); }
      else if (Math.random() < 0.55) tone(pick(PENTA), 0.4, 'triangle', 0.022);
    }, 380);
  }
  function musicStop() { clearInterval(musicT); musicT = null; }
  let zhVoice = null;
  function pickVoice() { try { const vs = speechSynthesis.getVoices(); zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null; } catch (e) { } }
  try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); } catch (e) { }
  function speak(text) {
    if (!voiceOn() || soundOff()) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[（(][^）)]*[）)]/g, ''));
      u.lang = 'zh-TW'; if (zhVoice) u.voice = zhVoice;
      u.pitch = 0.55; u.rate = 1.08; u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { }
  }

  // =====================================================================
  //  遊戲狀態
  // =====================================================================
  let G = null;   // 目前的遊戲
  const nowS = () => Date.now() + (G ? G.off : 0);
  const stagesOf = room => (G.me.stages || []).filter(s => s.room === room);
  const stInfo = sid => (G.me.s || {})[sid] || null;
  const isDone = sid => { const x = stInfo(sid); return !!(x && x.closed) || !!(G.me.skip || {})[sid]; };
  const roomDone = r => r === 0 || stagesOf(r).every(s => isDone(s.sid));
  function unlocked(r) {
    if (G.me.free || r <= 1) return true;
    for (let k = 1; k < r; k++) if (!roomDone(k)) return false;
    return true;
  }
  const roomInfo = r => r === 0 ? ROOM0 : r === 6 ? ROOM6 : (G.me.rooms || []).find(x => x.id === r) || { id: r, name: '房間 ' + r };
  const firstOpen = r => { const l = stagesOf(r); return (l.find(s => !isDone(s.sid)) || (G.me.free ? l[0] : null) || {}).sid || null; };
  const stageMeta = sid => sid === 'p0' ? { sid: 'p0', room: 0, n: 1, P: 0, title: '練習：投信口' } : (G.me.stages || []).find(s => s.sid === sid);

  function say(text, opt = {}) {
    if (!G) return;
    const box = $('#poSay'), t = $('#poSayText');
    box.hidden = false; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    clearInterval(G.typeT); clearTimeout(G.sayHide);
    let i = 0;
    t.textContent = '';
    box.classList.add('talking');
    G.owlTalk = true;
    G.typeT = setInterval(() => {
      i += 2; t.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(G.typeT); box.classList.remove('talking'); G.owlTalk = false; }
    }, 35);
    if (!opt.silent) speak(text);
    G.sayHide = setTimeout(() => { if ($('#poSay')) $('#poSay').hidden = true; }, Math.max(5000, text.length * 160));
    G.lastSay = Date.now();
  }

  // 每進入一關：館長飛到畫面中間跟你說話（每一關第一次進入時）
  function introWatch() {
    if (!G || !G.started || G.busy || G.timingOut || G.introOn || G.room === 6) return;
    const sid = G.sel, sp = sid && G.spec[sid];
    if (!sp || stageMeta(sid).room !== G.room) return;
    G.introDone = G.introDone || {};
    if (G.introDone[sid]) return;
    G.introDone[sid] = 1;
    owlIntro(sid);
  }
  async function owlIntro(sid) {
    const sp = G.spec[sid], meta = stageMeta(sid), room = roomInfo(meta.room);
    const lines = [];
    if (!G.saidHello) { G.saidHello = 1; lines.push(pick(OWL.hello)); }
    if (G.introRoom !== G.room) { G.introRoom = G.room; const l = OWL.room[G.room]; if (l) lines.push(pick(l)); }
    lines.push(sp.q.story);
    const text = lines.join('\n');
    const el = $('#poIntro'); if (!el) return;
    el.innerHTML = `<div class="po-ib-owl">${OWL_SVG}</div><div class="po-ib-bub"><div class="po-ib-h">${esc(room.name)}${meta.n ? `・第 ${meta.n} 關` : ''}：${esc(meta.title)}${sp.q.limit ? `　<span>⏳ ${fmtLeft(sp.q.limit * 1000)}</span>` : ''}</div>
      ${lines.map(t => `<p>${esc(t)}</p>`).join('')}<div class="po-ib-b"><button class="btn primary" id="poIbGo">知道了，開始！</button></div></div>`;
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    G.introOn = true; G.busy = true; G.owlTalk = true;
    speak(text); SFX.swoop();
    await new Promise(res => { $('#poIbGo').onclick = res; el.onclick = e => { if (e.target === el) res(); }; setTimeout(res, Math.max(7000, text.length * 170)); });
    el.hidden = true; G.introOn = false; G.busy = false; G.owlTalk = false;
  }

  // =====================================================================
  //  3D 世界
  // =====================================================================
  const THEME = {
    0: { floor: '#e9d3ad', floor2: '#dfc497', wall: '#f6e7c8', acc: '#c97b4a', bg: '#f7efe0' },
    1: { floor: '#d9b88f', floor2: '#cfa979', wall: '#cfe3d4', acc: '#7a9e7e', bg: '#eef5ef' },
    2: { floor: '#cbb59a', floor2: '#bea584', wall: '#f1d7d0', acc: '#c46b6b', bg: '#fbeeea' },
    3: { floor: '#b9a58a', floor2: '#ab9677', wall: '#d6dbe8', acc: '#6c7fa8', bg: '#eef0f6' },
    4: { floor: '#4f3f3f', floor2: '#453636', wall: '#6b3b3b', acc: '#b04848', bg: '#2a1c1c' },
    5: { floor: '#9fb2b8', floor2: '#93a6ad', wall: '#b7c9cf', acc: '#5d7f8c', bg: '#d4e3e9' },
    6: { floor: '#efd9b6', floor2: '#e6cc9f', wall: '#f9e6c4', acc: '#d08a3c', bg: '#fff4e2' },
  };
  // 每間房的道具：代號、名稱、圖示
  const PROPS = {
    0: [['board', '公告板', '📋'], ['box', '練習箱', '📦']],
    1: [['scale', '秤盤', '⚖️'], ['bag', '郵袋', '👜'], ['drawer', '抽屜', '🗄️'], ['counter', '計數器', '🔢'], ['gearA', '銅齒輪', '⚙️'], ['gearB', '鐵齒輪', '🔩'], ['plate', '順序牌', '🪧'], ['meter', '電表', '🔋'], ['camera', '快照機', '📷'], ['charger', '充電器', '🔌']],
    2: [['umbrella', '失物傘', '☂️'], ['board', '黑板', '📝'], ['lights', '紙條', '📄'], ['pen', '鋼筆', '✒️'], ['chart', '濃度表', '🎨'], ['desk2', '舊課桌', '🪑'], ['envelope', '信封', '✉️'], ['tag', '吊牌', '🏷️'], ['page', '筆記本', '📖']],
    3: [['tape', '紙帶', '📜'], ['lever', '加法桿', '🕹️'], ['dial', '圈數轉盤', '🎛️'], ['counter', '計數器', '🔢'], ['cam', '凸輪', '⚙️'], ['hammer', '印字鎚', '🔨'], ['gaps', '缺口紙帶', '🧻'], ['stamp', '印章機', '🔖']],
    4: [['lightbox', '燈箱', '💡'], ['ruler', '定位尺', '📏'], ['film', '底片', '🎞️']],
    5: [['railing', '橋欄', '🚧'], ['tape', '陣列紙帶', '📜'], ['sign', '告示牌', '🪧'], ['plaque', '石碑', '🗿'], ['battery', '松鼠背包', '🎒'], ['gate', '電量閘門', '⛩️']],
    6: [],
  };
  const SLOTS = [[-3.6, -3.6], [-1.6, -3.6], [1.6, -3.6], [3.5, -3.6], [-5.8, -1.5], [-5.8, 0.9], [-5.8, 3.2], [5.8, -1.3], [5.8, 1.0], [5.8, 3.2], [-3, 3.9], [3, 3.9]];
  const SLOTS5 = [[-5.6, 1.6], [-5.6, 3.7], [5.6, 1.6], [5.6, 3.7], [-3, 4.3], [3, 4.3]];
  const ROWZ = [-0.9, -2.6, -4.3, -6.0, -7.7, -9.4];

  const W = { };   // three.js 物件
  function initRenderer(host) {
    const T = THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    const low = store.get('cj-po-low') === '1';
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    W.renderer = renderer;
    W.camera = new T.PerspectiveCamera(42, 1, 0.1, 200);
    W.ray = new T.Raycaster();
    const grad = new T.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, T.LuminanceFormat);
    grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
    W.grad = grad;
    W.texCache = {};
    const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height); W.camera.aspect = r.width / Math.max(1, r.height); W.camera.updateProjectionMatrix(); };
    W.resize = resize; resize();
    window.addEventListener('resize', resize);
  }
  const mat = (c, o) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: W.grad }, o || {}));
  function mesh(geo, color, o) { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color, o) : color); m.castShadow = true; m.receiveShadow = true; return m; }
  function emojiTex(e) {
    if (W.texCache[e]) return W.texCache[e];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(e, 64, 72);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return W.texCache[e] = t;
  }
  function emojiSprite(e, size) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true })); s.scale.set(size, size, 1); return s; }
  function textSprite(text, color, bg) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), fs = 44;
    x.font = `bold ${fs}px "Microsoft JhengHei","PingFang TC",sans-serif`;
    const w = Math.ceil(x.measureText(text).width) + 40; c.width = w; c.height = fs + 30;
    x.font = `bold ${fs}px "Microsoft JhengHei","PingFang TC",sans-serif`;
    x.fillStyle = bg || 'rgba(255,255,255,.88)'; const r = 18;
    x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, c.height, r); x.arcTo(w, c.height, 0, c.height, r); x.arcTo(0, c.height, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.fillStyle = color || '#4a3426'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(w / 120, c.height / 120, 1); s.renderOrder = 10;
    return s;
  }
  // ---- 角色 ----
  function makeSquirrel() {
    const T = THREE, g = new T.Group(), body = new T.Group();
    const fur = '#c8743a', lite = '#e9a76a', cream = '#fbe8cf';
    const b = mesh(new T.SphereGeometry(0.36, 20, 16), fur); b.scale.set(1, 1.1, 0.95); b.position.y = 0.42; body.add(b);
    const belly = mesh(new T.SphereGeometry(0.27, 16, 12), cream); belly.position.set(0, 0.4, 0.15); belly.scale.set(1, 1.15, 0.8); body.add(belly);
    const head = new T.Group(); head.position.y = 0.95; body.add(head);
    const hd = mesh(new T.SphereGeometry(0.34, 20, 16), fur); head.add(hd);
    const muzzle = mesh(new T.SphereGeometry(0.17, 14, 10), cream); muzzle.position.set(0, -0.08, 0.25); muzzle.scale.set(1.2, 0.85, 0.8); head.add(muzzle);
    const nose = mesh(new T.SphereGeometry(0.05, 10, 8), '#4a2c1d'); nose.position.set(0, -0.02, 0.38); head.add(nose);
    [-1, 1].forEach(s => {
      const eye = mesh(new T.SphereGeometry(0.06, 12, 10), '#1c1410'); eye.position.set(0.13 * s, 0.06, 0.29); head.add(eye);
      const hl = mesh(new T.SphereGeometry(0.02, 8, 6), '#ffffff'); hl.position.set(0.14 * s, 0.09, 0.345); head.add(hl);
      const ear = mesh(new T.ConeGeometry(0.1, 0.24, 10), fur); ear.position.set(0.2 * s, 0.3, -0.02); ear.rotation.z = -0.35 * s; head.add(ear);
      const cheek = mesh(new T.SphereGeometry(0.05, 10, 8), '#f29b8e'); cheek.position.set(0.22 * s, -0.06, 0.24); head.add(cheek);
      const foot = mesh(new T.SphereGeometry(0.1, 10, 8), lite); foot.position.set(0.16 * s, 0.07, 0.12); foot.scale.set(1, 0.6, 1.4); body.add(foot);
      const arm = mesh(new T.SphereGeometry(0.08, 10, 8), fur); arm.position.set(0.32 * s, 0.5, 0.12); body.add(arm);
    });
    // 郵差帽
    const cap = mesh(new T.CylinderGeometry(0.24, 0.27, 0.16, 18), '#2f5d8a'); cap.position.set(0, 0.3, -0.02); head.add(cap);
    const brim = mesh(new T.CylinderGeometry(0.2, 0.2, 0.03, 18), '#24496d'); brim.position.set(0, 0.23, 0.16); brim.scale.set(1, 1, 0.7); head.add(brim);
    const badge = mesh(new T.SphereGeometry(0.04, 8, 6), '#f2c14e'); badge.position.set(0, 0.32, 0.24); head.add(badge);
    // 郵差包
    const bag = mesh(new T.BoxGeometry(0.26, 0.24, 0.12), '#8a5a3b'); bag.position.set(-0.36, 0.38, 0.05); bag.rotation.y = 0.3; body.add(bag);
    const strap = mesh(new T.TorusGeometry(0.36, 0.02, 6, 20), '#6b4430'); strap.position.set(0, 0.55, 0); strap.rotation.set(0, 1.57, 0.7); body.add(strap);
    // 大尾巴
    const tail = new T.Group(); tail.position.set(0, 0.35, -0.3); body.add(tail);
    [[0, 0.05, -0.08, 0.2], [0, 0.32, -0.2, 0.24], [0, 0.62, -0.2, 0.27], [0, 0.88, -0.08, 0.25], [0, 1.02, 0.08, 0.2]].forEach(([x, y, z, r], i) => {
      const s = mesh(new T.SphereGeometry(r, 14, 10), i % 2 ? lite : fur); s.position.set(x, y, z); tail.add(s);
    });
    g.add(body);
    const shadow = new T.Mesh(new T.CircleGeometry(0.42, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; g.add(shadow);
    g.userData = { body, tail, head };
    return g;
  }
  function makeOwl() {
    const T = THREE, g = new T.Group();
    const pur = '#6d4c7d', cream = '#e8d6b8';
    const b = mesh(new T.SphereGeometry(0.5, 20, 16), pur); b.scale.set(1, 1.15, 0.9); b.position.y = 0.55; g.add(b);
    const belly = mesh(new T.SphereGeometry(0.34, 16, 12), cream); belly.position.set(0, 0.45, 0.25); belly.scale.set(1, 1.2, 0.7); g.add(belly);
    const head = new T.Group(); head.position.y = 1.1; g.add(head);
    head.add(mesh(new T.SphereGeometry(0.42, 20, 16), pur));
    [-1, 1].forEach(s => {
      const ring = mesh(new T.CylinderGeometry(0.17, 0.17, 0.06, 20), '#f2b134'); ring.rotation.x = Math.PI / 2; ring.position.set(0.17 * s, 0.05, 0.36); head.add(ring);
      const w = mesh(new T.SphereGeometry(0.14, 16, 12), '#fff8e6'); w.position.set(0.17 * s, 0.05, 0.38); w.scale.z = 0.5; head.add(w);
      const p = mesh(new T.SphereGeometry(0.065, 12, 10), '#1d1428'); p.position.set(0.17 * s, 0.04, 0.45); head.add(p);
      const brow = mesh(new T.BoxGeometry(0.22, 0.04, 0.04), '#1d1428'); brow.position.set(0.17 * s, 0.22, 0.4); brow.rotation.z = 0.35 * s; head.add(brow);
      const tuft = mesh(new T.ConeGeometry(0.09, 0.28, 8), pur); tuft.position.set(0.3 * s, 0.38, 0); tuft.rotation.z = -0.5 * s; head.add(tuft);
      const wing = mesh(new T.SphereGeometry(0.25, 14, 10), '#553a63'); wing.position.set(0.48 * s, 0.55, 0); wing.scale.set(0.45, 1, 0.8); g.add(wing);
    });
    const mono = new T.Mesh(new T.TorusGeometry(0.19, 0.022, 8, 24), mat('#d9a520')); mono.position.set(0.17, 0.05, 0.42); head.add(mono);
    const beak = mesh(new T.ConeGeometry(0.07, 0.18, 8), '#f39c12'); beak.rotation.x = Math.PI / 2 + 0.4; beak.position.set(0, -0.1, 0.43); head.add(beak);
    const hat = mesh(new T.CylinderGeometry(0.2, 0.2, 0.3, 18), '#2b2140'); hat.position.set(0, 0.5, 0); head.add(hat);
    const hb = mesh(new T.CylinderGeometry(0.32, 0.32, 0.04, 20), '#2b2140'); hb.position.set(0, 0.36, 0); head.add(hb);
    const band = mesh(new T.CylinderGeometry(0.205, 0.205, 0.07, 18), '#b8325a'); band.position.set(0, 0.42, 0); head.add(band);
    g.userData = { head, beak };
    return g;
  }
  function makeHedgehog() {
    const T = THREE, g = new T.Group();
    const b = mesh(new T.SphereGeometry(0.42, 18, 14), '#8a6a52'); b.scale.set(1, 0.9, 1.1); b.position.y = 0.42; g.add(b);
    for (let i = 0; i < 46; i++) {
      const th = Math.acos(1 - Math.random() * 1.2), ph = Math.random() * Math.PI * 2;
      const dir = new T.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      if (dir.z > 0.55) continue;
      const sp = mesh(new T.ConeGeometry(0.06, 0.26, 6), '#5b4334');
      sp.position.copy(dir.clone().multiplyScalar(0.42)).add(new T.Vector3(0, 0.42, 0));
      sp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      g.add(sp);
    }
    const face = mesh(new T.SphereGeometry(0.26, 16, 12), '#f3dcc0'); face.position.set(0, 0.42, 0.28); face.scale.set(1, 0.9, 0.8); g.add(face);
    const nose = mesh(new T.SphereGeometry(0.06, 10, 8), '#2a1d16'); nose.position.set(0, 0.42, 0.5); g.add(nose);
    [-1, 1].forEach(s => { const e = mesh(new T.SphereGeometry(0.045, 10, 8), '#1c1410'); e.position.set(0.1 * s, 0.52, 0.45); g.add(e); const c = mesh(new T.SphereGeometry(0.04, 8, 6), '#f29b8e'); c.position.set(0.17 * s, 0.42, 0.42); g.add(c); });
    return g;
  }
  // ---- 房間 ----
  function buildRoom(r) {
    const T = THREE, th = THEME[r], scene = new T.Scene();
    scene.background = new T.Color(th.bg);
    if (r === 5) scene.fog = new T.Fog(th.bg, 14, 30);
    const hemi = new T.HemisphereLight(0xffffff, 0xc9b79c, r === 4 ? 0.35 : 0.8); scene.add(hemi);
    const sun = new T.DirectionalLight(r === 4 ? 0xff9a8a : 0xfff3dd, r === 4 ? 0.45 : 0.7);
    sun.position.set(5, 11, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 12, bottom: -14, near: 1, far: 40 });
    scene.add(sun);
    if (r === 4) { const red = new T.PointLight(0xff3b3b, 1.1, 14); red.position.set(0, 3, 0); scene.add(red); }
    const ia = [], obst = [];
    W.scene = scene; W.ia = ia; W.obst = obst; W.anim = []; W.deskPos = null;
    // 地板（棋盤格）
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? th.floor : th.floor2; x.fillRect(i * 32, j * 32, 32, 32); }
    const ftex = new T.CanvasTexture(c); ftex.wrapS = ftex.wrapT = T.RepeatWrapping; ftex.repeat.set(r === 5 ? 2 : 3.5, r === 5 ? 1.2 : 2.5); ftex.encoding = T.sRGBEncoding;
    const fl = r === 5 ? [14, 5, 2.75] : [14, 10, 0];
    const floor = new T.Mesh(new T.BoxGeometry(fl[0], 0.4, fl[1]), new T.MeshToonMaterial({ map: ftex, gradientMap: W.grad }));
    floor.position.set(0, -0.2, fl[2]); floor.receiveShadow = true; scene.add(floor); W.floor = floor;
    if (r !== 5) {
      const back = mesh(new T.BoxGeometry(14.6, 3.4, 0.3), th.wall); back.position.set(0, 1.5, -5.15); scene.add(back);
      const left = mesh(new T.BoxGeometry(0.3, 3.4, 10.3), th.wall); left.position.set(-7.15, 1.5, 0); scene.add(left);
      const trim = mesh(new T.BoxGeometry(14.6, 0.25, 0.34), th.acc); trim.position.set(0, 0.12, -5.12); scene.add(trim);
      const trim2 = mesh(new T.BoxGeometry(0.34, 0.25, 10.3), th.acc); trim2.position.set(-7.12, 0.12, 0); scene.add(trim2);
      // 窗戶與掛畫
      [[-4.5, 1.9], [0, 2.1]].forEach(([wx, wy], i) => {
        const fr = mesh(new T.BoxGeometry(1.6, 1.1, 0.12), th.acc); fr.position.set(wx, wy, -4.98); scene.add(fr);
        const gl = new T.Mesh(new T.PlaneGeometry(1.35, 0.85), new T.MeshBasicMaterial({ color: r === 4 ? 0x3b1010 : i ? 0x2d3561 : 0xbfe3ff })); gl.position.set(wx, wy, -4.91); scene.add(gl);
        if (i) { for (let k = 0; k < 6; k++) { const st = emojiSprite('✦', 0.12); st.position.set(wx - 0.5 + Math.random(), wy - 0.3 + Math.random() * 0.6, -4.88); scene.add(st); } }
      });
    } else {
      // 霧河：深藍水面、玻璃橋、對岸平台
      const water = new T.Mesh(new T.PlaneGeometry(60, 40), new T.MeshBasicMaterial({ color: 0x5f8ea0 })); water.rotation.x = -Math.PI / 2; water.position.set(0, -2.2, -10); scene.add(water);
      for (let k = 0; k < 14; k++) { const fog = new T.Mesh(new T.SphereGeometry(1.4 + Math.random(), 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); fog.position.set(-9 + Math.random() * 18, -1.4, -1 - Math.random() * 12); fog.scale.y = 0.3; scene.add(fog); W.anim.push(t => fog.position.x += Math.sin(t * 0.3 + k) * 0.003); }
      W.rows = ROWZ.map((z, i) => {
        const o = {};
        ['L', 'R'].forEach(s => {
          const p = new T.Mesh(new T.BoxGeometry(1.5, 0.12, 1.3), new T.MeshPhongMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, shininess: 90 }));
          p.position.set(s === 'L' ? -1.05 : 1.05, -0.06, z); scene.add(p); o[s] = p;
          ia.push({ obj: p, kind: 'glass', key: i + '|' + s, name: `第 ${i + 1} 排${s === 'L' ? '左' : '右'}邊的玻璃`, pos: new T.Vector3(p.position.x, 0, z), reach: 1 });
          const rim = new T.Mesh(new T.EdgesGeometry(p.geometry), new T.LineBasicMaterial({ color: 0xffffff })); p.add(rim);
        });
        const lab = textSprite(`a[${i}]`, '#24414c', 'rgba(255,255,255,.75)'); lab.position.set(-2.6, 0.5, z); lab.scale.multiplyScalar(0.6); scene.add(lab);
        return o;
      });
      [-2.1, 2.1].forEach(xx => { const rail = mesh(new T.BoxGeometry(0.1, 0.1, 10), '#8a6a4a'); rail.position.set(xx, 0.6, -5.2); scene.add(rail); for (let k = 0; k < 7; k++) { const post = mesh(new T.CylinderGeometry(0.06, 0.06, 0.7, 8), '#8a6a4a'); post.position.set(xx, 0.25, -0.2 - k * 1.65); scene.add(post); } });
      const far = mesh(new T.BoxGeometry(6, 0.4, 3), '#c9b79c'); far.position.set(0, -0.2, -12); scene.add(far);
      const arch = mesh(new T.TorusGeometry(1.2, 0.18, 10, 24, Math.PI), '#d08a3c'); arch.position.set(0, 0, -12.8); scene.add(arch);
      const lab = textSprite('信庫', '#7a3f10'); lab.position.set(0, 1.9, -12.8); scene.add(lab);
    }
    // 午夜鐘＋館長
    const clockPos = r === 5 ? [-6.4, 0.6] : [-6.2, -4.3];
    const clock = new T.Group(); clock.position.set(clockPos[0], 0, clockPos[1]); scene.add(clock);
    const cb = mesh(new T.BoxGeometry(0.9, 2.3, 0.6), '#7a4e2d'); cb.position.y = 1.15; clock.add(cb);
    const face = new T.Mesh(new T.CircleGeometry(0.32, 24), new T.MeshBasicMaterial({ color: 0xfff6dd })); face.position.set(0, 1.75, 0.31); clock.add(face);
    const hand = new T.Mesh(new T.BoxGeometry(0.04, 0.26, 0.02), new T.MeshBasicMaterial({ color: 0x222222 })); hand.position.set(0, 1.75, 0.33); hand.geometry.translate(0, 0.11, 0); clock.add(hand);
    W.anim.push(t => hand.rotation.z = -t * 0.8);
    const owl = makeOwl(); owl.position.y = 2.3; owl.scale.setScalar(0.85); clock.add(owl);
    W.owl = owl;
    ia.push({ obj: clock, kind: 'owl', key: 'owl', name: '館長歐爾', pos: new T.Vector3(clockPos[0], 0, clockPos[1]), reach: 1.6 });
    obst.push([clockPos[0], clockPos[1], 0.7]);
    // 道具
    const list = PROPS[r] || [], slots = r === 5 ? SLOTS5 : SLOTS;
    W.propObj = {};
    list.forEach(([key, name, emo], i) => {
      const [px, pz] = slots[i % slots.length];
      const g = new T.Group(); g.position.set(px, 0, pz); scene.add(g);
      const ped = mesh(new T.CylinderGeometry(0.42, 0.5, 0.75, 16), th.acc); ped.position.y = 0.37; g.add(ped);
      const top = mesh(new T.CylinderGeometry(0.46, 0.46, 0.06, 16), '#fff3e0'); top.position.y = 0.77; g.add(top);
      const sp = emojiSprite(emo, 0.95); sp.position.y = 1.35; g.add(sp);
      const ring = new T.Mesh(new T.RingGeometry(0.58, 0.72, 32), new T.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.85, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; g.add(ring);
      const mark = textSprite('？', '#ffffff', 'rgba(232,138,30,.95)'); mark.position.y = 2.05; mark.scale.multiplyScalar(0.5); mark.visible = false; g.add(mark);
      W.propObj[key] = { g, sp, ring, mark };
      W.anim.push(t => { sp.position.y = 1.35 + (ring.visible ? Math.sin(t * 3 + i) * 0.08 : 0); ring.rotation.z = t; mark.position.y = 2.05 + Math.sin(t * 4) * 0.05; });
      ia.push({ obj: g, kind: 'prop', key, name, pos: new T.Vector3(px, 0, pz), reach: 1.4 });
      obst.push([px, pz, 0.55]);
    });
    // 作答台
    const deskPos = r === 5 ? [0, 2.4] : r === 6 ? [3.5, 2.5] : [1, 4].includes(r) ? [0, 0.2] : [3.2, 0.9];
    if (r !== 6) {
      const desk = new T.Group(); desk.position.set(deskPos[0], 0, deskPos[1]); scene.add(desk);
      const top = mesh(new T.BoxGeometry(1.9, 0.12, 1.1), '#a0683f'); top.position.y = 0.8; desk.add(top);
      [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]].forEach(([a, b]) => { const l = mesh(new T.BoxGeometry(0.1, 0.8, 0.1), '#7a4e2d'); l.position.set(a, 0.4, b); desk.add(l); });
      const paper = mesh(new T.BoxGeometry(0.7, 0.02, 0.5), '#fffdf5'); paper.position.set(-0.2, 0.87, 0); paper.rotation.y = 0.2; desk.add(paper);
      const sp = emojiSprite('✍️', 0.8); sp.position.set(0.4, 1.3, 0); desk.add(sp);
      const lab = textSprite('作答台'); lab.position.set(0, 1.95, 0); lab.scale.multiplyScalar(0.55); desk.add(lab);
      W.anim.push(t => sp.position.y = 1.3 + Math.sin(t * 2.4) * 0.06);
      W.deskPos = deskPos;
      ia.push({ obj: desk, kind: 'desk', key: 'desk', name: '作答台', pos: new T.Vector3(deskPos[0], 0, deskPos[1]), reach: 1.7 });
      obst.push([deskPos[0], deskPos[1], 1.05]);
    }
    // 門（往下一間）
    W.door = null;
    if (r < 5 || r === 5) {
      const dp = r === 5 ? [6.3, 0.9] : [5.3, -4.95];
      const door = new T.Group(); door.position.set(dp[0], 0, dp[1]); if (r === 5) door.rotation.y = -Math.PI / 2; scene.add(door);
      const fr = mesh(new T.BoxGeometry(1.6, 2.5, 0.3), '#6b4430'); fr.position.y = 1.25; door.add(fr);
      const pnl = mesh(new T.BoxGeometry(1.25, 2.2, 0.32), '#a0683f', { emissive: 0x000000 }); pnl.position.y = 1.1; door.add(pnl);
      const knob = mesh(new T.SphereGeometry(0.07, 10, 8), '#f2c14e'); knob.position.set(0.45, 1.1, 0.2); door.add(knob);
      const next = r === 5 ? '渡船 → 信庫' : '→ ' + roomInfo(r + 1).name;
      const lab = textSprite(next); lab.position.set(0, 2.95, 0); lab.scale.multiplyScalar(0.55); door.add(lab);
      const lock = emojiSprite('🔒', 0.6); lock.position.set(0, 1.4, 0.4); door.add(lock);
      W.door = { g: door, pnl, lock };
      ia.push({ obj: door, kind: 'door', key: 'door', name: next.replace('→ ', '往 '), pos: new T.Vector3(dp[0] - (r === 5 ? 0.6 : 0), 0, dp[1] + (r === 5 ? 0 : 0.6)), reach: 1.5 });
    }
    // 信庫：小刺蝟和信
    if (r === 6) {
      const hh = makeHedgehog(); hh.position.set(0, 0, -2); scene.add(hh); W.hedgehog = hh;
      ia.push({ obj: hh, kind: 'hedgehog', key: 'hh', name: '小刺蝟', pos: new T.Vector3(0, 0, -2), reach: 1.6 });
      obst.push([0, -2, 0.6]);
      for (let k = 0; k < 5; k++) { const sh = mesh(new T.BoxGeometry(2.4, 0.1, 0.6), '#a0683f'); sh.position.set(-4 + (k % 2) * 8, 0.6 + Math.floor(k / 2) * 0.8, -4.6); scene.add(sh); for (let m = 0; m < 3; m++) { const l = emojiSprite(pick(['💌', '✉️', '📨']), 0.45); l.position.set(sh.position.x - 0.7 + m * 0.7, sh.position.y + 0.3, -4.5); scene.add(l); } }
      W.anim.push(t => hh.position.y = Math.abs(Math.sin(t * 2)) * 0.05);
    }
    // 數字方塊（值班室、打孔室、大廳）：撿起來放到密碼鎖上
    W.lockG = null; W.bomb = null; W.digitObjs = [];
    if ([0, 1].includes(r)) {
      for (let d = 0; d <= 9; d++) {
        const x0 = -4.05 + d * 0.9;
        const cube = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), new T.MeshToonMaterial({ map: digitTex(d), gradientMap: W.grad }));
        cube.position.set(x0, 0.45, 2.2); cube.castShadow = true; scene.add(cube); W.digitObjs.push(cube);
        W.anim.push(t => { cube.position.y = 0.45 + Math.sin(t * 2 + d) * 0.06; cube.rotation.y = Math.sin(t + d) * 0.3; });
        ia.push({ obj: cube, kind: 'digit', key: String(d), name: '數字方塊 ' + d, pos: new T.Vector3(x0, 0, 2.2), reach: 0.95 });
      }
      W.lockG = new T.Group(); scene.add(W.lockG);
    }
    // 失物教室：炸彈（5 條線）
    if (r === 2) {
      const bomb = new T.Group(); bomb.position.set(0, 0, -2.0); scene.add(bomb);
      const tb = mesh(new T.BoxGeometry(1.8, 0.7, 1.0), '#7a4e2d'); tb.position.y = 0.35; bomb.add(tb);
      const box = mesh(new T.BoxGeometry(1.3, 0.62, 0.7), '#3a3a40'); box.position.y = 1.02; bomb.add(box);
      [-0.35, 0, 0.35].forEach(x => { const dy = mesh(new T.CylinderGeometry(0.12, 0.12, 0.66, 12), '#c0392b'); dy.rotation.x = Math.PI / 2; dy.position.set(x, 1.45, 0); bomb.add(dy); });
      const c = document.createElement('canvas'); c.width = 256; c.height = 96;
      const dtex = new T.CanvasTexture(c);
      const disp = new T.Mesh(new T.PlaneGeometry(0.62, 0.23), new T.MeshBasicMaterial({ map: dtex })); disp.position.set(0, 1.17, 0.36); bomb.add(disp);
      const led = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), new T.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0.5, 1.22, 0.36); bomb.add(led);
      W.anim.push(t => led.visible = !W.bomb || W.bomb.safe || Math.sin(t * 8) > 0);
      const wires = {};
      Object.keys(WIRE_COLOR).forEach((name, i) => {
        const y = 0.82 + i * 0.075, sag = 0.14 + i * 0.02;
        const curve = new T.CatmullRomCurve3([new T.Vector3(-0.55, y, 0.36), new T.Vector3(-0.2, y - 0.03, 0.36 + sag), new T.Vector3(0.2, y - 0.03, 0.36 + sag), new T.Vector3(0.55, y, 0.36)]);
        const hit = new T.Mesh(new T.TubeGeometry(curve, 16, 0.05, 6), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        const vis = new T.Mesh(new T.TubeGeometry(curve, 24, 0.028, 8), new T.MeshToonMaterial({ color: WIRE_COLOR[name], gradientMap: W.grad }));
        hit.add(vis); bomb.add(hit);
        wires[name] = vis;
        ia.push({ obj: hit, kind: 'wire', key: name, name: '炸彈的' + name, pos: new T.Vector3(0, 0, -2.0), reach: 1.7 });
      });
      ia.push({ obj: box, kind: 'bomb', key: 'bomb', name: '炸彈', pos: new T.Vector3(0, 0, -2.0), reach: 1.7 });
      obst.push([0, -2.0, 0.95]);
      const lab = textSprite('💣 炸彈'); lab.position.set(0, 2.1, 0); lab.scale.multiplyScalar(0.55); bomb.add(lab);
      W.bomb = { g: bomb, wires, c, dtex, led, safe: false };
      drawBomb('--:--');
    }
    // 裝飾：盆栽、燈
    if (r !== 5) [[-6.3, 4.2], [6.4, -4.4]].forEach(([a, b]) => { const pot = mesh(new T.CylinderGeometry(0.3, 0.22, 0.45, 12), '#c0623a'); pot.position.set(a, 0.22, b); scene.add(pot); const lf = mesh(new T.SphereGeometry(0.45, 12, 10), r === 4 ? '#5a2f2f' : '#6fae6a'); lf.position.set(a, 0.8, b); lf.scale.y = 1.2; scene.add(lf); obst.push([a, b, 0.45]); });
    // 玩家
    const pl = makeSquirrel(); scene.add(pl); W.player = pl;
    W.bounds = r === 5 ? [-6.6, 6.6, 0.75, 4.8] : [-6.6, 6.6, -4.4, 4.6];
    pl.position.set(0, 0, r === 5 ? 4.2 : 3.4);
    W.camLook = pl.position.clone();
    W.camera.position.set(0, 9, pl.position.z + 9);
    W.room = r;
    refreshMarks();
  }
  function digitTex(d) {
    const k = 'd' + d;
    if (W.texCache[k]) return W.texCache[k];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = ['#ffd166', '#8ce0a6', '#9cc3e6', '#f4a3a3', '#c9b6f2'][d % 5]; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#3d2b1f'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
    x.fillStyle = '#3d2b1f'; x.font = 'bold 92px Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(d), 64, 70);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return W.texCache[k] = t;
  }
  function drawBomb(text, safe) {
    if (!W.bomb) return;
    const x = W.bomb.c.getContext('2d');
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 256, 96);
    x.fillStyle = safe ? '#3dff6e' : '#ff3030'; x.font = 'bold 70px Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 52);
    W.bomb.dtex.needsUpdate = true;
  }
  // 密碼鎖：數字方塊的值存在草稿 [欄位#d]
  const slotSum = f => (f.slots || []).reduce((a, b) => a + b, 0);
  const lockDigits = (q, f) => String(getDraft(q.qid)[f.id + '#d'] || '');
  function setLockDigits(q, f, digits) {
    const dd = getDraft(q.qid);
    digits = String(digits).replace(/\D/g, '').slice(0, slotSum(f));
    dd[f.id + '#d'] = digits;
    let k = 0; const parts = [];
    f.slots.forEach(n => { const s = digits.slice(k, k + n); k += n; if (s) parts.push(s); });
    dd[f.id] = f.type === 'seq' ? parts.join(' ') : digits;
    setDraft(q.qid, dd);
  }
  const lockFields = () => { const sp = G && G.sel && G.spec[G.sel]; return sp ? sp.q.fields.filter(f => f.lock) : []; };
  // 數字方塊放在「測驗桌」（作答台）上
  function refreshLocks() {
    if (!W.lockG || !G) return;
    const T = THREE, sp = G.sel && G.spec[G.sel], q = sp && sp.q, fs = lockFields();
    while (W.lockG.children.length) W.lockG.remove(W.lockG.children[0]);
    // 數字方塊只在需要的關卡出現（值班室第 4 關、大廳練習）
    (W.digitObjs || []).forEach(c => c.visible = fs.length > 0);
    if (!fs.length && G.carry != null) setCarry(null);
    if (!fs.length || !W.deskPos) return;
    const [dx, dz] = W.deskPos;
    fs.forEach((f, li) => {
      const idx = q.fields.indexOf(f), total = slotSum(f), digits = lockDigits(q, f);
      const width = total * 0.38 + (f.slots.length - 1) * 0.15;
      let xx = dx - width / 2 + 0.19, k = 0;
      const z = dz + (li - (fs.length - 1) / 2) * 0.45;
      f.slots.forEach(n => {
        for (let s = 0; s < n; s++, k++) {
          const pl = mesh(new T.BoxGeometry(0.32, 0.03, 0.32), digits[k] !== undefined ? '#2a9d8f' : '#2b2f38'); pl.position.set(xx, 0.88, z); W.lockG.add(pl);
          if (digits[k] !== undefined) { const cb = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), new T.MeshToonMaterial({ map: digitTex(+digits[k]), gradientMap: W.grad })); cb.position.set(xx, 1.05, z); W.lockG.add(cb); }
          xx += 0.38;
        }
        xx += 0.15;
      });
      const lab = textSprite(`測驗桌：放數字 ${digits.length}/${total}`, '#fff', digits.length === total ? 'rgba(42,157,143,.92)' : 'rgba(231,111,81,.92)'); lab.position.set(dx, 2.5 + li * 0.4, dz); lab.scale.multiplyScalar(0.5); W.lockG.add(lab);
    });
  }
  function dropDigit() {
    const sp = G.spec[G.sel], q = sp && sp.q, f = lockFields().find(x => lockDigits(q, x).length < slotSum(x));
    if (!f) { toast('測驗桌已經放滿了。要改的話，按「📝 作答」可以清除；沒問題就按「送出」。', 4000); return; }
    setLockDigits(q, f, lockDigits(q, f) + G.carry); setCarry(null); SFX.drop(); refreshLocks();
    if (lockFields().every(x => lockDigits(q, x).length === slotSum(x))) toast('測驗桌放滿了！按「📝 作答」檢查後送出。', 4000);
  }  function setCarry(d) {
    G.carry = d;
    if (!W.player) return;
    if (W.carrySp) { W.player.remove(W.carrySp); W.carrySp = null; }
    if (d === null || d === undefined) return;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshToonMaterial({ map: digitTex(d), gradientMap: W.grad }));
    s.position.y = 1.75; W.player.add(s); W.carrySp = s;
  }
  // 依目前的題目，讓有線索的道具發光（調查過的打勾）
  function refreshMarks() {
    refreshLocks();
    if (!W.propObj || !G) return;
    const sp = G.sel && G.spec[G.sel], props = (sp && sp.q.props) || {}, seen = (sp && G.clues[sp.q.qid]) || {};
    Object.entries(W.propObj).forEach(([k, o]) => {
      const has = k in props;
      o.ring.visible = has; o.mark.visible = has && !seen[k];
      o.ring.material.color.set(has && seen[k] ? 0x6cd17a : 0xffc93c);
    });
    if (W.door) {
      const ok = W.room === 5 ? unlocked(6) : unlocked(W.room + 1);
      W.door.lock.visible = !ok;
      W.door.pnl.material.emissive.set(ok ? 0x6b4a10 : 0x000000);
    }
  }

  // ---- 迴圈：移動、鏡頭、動畫 ----
  const keys = {};
  function onKey(e, down) {
    if (!G || G.panelOpen || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
    const k = e.key.toLowerCase();
    if (down && G.onBridge && ['arrowleft', 'arrowright', 'a', 'd'].includes(k)) { e.preventDefault(); bridgeJump(k === 'arrowleft' || k === 'a' ? 'L' : 'R'); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys[k] = down; e.preventDefault(); }
    if (down && (k === 'e' || k === ' ' || k === 'enter')) { e.preventDefault(); const n = nearest(); if (n) act(n); else if (k === 'e') openPanel(); }
  }
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  function nearest() {
    if (!W.player) return null;
    const p = W.player.position;
    let best = null, bd = 1e9;
    W.ia.forEach(o => { if (o.kind === 'wire' || o.kind === 'glass' || o.obj.visible === false) return; const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z); if (d < o.reach + 0.2 && d < bd) { bd = d; best = o; } });
    return best;
  }
  function loop() {
    if (!G || !W.renderer) return;
    G.raf = requestAnimationFrame(loop);
    if (!W.player || !W.scene) return;
    const now = performance.now(), dt = Math.min(0.05, (now - (G.lastT || now)) / 1000); G.lastT = now;
    const t = now / 1000, T = THREE, pl = W.player;
    let vx = 0, vz = 0;
    if (!G.busy && !G.onBridge) {
      if (keys.w || keys.arrowup) vz -= 1; if (keys.s || keys.arrowdown) vz += 1;
      if (keys.a || keys.arrowleft) vx -= 1; if (keys.d || keys.arrowright) vx += 1;
      if (vx || vz) { G.target = null; G.pending = null; }
      else if (G.target) { const dx = G.target.x - pl.position.x, dz = G.target.z - pl.position.z, d = Math.hypot(dx, dz); if (d > 0.08) { vx = dx / d; vz = dz / d; } else G.target = null; }
    }
    const moving = !!(vx || vz);
    if (moving) {
      const l = Math.hypot(vx, vz), sp = 4.2;
      const nx = pl.position.x + vx / l * sp * dt, nz = pl.position.z + vz / l * sp * dt;
      pl.position.x = nx; pl.position.z = nz;
      W.obst.forEach(([ox, oz, r]) => { const dx = pl.position.x - ox, dz = pl.position.z - oz, d = Math.hypot(dx, dz), m = r + 0.35; if (d < m && d > 0.0001) { pl.position.x = ox + dx / d * m; pl.position.z = oz + dz / d * m; } });
      const [x0, x1, z0, z1] = W.bounds;
      pl.position.x = Math.max(x0, Math.min(x1, pl.position.x)); pl.position.z = Math.max(z0, Math.min(z1, pl.position.z));
      const ang = Math.atan2(vx, vz); let da = ang - pl.rotation.y; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      pl.rotation.y += da * Math.min(1, dt * 12);
      // 被障礙物擋住走不動：停下來（如果要互動的東西已經在附近，就直接互動）
      if (G.target) {
        const mv = Math.hypot(pl.position.x - nx + vx / l * sp * dt, pl.position.z - nz + vz / l * sp * dt);
        G.stuckT = mv < sp * dt * 0.25 ? (G.stuckT || 0) + dt : 0;
        if (G.stuckT > 0.35) {
          G.stuckT = 0; G.target = null;
          const o = G.pending; G.pending = null;
          if (o && Math.hypot(o.pos.x - pl.position.x, o.pos.z - pl.position.z) < o.reach + 1.2) act(o);
        }
      }
      G.walkT = (G.walkT || 0) + dt * 11;
      if (Math.floor(G.walkT / Math.PI) !== G.lastStep) { G.lastStep = Math.floor(G.walkT / Math.PI); SFX.step(); }
      G.idleSince = Date.now();
    }
    const u = pl.userData;
    if (!G.busy) u.body.position.y = moving ? Math.abs(Math.sin(G.walkT)) * 0.09 : Math.sin(t * 2) * 0.015;
    u.tail.rotation.x = Math.sin(t * (moving ? 9 : 2)) * (moving ? 0.18 : 0.06);
    u.tail.rotation.z = Math.sin(t * 1.3) * 0.06;
    // 走到要互動的物件旁邊
    if (G.pending && !G.busy) { const o = G.pending; if (Math.hypot(o.pos.x - pl.position.x, o.pos.z - pl.position.z) < o.reach + 0.1 || (!G.target && !moving)) { G.pending = null; G.target = null; act(o); } }
    // 館長看著玩家、講話時嘴巴動
    if (W.owl && !G.owlBusy) {
      const op = new T.Vector3(); W.owl.getWorldPosition(op);
      const want = Math.atan2(pl.position.x - op.x, pl.position.z - op.z);
      W.owl.rotation.y += (want - W.owl.rotation.y) * Math.min(1, dt * 3);
      W.owl.userData.head.rotation.z = Math.sin(t * 1.7) * 0.12;
      W.owl.userData.beak.scale.y = G.owlTalk ? 1 + Math.abs(Math.sin(t * 22)) * 0.6 : 1;
      W.owl.position.y = 2.3 + Math.abs(Math.sin(t * (G.owlTalk ? 8 : 1.5))) * (G.owlTalk ? 0.08 : 0.03);
    }
    W.anim.forEach(f => f(t));
    // 鏡頭
    const far = W.room === 5 && pl.position.z < 0.5;   // 玻璃橋上：鏡頭跟著往前
    const cz = far ? pl.position.z + 8 : Math.min(pl.position.z, 2.5) * 0.6 + 8.2;
    const want = new T.Vector3(pl.position.x * 0.7, 7.6, cz);
    const k = 1 - Math.exp(-dt * 4);
    W.camera.position.lerp(want, k);
    W.camLook.lerp(new T.Vector3(pl.position.x * 0.8, 0.8, far ? pl.position.z - 1.5 : Math.min(pl.position.z, 2.5) * 0.6 - 1.6), k);
    W.camera.lookAt(W.camLook);
    W.renderer.render(W.scene, W.camera);
    // 提示：靠近可以互動的東西
    const n = G.busy ? null : nearest(), pr = $('#poNear');
    if (pr) { const txt = n ? `按 <b>E</b> 或點一下：${({ prop: '調查', desk: G.carry != null && lockFields().length ? `把 ${G.carry} 放上` : '開始作答', door: '', digit: '撿起', lock: G.carry != null ? `把 ${G.carry} 放上` : '打開', wire: '剪', bomb: '查看', owl: '和他說話', hedgehog: '和他說話' })[n.kind] ?? ''} ${esc(n.name)}` : ''; if (pr.dataset.t !== txt) { pr.dataset.t = txt; pr.innerHTML = txt; pr.hidden = !txt; } }
  }
  // 點畫面：點到物件就走過去互動，點到地板就走過去
  function onPointer(e) {
    if (!G || G.busy || G.panelOpen || !W.renderer) return;
    const rect = W.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    W.ray.setFromCamera(m, W.camera);
    const hit = W.ray.intersectObjects(W.ia.filter(o => o.obj.visible !== false).map(o => o.obj), true)[0];
    if (hit) {
      let o = hit.object; const roots = W.ia.map(x => x.obj);
      while (o && !roots.includes(o)) o = o.parent;
      const it = W.ia.find(x => x.obj === o);
      if (it) {
        const p = W.player.position, dx = p.x - it.pos.x, dz = p.z - it.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d < it.reach + 0.1 || it.kind === 'glass') { act(it); return; }
        G.target = new THREE.Vector3(it.pos.x + dx / d * (it.reach - 0.25), 0, it.pos.z + dz / d * (it.reach - 0.25));
        G.pending = it; return;
      }
    }
    if (G.onBridge) { toast('在橋上只能往前跳：按「⬅ 跳左」或「跳右 ➡」（鍵盤 ← →）'); return; }
    const fh = W.ray.intersectObject(W.floor)[0];
    if (fh) { G.target = fh.point.clone(); G.pending = null; showClickMark(fh.point); }
  }
  function showClickMark(p) {
    const T = THREE, r = new T.Mesh(new T.RingGeometry(0.15, 0.25, 20), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    r.rotation.x = -Math.PI / 2; r.position.set(p.x, 0.03, p.z); W.scene.add(r);
    const t0 = performance.now(), f = () => { const k = (performance.now() - t0) / 400; if (k >= 1 || !W.scene) { W.scene && W.scene.remove(r); return; } r.scale.setScalar(1 + k * 1.5); r.material.opacity = 0.9 * (1 - k); requestAnimationFrame(f); }; f();
  }
  // 動畫：畫面在背景（切到別的分頁）時改用計時器，動畫才不會卡住
  function tween(ms, fn) { return new Promise(res => { const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / ms); fn(k); if (k < 1) (document.hidden ? setTimeout(f, 30) : requestAnimationFrame(f)); else res(); }; f(); }); }

  // =====================================================================
  //  互動
  // =====================================================================
  function act(o) {
    if (!G) return;
    if (o.kind === 'prop') inspect(o.key, o.name);
    else if (o.kind === 'desk') { if (G.carry !== null && G.carry !== undefined && lockFields().length) dropDigit(); else openPanel(); }
    else if (o.kind === 'door') useDoor();
    else if (o.kind === 'owl') say(pick(OWL.poke));
    else if (o.kind === 'hedgehog') ending();
    else if (o.kind === 'digit') { setCarry(+o.key); SFX.pick(); }
    else if (o.kind === 'lock') useLock(o.key);
    else if (o.kind === 'wire') cutWire(o.key);
    else if (o.kind === 'bomb') wireMenu();
    else if (o.kind === 'glass') { const [i, s] = o.key.split('|'); if (+i !== ((G.br && G.br.qid === (G.spec[G.sel] || {}).q?.qid) ? G.br.route.length : 0)) toast('要照順序，一排一排往前跳。'); else bridgeJump(s); }
  }
  function useLock(fid) {
    const sp = G.spec[G.sel], q = sp && sp.q, f = q && q.fields.find(x => x.id === fid);
    if (!f) return;
    const total = slotSum(f), dg = lockDigits(q, f);
    if (G.carry !== null && G.carry !== undefined) {
      if (dg.length >= total) { toast('密碼鎖已經滿了。要改的話，空手走過來按一下密碼鎖可以清除。'); return; }
      setLockDigits(q, f, dg + G.carry); setCarry(null); SFX.drop(); refreshLocks();
      if (dg.length + 1 === total) {
        const allFull = lockFields().every(x => lockDigits(q, x).length === slotSum(x));
        toast(allFull ? '密碼鎖都放滿了！空手按一下密碼鎖就可以送出答案。' : '這個密碼鎖放滿了，還有別的密碼鎖要放。', 3500);
      }
      return;
    }
    const m = $('#poModal');
    m.innerHTML = `<div class="po-modal-in"><h3>🔐 ${esc(CIRC[q.fields.indexOf(f)])} 密碼鎖</h3><p>${esc(f.label)}</p><p class="po-lockshow">${dg ? esc(dg) : '（還是空的）'}　<span class="muted">${dg.length}/${total} 格</span></p>
      <p class="muted small">去地上撿數字方塊（點一下就撿起來），再點密碼鎖放上去。數字要照順序放。</p>
      <div class="row"><button class="btn" id="poL1" ${dg ? '' : 'disabled'}>↩ 拿掉最後一個</button><button class="btn" id="poL2" ${dg ? '' : 'disabled'}>🗑 全部清除</button><span class="spacer"></span><button class="btn" id="poLX">關閉</button><button class="btn primary" id="poLGo">📮 送出答案</button></div></div>`;
    m.hidden = false;
    $('#poL1').onclick = () => { setLockDigits(q, f, dg.slice(0, -1)); m.hidden = true; refreshLocks(); };
    $('#poL2').onclick = () => { setLockDigits(q, f, ''); m.hidden = true; refreshLocks(); };
    $('#poLX').onclick = () => m.hidden = true;
    $('#poLGo').onclick = () => { m.hidden = true; G.panelOpen = true; drawPanel(); submit(sp.free || G.sel === 'p0'); };
  }
  // 點炸彈或按 E：選要剪哪一條線
  function wireMenu() {
    const sp = G.spec[G.sel], q = sp && sp.q, f = q && q.fields.find(x => x.type === 'wire');
    if (!f) { say('這顆炸彈現在很安靜……先別碰。', { silent: true }); return; }
    if (W.bomb && W.bomb.safe) { say('這顆已經拆掉了。', { silent: true }); return; }
    const { miss } = answersOf(q, f.id);
    const m = $('#poModal');
    m.innerHTML = `<div class="po-modal-in"><h3>💣 要剪哪一條線？</h3>${warnHtml(miss)}<p class="muted small">照你判斷的程式結果選一條。剪下去之前還會再問你一次。</p>
      <div class="po-wires">${f.opts.map(w => `<button class="po-wbtn" data-w="${esc(w)}" style="--wc:#${(WIRE_COLOR[w] || 0).toString(16).padStart(6, '0')}">✂️ ${esc(w)}</button>`).join('')}</div>
      <div class="row"><span class="spacer"></span><button class="btn" id="poMNo">先不要</button></div></div>`;
    m.hidden = false;
    $('#poMNo').onclick = () => m.hidden = true;
    $$('[data-w]', m).forEach(b => b.onclick = () => { m.hidden = true; cutWire(b.dataset.w); });
  }
  function cutWire(name) {
    const sp = G.spec[G.sel], q = sp && sp.q, f = q && q.fields.find(x => x.type === 'wire');
    if (!f) { say('現在這一關不是拆炸彈，別亂剪！'); return; }
    if (W.bomb && W.bomb.safe) { say('這顆已經拆掉了。'); return; }
    const { miss } = answersOf(q, f.id);
    const free = sp.free || G.sel === 'p0', x = stInfo(G.sel), meta = stageMeta(G.sel), pen = G.me.penalty || 0.2, a = x ? x.a : 0;
    const m = $('#poModal');
    m.innerHTML = `<div class="po-modal-in"><h3>✂️ 確定要剪「${esc(name)}」嗎？</h3>
      ${warnHtml(miss)}<p>${free ? '這是練習（不計分）。' : a === 0 ? `這是<b>第 1 次</b>正式作答：全對得 <b>${meta.P}</b> 分；剪錯會爆炸，扣 ${Math.round(pen * 100)}% 並換一顆新炸彈。` : `這是<b>最後一次</b>：最多得 <b>${Math.round(meta.P * (1 - pen) * 100) / 100}</b> 分。`}</p>
      <div class="row"><button class="btn" id="poMNo">再想想</button><span class="spacer"></span><button class="btn danger" id="poMYes">✂️ 剪下去</button></div></div>`;
    m.hidden = false;
    $('#poMNo').onclick = () => m.hidden = true;
    $('#poMYes').onclick = () => {
      m.hidden = true;
      const dd = getDraft(q.qid); dd[f.id] = name; setDraft(q.qid, dd);
      if (W.bomb && W.bomb.wires[name]) W.bomb.wires[name].visible = false;
      SFX.card();
      doSubmit(G.sel, q, answersOf(q).out, free, { wire: name });
    };
  }
  // ---- 失敗的劇情動畫 ----
  function startPos() { return W.room === 5 ? [0, 4.2] : [0, 3.4]; }
  async function fx(kind, emo, cap) {
    const el = $('#poFx'); if (!el) return;
    el.className = 'po-fx ' + kind; el.innerHTML = `<div class="po-fx-e">${emo}</div><div class="po-fx-c">${esc(cap)}</div>`; el.hidden = false;
    $('#poRoot').classList.add('shake');
    (SFX[kind] || SFX.flash)();
    await wait(2200);
    $('#poRoot') && $('#poRoot').classList.remove('shake');
    el.hidden = true;
  }
  async function respawn() {
    if (!W.player) return;
    const fade = $('#poFade'); fade.classList.add('on'); await wait(350);
    const [x, z] = startPos(); W.player.position.set(x, 0, z); W.player.rotation.set(0, 0, 0); setCarry(null);
    G.br = null; G.onBridge = false;
    if (W.rows) W.rows.forEach(o => ['L', 'R'].forEach(s => { o[s].visible = true; o[s].position.y = -0.06; o[s].scale.set(1, 1, 1); o[s].rotation.z = 0; }));
    if (W.bomb) { W.bomb.safe = false; Object.values(W.bomb.wires).forEach(w => w.visible = true); }
    fade.classList.remove('on');
  }
  async function owlHunt() {
    if (!G.three || !W.owl) { await fx('hunt', '🦉', '館長把你抓走了！回起點重來。'); return; }
    G.busy = true; G.owlBusy = true;
    const T = THREE, owl = W.owl, clock = owl.parent, pl = W.player;
    const s = owl.position.clone(), rot = owl.rotation.clone();
    const tgt = new T.Vector3((pl.position.x - clock.position.x) / clock.scale.x, 1.0, (pl.position.z - clock.position.z) / clock.scale.z);
    SFX.swoop(); say(pick(OWL.hunt));
    owl.rotation.y = Math.atan2(tgt.x - s.x, tgt.z - s.z);
    await tween(750, k => { owl.position.set(s.x + (tgt.x - s.x) * k, s.y + (tgt.y - s.y) * k + Math.sin(k * Math.PI) * 1.4, s.z + (tgt.z - s.z) * k); owl.rotation.x = k * 0.6; });
    await tween(900, k => { owl.position.y = tgt.y + k * 6; pl.position.y = k * 6; pl.rotation.z = Math.sin(k * 20) * 0.3; });
    await respawn();
    owl.position.copy(s); owl.rotation.copy(rot);
    G.owlBusy = false; G.busy = false;
  }
  // ---- 玻璃橋：自己一步一步跳 ----
  const bridgeField = () => { const sp = G && G.sel && G.spec[G.sel]; const f = sp && sp.q.fields.find(x => x.id === 'out'); return f && (f.type === 'route' || (f.type === 'choice' && f.opts.includes('L'))) ? f : null; };
  function updateBridgeUi() {
    const el = $('#poBridge'); if (!el) return;
    el.hidden = !(G && G.three && W.room === 5 && bridgeField() && !G.panelOpen && (!G.busy || G.bjBusy));
    if (!el.hidden) { const f = bridgeField(), need = f.type === 'route' ? 6 : 1, n = G.br && G.br.qid === G.spec[G.sel].q.qid ? G.br.route.length : 0; $('#poBrInfo').textContent = n ? `已經跳了 ${n}/${need} 步：${G.br.route}` : need === 1 ? '照你算的，跳一步' : '照你排的路線，一步一步跳'; }
  }
  async function bridgeJump(side) {
    if (!G || G.busy || G.bjBusy || !W.rows) return;
    const sp = G.spec[G.sel], q = sp && sp.q, f = bridgeField();
    if (!f) { say('這一關不是跳橋喔。', { silent: true }); return; }
    const { miss } = answersOf(q, 'out');
    G.warnBr = G.warnBr || {};
    if (miss.length && !G.warnBr[q.qid]) { G.warnBr[q.qid] = 1; toast('提醒：推理還有 ' + miss.length + ' 格沒填，沒填的不給分。', 3500); }
    const need = f.type === 'route' ? 6 : 1;
    if (!G.br || G.br.qid !== q.qid) G.br = { qid: q.qid, route: '' };
    const i = G.br.route.length;
    if (i >= need) return;
    G.bjBusy = true; G.busy = true; G.onBridge = true;
    const pl = W.player;
    if (i === 0) { const sx = pl.position.x, sz = pl.position.z; await tween(450, k => { pl.position.x = sx * (1 - k); pl.position.z = sz + (0.6 - sz) * k; }); pl.rotation.y = Math.PI; }
    const tx = side === 'L' ? -1.05 : 1.05, tz = ROWZ[i], sx = pl.position.x, sz = pl.position.z;
    SFX.hop();
    await tween(420, k => { pl.position.x = sx + (tx - sx) * k; pl.position.z = sz + (tz - sz) * k; pl.position.y = Math.sin(k * Math.PI) * 0.9; });
    pl.position.y = 0;
    const route = G.br.route + side, free = sp.free || G.sel === 'p0';
    let r;
    try {
      // 玻璃晃一下，等伺服器判斷
      const p = W.rows[i][side];
      const wob = tween(700, k => p.rotation.z = Math.sin(k * 30) * 0.03 * (1 - k));
      r = await api('/api/post/bridge', { cid: S.cid, sid: G.sel, qid: q.qid, route, ans: answersOf(q, 'out').out, free, nonce: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
      await wob;
    } catch (e) {
      toast(e.message, 4000); G.bjBusy = false; G.busy = false;
      if (/換過了/.test(e.message)) { await respawn(); delete G.spec[G.sel]; await loadSpec(G.sel).catch(() => { }); }
      return;
    }
    if (r.ok) { G.br.route = route; const dd = getDraft(q.qid); dd.out = route; setDraft(q.qid, dd); SFX.pick(); G.bjBusy = false; G.busy = false; updateBridgeUi(); return; }
    // 跳完或踩錯：已經正式送出
    const last = r.oOk < r.oN ? i : -1;
    G.br = null; G.bjBusy = false; G.busy = false;
    const dd = getDraft(q.qid); dd.out = route; setDraft(q.qid, dd);
    await handleResult(G.sel, q, Object.assign({}, answersOf(q).out, { out: route }), free, { manual: true, fallAt: last, side }, r);
  }
  async function shatter(i, side) {
    const p = W.rows[i][side], pl = W.player;
    SFX.crash(); await wait(150);
    await tween(700, k => { p.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); p.position.y = -k * 2.5; pl.position.y = -k * 3; pl.rotation.z = k * 2; });
    say(pick(OWL.fall));
    await wait(700);
  }
  async function boom() {
    G.busy = true;
    say(pick(OWL.boom));
    await fx('boom', '💥', '轟！炸彈爆炸了！');
    await respawn();
    G.busy = false;
  }
  function inspect(key, name) {
    const sp = G.sel && G.spec[G.sel];
    const props = (sp && sp.q.props) || {};
    let text = props[key];
    SFX.open();
    if (text) { G.clues[sp.q.qid] = G.clues[sp.q.qid] || {}; G.clues[sp.q.qid][key] = text; saveClues(); }
    else text = '這個東西現在看起來沒什麼特別的。（有線索的物件腳下會有黃色光圈）';
    const pop = $('#poClue');
    pop.innerHTML = `<div class="po-clue-card"><div class="po-clue-h">${esc((PROPS[W.room || G.room].find(p => p[0] === key) || [])[2] || '🔍')} ${esc(name)}</div><div class="po-clue-t">${esc(text)}</div>
      <div class="po-clue-b"><button class="btn sm" id="poClueX">知道了</button>${props[key] ? '<button class="btn sm primary" id="poClueGo">📝 去作答</button>' : ''}</div></div>`;
    pop.hidden = false;
    $('#poClueX').onclick = () => pop.hidden = true;
    if ($('#poClueGo')) $('#poClueGo').onclick = () => { pop.hidden = true; openPanel(); };
    refreshMarks();
  }
  const saveClues = () => { try { store.set('cj-po-clues', JSON.stringify(G.clues)); } catch (e) { } };
  async function useDoor() {
    const next = W.room === 5 ? 6 : W.room + 1;
    if (!unlocked(next)) { say(pick(OWL.locked)); SFX.wrong(); return; }
    SFX.door();
    await goRoom(next);
  }
  async function goRoom(r, sid) {
    if (!G) return;
    G.busy = true;
    const fade = $('#poFade'); fade.classList.add('on'); await wait(350);
    G.room = r;
    store.set('cj-po-room', String(r));
    G.sel = sid || (r === 0 ? 'p0' : r === 6 ? null : firstOpen(r));
    if (G.sel) await loadSpec(G.sel).catch(e => toast(e.message));
    G.carry = null; W.carrySp = null;
    if (G.three) buildRoom(r); else render2D();
    musicMode = r === 5 ? 'bridge' : 'xylo';
    updateHud();
    fade.classList.remove('on');
    G.busy = false;
    if (r === 6) setTimeout(() => say(OWL.room[6][0]), 500);   // 其他房間：進入關卡時館長會飛出來說話（owlIntro）
  }
  async function loadSpec(sid, opt = {}) {
    const d = await api('/api/post/stage', { cid: S.cid, sid, free: !!opt.free || !!G.forceFree[sid], renew: !!opt.renew });
    G.spec[sid] = { q: d.q, free: d.free };
    applyMe(d.me);
    return G.spec[sid];
  }
  function applyMe(me) {
    if (!me) return;
    G.off = me.now - Date.now();
    const wasFree = G.me && G.me.free;
    G.me = me;
    if (me.hint && me.hint.t && me.hint.t > (G.lastHint || 0)) {
      const first = !G.lastHint; G.lastHint = me.hint.t; store.set('cj-po-hint', String(me.hint.t));
      if (!first || Date.now() - me.hint.t < 120000) setTimeout(() => say(OWL.hint + me.hint.text), 300);
    }
    if (!wasFree && me.free && !me.teacher && G.started) showEnd();
    updateHud(); refreshMarks();
  }

  // =====================================================================
  //  作答面板
  // =====================================================================
  const draftKey = qid => 'cj-po-d:' + qid;
  const getDraft = qid => store.json(draftKey(qid), {});
  const setDraft = (qid, d) => store.set(draftKey(qid), JSON.stringify(d));
  async function openPanel(sid) {
    if (!G) return;
    sid = sid || G.sel || (G.room === 0 ? 'p0' : firstOpen(G.room));
    if (!sid) { if (G.room >= 1 && G.room <= 5) { sid = stagesOf(G.room)[0].sid; } else { say(G.room === 6 ? '去找小刺蝟吧。' : '這裡沒有題目。'); return; } }
    G.sel = sid;
    if (!G.spec[sid]) { try { await loadSpec(sid); } catch (e) { toast(e.message); return; } }
    refreshMarks();
    G.panelOpen = true; Object.keys(keys).forEach(k => keys[k] = false);
    drawPanel();
  }
  function closePanel() { G.panelOpen = false; $('#poPanel').hidden = true; refreshMarks(); updateHud(); updateBridgeUi(); }
  function fieldHtml(q, f, i, d) {
    const v = d[f.id] ?? '', badge = `<span class="po-fn">${CIRC[i]}</span>`;
    const tag = `<span class="po-kind ${f.kind}">${f.kind === 'r' ? '推理' : '結果'}</span>`;
    let input;
    if (f.lock) {
      const dg = lockDigits(q, f); let k = 0;
      const boxes = f.slots.map(n => `<span class="po-lkg">${Array.from({ length: n }, () => `<span class="po-lk ${dg[k] !== undefined ? 'on' : ''}">${dg[k++] ?? ''}</span>`).join('')}</span>`).join('');
      input = `<div class="po-lockv">${boxes}${G.three ? ` <button class="btn sm" data-lclr="${f.id}">清除</button>` : ` <input type="text" class="po-in" data-lin="${f.id}" value="${esc(dg)}" inputmode="numeric" placeholder="輸入數字">`}</div>
        ${G.three ? `<div class="muted small">👉 這一格要用<b>數字方塊</b>作答：到房間地上撿數字（點一下就撿起來），放到房間中央的<b>測驗桌（作答台）</b>上。${f.type === 'seq' ? '每一組數字分開的格子要照順序放。' : ''}</div>` : ''}`;
    } else if (f.type === 'wire') {
      input = G.three ? `<div class="po-wirehint">👉 填好上面的推理之後，走到房間中央的<b>💣 炸彈</b>旁邊，點你判斷的那條線剪下去。<br><span class="muted small">炸彈上有：${f.opts.map(w => `<b style="color:#${(WIRE_COLOR[w] || 0).toString(16).padStart(6, '0')};-webkit-text-stroke:.3px #333">${esc(w)}</b>`).join('、')}</span></div>`
        : `<div class="po-choices">${f.opts.map(o => `<label class="po-ch ${v === o ? 'on' : ''}"><input type="radio" name="po_${f.id}" value="${esc(o)}" ${v === o ? 'checked' : ''} data-in="${f.id}"> ✂️ ${esc(o)}</label>`).join('')}</div>`;
    } else if (f.type === 'card') input = `<button class="po-slot ${v ? 'on' : ''}" data-slot="${f.id}">${v ? esc(v) : '點這裡，再點下面的卡片'}</button>`;
    else if (f.type === 'choice') input = `<div class="po-choices">${f.opts.map(o => `<label class="po-ch ${v === o ? 'on' : ''}"><input type="radio" name="po_${f.id}" value="${esc(o)}" ${v === o ? 'checked' : ''} data-in="${f.id}"> ${esc(o)}</label>`).join('')}</div>`;
    else if (f.type === 'route') { const s = String(v || '').padEnd(6, '?').slice(0, 6); input = `<div class="po-route" data-route="${f.id}">${[...s].map((c, k) => `<button class="po-step ${c}" data-k="${k}"><small>a[${k}]</small>${c === '?' ? '？' : c}</button>`).join('')}</div>`; }
    else if (f.type === 'pattern') input = `<div class="po-pat"><textarea data-in="${f.id}" rows="7" spellcheck="false" placeholder="一列一列打出來，前面的空白也要打">${esc(v)}</textarea><pre class="po-patv" data-pv="${f.id}">${esc(String(v).replace(/ /g, '·'))}</pre></div><div class="muted small">右邊用「·」顯示空白，方便你數格子。</div>`;
    else input = `<input type="text" class="po-in ${f.type === 'num' ? 'num' : ''}" data-in="${f.id}" value="${esc(v)}" ${f.type === 'num' ? 'inputmode="numeric"' : ''} autocomplete="off" placeholder="${f.type === 'seq' ? '例如 3 7 11' : f.type === 'pw' ? '例如 0581' : ''}">`;
    return `<div class="po-field" data-f="${f.id}"><div class="po-flab">${badge}${tag}${esc(f.label)}</div>${input}</div>`;
  }
  function drawPanel(result) {
    const sid = G.sel, sp = G.spec[sid], q = sp.q, meta = stageMeta(sid) || {}, x = stInfo(sid), d = getDraft(q.qid);
    const free = sp.free || sid === 'p0';
    const room = roomInfo(meta.room);
    const tabs = sid === 'p0' ? '' : stagesOf(meta.room).map(s => { const y = stInfo(s.sid); return `<button class="po-tab ${s.sid === sid ? 'on' : ''}" data-tab="${s.sid}">${s.n}. ${esc(s.title)} ${y && y.pass ? '✅' : y && y.closed ? '🔑' : (G.me.skip || {})[s.sid] ? '⏭' : ''}</button>`; }).join('');
    const pen = Math.round((G.me.penalty || 0.2) * 100);
    const status = x && x.closed && !G.me.free ? `<span class="po-done">這一關已結束：${x.pass ? '✅ 通過' : '🔑 用備用鑰匙'}，得 ${x.best} / ${meta.P} 分・現在是練習題（不計分）</span>`
      : free ? '<span class="po-free">自由遊玩・不計分</span>'
      : `<span class="po-try">正式機會：第 ${(x ? x.a : 0) + 1} 次／共 2 次　配分 ${meta.P} 分</span>`;
    let n = 0;
    const idx = {}; q.fields.forEach((f, i) => idx[f.id] = i);
    const codeHtml = esc(q.code).replace(/\[\[(\w+)\]\]/g, (_, id) => { const f = q.fields.find(z => z.id === id); const v = d[id]; return `<span class="po-badge ${v !== undefined && v !== '' ? 'on' : ''}" data-b="${id}" title="${esc(f ? f.label : '')}">${CIRC[idx[id]] || '?'} ${v !== undefined && v !== '' ? esc(v) : '＿＿'}</span>`; });
    const clues = G.clues[q.qid] || {}, ckeys = Object.keys(q.props || {});
    const cluesHtml = ckeys.map(k => { const pr = (PROPS[meta.room] || []).find(p => p[0] === k) || [k, k, '🔍']; return clues[k] ? `<li>✅ <b>${esc(pr[2])} ${esc(pr[1])}</b>：${esc(q.props[k])}</li>` : `<li class="muted">❔ ${esc(pr[2])} ${esc(pr[1])}：還沒調查（走過去看看）</li>`; }).join('');
    const cards = q.cards || [];
    const used = new Set(q.fields.filter(f => f.type === 'card').map(f => d[f.id]).filter(Boolean));
    // 面板已經開著（同一關）再畫一次時：不播進場動畫、保留捲動位置，看起來就不會像重新整理
    const prevIn = $('#poPanel .po-panel-in'), keepScroll = !$('#poPanel').hidden && prevIn && prevIn.dataset.sid === sid ? prevIn.scrollTop : null;
    $('#poPanel').innerHTML = `<div class="po-panel-in" data-sid="${sid}">
      <div class="po-ph"><div><b>${esc(room.name)}</b> <span class="muted small">${esc(room.topic || '')}</span><div class="po-tabs">${tabs}</div></div><span class="spacer"></span>${status}<button class="po-x" id="poPX" title="關閉（回到房間）">✕</button></div>
      <div class="po-story"><span class="po-mini-owl">${OWL_SVG}</span><span>${esc(q.story)}</span></div>
      ${result || ''}
      ${(q.desc || []).length ? `<div class="po-desc"><div class="po-sec" style="margin-top:0">📖 這一關要做什麼</div>${q.desc.map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
      ${q.show && q.show.pattern ? `<div class="po-target"><div class="po-sec" style="margin-top:0">🎯 要印出的圖案：${esc(q.show.name)}（「·」代表空白）</div><div class="po-tg"><pre class="po-patv">${esc(q.show.pattern.join('\n').replace(/ /g, '·'))}</pre>`+`<div><button class="btn" id="poRun">▶ 試印我排的程式（剩 ${Math.max(0, 3 - (+store.get('cj-po-run:' + q.qid) || 0))} 次）</button><pre class="po-patv" id="poRunOut">${esc(store.get('cj-po-runout:' + q.qid) || '（還沒試印）')}</pre></div></div></div>` : ''}
      <div class="po-cols"><div class="po-left">
        <div class="po-sec">📒 調查到的線索</div><ul class="po-clues">${cluesHtml || '<li class="muted">這一題不用調查</li>'}</ul>
        <div class="po-sec">💻 程式卡</div><pre class="po-code">${codeHtml}</pre>
        ${cards.length ? `<div class="po-sec">🃏 卡片匣 <span class="muted small">（先點空格，再點卡片；或先點卡片，再點空格）</span></div><div class="po-tray">${cards.map(c => `<button class="po-card ${used.has(c) ? 'used' : ''} ${G.pickCard === c ? 'sel' : ''}" data-card="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      </div><div class="po-right">
        <div class="po-sec">✏️ 作答欄 <span class="muted small">推理占 60%、結果占 40%，兩欄全對才通關</span></div>
        ${q.fields.map((f, i) => fieldHtml(q, f, i, d)).join('')}
        ${bridgeField() && G.three ? '<div class="po-wirehint">🦘 填好上面的推理後，關掉這個視窗，按畫面下方的「⬅ 跳左／跳右 ➡」（或點橋上的玻璃）<b>自己一步一步跳</b>。每一步會馬上知道對不對，踩錯就掉下去（算失敗一次）。跳完就自動送出。</div>' : ''}
        <div class="po-btns">
          ${free ? `<button class="btn primary" id="poSend">送出（不計分）</button><button class="btn" id="poRenew">🔄 換一題</button>`
            : x && x.closed ? `<button class="btn primary" id="poPractice">🎮 練習這關（不計分）</button>`
            : `<button class="btn primary" id="poSend">📮 正式送出</button>${(G.me.skip || {})[sid] ? '' : '<button class="btn" id="poSkip">⏭ 先跳過</button>'}`}
          <span class="spacer"></span><button class="btn" id="poBack">回到房間</button></div>
        ${free ? '' : `<div class="muted small po-rule">規則：第 1 次全對得滿分；有錯先扣配分的 ${pen}% 並換新題。第 2 次最多得 ${100 - pen}%。取兩次較高分。</div>`}
      </div></div></div>`;
    const P = $('#poPanel'); P.hidden = false; G.panelOpen = true;
    if (keepScroll !== null) { const pin = $('.po-panel-in', P); pin.style.animation = 'none'; pin.scrollTop = keepScroll; }
    $('#poPX').onclick = closePanel; $('#poBack').onclick = closePanel;
    $$('[data-tab]', P).forEach(b => b.onclick = async () => { G.sel = b.dataset.tab; G.pickCard = null; try { if (!G.spec[G.sel]) await loadSpec(G.sel); drawPanel(); refreshMarks(); } catch (e) { toast(e.message); } });
    const save = (id, v) => { const dd = getDraft(q.qid); dd[id] = v; setDraft(q.qid, dd); };
    // 卡片：點空格 → 點卡片
    // 只更新卡片相關的那幾格（不重畫整個面板）
    const setBadge = (id, v) => { const b = $(`[data-b="${id}"]`, P); if (b) { b.innerHTML = `${CIRC[idx[id]] || ''} ${v !== undefined && v !== '' ? esc(v) : '＿＿'}`; b.classList.toggle('on', v !== undefined && v !== ''); } };
    const cardsUi = () => {
      const dd = getDraft(q.qid), cf = q.fields.filter(f => f.type === 'card');
      cf.forEach(f => { const s = $(`[data-slot="${f.id}"]`, P), v = dd[f.id]; if (s) { s.textContent = v || '點這裡，再點下面的卡片'; s.classList.toggle('on', !!v); s.classList.toggle('pick', G.pickSlot === f.id); } setBadge(f.id, v); });
      const usedNow = new Set(cf.map(f => dd[f.id]).filter(Boolean));
      $$('[data-card]', P).forEach(b => { b.classList.toggle('used', usedNow.has(b.dataset.card)); b.classList.toggle('sel', b.dataset.card === G.pickCard); });
    };
    const place = (id, c) => { save(id, c); SFX.card(); G.pickSlot = null; G.pickCard = null; cardsUi(); };
    $$('[data-slot]', P).forEach(b => b.onclick = () => {
      const id = b.dataset.slot;
      if (G.pickCard) return place(id, G.pickCard);
      if (getDraft(q.qid)[id]) { save(id, ''); G.pickSlot = null; cardsUi(); return; }
      G.pickSlot = id; $$('[data-slot]', P).forEach(z => z.classList.toggle('pick', z === b));
    });
    $$('[data-b]', P).forEach(b => b.onclick = () => { const f = q.fields.find(z => z.id === b.dataset.b); const el = $(`[data-f="${b.dataset.b}"]`, P); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); const s = $(`[data-slot="${f.id}"]`, P); if (s) s.click(); else { const inp = $('[data-in]', el); if (inp) inp.focus(); } } });
    $$('[data-card]', P).forEach(b => b.onclick = () => {
      const c = b.dataset.card;
      if (G.pickSlot) return place(G.pickSlot, c);
      const empty = q.fields.find(f => f.type === 'card' && !getDraft(q.qid)[f.id]);
      G.pickCard = G.pickCard === c ? null : c;
      if (G.pickCard && empty && q.fields.filter(f => f.type === 'card').length === 1) return place(empty.id, c);
      $$('[data-card]', P).forEach(z => z.classList.toggle('sel', z.dataset.card === G.pickCard));
      if (G.pickCard) toast('再點一個空格，把卡片放進去');
    });
    $$('[data-in]', P).forEach(inp => {
      const ev = inp.type === 'radio' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        save(inp.dataset.in, inp.value);
        const b = $(`[data-b="${inp.dataset.in}"]`, P); if (b) { b.innerHTML = `${CIRC[idx[inp.dataset.in]]} ${inp.value !== '' ? esc(inp.value) : '＿＿'}`; b.classList.toggle('on', inp.value !== ''); }
        const pv = $(`[data-pv="${inp.dataset.in}"]`, P); if (pv) pv.textContent = inp.value.replace(/ /g, '·');
        if (inp.type === 'radio') $$(`[name="${inp.name}"]`, P).forEach(r => r.parentElement.classList.toggle('on', r.checked));
      });
      if (inp.tagName === 'TEXTAREA') inp.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); toast('請用空白鍵，不要用 Tab'); } });
    });
    $$('[data-route]', P).forEach(box => $$('.po-step', box).forEach(b => b.onclick = () => {
      const id = box.dataset.route, cur = String(getDraft(q.qid)[id] || '').padEnd(6, '?').slice(0, 6).split('');
      const k = +b.dataset.k; cur[k] = cur[k] === 'L' ? 'R' : cur[k] === 'R' ? '?' : 'L';
      save(id, cur.join('').replace(/\?+$/, '')); SFX.card();
      $$('.po-step', box).forEach((s, j) => { const ch = cur[j]; s.className = 'po-step ' + ch; s.innerHTML = `<small>a[${j}]</small>${ch === '?' ? '？' : ch}`; });
      setBadge(id, cur.join('').replace(/\?+$/, ''));
    }));
    if ($('#poRun')) $('#poRun').onclick = () => {
      const k = 'cj-po-run:' + q.qid, used = +store.get(k) || 0;
      if (used >= 3) { toast('這一題的試印次數用完了'); return; }
      const r = simulate(q, getDraft(q.qid));
      if (r.err) { toast(r.err, 3500); return; }
      store.set(k, String(used + 1));
      const same = r.out.replace(/\n+$/, '') === q.show.pattern.join('\n');
      store.set('cj-po-runout:' + q.qid, (r.out.replace(/\n+$/, '') || '（什麼都沒印出來）').replace(/ /g, '·') + (same ? '\n✅ 和目標一樣！' : '\n❌ 和目標不一樣'));
      SFX.card(); drawPanel(result);
    };
    $$('[data-lclr]', P).forEach(b => b.onclick = () => { setLockDigits(q, q.fields.find(z => z.id === b.dataset.lclr), ''); refreshLocks(); drawPanel(result); });
    $$('[data-lin]', P).forEach(inp => inp.addEventListener('input', () => setLockDigits(q, q.fields.find(z => z.id === inp.dataset.lin), inp.value)));
    if ($('#poSend')) $('#poSend').onclick = () => {
      const wf = q.fields.find(z => z.type === 'wire');
      if (wf && G.three) { closePanel(); toast('走到炸彈旁邊，點炸彈選要剪的線。', 4000); return; }
      submit(free);
    };
    if ($('#poSend') && q.fields.some(z => z.type === 'wire') && G.three) $('#poSend').textContent = '✂️ 去剪線';
    if ($('#poSkip')) $('#poSkip').onclick = skipStage;
    if ($('#poRenew')) $('#poRenew').onclick = async () => { try { await loadSpec(sid, { free: true, renew: true }); drawPanel(); refreshMarks(); } catch (e) { toast(e.message); } };
    if ($('#poPractice')) $('#poPractice').onclick = async () => { G.forceFree[sid] = true; try { await loadSpec(sid, { free: true }); drawPanel(); refreshMarks(); } catch (e) { toast(e.message); } };
  }
  function answersOf(q, skip) {
    const d = getDraft(q.qid), out = {}, miss = [];
    q.fields.forEach((f, i) => {
      let v = d[f.id];
      if (f.type === 'route') v = String(v || '').replace(/[^LR]/g, '');
      if (f.id === skip) return;
      if (f.lock && lockDigits(q, f).length < slotSum(f)) { miss.push(CIRC[i] + ' ' + f.label + '（到房間把數字方塊放上密碼鎖）'); out[f.id] = v; return; }
      if (v === undefined || v === null || String(v).trim() === '' || (f.type === 'route' && v.length < 6)) miss.push(CIRC[i] + ' ' + f.label);
      out[f.id] = v;
    });
    return { out, miss };
  }
  // 試印：照學生排的卡片跑一次（只認得卡片匣裡的寫法）
  function simulate(q, d) {
    const n = parseInt(d.n, 10);
    if (!(n >= 1 && n <= 9)) return { err: '先在 ① 填 n（1～9）' };
    let is;
    if (/i = 1; i <= n; i\+\+/.test(d.a || '')) is = Array.from({ length: n }, (_, x) => x + 1);
    else if (/i = n; i >= 1; i--/.test(d.a || '')) is = Array.from({ length: n }, (_, x) => n - x);
    else return { err: '先把「外層迴圈」的卡片放進去' };
    const ev = (e, i) => ({ 'n - i': n - i, 'i - 1': i - 1, 'i': i, '2 * i - 1': 2 * i - 1, '2 * i': 2 * i })[e];
    let out = '';
    is.forEach(i => [d.b, d.c, d.d].forEach(l => {
      if (!l) return;
      const m = l.match(/j <= (.+?); j\+\+\) cout << "(.)";/);
      if (m) out += m[2].repeat(Math.max(0, ev(m[1], i) || 0));
      else if (l === 'cout << endl;') out += '\n';
    }));
    return { out };
  }
  const warnHtml = miss => miss.length ? `<p class="po-warn">⚠ 還有 ${miss.length} 格沒填：${miss.map(esc).join('、')}。<br>沒填的格子不給分，但你還是可以先作答。</p>` : '';
  function submit(free) {
    const sid = G.sel, sp = G.spec[sid], q = sp.q, meta = stageMeta(sid), x = stInfo(sid);
    const { out, miss } = answersOf(q);
    if (free && !miss.length) return doSubmit(sid, q, out, true);
    const a = x ? x.a : 0, pen = G.me.penalty || 0.2;
    const rule = a === 0 ? `這是<b>第 1 次</b>正式送出：全對得 <b>${meta.P}</b> 分。有錯的話，會先扣 ${Math.round(pen * 100)}%（最多扣 ${Math.round(meta.P * pen * 100) / 100} 分），並換一題新的（還有第 2 次機會）。`
      : `這是<b>最後一次</b>正式送出：這次最多得 <b>${Math.round(meta.P * (1 - pen) * 100) / 100}</b> 分（配分的 ${Math.round((1 - pen) * 100)}%）。兩次取較高分。`;
    const m = $('#poModal');
    m.innerHTML = `<div class="po-modal-in"><h3>📮 確定要正式送出嗎？</h3><ul class="po-sum">${q.fields.map((f, i) => `<li>${CIRC[i]} ${esc(f.label)}：<code>${esc(f.type === 'pattern' ? '\n' + out[f.id] : out[f.id])}</code></li>`).join('')}</ul>
      ${warnHtml(miss)}<p>${free ? '這是練習（不計分）。' : rule}</p><div class="row"><button class="btn" id="poMNo">返回修改</button><span class="spacer"></span><button class="btn primary" id="poMYes">確定送出</button></div></div>`;
    m.hidden = false;
    $('#poMNo').onclick = () => m.hidden = true;
    $('#poMYes').onclick = () => { m.hidden = true; doSubmit(sid, q, out, free); };
  }
  async function doSubmit(sid, q, ans, free, opt = {}) {
    if (G.sending) return;
    G.sending = true;
    const btn = $('#poSend'); if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    // 同一次提交用同一個 nonce：斷線重送不會被算兩次
    let pend = store.json('cj-po-pend', null);
    if (!pend || pend.qid !== q.qid || JSON.stringify(pend.ans) !== JSON.stringify(ans)) { pend = { qid: q.qid, ans, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }; store.set('cj-po-pend', JSON.stringify(pend)); }
    let r;
    try { r = await api('/api/post/submit', { cid: S.cid, sid, qid: q.qid, ans, nonce: pend.nonce, free, timeout: !!opt.timeout }); }
    catch (e) {
      G.sending = false; toast(e.message, 4000); if (btn) { btn.disabled = false; btn.textContent = free ? '送出（不計分）' : '📮 正式送出'; }
      if (/換過了/.test(e.message)) { delete G.spec[sid]; await loadSpec(sid).catch(() => { }); drawPanel(); }
      return;
    }
    store.del('cj-po-pend');
    return handleResult(sid, q, ans, free, opt, r);
  }
  async function handleResult(sid, q, ans, free, opt, r) {
    G.sending = false;
    applyMe(r.me);
    const meta = stageMeta(sid);
    let html;
    if (r.all) {
      SFX.right(); confetti();
      html = `<div class="po-res ok">✅ <b>全對！</b>${r.free ? '（自由遊玩・不計分）' : `這一關得 <b>${r.score}</b> / ${meta.P} 分。`}</div>`;
      say(pick(OWL.right));
    } else {
      if (!opt.timeout) { SFX.wrong(); clockBack(); }
      const parts = `推理 ${r.rOk}/${r.rN}、結果 ${r.oOk}/${r.oN}`;
      const tip = r.tip ? `<br>💡 <b>提示：</b>${esc(r.tip)}` : '';
      const nextT = Math.round((((G.spec[sid] || {}).q || {}).limit || 0) * 1.5 / 60 * 10) / 10;
      if (opt.timeout && !r.closed) html = `<div class="po-res bad">⏰ <b>時間到！</b>這一題算失敗一次：已經填的部分（${parts}）得原始 ${r.R} 分${r.free ? '' : `，扣分後實得 <b>${r.score}</b> 分`}。${tip}<br>已經換成<b>新的題目</b>${r.free ? '' : `，這次時間比較長`}——線索也換了，要重新調查喔！</div>`;
      else if (r.free) html = `<div class="po-res bad">${r.oN && r.oOk === r.oN ? '✅ 答案是對的，但推理還有錯或沒填' : '❌ 還沒全對'}（${parts}）。先檢查「${esc(r.hint || '')}」。${tip}<br>已經換了一題新的。</div>`;
      else if (!r.closed) html = `<div class="po-res bad">${r.oN && r.oOk === r.oN ? '✅ <b>答案是對的！</b>但推理還有錯或沒填，所以不算全對。' : '⏰ <b>午夜鐘倒轉！</b>'}這次 ${parts}，原始 ${r.R} 分，扣 ${r.deduct} 分 → 實得 <b>${r.score}</b> 分。<br>舊題第一個錯的推理是「${esc(r.hint || '')}」。${tip}<br>已經換成<b>新的題目</b>（第 2 次機會，最多 ${Math.round(meta.P * (1 - (G.me.penalty || 0.2)) * 100) / 100} 分）——線索也換了，要重新調查喔！</div>`;
      else html = `<div class="po-res bad">🔑 兩次都沒全對（${parts}）。這一關取較高分：<b>${r.best}</b> / ${meta.P} 分。<br>館長丟給你一把備用鑰匙，可以繼續往前；想弄懂的話可以按「練習這關」（不計分）。${tip}</div>`;
      if (opt.timeout) setTimeout(() => say(r.closed && !r.free ? pick(OWL.fail2) : pick(OWL.timeout)), 300);
      else if (r.closed && !r.free) say(pick(OWL.fail2));
    }
    // 換新題（錯的時候）／關卡結束
    if (!r.all || r.free) { delete G.spec[sid]; try { await loadSpec(sid, r.free ? { free: true } : {}); } catch (e) { } }
    if (!G.spec[sid]) await loadSpec(sid).catch(() => { });
    // 剪線成功：炸彈解除
    // 答案（結果欄）對了、但推理有錯或沒填：不演失敗劇情，館長只唸一句（照樣只拿部分分數）
    const resultOk = r.oN > 0 && r.oOk === r.oN;
    if (W.bomb && opt.wire && resultOk) { W.bomb.safe = true; drawBomb('SAFE', true); if (!r.all) setTimeout(() => { if (W.bomb) { W.bomb.safe = false; Object.values(W.bomb.wires).forEach(w => w.visible = true); } }, 2500); }
    if (!r.all && resultOk && !opt.timeout) setTimeout(() => say(pick(OWL.partial)), 400);
    // 失敗的劇情：拆彈爆炸、其他房間被貓頭鷹抓走（只有答案錯才演；時間到的劇情已經演過了；玻璃橋另外處理）
    if (!r.all && !resultOk && G.three && !opt.timeout && !opt.manual && sid !== 'r5s3') {
      closePanel();
      if (opt.wire || (W.room === 2 && W.bomb)) await boom(); else await owlHunt();
      refreshMarks();
    }
    // 玻璃橋：照自己排的路線跳
    if (opt.manual) {
      // 自己跳橋：踩錯就碎；路線全對就走到對岸（推理有錯的話只拿部分分數，回到起點換新題）
      closePanel();
      if (!r.all && opt.fallAt >= 0) { await shatter(opt.fallAt, opt.side); await respawn(); }
      else if (!r.all) { SFX.right(); const pl = W.player, sx = pl.position.x, sz = pl.position.z; await tween(800, k => { pl.position.x = sx * (1 - k); pl.position.z = sz + (-12 - sz) * k; pl.position.y = Math.sin(k * Math.PI) * 1.2; }); pl.position.y = 0; await wait(1200); await respawn(); }
      else {
        SFX.melody(); confetti();
        if (sid === 'r5s3' && (r.free || r.pass)) { const pl = W.player, sx = pl.position.x, sz = pl.position.z; await tween(800, k => { pl.position.x = sx * (1 - k); pl.position.z = sz + (-12 - sz) * k; pl.position.y = Math.sin(k * Math.PI) * 1.2; }); pl.position.y = 0; await wait(400); G.onBridge = false; return goRoom(6); }
        await wait(900); await respawn();
      }
      refreshMarks(); updateBridgeUi();
      if (!(r.all && !r.free)) { drawPanel(html); return; }
    }
    if (sid === 'r5s3' && G.three && W.rows && !opt.manual) {
      closePanel();
      await bridgeRun(String(ans.out || '').toUpperCase().replace(/[^LR]/g, ''), r.fall);
      if (r.all && (r.free || r.pass)) { await wait(400); return goRoom(6); }
      G.panelOpen = true; drawPanel(html); refreshMarks();
      return;
    }
    if (r.all && !r.free) {
      // 過關：下一關
      const nx = firstOpen(meta.room);
      if (nx && nx !== sid) { G.sel = nx; G.pickCard = null; await loadSpec(nx).catch(() => { }); drawPanel(html + `<div class="po-res info">➡ 下一關：${esc(stageMeta(nx).title)}。記得先去調查發光的物件！</div>`); }
      else { closePanel(); if (roomDone(meta.room) && meta.room >= 1) { say(pick(OWL.door)); SFX.door(); } }
      refreshMarks();
      return;
    }
    if (r.closed && !r.all && !r.free) {
      const nx = firstOpen(meta.room);
      drawPanel(html + (nx ? `<div class="po-res info">➡ 可以往下一關：<button class="btn sm" id="poNext">${esc(stageMeta(nx).title)}</button></div>` : '<div class="po-res info">➡ 這間房間的門已經打開了。</div>'));
      if ($('#poNext')) $('#poNext').onclick = async () => { G.sel = nx; await loadSpec(nx).catch(() => { }); drawPanel(); refreshMarks(); };
      refreshMarks(); return;
    }
    drawPanel(html); refreshMarks();
  }
  async function skipStage() {
    const sid = G.sel;
    try { applyMe(await api('/api/post/skip', { cid: S.cid, sid })); } catch (e) { toast(e.message); return; }
    say(pick(OWL.skip));
    const meta = stageMeta(sid), nx = firstOpen(meta.room);
    if (nx) { G.sel = nx; await loadSpec(nx).catch(() => { }); drawPanel(); } else closePanel();
    refreshMarks();
  }
  function clockBack() {
    SFX.clock();
    const c = $('#poClock'); if (!c) return; c.classList.remove('spin'); void c.offsetWidth; c.classList.add('spin');
  }
  function confetti() {
    const box = $('#poRoot'); if (!box) return;
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('i'); s.className = 'po-conf';
      s.style.left = Math.random() * 100 + '%'; s.style.background = pick(['#f2c14e', '#e76f51', '#2a9d8f', '#8ab17d', '#b56576', '#4cc9f0']);
      s.style.animationDelay = Math.random() * 0.4 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(s); setTimeout(() => s.remove(), 2600);
    }
  }
  // 玻璃橋動畫：按照學生排的路線一步一步跳；踩錯的那一塊會碎掉
  async function bridgeRun(route, fall) {
    if (!W.rows || !route) return;
    G.busy = true;
    const pl = W.player, T = THREE;
    W.rows.forEach(o => ['L', 'R'].forEach(s => { o[s].visible = true; o[s].position.y = -0.06; o[s].scale.set(1, 1, 1); }));
    await tween(500, k => { pl.position.x += (0 - pl.position.x) * k; pl.position.z += (0.6 - pl.position.z) * k; });
    pl.rotation.y = Math.PI;
    for (let i = 0; i < Math.min(6, route.length); i++) {
      const s = route[i], tx = s === 'L' ? -1.05 : 1.05, tz = ROWZ[i], sx = pl.position.x, sz = pl.position.z;
      SFX.hop();
      await tween(420, k => { pl.position.x = sx + (tx - sx) * k; pl.position.z = sz + (tz - sz) * k; pl.position.y = Math.sin(k * Math.PI) * 0.9; });
      pl.position.y = 0;
      if (i === fall) {
        const p = W.rows[i][s];
        SFX.crash(); await wait(150);
        await tween(700, k => { p.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); p.position.y = -k * 2.5; pl.position.y = -k * 3; pl.rotation.z = k * 2; });
        say(pick(OWL.fall));
        await wait(900);
        pl.rotation.z = 0; pl.position.set(0, 0, 4.2); pl.rotation.y = 0;
        G.busy = false; return;
      }
      await wait(120);
    }
    if (fall === -1 && route.length >= 6) {
      SFX.melody();
      const sx = pl.position.x, sz = pl.position.z;
      await tween(800, k => { pl.position.x = sx * (1 - k); pl.position.z = sz + (-12 - sz) * k; pl.position.y = Math.sin(k * Math.PI) * 1.2; });
      pl.position.y = 0;
    } else { await wait(300); pl.position.set(0, 0, 4.2); }
    G.busy = false;
  }
  async function ending() {
    G.busy = true;
    const lines = [['🦔', '小刺蝟', '那是……我小時候寄給自己的信！你真的找到了！'], ['🐿️', '你', '（把信交給小刺蝟）栗尾郵局，使命必達。'], ['🦉', '館長歐爾', pick(OWL.end)], ['🦔', '小刺蝟', '謝謝你，松鼠郵差。這封信，我等了好多年。']];
    SFX.melody(); confetti();
    for (const [e, who, t] of lines) {
      const m = $('#poModal');
      m.innerHTML = `<div class="po-modal-in po-talk"><div class="po-talk-e">${e}</div><div><b>${who}</b><p>${esc(t)}</p></div></div>`;
      m.hidden = false;
      if (who === '館長歐爾') speak(t);
      await new Promise(res => { m.onclick = res; setTimeout(res, 4200); });
    }
    $('#poModal').hidden = true; $('#poModal').onclick = null;
    G.busy = false;
    if (!G.me.free) finishDialog(true);
  }

  // =====================================================================
  //  HUD、計時、交卷
  // =====================================================================
  const fmtLeft = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function updateHud() {
    if (!G || !$('#poHud')) return;
    const r = roomInfo(G.room), meta = G.sel && stageMeta(G.sel);
    $('#poRoomName').innerHTML = `${esc(r.name)}${meta && G.room >= 1 && G.room <= 5 ? ` <span class="muted">・第 ${meta.n} 關 ${esc(meta.title)}</span>` : ''}`;
    $('#poMute').textContent = soundOff() ? '🔇' : '🔊';
    $('#poVoice').textContent = voiceOn() ? '🗣️' : '🤐';
    $('#poVoice').title = voiceOn() ? '館長語音：開' : '館長語音：關';
    $('#poFinish').hidden = !!G.me.free;
    $('#poAnswer').hidden = G.room === 6;
    tickTimer();
  }
  // 每一關自己的倒數（存在瀏覽器：重新整理不會重來；換到別關會暫停）
  function stageTick() {
    const el = $('#poStageT'); if (!G || !el) return;
    const sp = G.sel && G.spec[G.sel], q = sp && sp.q;
    if (!q || !q.limit || G.room === 6 || stageMeta(G.sel).room !== G.room && G.sel !== 'p0') { el.hidden = true; if (W.bomb && !W.bomb.safe) drawBomb(G.me.free || !G.me.deadline ? '--:--' : fmtLeft(G.me.deadline - nowS())); return; }
    const key = 'cj-po-t:' + q.qid;
    let used = +(store.get(key) || 0);
    // 只有動畫、送出中會暫停；開對話框、切到別的分頁都照樣計時（用真實經過的時間）
    const running = !G.busy && !G.timingOut && !G.sending;
    const now = Date.now(), dt = Math.min(120000, Math.max(0, now - (G.lastStageTick || now)));
    G.lastStageTick = now;
    if (running && G.lastKey === key) { used += dt; store.set(key, String(used)); }
    G.lastKey = key;
    const left = q.limit * 1000 - used, fxr = ROOMFX[G.room] || ROOMFX[0];
    el.hidden = false; el.textContent = `${fxr.icon} 本關 ${fmtLeft(left)}`;
    el.className = 'po-stime' + (left <= 30000 ? ' low' : '');
    if (W.bomb && !W.bomb.safe) { drawBomb(fmtLeft(left)); if (left <= 30000 && running) SFX.tick(); }
    G.warned = G.warned || {};
    if (left <= 30000 && left > 0 && !G.warned[q.qid]) { G.warned[q.qid] = 1; say(fxr.warn, { silent: true }); }
    if (left <= 0 && running) timeUp(sp);
  }
  async function timeUp(sp) {
    if (G.timingOut) return;
    G.timingOut = true;
    const q = sp.q, sid = G.sel, fxr = ROOMFX[G.room] || ROOMFX[0];
    try {
      closePanel(); $('#poClue').hidden = true; $('#poModal').hidden = true;
      G.busy = true;
      await fx(fxr.fx, fxr.emo, fxr.cap);
      await respawn();
      G.busy = false;
      await doSubmit(sid, q, answersOf(q).out, sp.free || sid === 'p0', { timeout: true });
    } finally { if (G) { G.timingOut = false; G.busy = false; } }
  }
  function tickTimer() {
    if (!G || !$('#poTime')) return;
    stageTick(); updateBridgeUi(); introWatch();
    const el = $('#poTime');
    if (G.me.teacher) { el.textContent = '👩‍🏫 老師試玩（不記錄）'; el.className = 'po-time free'; return; }
    if (G.me.free) { el.textContent = '自由遊玩・不計分'; el.className = 'po-time free'; return; }
    const left = G.me.deadline - nowS();
    el.textContent = '⏰ ' + fmtLeft(left);
    el.className = 'po-time' + (left < 600000 ? ' low' : '');
    if (left < 600000 && !G.said10) { G.said10 = true; say(OWL.time10[0]); }
    if (left < 180000 && !G.said3) { G.said3 = true; say(OWL.time3[0]); }
    if (left <= 0 && !G.endChecking) { G.endChecking = true; poll().finally(() => G && (G.endChecking = false)); }
    // 發呆太久，館長嗆一下
    if (!G.panelOpen && Date.now() - (G.idleSince || Date.now()) > 45000 && Date.now() - (G.lastSay || 0) > 40000) { G.idleSince = Date.now(); say(pick(OWL.idle)); }
  }
  async function poll() {
    try { applyMe(await api('/api/post/status', { cid: S.cid })); } catch (e) { }
  }
  function mapDialog() {
    const m = $('#poModal');
    const rooms = [0, 1, 2, 3, 4, 5, 6].map(r => {
      const ri = roomInfo(r), ok = r === 0 || unlocked(r);
      const st = r >= 1 && r <= 5 ? stagesOf(r).map(s => { const y = stInfo(s.sid), sk = (G.me.skip || {})[s.sid], vd = (G.me.voided || []).includes(s.sid);
        const ic = y && y.pass ? '✅' : y && y.closed ? '🔑' : sk ? '⏭' : y && y.a ? '🔸' : '⬜';
        return `<button class="po-mst" data-go="${r}" data-sid="${s.sid}" ${ok ? '' : 'disabled'}>${ic} ${s.n}. ${esc(s.title)} <small>${y && y.best !== undefined ? y.best : '-'}／${s.P}${vd ? '（老師設為不計分）' : ''}</small></button>`; }).join('') : '';
      return `<div class="po-mroom ${ok ? '' : 'lock'}"><div class="po-mrh">${ok ? '' : '🔒 '}${esc(ri.name)} <span class="muted small">${esc(ri.topic || '')}</span>${ok ? ` <button class="btn sm" data-go="${r}">前往</button>` : ''}</div>${st}</div>`;
    }).join('');
    m.innerHTML = `<div class="po-modal-in wide"><h3>🗺️ 關卡地圖</h3><p class="muted small">✅ 通過　🔑 兩次沒過（已拿部分分數）　🔸 用掉 1 次機會　⏭ 先跳過　⬜ 還沒作答。房間要照順序開：前一間的三關都「結束或跳過」，下一間的門就會打開。</p>${rooms}<div class="row"><span class="spacer"></span><button class="btn" id="poMX">關閉</button></div></div>`;
    m.hidden = false;
    $('#poMX').onclick = () => m.hidden = true;
    $$('[data-go]', m).forEach(b => b.onclick = async () => {
      m.hidden = true; const r = +b.dataset.go, sid = b.dataset.sid;
      if (r !== G.room) await goRoom(r, sid); else if (sid) { G.sel = sid; await loadSpec(sid).catch(() => { }); refreshMarks(); }
      if (sid) openPanel(sid);
    });
  }
  function finishDialog(fromEnding) {
    const m = $('#poModal');
    const left = (G.me.stages || []).filter(s => !(stInfo(s.sid) || {}).closed);
    m.innerHTML = `<div class="po-modal-in"><h3>📤 ${fromEnding ? '信送到了！要交卷嗎？' : '確定要交卷嗎？'}</h3>
      ${left.length ? `<p>還沒結束的關卡（${left.length} 關）：</p><ul class="po-sum">${left.map(s => `<li>${esc(roomInfo(s.room).name)}・${s.n}. ${esc(s.title)}${(G.me.skip || {})[s.sid] ? '（跳過）' : ''}</li>`).join('')}</ul>` : `<p>${(G.me.stages || []).length} 關全部完成了！</p>`}
      <p><b>交卷後正式成績就鎖定了</b>，不能再改；之後可以「繼續冒險」自由遊玩（不計分）。</p>
      <div class="row"><button class="btn" id="poMNo">${fromEnding ? '還要回去補' : '返回'}</button><span class="spacer"></span><button class="btn primary" id="poMYes">確定交卷</button></div></div>`;
    m.hidden = false;
    $('#poMNo').onclick = () => m.hidden = true;
    $('#poMYes').onclick = async () => { m.hidden = true; try { applyMe(await api('/api/post/finish', { cid: S.cid })); } catch (e) { toast(e.message); } };
  }
  function showEnd() {
    closePanel();
    const m = $('#poModal'), why = { submit: '你已經交卷了', time: '時間到，已經自動收卷', teacher: '老師已經收卷', kick: '老師結束了你的測驗' }[G.me.endReason] || '測驗結束了';
    const tot = G.me.total;
    m.innerHTML = `<div class="po-modal-in"><h3>📮 ${why}</h3>
      <p>${tot ? `你的正式成績：<b class="po-big">${tot.total}</b> 分（原始 ${tot.raw} / ${tot.max}）` : '正式成績已經保存，等老師公布。'}</p>
      <p class="muted">接下來是<b>自由遊玩・不計分</b>：每一間房都打開了，可以換新題目一直練習，不會改到正式成績。</p>
      <div class="row"><button class="btn" id="poMQuit">離開</button><span class="spacer"></span><button class="btn primary" id="poMGo">🎮 繼續冒險</button></div></div>`;
    m.hidden = false;
    G.spec = {}; G.forceFree = {};
    $('#poMGo').onclick = async () => { m.hidden = true; await goRoom(G.room === 6 ? 1 : Math.max(1, G.room)); };
    $('#poMQuit').onclick = () => { m.hidden = true; quitGame(); };
  }

  // =====================================================================
  //  2D 模式（電腦不支援 3D 時）
  // =====================================================================
  function render2D() {
    const host = $('#poStage'), r = G.room;
    const props = PROPS[r] || [];
    host.innerHTML = `<div class="po-2d"><div class="po-2d-h">🏠 ${esc(roomInfo(r).name)} <span class="muted small">（2D 模式：這台電腦不支援 3D）</span></div>
      <div class="po-2d-grid">${props.map(([k, n, e]) => `<button class="po-2d-p" data-p="${k}"><span>${e}</span>${esc(n)}</button>`).join('')}
      ${r !== 6 ? '<button class="po-2d-p desk" data-d="1"><span>✍️</span>作答台</button>' : '<button class="po-2d-p" data-h="1"><span>🦔</span>小刺蝟</button>'}
      ${r <= 5 ? `<button class="po-2d-p door" data-door="1"><span>🚪</span>${r === 5 ? '往 信庫' : '往 ' + esc(roomInfo(r + 1).name)}</button>` : ''}
      <button class="po-2d-p" data-o="1"><span>🦉</span>館長歐爾</button></div></div>`;
    W.room = r; W.propObj = null;
    $$('[data-p]', host).forEach(b => b.onclick = () => inspect(b.dataset.p, props.find(p => p[0] === b.dataset.p)[1]));
    if ($('[data-d]', host)) $('[data-d]', host).onclick = () => openPanel();
    if ($('[data-h]', host)) $('[data-h]', host).onclick = ending;
    if ($('[data-door]', host)) $('[data-door]', host).onclick = useDoor;
    $('[data-o]', host).onclick = () => say(pick(OWL.poke));
    const sp = G.sel && G.spec[G.sel], has = (sp && sp.q.props) || {};
    $$('[data-p]', host).forEach(b => b.classList.toggle('glow', b.dataset.p in has));
  }

  // =====================================================================
  //  開始／離開遊戲
  // =====================================================================
  async function startGame(me) {
    quitGame();
    document.body.insertAdjacentHTML('beforeend', `<div id="poRoot" class="po-root">
      <div id="poStage" class="po-stage"></div>
      <div id="poHud" class="po-hud">
        <span class="po-clock" id="poClock">🕛</span><span id="poRoomName" class="po-rn"></span><span class="spacer"></span>
        <span id="poStageT" class="po-stime" hidden></span><span id="poTime" class="po-time"></span>
        <button class="po-hb" id="poMap" title="關卡地圖">🗺️ 關卡</button>
        <button class="po-hb" id="poMute" title="音效／音樂"></button><button class="po-hb" id="poVoice"></button>
        <button class="po-hb" id="poLow" title="畫質（電腦很卡時切換）">⚙️</button>
        <button class="po-hb warn" id="poFinish">📤 交卷</button><button class="po-hb" id="poQuit" title="離開（不會交卷）">✖</button>
      </div>
      <div id="poSay" class="po-say" hidden><span class="po-say-owl">${OWL_SVG}</span><div><b>館長歐爾</b><div id="poSayText"></div></div></div>
      <div id="poNear" class="po-near" hidden></div>
      <button id="poAnswer" class="po-answer">📝 作答</button>
      <div id="poBridge" class="po-bridge" hidden><button class="po-jb" data-j="L">⬅ 跳左 L</button><span id="poBrInfo"></span><button class="po-jb" data-j="R">跳右 R ➡</button></div>
      <div id="poIntro" class="po-introbox" hidden></div>
      <div class="po-help">🖱 點地板走路・點物件調查　⌨ WASD／方向鍵走路・E 互動</div>
      <div id="poClue" class="po-clue" hidden></div>
      <div id="poPanel" class="po-panel" hidden></div>
      <div id="poModal" class="po-modal" hidden></div>
      <div id="poFx" class="po-fx" hidden></div>
      <div id="poFade" class="po-fade on"></div>
    </div>`);
    document.body.classList.add('po-on');
    G = { me, off: me.now - Date.now(), room: 0, sel: 'p0', spec: {}, forceFree: {}, clues: store.json('cj-po-clues', {}), three: false, idleSince: Date.now(), lastHint: +(store.get('cj-po-hint') || 0), started: false };
    try {
      await loadThree();
      const t = document.createElement('canvas'); if (!(t.getContext('webgl') || t.getContext('experimental-webgl'))) throw new Error('no webgl');
      initRenderer($('#poStage'));
      G.three = true;
      W.renderer.domElement.addEventListener('pointerdown', onPointer);
    } catch (e) { G.three = false; }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    $('#poAnswer').onclick = () => openPanel();
    $$('[data-j]').forEach(b => b.onclick = () => bridgeJump(b.dataset.j));
    $('#poMap').onclick = mapDialog;
    $('#poMute').onclick = () => { store.set('cj-po-mute', soundOff() ? '0' : '1'); if (soundOff()) { try { speechSynthesis.cancel(); } catch (e) { } } updateHud(); };
    $('#poVoice').onclick = () => { store.set('cj-po-voice', voiceOn() ? '0' : '1'); if (!voiceOn()) { try { speechSynthesis.cancel(); } catch (e) { } } updateHud(); toast(voiceOn() ? '館長語音：開' : '館長語音：關'); };
    $('#poLow').onclick = () => { store.set('cj-po-low', store.get('cj-po-low') === '1' ? '0' : '1'); toast(store.get('cj-po-low') === '1' ? '已切換成「省電畫質」，重新進入後生效' : '已切換成「一般畫質」，重新進入後生效'); };
    $('#poFinish').onclick = () => finishDialog(false);
    $('#poQuit').onclick = () => { if (confirm('離開郵局？（不會交卷，時間會繼續算；回來會接著原本的題目）')) quitGame(true); };
    $('#poSay').onclick = () => $('#poSay').hidden = true;
    G.timer = setInterval(tickTimer, 1000);
    G.poller = setInterval(poll, 30000);
    musicStart();
    if (G.three) loop();
    // 從上次的房間繼續（重新整理也不會回到起點）
    const last = +(store.get('cj-po-room') || 0);
    const startRoom = me.free || me.teacher ? (last || 0) : (unlocked(last) ? last : 0);
    await goRoom(Math.min(6, Math.max(0, startRoom)));
    G.started = true;
    if (me.free && !me.teacher) showEnd();
  }
  function quitGame(toPage) {
    if (!G && !$('#poRoot')) return;
    if (G) { cancelAnimationFrame(G.raf); clearInterval(G.timer); clearInterval(G.poller); clearInterval(G.typeT); clearTimeout(G.sayHide); }
    musicStop();
    try { speechSynthesis.cancel(); } catch (e) { }
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    if (W.renderer) { try { W.renderer.dispose(); W.renderer.forceContextLoss(); } catch (e) { } window.removeEventListener('resize', W.resize); }
    Object.keys(W).forEach(k => delete W[k]);
    $('#poRoot')?.remove(); document.body.classList.remove('po-on');
    G = null;
    if (toPage) router();
  }
  window.addEventListener('hashchange', () => { if (G && !/^#\/post/.test(location.hash)) quitGame(); });

  // =====================================================================
  //  學生：進場前的規則畫面
  // =====================================================================
  async function viewPostStudent() {
    app().innerHTML = '<div class="loading">載入中…</div>';
    let me;
    try { me = await api('/api/post/status', { cid: S.cid }); }
    catch (e) {
      app().innerHTML = `<div class="card po-intro"><div class="po-intro-owl">${OWL_SVG}</div><h2>📮 栗尾郵局：最後一封信</h2><p class="err">${esc(e.message)}</p><p class="muted">老師開放之後，按下面的按鈕重新整理。</p><button class="btn primary" id="poRe">↻ 重新整理</button></div>`;
      $('#poRe').onclick = router; return;
    }
    const pen = Math.round(me.penalty * 100), left = me.deadline - me.now;
    app().innerHTML = `<div class="card po-intro"><div class="po-intro-owl">${OWL_SVG}</div>
      <h2>📮 栗尾郵局：最後一封信</h2>
      <p>小刺蝟來領小時候寄給自己的信。你是夜班<b>松鼠郵差</b>，要穿過五個房間，把信送到他手上。可是<b>館長歐爾</b>不想讓你過關……</p>
      ${me.free ? '<p class="po-free">測驗已經結束，現在是自由遊玩・不計分。</p>' : `<p>⏰ 剩下 <b>${fmtLeft(left)}</b>（伺服器時間，時間到會自動收卷）</p>`}
      <div class="po-rules"><h3>📜 規則（請看完再進場）</h3><ol>
        <li>五間房，共 ${me.stages.length} 關、100 分（暗房只有 1 關）。<b>大廳是練習區，不計分</b>，先去熟悉操作。</li>
        <li>每一關的數字藏在房間的物件裡（腳下有<b>黃色光圈</b>的），要走過去調查。程式卡要放進空格、再填追蹤值和答案。</li>
        <li>每關的分數：<b>推理占 60%</b>（程式卡、分支、追蹤值）、<b>結果占 40%</b>（密碼、圖樣、路線）。只寫對結果最多四成。</li>
        <li>每關有 <b>2 次</b>正式機會：第 1 次全對拿滿分；有錯先扣配分的 ${pen}%，並<b>換一題新的</b>（線索也會換）。第 2 次最多拿 ${100 - pen}%。兩次取較高分。</li>
        <li>每一關<b>不限時</b>，只有總時間（右上角的 ⏰）。時間到會自動收卷。</li>
        <li><b>答案錯了</b>才會出事：值班室、打孔室、暗房會被<b>貓頭鷹抓回起點</b>；失物教室的<b>炸彈會爆炸</b>；玻璃橋會掉下去。都會換一題新的。（答案對、推理沒寫好，不會被抓，只是拿部分分數。）</li>
        <li>失物教室：在作答台填推理，再走到<b>炸彈</b>旁邊剪線。玻璃橋：可以自己按「跳左／跳右」一步一步跳。</li>
        <li>兩次都沒過不會卡住：館長會丟一把<b>備用鑰匙</b>，分數照算你拿到的，可以繼續往前。也可以按「先跳過」，之後再回來（跳過不會用掉機會）。</li>
        <li>按「正式送出」前會讓你再確認一次；沒填完會提醒你，不會用掉機會。</li>
        <li>重新整理、斷線都沒關係，回來會接著原本的題目。</li>
        <li>可以提早交卷；交卷後成績鎖定，之後可以自由遊玩（不計分）。</li>
      </ol>
      <p class="muted small">操作：點地板走路、點物件調查；鍵盤 WASD／方向鍵走路、E 互動。右上角可以關掉音樂和館長語音（館長講的話也會有文字）。</p></div>
      <div class="row"><span class="spacer"></span><button class="btn primary big" id="poGo">🐿️ 進入郵局</button></div></div>`;
    $('#poGo').onclick = () => startGame(me);
  }

  // =====================================================================
  //  老師：控制台
  // =====================================================================
  async function viewPostTeacher() {
    const classes = teacherClasses();
    if (!classes.length) { app().innerHTML = '<div class="card">還沒有班級。</div>'; return; }
    let cid = teacherCid();
    app().innerHTML = `<div class="card po-tcard"><div class="row"><span class="po-t-owl">${OWL_SVG}</span><div><h2 style="margin:0">📮 栗尾郵局：最後一封信</h2><div class="muted small">3D 實境解謎測驗（變數、條件、for、巢狀迴圈、一維陣列）・每人題目不同・題目與答案都在伺服器</div></div>
      <span class="spacer"></span><select id="poCls">${classes.map(c => `<option value="${esc(c.id)}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}（${c.count} 人）</option>`).join('')}</select>
      <button class="btn" id="poTry">🎮 老師試玩</button></div></div><div id="poBoard"><div class="loading">載入中…</div></div>`;
    $('#poCls').onchange = () => { store.set('cj-tcid', $('#poCls').value); cid = $('#poCls').value; load(); };
    $('#poTry').onclick = async () => { try { const me = await api('/api/post/status', { cid }); startGame(me); } catch (e) { toast(e.message); } };
    let data = null, floor = +(store.get('cj-po-floor') || 0);
    const manage = async (body, msg) => { try { await api('/api/post/manage', Object.assign({ cid }, body)); if (msg) toast(msg); load(); } catch (e) { toast(e.message, 4000); } };
    async function load() {
      try { data = await apiGet('/api/post/board', { cid }); draw(); } catch (e) { $('#poBoard').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
    }
    function draw() {
      const d = data, cfg = d.cfg, now = d.now, run = cfg.round && !cfg.closed && now < d.deadline;
      const adj = t => Math.round((floor + (100 - floor) * t / 100) * 10) / 10;
      const st = d.students;
      const stats = d.stages.map(s => { const xs = st.map(x => x.st && x.st.s[s.sid]).filter(Boolean); return { s, n: xs.length, pass: xs.filter(x => x.pass).length, avg: xs.length ? Math.round(xs.reduce((a, x) => a + (x.best || 0), 0) / xs.length * 10) / 10 : 0 }; });
      const statusOf = x => !x.st ? '<span class="muted">未進場</span>' : x.st.end ? ({ submit: '📤 已交卷', time: '⏰ 時間到', teacher: '⏹ 已收卷', kick: '⏹ 老師結束' }[x.st.endReason] || '結束') : '🟢 作答中';
      const cell = (x, s) => { const y = x.st && x.st.s[s.sid]; const sk = x.st && x.st.skip[s.sid]; if (!y) return `<td class="po-c ${sk ? 'skip' : ''}">${sk ? '⏭' : ''}</td>`;
        return `<td class="po-c ${y.pass ? 'ok' : y.closed ? 'bad' : 'mid'}" title="${y.sc.map((v, i) => `第${i + 1}次 原始${y.raw[i]} 實得${v}`).join('、')}">${y.best}${y.a > 1 ? '²' : ''}</td>`; };
      $('#poBoard').innerHTML = `<div class="card">
        ${!cfg.round ? `<h3 style="margin-top:0">還沒開始</h3>` : `<h3 style="margin-top:0">${run ? `🔴 進行中・剩下 <span id="poTLeft">${fmtLeft(d.deadline - now)}</span>` : cfg.closed ? '⏹ 已收卷' : '⏰ 時間到'}　<span class="muted small">場次 ${esc(cfg.round)}・開始 ${fmtTime(cfg.startAt)}・首錯扣 ${Math.round(cfg.penalty * 100)}%</span></h3>`}
        <div class="row po-ctl">
          ${run ? `<button class="btn" id="poExt">⏩ 全班加時</button><input type="number" id="poExtM" value="10" min="1" max="120" style="width:60px">分　<button class="btn danger" id="poClose">⏹ 收卷</button>`
            : `<label>時間 <input type="number" id="poMin" value="${cfg.minutes || 80}" min="5" max="240" style="width:64px"> 分</label>
               <label>首錯扣 <select id="poPen">${[0, 10, 20, 30].map(v => `<option value="${v / 100}" ${Math.round(cfg.penalty * 100) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
               <button class="btn primary" id="poOpen">▶ ${cfg.round ? '重新開一場（舊成績保留在試算表）' : '開始測驗（開放學生進場並開始計時）'}</button>
               ${cfg.round ? `<button class="btn" id="poExt">⏩ 時間到了，全班再加</button><input type="number" id="poExtM" value="10" min="1" max="120" style="width:60px">分` : ''}`}
        </div>
        ${cfg.round ? `<div class="row po-ctl"><input type="text" id="poHint" placeholder="📣 廣播提示（館長會在每個學生畫面念出來）" style="flex:1;min-width:240px" value=""><button class="btn" id="poHintGo">📣 廣播</button>
          ${cfg.hint ? `<span class="muted small">目前：${esc(cfg.hint.text)} <a href="#" id="poHintClr">清除</a></span>` : ''}
          <label class="po-chk"><input type="checkbox" id="poShow" ${cfg.show ? 'checked' : ''}> 公布成績（交卷後學生看得到總分）</label></div>` : ''}
        <p class="muted small" style="margin:6px 0 0">學生：登入 → 導覽列「📮 栗尾郵局」→ 看規則 → 進入郵局。中途重新整理、斷線都會回到原本的題目。</p></div>
      ${cfg.round ? `<div class="card"><h3 style="margin-top:0">📊 各關狀況 <span class="muted small">全班都卡住的關卡會變紅：可以廣播提示，或設為「不計分」（總分自動換算回 100）</span></h3>
        <div class="table-wrap"><table class="list po-stat"><thead><tr><th>關卡</th>${stats.map(x => `<th title="${esc(x.s.title)}">${x.s.room}-${x.s.n}<br><small>${esc(x.s.title)}</small></th>`).join('')}</tr></thead><tbody>
          <tr><td>配分</td>${stats.map(x => `<td>${x.s.P}</td>`).join('')}</tr>
          <tr><td>作答人數</td>${stats.map(x => `<td>${x.n}</td>`).join('')}</tr>
          <tr><td>全對人數</td>${stats.map(x => `<td class="${x.n >= 5 && x.pass / x.n < 0.3 ? 'po-red' : ''}">${x.pass}</td>`).join('')}</tr>
          <tr><td>平均得分</td>${stats.map(x => `<td>${x.avg}</td>`).join('')}</tr>
          <tr><td>不計分</td>${stats.map(x => `<td><input type="checkbox" data-void="${x.s.sid}" ${(cfg.voided || []).includes(x.s.sid) ? 'checked' : ''}></td>`).join('')}</tr>
        </tbody></table></div></div>
      <div class="card"><div class="row"><h3 style="margin:0">👥 全班（${st.filter(x => x.st).length}/${st.length} 人進場）</h3><span class="spacer"></span>
        <label class="small">成績換算：保底 <input type="number" id="poFloor" value="${floor}" min="0" max="99" style="width:56px"> 分 <span class="muted">（0 = 不調整；調整後 = 保底 + (100−保底) × 原始/100）</span></label>
        <button class="btn" id="poCsv">⬇ 成績 CSV</button><button class="btn" id="poCsv2">⬇ 作答明細 CSV</button><button class="btn" id="poRef">↻</button></div>
        <div class="table-wrap"><table class="list po-tab"><thead><tr><th>座號</th><th>姓名</th><th>狀態</th>${d.stages.map(s => `<th>${s.room}-${s.n}</th>`).join('')}<th>總分</th>${floor ? '<th>調整後</th>' : ''}<th>剩餘</th><th></th></tr></thead><tbody>
        ${st.map(x => `<tr><td>${seat2(x.seat)}</td><td>${x.online && now - x.online < 120000 ? '🟢' : '⚪'} ${esc(x.name)}</td><td class="small">${statusOf(x)}</td>${d.stages.map(s => cell(x, s)).join('')}
          <td><b>${x.st ? x.st.tot.total : ''}</b></td>${floor ? `<td>${x.st ? adj(x.st.tot.total) : ''}</td>` : ''}<td class="small">${x.st && !x.st.end ? fmtLeft(x.st.deadline - now) : ''}</td>
          <td class="po-act">${x.st ? `<button class="btn sm" data-a="extend" data-s="${x.seat}" title="這位學生多 5 分鐘（技術問題時用）">+5分</button>${x.st.end ? `<button class="btn sm" data-a="resume" data-s="${x.seat}">繼續</button>` : `<button class="btn sm" data-a="end" data-s="${x.seat}">結束</button>`}<button class="btn sm" data-det="${esc(x.email)}">明細</button><button class="btn sm danger" data-a="reset" data-s="${x.seat}">重設</button>` : ''}</td></tr>
          <tr id="poDet_${esc(x.email)}" hidden><td colspan="${d.stages.length + 8}"></td></tr>`).join('')}
        </tbody></table></div><p class="muted small">格子：綠＝全對、橘＝還有機會、紅＝兩次都沒過（取較高分）、⏭＝跳過；² ＝用了第 2 次機會。滑鼠移到格子上可看每次原始分與實得分。</p></div>` : ''}`;
      const B = $('#poBoard');
      if ($('#poOpen')) $('#poOpen').onclick = () => { if (cfg.round && !confirm('重新開一場：所有學生從頭開始（舊的作答紀錄保留在試算表「郵局測驗」）。確定？')) return; manage({ action: 'open', minutes: +$('#poMin').value, penalty: +$('#poPen').value, force: true }, '已開始！學生可以進場了'); };
      if ($('#poClose')) $('#poClose').onclick = () => { if (confirm('現在收卷？還在作答的學生會立刻結束（已送出的成績都會保留）。')) manage({ action: 'close' }, '已收卷'); };
      if ($('#poExt')) $('#poExt').onclick = () => manage({ action: 'extendAll', minutes: +$('#poExtM').value }, '已加時');
      if ($('#poHintGo')) $('#poHintGo').onclick = () => { const t = $('#poHint').value.trim(); if (!t) return toast('請輸入提示內容'); manage({ action: 'hint', text: t }, '已廣播（學生 30 秒內會看到）'); };
      if ($('#poHintClr')) $('#poHintClr').onclick = e => { e.preventDefault(); manage({ action: 'hint', text: '' }); };
      if ($('#poShow')) $('#poShow').onchange = () => manage({ action: 'show', on: $('#poShow').checked }, $('#poShow').checked ? '學生交卷後看得到總分了' : '已隱藏總分');
      $$('[data-void]', B).forEach(c => c.onchange = () => manage({ action: 'void', sid: c.dataset.void, on: c.checked }, c.checked ? '這一關不計分，總分已換算' : '這一關恢復計分'));
      $$('[data-a]', B).forEach(b => b.onclick = () => {
        const a = b.dataset.a, x = st.find(y => y.seat === +b.dataset.s);
        const msg = { reset: `重設 ${x.name} 的作答？所有關卡清空重來（請確定是技術問題）。`, end: `結束 ${x.name} 的測驗？` }[a];
        if (msg && !confirm(msg)) return;
        manage({ action: a, seat: x.seat, minutes: 5 }, { extend: '已多給 5 分鐘', resume: '已讓學生繼續（多 5 分鐘）', end: '已結束', reset: '已重設' }[a]);
      });
      $$('[data-det]', B).forEach(b => b.onclick = async () => {
        const tr = $('#poDet_' + CSS.escape(b.dataset.det)); tr.hidden = !tr.hidden; if (tr.hidden) return;
        tr.firstElementChild.innerHTML = '<div class="loading">載入中…</div>';
        try { const r = await apiGet('/api/post/detail', { cid, email: b.dataset.det }); tr.firstElementChild.innerHTML = detailHtml(r.rows); } catch (e) { tr.firstElementChild.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      });
      if ($('#poFloor')) $('#poFloor').onchange = () => { floor = Math.max(0, Math.min(99, +$('#poFloor').value || 0)); store.set('cj-po-floor', String(floor)); draw(); };
      if ($('#poRef')) $('#poRef').onclick = load;
      if ($('#poCsv')) $('#poCsv').onclick = () => downloadCsv([['座號', '姓名', 'Email', '狀態', ...d.stages.map(s => `${s.room}-${s.n} ${s.title}（${s.P}）`), '原始分', '總分（換算100）', ...(floor ? ['調整後'] : []), '不計分的關卡'],
        ...st.map(x => [x.seat, x.name, x.email, x.st ? (x.st.end ? x.st.endReason : '作答中') : '未進場', ...d.stages.map(s => { const y = x.st && x.st.s[s.sid]; return y ? y.best : ''; }), x.st ? x.st.tot.raw : '', x.st ? x.st.tot.total : '', ...(floor ? [x.st ? adj(x.st.tot.total) : ''] : []), (cfg.voided || []).join(' ')])], `栗尾郵局成績_${cfg.round}.csv`);
      if ($('#poCsv2')) $('#poCsv2').onclick = async () => {
        try {
          const r = await apiGet('/api/post/detail', { cid });
          downloadCsv([['座號', '姓名', '關卡', '配分', '第幾次', '題號', '時間', '原始分', '扣分', '實得分', '這關最後得分', '欄位', '類型', '學生作答', '標準答案', '對錯'],
            ...r.rows.flatMap(x => x.fields.map(f => [x.seat, x.name, `${x.sid} ${x.title}`, x.P, x.n, x.qid, fmtTime(x.time), x.raw, Math.round((x.n === 1 ? x.raw - x.score : x.raw - x.score) * 100) / 100, x.score, x.best, f.label, f.kind === 'r' ? '推理' : '結果',
              Array.isArray(f.got) ? f.got.join('/') : f.got ?? '', Array.isArray(f.want) ? f.want.join('/') : f.want, f.ok ? '✔' : '✘']))], `栗尾郵局作答明細_${cfg.round}.csv`);
        } catch (e) { toast(e.message); }
      };
      clearInterval(G_T.t);
      G_T.t = setInterval(() => { const el = $('#poTLeft'); if (!el) return clearInterval(G_T.t); el.textContent = fmtLeft(d.deadline - Date.now() - (d.now - d.fetched)); }, 1000);
      d.fetched = d.fetched || Date.now();
    }
    const G_T = {};
    load();
    pageTimers.push(setInterval(() => { if (!$('#poBoard') || $('#poRoot')) return; if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return; load(); }, 20000));
  }
  function detailHtml(rows) {
    if (!rows.length) return '<p class="muted">還沒有正式送出的紀錄。</p>';
    return `<div class="po-det">${rows.map(x => `<div class="po-det-i"><b>${esc(x.sid)} ${esc(x.title)}</b>・第 ${x.n} 次・${fmtTime(x.time)}・題號 <code>${esc(x.qid)}</code>・原始 ${x.raw} → 實得 <b>${x.score}</b>（這關最後 ${x.best}/${x.P}）
      <table class="list"><tbody>${x.fields.map(f => `<tr class="${f.ok ? 'ok' : 'bad'}"><td>${f.ok ? '✔' : '✘'}</td><td>${f.kind === 'r' ? '推理' : '結果'}</td><td>${esc(f.label)}</td><td><pre>${esc(Array.isArray(f.got) ? f.got.join('\n') : f.got ?? '')}</pre></td><td><pre>${esc(Array.isArray(f.want) ? f.want.join('\n') : f.want)}</pre></td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
  }

  function viewPost() { return isTeacher() ? viewPostTeacher() : viewPostStudent(); }
  window.CJ_VIEWS = Object.assign(window.CJ_VIEWS || {}, { post: viewPost });
})();
