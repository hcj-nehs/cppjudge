/* C++ 校園密室逃脫（測驗）
 * 關卡資料在 escape-data.js（不含答案）；密碼由後端比對雜湊。
 * 使用 app.js 的共用工具：$、$$、esc、api、apiGet、S、Judge、sha、toast、renderLesson、diagHtml、friendlyCE… */
'use strict';
(function () {
  const ED = window.CJ_ESCAPE;
  if (!ED) return;
  const ROOM = Object.fromEntries(ED.rooms.map(r => [r.id, r]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // 依帳號分配題目版本（和後端 escVariant 一樣）
  function variantOf(email, room, door) {
    let h = 2166136261;
    for (const ch of email + '|' + room + door) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h % ED.variants;
  }
  const doorName = d => d === 'A' ? '左門' : '右門';

  // ============ 場景（2.5D：SVG 背景 + CSS 3D 的門） ============
  const FLOOR = c => `<polygon points="0,250 400,250 330,175 70,175" fill="${c}"/><rect x="0" y="0" width="400" height="175" fill="url(#wall)"/>`;
  const SCENES = {
    classroom: ['#b7c4a5', `<rect x="110" y="28" width="180" height="80" rx="3" fill="#2f5d3a" stroke="#8a6a3d" stroke-width="5"/>
      <text x="200" y="62" fill="#f4f4e8" font-size="13" text-anchor="middle" font-family="monospace">cout &lt;&lt; "Bye";</text>
      <text x="200" y="85" fill="#f4f4e8" font-size="10" text-anchor="middle" opacity=".7">值日生：記得關燈</text>
      <rect x="20" y="40" width="60" height="45" fill="#cfe8ff" stroke="#fff" stroke-width="3"/><line x1="50" y1="40" x2="50" y2="85" stroke="#fff" stroke-width="2"/>
      <rect x="320" y="40" width="60" height="45" fill="#ffd9a8" stroke="#fff" stroke-width="3"/><line x1="350" y1="40" x2="350" y2="85" stroke="#fff" stroke-width="2"/>
      <g fill="#c98d4e"><rect x="95" y="200" width="60" height="10"/><rect x="245" y="200" width="60" height="10"/><rect x="150" y="225" width="100" height="12"/></g>
      <rect x="160" y="150" width="80" height="22" fill="#8a5a2b"/><text x="200" y="166" fill="#fff" font-size="10" text-anchor="middle">講桌</text>`],
    lockers: ['#c9c2b4', `${Array.from({ length: 8 }, (_, i) => `<rect x="${12 + i * 48}" y="30" width="44" height="140" fill="${i % 2 ? '#5b8bd0' : '#4a78bd'}" stroke="#2c4a7a" stroke-width="2"/>
      <rect x="${20 + i * 48}" y="45" width="28" height="4" fill="#2c4a7a"/><rect x="${20 + i * 48}" y="53" width="28" height="4" fill="#2c4a7a"/><circle cx="${48 + i * 48}" cy="105" r="3" fill="#ddd"/>
      <text x="${34 + i * 48}" y="155" font-size="9" fill="#fff" text-anchor="middle">${301 + i}</text>`).join('')}
      <rect x="252" y="80" width="26" height="20" fill="#fff59d" transform="rotate(-8 265 90)"/><text x="265" y="93" font-size="7" text-anchor="middle" transform="rotate(-8 265 90)">紙條</text>`],
    guard: ['#a9b8c4', `<rect x="30" y="35" width="150" height="90" rx="4" fill="#263238"/>
      ${[0, 1, 2, 3].map(i => `<rect x="${38 + (i % 2) * 72}" y="${42 + Math.floor(i / 2) * 40}" width="64" height="34" fill="#4caf50" opacity=".35"/>`).join('')}
      <text x="105" y="140" font-size="10" text-anchor="middle" fill="#333">監視器</text>
      <rect x="230" y="110" width="140" height="55" fill="#6d4c41"/><rect x="250" y="90" width="50" height="22" rx="3" fill="#455a64"/>
      <rect x="258" y="96" width="34" height="8" fill="#80deea"/><text x="275" y="125" font-size="9" text-anchor="middle" fill="#fff">掃描機</text>
      <circle cx="340" cy="60" r="18" fill="#fff" stroke="#555" stroke-width="3"/><line x1="340" y1="60" x2="340" y2="48" stroke="#333" stroke-width="2"/><line x1="340" y1="60" x2="350" y2="64" stroke="#333" stroke-width="2"/>`],
    lab: ['#b3c7c7', `<rect x="20" y="110" width="200" height="12" fill="#795548"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${32 + i * 30}" y="${70 + (i % 2) * 8}" width="12" height="40" rx="6" fill="${['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#26c6da'][i]}" opacity=".85" stroke="#fff"/>`).join('')}
      <rect x="290" y="30" width="80" height="140" rx="6" fill="#eceff1" stroke="#90a4ae" stroke-width="3"/><line x1="290" y1="85" x2="370" y2="85" stroke="#90a4ae" stroke-width="3"/>
      <rect x="300" y="95" width="28" height="22" fill="#fff59d"/><text x="314" y="109" font-size="7" text-anchor="middle">第4頁</text>
      <rect x="240" y="30" width="34" height="50" rx="4" fill="#263238"/><text x="257" y="60" font-size="13" text-anchor="middle" fill="#ff7043" font-family="monospace">31°</text>`],
    library: ['#8d6e63', `<rect x="0" y="0" width="400" height="175" fill="#3e2f2a"/>
      ${[0, 1, 2, 3].map(k => `<rect x="${10 + k * 98}" y="20" width="88" height="150" fill="#5d4037" stroke="#3e2723" stroke-width="3"/>
        ${[0, 1, 2, 3].map(sh => `<rect x="${12 + k * 98}" y="${52 + sh * 32}" width="84" height="4" fill="#3e2723"/>
          ${Array.from({ length: 9 }, (_, b) => `<rect x="${15 + k * 98 + b * 9}" y="${30 + sh * 32}" width="7" height="22" fill="${['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f'][(b + sh + k) % 6]}"/>`).join('')}`).join('')}`).join('')}
      <circle cx="200" cy="12" r="9" fill="#fff59d" opacity=".8"/><polygon points="160,175 240,175 215,20 185,20" fill="#fff59d" opacity=".12"/>`],
    gym: ['#d7a86e', `<rect x="0" y="0" width="400" height="175" fill="#90a4ae"/>
      <rect x="140" y="18" width="120" height="50" rx="4" fill="#111"/><text x="170" y="52" font-size="24" fill="#ff5252" font-family="monospace" text-anchor="middle">12</text>
      <text x="230" y="52" font-size="24" fill="#69f0ae" font-family="monospace" text-anchor="middle">09</text><text x="200" y="62" font-size="7" fill="#aaa" text-anchor="middle">HOME  GUEST</text>
      <rect x="30" y="40" width="6" height="130" fill="#607d8b"/><rect x="18" y="40" width="40" height="30" fill="#fff" stroke="#e53935" stroke-width="2"/><ellipse cx="50" cy="80" rx="14" ry="4" fill="none" stroke="#ff6f00" stroke-width="3"/>
      <rect x="364" y="40" width="6" height="130" fill="#607d8b"/><rect x="342" y="40" width="40" height="30" fill="#fff" stroke="#e53935" stroke-width="2"/><ellipse cx="350" cy="80" rx="14" ry="4" fill="none" stroke="#ff6f00" stroke-width="3"/>
      <ellipse cx="200" cy="215" rx="70" ry="18" fill="none" stroke="#fff" stroke-width="3"/><line x1="200" y1="175" x2="200" y2="250" stroke="#fff" stroke-width="3"/>
      <circle cx="120" cy="160" r="10" fill="#ef6c00"/><path d="M110 160 H130 M120 150 V170" stroke="#5d2a00" stroke-width="1.5"/>`],
    music: ['#a1887f', `<rect x="0" y="0" width="400" height="175" fill="#ede7f6"/>
      <rect x="40" y="20" width="160" height="70" fill="#fff" stroke="#9575cd" stroke-width="2"/>${[0, 1, 2, 3, 4].map(i => `<line x1="46" y1="${34 + i * 10}" x2="194" y2="${34 + i * 10}" stroke="#7e57c2"/>`).join('')}
      <text x="70" y="64" font-size="22" fill="#4527a0">♪</text><text x="110" y="54" font-size="22" fill="#4527a0">♫</text><text x="150" y="70" font-size="22" fill="#4527a0">♪</text>
      <rect x="230" y="95" width="150" height="70" rx="4" fill="#212121"/><rect x="236" y="135" width="138" height="24" fill="#fafafa"/>
      ${Array.from({ length: 9 }, (_, i) => `<line x1="${251 + i * 15}" y1="135" x2="${251 + i * 15}" y2="159" stroke="#999"/>`).join('')}
      ${[0, 1, 3, 4, 5, 7, 8].map(i => `<rect x="${246 + i * 15}" y="135" width="9" height="14" fill="#212121"/>`).join('')}
      <polygon points="300,92 312,40 324,92" fill="#795548"/><line x1="312" y1="88" x2="322" y2="50" stroke="#ffd54f" stroke-width="2" class="esc-metro"/>`],
    rooftop: ['#78909c', `<rect x="0" y="0" width="400" height="175" fill="#1a237e"/>
      ${Array.from({ length: 24 }, (_, i) => `<circle cx="${(i * 67) % 400}" cy="${(i * 37) % 90 + 5}" r="${i % 3 ? 1 : 1.6}" fill="#fff" opacity=".8"/>`).join('')}
      <circle cx="340" cy="38" r="16" fill="#fff8e1"/><circle cx="347" cy="33" r="14" fill="#1a237e"/>
      <rect x="250" y="90" width="90" height="85" fill="#263238"/>${[0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${260 + c * 26}" y="${100 + r * 24}" width="14" height="12" fill="${(r + c) % 2 ? '#ffee58' : '#37474f'}"/>`).join('')).join('')}
      <g class="esc-heli"><ellipse cx="300" cy="72" rx="18" ry="8" fill="#e53935"/><line x1="278" y1="62" x2="322" y2="62" stroke="#ddd" stroke-width="2"/><line x1="282" y1="72" x2="262" y2="70" stroke="#e53935" stroke-width="3"/></g>
      <rect x="20" y="120" width="40" height="55" rx="6" fill="#b0bec5"/><text x="40" y="150" font-size="8" text-anchor="middle">水塔</text>
      <rect x="0" y="168" width="400" height="7" fill="#546e7a"/>`],
    exit: ['#9ccc65',`<rect x="0" y="0" width="400" height="175" fill="#81d4fa"/><circle cx="330" cy="50" r="24" fill="#ffeb3b"/>
      <rect x="120" y="60" width="160" height="115" fill="#e0e0e0"/><rect x="170" y="100" width="60" height="75" fill="#5d4037"/>
      <text x="200" y="88" font-size="14" text-anchor="middle" fill="#333">校　門</text>`],
  };
  const sceneSvg = id => { const s = SCENES[id] || SCENES.classroom; return `<svg class="esc-bg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3efe6"/><stop offset="1" stop-color="#ddd6c6"/></linearGradient></defs>${FLOOR(s[0])}${s[1]}</svg>`; };
  // BYTE：校園管理 AI
  const BYTE = `<svg viewBox="0 0 100 130" class="byte-svg"><line x1="50" y1="8" x2="50" y2="24" stroke="#607d8b" stroke-width="4"/><circle class="byte-led" cx="50" cy="8" r="6"/>
    <rect x="14" y="22" width="72" height="56" rx="16" fill="#cfd8dc" stroke="#455a64" stroke-width="4"/><rect x="24" y="32" width="52" height="34" rx="8" fill="#102027"/>
    <g class="byte-eyes"><rect x="34" y="42" width="9" height="12" rx="3"/><rect x="57" y="42" width="9" height="12" rx="3"/></g>
    <path class="byte-mouth" d="M40 60 Q50 64 60 60" stroke-width="3" fill="none"/>
    <rect x="28" y="82" width="44" height="34" rx="8" fill="#b0bec5" stroke="#455a64" stroke-width="4"/><circle cx="50" cy="99" r="6" fill="#ffca28"/>
    <rect class="byte-arm l" x="10" y="86" width="14" height="6" rx="3" fill="#78909c"/><rect class="byte-arm r" x="76" y="86" width="14" height="6" rx="3" fill="#78909c"/></svg>`;

  // ============ 遊戲狀態 ============
  let G = null;
  const root = () => document.getElementById('esc');
  const solvedOf = () => G.practice ? G.local.solved : (G.state && G.state.solved) || {};
  const currentRoom = () => (ED.parts[G.part].rooms || []).find(r => !solvedOf()[r]) || null;
  const remaining = () => G.practice || !G.state || !G.state.start ? null : G.state.start + G.cfg.minutes * 60000 + (G.state.extend || 0) - (Date.now() + G.offset);
  const hintsLeft = () => G.practice ? '∞' : 5 - ((G.state && G.state.hints) || 0);
  const manualPages = () => {
    const rooms = ED.parts[G.part].rooms, cur = currentRoom(), out = [];
    for (const r of rooms) { if (ROOM[r] && ROOM[r].manual && !out.includes(ROOM[r].manual)) out.push(ROOM[r].manual); if (r === cur) break; }
    // 第二次測驗也可以翻第一次的說明書
    if (+G.part > 1) Object.keys(ED.manual).forEach(k => { if (!out.includes(k) && ED.rooms.some(x => x.manual === k && x.part < +G.part)) out.unshift(k); });
    return out;
  };
  const ctxBody = extra => Object.assign({ part: G.part, cid: S.cid, version: ED.version }, extra || {});

  let opening = false;
  async function openGame(part) {
    if (G || opening || root()) return;   // 不要重複開啟
    opening = true;
    let st;
    try { st = await api('/api/escape/status', { part, cid: S.cid }); } finally { opening = false; }
    if (st.version !== ED.version) { toast('測驗內容已經更新，請重新整理網頁（按 F5）', 5000); return; }
    G = { part: String(part), practice: st.practice, cfg: st.cfg, state: st.state, offset: st.now - Date.now(), hints: {}, local: { solved: {}, wrong: {} }, door: null, armed: 0, rank: st.rank || null };
    document.body.insertAdjacentHTML('beforeend', '<div id="esc" class="esc"></div>');
    document.body.classList.add('esc-open');
    Judge.start().catch(() => { });
    G.tick = setInterval(tick, 1000);
    if (!G.practice && G.state && G.state.end) return showEnd();
    if (!G.practice && G.state && G.state.start) { await enterExam(true); return; }
    showLobby();
  }
  function closeGame() {
    if (!G) return;
    clearInterval(G.tick); clearInterval(G.lockPoll); clearInterval(G.endPoll);
    unbindLeave();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    root() && root().remove();
    document.body.classList.remove('esc-open');
    G = null;
    if (typeof router === 'function') router();
  }

  function showLobby() {
    const p = ED.parts[G.part], c = G.cfg;
    root().innerHTML = `<div class="esc-lobby">${sceneSvg(ROOM[p.rooms[0]].scene)}<div class="esc-lobby-card">
      <div class="esc-tag">${G.practice ? '🎮 練習模式（不計分、不記錄）' : '🔐 正式測驗'}</div>
      <h1>${esc(p.name)}</h1><p>${esc(p.desc)}</p>
      <ul class="esc-rules">
        <li>共 ${p.rooms.length} 間房間，要照順序破解。每間有兩扇門：<b>左門是填空</b>、<b>右門是程式重組</b>，選一扇就好，隨時可以換。</li>
        <li>程式印出來的結果就是密碼，按「🔑 開門」由掃描機檢查。有輸入的房間會用好幾組資料測試。</li>
        <li>📖 <b>程式說明書</b>：每進一間房間會撿到一頁，隨時可以翻，不算提示。</li>
        <li>🃏 <b>提示卡</b>：${G.practice ? '練習模式不限張數' : '整場共 5 張，用了會被記錄'}。</li>
        ${G.practice ? '' : `<li>⏱ 時間 <b>${c.minutes} 分鐘</b>，從按下「開始」起算。</li>`}
        ${!G.practice && c.lock ? `<li>🖥 測驗會進入<b>全螢幕</b>。離開全螢幕、切換視窗或分頁都會被記錄${c.unlockBy === 'teacher' ? '，而且<b>要老師解鎖</b>才能繼續' : ''}${c.endAfter ? `；離開 <b>${c.endAfter} 次</b>測驗就會自動結束` : ''}。</li>` : ''}
        ${!G.practice ? '<li>🚫 測驗中不能貼上程式碼。</li>' : ''}
      </ul>
      <div class="esc-row"><button class="esc-btn ghost" id="escBack">← 回去</button><span class="esc-sp"></span>
        <span class="esc-cc" id="escCC"></span><button class="esc-btn go" id="escGo">${G.practice ? '開始練習' : '開始測驗'} ▶</button></div></div>
      <div class="esc-byte-lobby">${BYTE}</div></div>`;
    $('#escBack').onclick = closeGame;
    $('#escGo').onclick = () => enterExam(false);
    const off = Judge.onStatus(j => { const el = $('#escCC'); if (!el) return off(); const s = compilerStatusText(j); el.textContent = s.text; el.className = 'esc-cc ' + s.cls; });
  }

  async function enterExam(resume) {
    if (!G.practice) {
      if (G.cfg.lock) await document.documentElement.requestFullscreen().catch(() => { });
      if (!resume) { const r = await api('/api/escape/start', ctxBody()); G.state = r.state; G.offset = r.now - Date.now(); }
      bindLeave();
      if (G.state.locked) { G.away = true; showLock(); }
    }
    showRoom();
  }

  // ============ 離開畫面偵測 ============
  function bindLeave() {
    if (G.leaveBound) return;
    const leave = why => {
      if (!G || G.away || G.finished) return;
      G.away = true;
      if (G.cfg.lock) showLock();
      api('/api/escape/event', ctxBody({ type: 'leave', detail: why })).then(r => { if (!G) return; G.state = r.state; if (r.state && r.state.end) showEnd(); else if (G.cfg.lock) showLock(); }).catch(() => { });
    };
    const back = () => {
      if (!G || !G.away || G.cfg.lock) return;   // 沒有鎖畫面：回來時自動繼續
      G.away = false;
      api('/api/escape/event', ctxBody({ type: 'return' })).catch(() => { });
    };
    G.h = {
      vis: () => { if (document.hidden) leave('切換分頁或縮小視窗'); },
      blur: () => leave('切換到其他視窗'),
      fs: () => { if (G && G.cfg.lock && !document.fullscreenElement) leave('離開全螢幕'); },
      focus: back,
      ctx: e => e.preventDefault(),
    };
    document.addEventListener('visibilitychange', G.h.vis);
    window.addEventListener('blur', G.h.blur);
    window.addEventListener('focus', G.h.focus);
    document.addEventListener('fullscreenchange', G.h.fs);
    document.addEventListener('contextmenu', G.h.ctx);
    G.leaveBound = true;
  }
  function unbindLeave() {
    if (!G || !G.leaveBound) return;
    document.removeEventListener('visibilitychange', G.h.vis);
    window.removeEventListener('blur', G.h.blur);
    window.removeEventListener('focus', G.h.focus);
    document.removeEventListener('fullscreenchange', G.h.fs);
    document.removeEventListener('contextmenu', G.h.ctx);
    G.leaveBound = false;
  }
  function showLock() {
    let el = $('.esc-lock');
    if (!el) { root().insertAdjacentHTML('beforeend', '<div class="esc-lock"></div>'); el = $('.esc-lock'); }
    const st = G.state || {}, n = st.leaves || 0, waitTeacher = G.cfg.unlockBy === 'teacher' && st.locked;
    el.innerHTML = `<div class="esc-lock-card"><div class="esc-siren">🚨</div><h2>你離開了測驗畫面！</h2>
      <p>${esc(pick(ED.taunts.leave))}</p><p class="esc-muted">已經離開 ${n} 次${G.cfg.endAfter ? `，離開 ${G.cfg.endAfter} 次就會自動結束（還剩 ${Math.max(0, G.cfg.endAfter - n)} 次）` : ''}。這些紀錄老師都看得到。</p>
      ${waitTeacher ? '<p class="esc-wait">✋ 請舉手，等老師在看板上幫你解鎖……</p>' : '<button class="esc-btn go" id="escReturn">回到測驗</button>'}</div>`;
    clearInterval(G.lockPoll);
    if (waitTeacher) G.lockPoll = setInterval(async () => {
      try {
        const r = await api('/api/escape/status', ctxBody());
        G.state = r.state;
        if (r.state.end) { clearInterval(G.lockPoll); showEnd(); }
        else if (!r.state.locked) { clearInterval(G.lockPoll); showLock(); }
      } catch { }
    }, 4000);
    const b = $('#escReturn');
    if (b) b.onclick = async () => {
      await document.documentElement.requestFullscreen().catch(() => { });
      G.away = false;
      $('.esc-lock') && $('.esc-lock').remove();
      api('/api/escape/event', ctxBody({ type: 'return' })).catch(() => { });
    };
  }

  function tick() {
    if (!G) return;
    const t = $('#escTime'), left = remaining();
    if (t && left !== null) {
      t.textContent = '⏱ ' + mmss(left);
      t.classList.toggle('warn', left < 5 * 60000);
      root().classList.toggle('alarm', left < 5 * 60000 && left > 0);
      if (left <= 0 && !G.finished && !G.timeChecked) {
        G.timeChecked = true;
        api('/api/escape/status', ctxBody()).then(r => { G.state = r.state; if (r.state.end) showEnd(); else G.timeChecked = false; }).catch(() => { G.timeChecked = false; });
      }
    }
  }

  // ============ 房間 ============
  function hud() {
    const rooms = ED.parts[G.part].rooms, solved = solvedOf(), cur = currentRoom();
    return `<div class="esc-hud"><b class="esc-title">${esc(ED.parts[G.part].name)}</b>${G.practice ? '<span class="esc-tag sm">練習模式</span>' : ''}
      <span class="esc-dots">${rooms.map((r, i) => `<span class="${solved[r] ? 'ok' : r === cur ? 'cur' : ''}" title="${esc(ROOM[r].name)}">${solved[r] ? '✔' : i + 1}</span>`).join('')}</span>
      <span class="esc-sp"></span>
      ${G.practice ? '' : `<span class="esc-time" id="escTime">⏱ --:--</span>`}
      <span class="esc-cards" title="提示卡">🃏 × <b>${hintsLeft()}</b></span>
      <button class="esc-btn sm" id="escBook">📖 說明書</button>
      ${G.practice ? '<button class="esc-btn sm ghost" id="escQuit">離開</button>' : ''}</div>`;
  }
  function say(lines, mood) {
    const b = $('#escBubble'), bot = $('.esc-byte');
    if (!b) return;
    lines = [].concat(lines);
    let i = 0;
    const show = () => { b.innerHTML = esc(lines[i]) + (i < lines.length - 1 ? '<span class="esc-more">▼</span>' : ''); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); };
    show();
    b.onclick = () => { if (i < lines.length - 1) { i++; show(); } };
    if (bot) { bot.className = 'esc-byte ' + (mood || ''); }
  }
  function showRoom() {
    const rid = currentRoom();
    if (!rid) return showEnd();
    const room = ROOM[rid];
    const chosen = G.door && G.door.room === rid ? G.door.d : null;
    root().innerHTML = `${hud()}<div class="esc-main">
      <div class="esc-scene" id="escScene">${sceneSvg(room.scene)}
        <div class="esc-roomname">${esc(room.name)}</div>
        ${['A', 'B'].map(d => `<div class="esc-door ${d} ${chosen === d ? 'chosen' : ''}" data-door="${d}"><div class="esc-door-frame"><div class="esc-door-leaf"><span class="esc-knob"></span>
          <span class="esc-door-lbl">${doorName(d)}<br><small>${esc(room.doors[d].type === 'fill' ? '填空' : '程式重組')}</small></span></div></div></div>`).join('')}
        <div class="esc-byte">${BYTE}</div><div class="esc-bubble" id="escBubble"></div>
      </div>
      <div class="esc-panel" id="escPanel"></div></div>`;
    bindHud();
    $$('.esc-door').forEach(el => el.onclick = () => chooseDoor(el.dataset.door));
    if (chosen) { renderPuzzle(); say(pick(['繼續努力吧，我在看著喔。', '還沒解開啊？'])); }
    else {
      const page = ED.manual[room.manual];
      say(room.intro);
      $('#escPanel').innerHTML = `<div class="esc-intro"><h2>第 ${ED.parts[G.part].rooms.indexOf(rid) + 1} 關：${esc(room.name)}</h2>
        ${page ? `<div class="esc-pickup" id="escPickup">📖 你撿到了《C++ 說明書》<b>${esc(page.title)}</b><br><small>點這裡翻開來看</small></div>` : ''}
        <p>選一扇門：</p>
        <div class="esc-choose">${['A', 'B'].map(d => `<button class="esc-choice" data-door="${d}"><b>${doorName(d)}・${room.doors[d].type === 'fill' ? '填空' : '程式重組'}</b><span>${esc(room.doors[d].concept)}</span>
          <small>${room.doors[d].type === 'fill' ? '程式大部分寫好了，把空格補上' : '程式碼被打散了，把它們排好'}</small></button>`).join('')}</div></div>`;
      $$('.esc-choice').forEach(el => el.onclick = () => chooseDoor(el.dataset.door));
      if ($('#escPickup')) $('#escPickup').onclick = () => openBook(room.manual);
    }
    tick();
  }
  function bindHud() {
    $('#escBook').onclick = () => openBook();
    if ($('#escQuit')) $('#escQuit').onclick = closeGame;
  }
  function chooseDoor(d) {
    const rid = currentRoom();
    if (G.door && G.door.room === rid && G.door.d === d) return;
    G.door = { room: rid, d, picked: null };
    if (!G.practice) api('/api/escape/event', ctxBody({ type: 'door', door: d })).catch(() => { });
    $$('.esc-door').forEach(el => el.classList.toggle('chosen', el.dataset.door === d));
    say(d === 'A' ? pick(['填空啊，看起來簡單，你可別填錯。', '左門？空格不多，但每一格都很重要喔。']) : pick(['重組？程式的順序可是很重要的。', '右門！一行一行排好，多出來的那一行是陷阱喔。']));
    renderPuzzle();
    if (!G.practice) peekHints();
  }
  const curVariant = () => { const room = ROOM[G.door.room], door = room.doors[G.door.d]; return { room, door, v: door.variants[variantOf(S.user.email, room.id, G.door.d)] }; };
  const hintKey = () => G.door.room + G.door.d;
  async function peekHints() {
    const k = hintKey();
    if (G.hints[k]) return;
    try { const r = await api('/api/escape/hint', ctxBody({ room: G.door.room, door: G.door.d, peek: true })); if (r.hints.length) { G.hints[k] = r.hints; renderHints(); } } catch { }
  }

  // ============ 題目 ============
  function renderPuzzle() {
    const { room, door, v } = curVariant();
    const other = G.door.d === 'A' ? 'B' : 'A';
    $('#escPanel').innerHTML = `<div class="esc-pz">
      <div class="esc-pz-head"><h2>${esc(room.name)}・${doorName(G.door.d)}（${door.type === 'fill' ? '填空' : '程式重組'}）</h2><span class="esc-sp"></span>
        <button class="esc-btn sm ghost" id="escSwitch">換${doorName(other)}</button></div>
      <div class="esc-story">${esc(v.story)}</div>
      <div class="esc-task"><div class="esc-task-h">🎯 你要做什麼</div><ol>${(v.task || []).map(t => `<li>${esc(t)}</li>`).join('')}
        <li class="esc-muted">寫好後按「▶ 執行看看」，${v.samples.length ? '確認輸出和「範例輸出」一模一樣' : '確認輸出正確'}，再按「🔑 開門」。</li></ol></div>
      ${v.screen ? `<div class="esc-screen"><div class="esc-screen-h">🖥 目標畫面（輸出要和這個一模一樣）</div><pre>${esc(v.screen)}</pre></div>` : ''}
      ${v.example ? `<div class="esc-example"><div class="esc-screen-h">💡 計算範例</div><pre>${esc(v.example)}</pre></div>` : ''}
      ${v.samples.length ? `<div class="esc-samples">${v.samples.map((s, i) => `<div class="esc-sample"><div class="esc-screen-h">📟 範例 ${i + 1}</div>
        <div class="esc-io"><div><small>範例輸入（掃描機送來的資料）</small><pre>${esc(s.input)}</pre></div><div class="arrow">→</div><div><small>範例輸出（程式要印出）</small><pre class="o">${esc(s.output)}</pre></div></div></div>`).join('')}
        <div class="esc-muted small">按「▶ 執行看看」會用範例 1 的資料執行；開門時會用 ${v.inputs.length} 組資料檢查${v.inputs.length > v.samples.length ? `（其中 ${v.inputs.length - v.samples.length} 組你看不到，答案不能寫死）` : ''}。</div></div>` : ''}
      <div id="escEditor" class="esc-editor"></div>
      <div class="esc-row"><button class="esc-btn" id="escRun">▶ 執行看看</button><button class="esc-btn go" id="escOpen">🔑 開門</button><span class="esc-sp"></span>
        <button class="esc-btn hint" id="escHint">🃏 用提示卡</button></div>
      <div id="escOut" class="esc-out"></div>
      <div id="escHints" class="esc-hints"></div></div>`;
    $('#escSwitch').onclick = () => chooseDoor(other);
    if (door.type === 'fill') mountFill(v); else mountOrder(v);
    $('#escRun').onclick = () => runAll(false);
    $('#escOpen').onclick = () => runAll(true);
    $('#escHint').onclick = useHint;
    renderHints();
  }
  // 填空：只有空格可以改
  function mountFill(v) {
    const parts = v.tpl.split('⟦⟧');
    let text = '';
    const blanks = [];
    parts.forEach((p, i) => {
      text += p;
      if (i < parts.length - 1) { const pad = ' '.repeat(v.widths[i] || 6); blanks.push([text.length, text.length + pad.length]); text += pad; }
    });
    const saved = G.door.fill;
    const cm = CodeMirror($('#escEditor'), { value: text, mode: 'text/x-c++src', lineNumbers: true, indentUnit: 4, matchBrackets: true, viewportMargin: Infinity });
    const pos = i => cm.posFromIndex(i);
    let last = 0;
    const marks = [];
    blanks.forEach(([a, b]) => {
      if (a > last) cm.markText(pos(last), pos(a), { readOnly: true, inclusiveLeft: last === 0, inclusiveRight: false, className: 'esc-ro' });
      marks.push(cm.markText(pos(a), pos(b), { className: 'esc-blank', inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false }));
      last = b;
    });
    if (last < text.length) cm.markText(pos(last), pos(text.length), { readOnly: true, inclusiveLeft: false, inclusiveRight: true, className: 'esc-ro' });
    if (saved) saved.forEach((s, i) => { const r = marks[i] && marks[i].find(); if (r) cm.replaceRange(s, r.from, r.to); });
    const jump = dir => {
      const c = cm.indexFromPos(cm.getCursor());
      const list = marks.map(m => m.find()).filter(Boolean).map(r => cm.indexFromPos(r.from));
      const next = dir > 0 ? list.find(x => x > c) ?? list[0] : [...list].reverse().find(x => x < c) ?? list[list.length - 1];
      if (next !== undefined) { cm.setCursor(pos(next)); cm.focus(); }
    };
    cm.setOption('extraKeys', { Tab: () => jump(1), 'Shift-Tab': () => jump(-1) });
    blockPaste(cm);
    cm.on('change', () => { G.door.fill = marks.map(m => { const r = m.find(); return r ? cm.getRange(r.from, r.to) : ''; }); });
    G.getCode = () => cm.getValue();
    G.cm = cm;
    setTimeout(() => { cm.refresh(); const r = marks[0] && marks[0].find(); if (r) { cm.setCursor(r.from); cm.focus(); } }, 0);
    $('#escEditor').insertAdjacentHTML('beforeend', '<div class="esc-tip">黃色的格子才可以輸入。按 Tab 跳到下一格。</div>');
  }
  function blockPaste(cm) {
    if (G.practice) return;
    cm.on('beforeChange', (_, ch) => { if (ch.origin === 'paste' || ch.origin === 'drop') { ch.cancel(); toast('測驗中不能貼上程式碼，請自己打 ✍'); } });
  }
  // 程式重組：點卡片加到程式裡，點程式裡的行拿回來
  function mountOrder(v) {
    if (!G.door.picked) G.door.picked = [];
    const draw = () => {
      const picked = G.door.picked;
      const head = v.head.split('\n'), tail = v.tail.split('\n');
      let n = 0;
      const ln = () => `<span class="esc-ln">${++n}</span>`;
      $('#escEditor').innerHTML = `<div class="esc-ord">
        <div class="esc-pool"><div class="esc-screen-h">程式碼卡片（點一下放進程式，有一張是多餘的）</div>
          ${v.cards.map((c, i) => picked.includes(i) ? '' : `<button class="esc-card" data-i="${i}"><code>${esc(c.trim())}</code></button>`).join('') || '<div class="esc-muted small">卡片都用完了</div>'}</div>
        <div class="esc-code"><div class="esc-screen-h">你的程式（點一行可以拿回去，⬆⬇ 可以調整順序）</div><pre>${head.map(l => `<div class="fixed">${ln()}${esc(l)}</div>`).join('')}${picked.map((ci, k) => `<div class="mine" data-k="${k}">${ln()}<span class="t">${esc(v.cards[ci])}</span>
          <span class="mv"><a data-up="${k}">⬆</a><a data-dn="${k}">⬇</a></span></div>`).join('')}${picked.length < v.need ? `<div class="slot">${ln()}    ← 還要再放 ${v.need - picked.length} 行</div>` : ''}${tail.map(l => `<div class="fixed">${ln()}${esc(l)}</div>`).join('')}</pre></div></div>`;
      $$('.esc-card').forEach(b => b.onclick = () => { picked.push(+b.dataset.i); draw(); });
      $$('.esc-code .mine .t').forEach(el => el.onclick = () => { picked.splice(+el.parentElement.dataset.k, 1); draw(); });
      $$('[data-up]').forEach(a => a.onclick = e => { e.stopPropagation(); const k = +a.dataset.up; if (k > 0) [picked[k - 1], picked[k]] = [picked[k], picked[k - 1]]; draw(); });
      $$('[data-dn]').forEach(a => a.onclick = e => { e.stopPropagation(); const k = +a.dataset.dn; if (k < picked.length - 1) [picked[k + 1], picked[k]] = [picked[k], picked[k + 1]]; draw(); });
    };
    draw();
    G.getCode = () => [v.head, ...G.door.picked.map(i => v.cards[i]), v.tail].join('\n');
    G.cm = null;
  }

  // ============ 執行與開門 ============
  async function runAll(check) {
    const { v } = curVariant();
    const out = $('#escOut'), btns = [$('#escRun'), $('#escOpen')];
    if (G.busy) return;
    G.busy = true; btns.forEach(b => b.disabled = true);
    out.innerHTML = '<div class="esc-term">編譯中…</div>';
    try {
      const code = G.getCode();
      const c = await Judge.compile(code);
      if (!c.success) {
        out.innerHTML = `<div class="esc-term bad">✘ 編譯失敗</div>${diagHtml(c.diags)}`;
        if (G.cm) markErrors(G.cm, c.diags);
        if (check) await sendCheck({ compileError: true });
        return;
      }
      if (G.cm) markErrors(G.cm, []);
      const runs = check ? v.inputs : [v.inputs[0]];
      const res = [];
      for (const inp of runs) res.push(await Judge.run(c.module, inp, 2000));
      const r0 = res[0];
      const bad = res.find(r => r.status !== 'OK');
      const want = v.samples[0] ? v.samples[0].output : v.screen || '';
      const same = want && normalize(r0.stdout) === normalize(want);
      out.innerHTML = `<div class="esc-term ${bad ? 'bad' : ''}"><div class="esc-screen-h">你的程式輸出${v.inputs[0] ? '（用範例 1 的資料）' : ''}</div><pre>${esc(r0.stdout) || '<span class="esc-muted">（沒有輸出）</span>'}</pre>
        ${bad ? `<div>⚠ ${esc(bad.status === 'TLE' ? '執行太久（可能是無窮迴圈）' : friendlyRE(bad))}</div>` : want && !check ? `<div class="${same ? 'esc-same' : 'esc-diff'}">${same ? '✔ 和範例輸出一樣，可以按「🔑 開門」試試看！' : '✘ 和範例輸出不一樣，仔細比對每一個字和空白'}</div>` : ''}</div>`;
      if (check) await sendCheck({ hashes: await Promise.all(res.map(r => r.status === 'OK' ? sha(r.stdout) : '')), empty: !String(r0.stdout || '').trim() });
    } catch (e) { out.innerHTML = `<div class="esc-term bad">${esc(e.message)}</div>`; }
    finally { G.busy = false; btns.forEach(b => b && (b.disabled = false)); }
  }
  async function sendCheck(x) {
    const room = G.door.room, d = G.door.d;
    const r = await api('/api/escape/check', ctxBody({ room, door: d, hashes: x.hashes, compileError: !!x.compileError }));
    if (!G.practice) { G.state = r.state; if (r.rank) G.rank = r.rank; }
    if (r.ok) return onPass(room, d);
    if (G.practice) G.local.wrong[room] = (G.local.wrong[room] || 0) + 1;
    const n = G.practice ? G.local.wrong[room] : r.wrongs;
    const T = ED.taunts;
    let line = r.kind === 'ce' ? pick(T.ce) : x.empty ? pick(T.empty) : r.kind === 'hidden' ? pick(T.hidden) : pick(T.wrong);
    if (n >= 3 && n % 3 === 0) line = pick(T.streak).replace('{n}', n);
    say(line, 'angry');
    const sc = $('#escScene'); sc.classList.remove('shake'); void sc.offsetWidth; sc.classList.add('shake');
    $('#escOut').insertAdjacentHTML('afterbegin', `<div class="esc-nope">✘ 門沒有開${r.kind === 'hidden' ? '：範例資料對了，但其他資料不對' : ''}（這間錯了 ${n} 次）</div>`);
    if (!G.practice && r.state && r.state.end) setTimeout(showEnd, 1500);
  }
  function onPass(room, d) {
    if (G.practice) G.local.solved[room] = { door: d, t: Date.now() };
    $(`.esc-door.${d}`) && $(`.esc-door.${d}`).classList.add('open');
    say(pick(ED.taunts.pass), 'happy');
    $('#escPanel').insertAdjacentHTML('afterbegin', '<div class="esc-yay">🔓 門打開了！</div>');
    G.door = null;
    G.cm = null;
    setTimeout(() => { if (G) showRoom(); }, 2200);
  }

  // ============ 提示卡 ============
  async function useHint() {
    const { door } = curVariant(), k = hintKey(), b = $('#escHint');
    const shown = (G.hints[k] || []).length;
    if (shown >= 3) { toast('這扇門的提示已經全部給你了'); return; }
    if (!G.practice && hintsLeft() <= 0) { toast('提示卡已經用完了'); return; }
    if (!G.practice && Date.now() - G.armed > 3000) { G.armed = Date.now(); b.textContent = '再按一次確認（會用掉 1 張）'; setTimeout(() => { if ($('#escHint')) $('#escHint').textContent = '🃏 用提示卡'; }, 3000); return; }
    G.armed = 0;
    try {
      const r = await api('/api/escape/hint', ctxBody({ room: G.door.room, door: G.door.d, level: shown }));
      if (!G.practice) G.state = r.state;
      G.hints[k] = r.hints;
      renderHints();
      say(pick(ED.taunts.hint));
      $('.esc-cards b') && ($('.esc-cards b').textContent = hintsLeft());
      b.textContent = '🃏 用提示卡';
    } catch (e) { toast(e.message); }
    void door;
  }
  function renderHints() {
    const el = $('#escHints'); if (!el || !G.door) return;
    const list = G.hints[hintKey()] || [];
    el.innerHTML = list.map((h, i) => `<div class="esc-hint"><b>🃏 提示 ${i + 1}</b> ${esc(h)}</div>`).join('');
  }

  // ============ 說明書 ============
  function openBook(focus) {
    const pages = manualPages();
    if (!pages.length) { toast('你還沒有撿到說明書'); return; }
    let cur = focus && pages.includes(focus) ? focus : pages[pages.length - 1];
    root().insertAdjacentHTML('beforeend', '<div class="esc-modal" id="escBookM"><div class="esc-book"></div></div>');
    const draw = () => {
      $('.esc-book').innerHTML = `<div class="esc-book-tabs">${pages.map(k => `<button class="${k === cur ? 'on' : ''}" data-p="${k}">${esc(ED.manual[k].title.split('　')[0])}</button>`).join('')}<span class="esc-sp"></span><button class="esc-x" id="escBookX">✕</button></div>
        <div class="esc-book-page"><h2>📖 ${esc(ED.manual[cur].title)}</h2>${renderLesson(ED.manual[cur].text)}</div>`;
      $$('.esc-book-tabs [data-p]').forEach(b => b.onclick = () => { cur = b.dataset.p; draw(); });
      $('#escBookX').onclick = () => $('#escBookM').remove();
    };
    draw();
    $('#escBookM').onclick = e => { if (e.target.id === 'escBookM') e.target.remove(); };
  }

  // ============ 結束 ============
  function showEnd() {
    if (!G) return;
    G.finished = true;
    clearInterval(G.lockPoll);
    const st = G.practice ? { start: 0, solved: G.local.solved } : G.state || {};
    const rooms = ED.parts[G.part].rooms, solved = st.solved || {}, n = rooms.filter(r => solved[r]).length;
    const done = n === rooms.length;
    const reason = { done: '', time: '⏰ 時間到了！', leave: '🚨 離開畫面太多次，測驗自動結束。', teacher: '老師結束了你的測驗。' }[st.endReason || (done ? 'done' : '')] || '';
    const used = st.start && st.end ? st.end - st.start : 0;
    const wrong = Object.values(G.practice ? G.local.wrong : st.wrong || {}).reduce((a, b) => a + b, 0);
    root().innerHTML = `<div class="esc-lobby">${sceneSvg(done ? 'exit' : ROOM[rooms[0]].scene)}<div class="esc-lobby-card end">
      <h1>${done ? '🎉 你逃出校園了！' : '測驗結束'}</h1>${reason ? `<p class="esc-reason">${esc(reason)}</p>` : ''}
      <div class="esc-stats"><div><b>${n} / ${rooms.length}</b><span>破解的房間</span></div>${used ? `<div><b>${mmss(used)}</b><span>花費時間</span></div>` : ''}
        <div><b>${wrong}</b><span>答錯次數</span></div>${G.practice ? '' : `<div><b>${st.hints || 0}</b><span>用掉的提示卡</span></div><div><b>${st.leaves || 0}</b><span>離開畫面</span></div>`}</div>
      <ol class="esc-route">${rooms.map(r => `<li class="${solved[r] ? 'ok' : ''}">${esc(ROOM[r].name)}${solved[r] ? `：${doorName(solved[r].door)}${st.start ? `，第 ${mmss(solved[r].t - st.start)} 破解` : ''}` : '（未破解）'}</li>`).join('')}</ol>
      ${done && !G.practice ? `<div class="esc-rank">🏅 你是全班第 <b>${G.rank && G.rank.rank ? G.rank.rank : '?'}</b> 名逃出的！<small>（依花費時間排名，目前全班 ${G.rank ? G.rank.done : '?'} 人逃出）</small></div>` : ''}
      <p class="esc-byte-say">BYTE：「${esc(done ? '……好吧，我承認你很厲害。下次可沒這麼容易！' : '哈哈，這次你出不去了！回去多翻翻說明書吧。')}」</p>
      <div class="esc-row"><span class="esc-sp"></span><button class="esc-btn go" id="escDone">離開</button></div></div>
      <div class="esc-byte-lobby ${done ? 'happy' : ''}">${BYTE}</div></div>`;
    $('#escDone').onclick = closeGame;
    if (done && !G.practice && !G.rankTried) {   // 名次會隨著其他同學逃出而改變，結束畫面再問一次
      G.rankTried = true;
      api('/api/escape/status', ctxBody()).then(r => { if (G && r.rank) { G.rank = r.rank; showEnd(); } }).catch(() => { });
    }
    // 還沒逃出：老師可能會加時或讓你繼續，每 5 秒問一次
    clearInterval(G.endPoll);
    if (!done && !G.practice) G.endPoll = setInterval(() => {
      api('/api/escape/status', ctxBody()).then(r => {
        if (!G || !r.state || r.state.end) return;
        clearInterval(G.endPoll);
        G.state = r.state; G.cfg = r.cfg; G.offset = r.now - Date.now();
        const card = $('.esc-lobby-card.end');
        if (!card) return;
        card.insertAdjacentHTML('afterbegin', `<div class="esc-rank">⏰ 老師讓你繼續作答了！<br><button class="esc-btn go" id="escResume" style="margin-top:8px">繼續作答 ▶</button></div>`);
        $('#escResume').onclick = () => { G.finished = false; G.timeChecked = false; G.away = false; enterExam(true); };
      }).catch(() => { });
    }, 5000);
    unbindLeave();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  }

  // ============ 網站頁面：學生（選擇測驗）與老師（設定與看板） ============
  async function viewEscape() {
    if (isTeacher()) return viewEscapeTeacher();
    const cfg = (S.klass && S.klass.escape) || {};
    const parts = Object.keys(ED.parts).filter(p => cfg[p] && (cfg[p].open || cfg[p].practice) && ED.parts[p].rooms.length);
    const wait = p => cfg[p].open && cfg[p].openAt > Date.now();
    app().innerHTML = `<div class="card"><h2 style="margin-top:0">🔐 C++ 校園密室逃脫</h2>
      ${parts.length ? '' : '<p class="muted">目前沒有開放的測驗。老師開放後，按右上角 🔄 就會出現。</p>'}
      <div class="esc-list">${parts.map(p => `<div class="esc-item"><div><b>${esc(ED.parts[p].name)}</b><div class="muted small">${esc(ED.parts[p].desc)}</div>
        <div class="small" id="escSt${p}">${wait(p) ? `⏳ 將於 <b>${twFmt(cfg[p].openAt)}</b>（台灣時間）開放` : ''}</div></div><button class="btn primary" data-part="${p}" ${wait(p) && !cfg[p].practice ? 'disabled' : ''}>${wait(p) ? (cfg[p].practice ? '🎮 練習模式' : '⏳ 還沒開放') : cfg[p].open ? '進入測驗' : '🎮 練習模式'}</button></div>`).join('')}</div></div>`;
    // 排定的時間到了就重新顯示（不用學生自己重新整理）
    const next = parts.filter(wait).map(p => cfg[p].openAt).sort((a, b) => a - b)[0];
    if (next) pageTimers.push(setInterval(() => { if (Date.now() >= next) { clearPageTimers(); setTimeout(router, Math.random() * 2500); } }, 1000));
    $$('[data-part]').forEach(b => b.onclick = () => openGame(b.dataset.part).catch(e => toast(e.message)));
    for (const p of parts) if (cfg[p].open && !wait(p)) api('/api/escape/status', { part: p, cid: S.cid }).then(r => {
      const st = r.state, el = $('#escSt' + p); if (!el) return;
      el.textContent = !st || !st.start ? '尚未開始' : st.end ? `已結束：破解 ${Object.keys(st.solved || {}).length} 間${r.rank ? `，🏅 全班第 ${r.rank.rank} 名逃出（共 ${r.rank.done} 人逃出）` : ''}` : `作答中：已破解 ${Object.keys(st.solved || {}).length} 間`;
    }).catch(() => { });
  }

  async function viewEscapeTeacher() {
    if (!teacherClasses().length) { app().innerHTML = '<div class="card"><h2>🔐 密室測驗</h2><p>你還沒有班級，請先到 <a href="#/classes">班級管理</a> 建立班級。</p></div>'; return; }
    let cid = teacherCid(), part = store.get('cj-esc-part') || '1', showLog = false, data = null;
    const partKeys = Object.keys(ED.parts).filter(p => ED.parts[p].rooms.length);
    if (!partKeys.includes(part)) part = partKeys[0];
    app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">🔐 C++ 校園密室逃脫</h2><span class="spacer"></span>
        ${classSelect('escCls', cid)}<select id="escPart">${partKeys.map(p => `<option value="${p}" ${p === part ? 'selected' : ''}>${esc(ED.parts[p].name)}</option>`).join('')}</select>
        <button class="btn" id="escTry">🎮 試玩（練習模式）</button></div>
      <div id="escCfg" class="esc-cfg"></div></div>
      <div class="card"><div class="row"><h3 style="margin:0">即時狀況</h3><span class="muted small" id="escUpd"></span><span class="spacer"></span>
        <span class="small">⏰ 全班加時 <input type="number" id="escAddMin" min="1" max="120" value="10" style="width:52px"> 分鐘</span><button class="btn sm primary" id="escAddAll">加時</button>
        <label class="small"><input type="checkbox" id="escLogT"> 📜 顯示事件紀錄</label><button class="btn sm" id="escCsv">⬇ 下載 CSV</button></div>
        <div id="escBoard"><div class="loading">載入中…</div></div><div id="escLog"></div></div>`;
    $('#escTry').onclick = () => { store.set('cj-esc-part', part); openGame(part).catch(e => toast(e.message)); };
    $('#escCls').onchange = e => { cid = e.target.value; store.set('cj-tcid', cid); data = null; load(); };
    $('#escPart').onchange = e => { part = e.target.value; store.set('cj-esc-part', part); data = null; load(); };
    $('#escLogT').onchange = e => { showLog = e.target.checked; load(); };
    $('#escAddAll').onclick = async () => {
      const min = Math.max(1, Math.min(120, +$('#escAddMin').value || 10));
      if (!confirm(`讓還沒逃出的同學再多 ${min} 分鐘？\n（作答中的：剩下的時間 + ${min} 分鐘；時間到的：從現在起 ${min} 分鐘）\n已逃出、離開畫面太多次、被老師結束的不會改變（那些可以個別按「繼續」）。`)) return;
      try { const r = await api('/api/escape/manage', { cid, part, action: 'extendAll', minutes: min }); toast(`已經幫 ${r.count} 位同學加時 ${r.minutes} 分鐘`); load(); } catch (e) { toast(e.message); }
    };
    $('#escCsv').onclick = async () => {
      const d = await apiGet('/api/escape/board', { cid, part, log: 1 });
      const rooms = d.rooms;
      const rows = [['座號', '姓名', 'Email', '狀態', '開始時間', '結束時間', '花費時間', ...rooms.flatMap(r => [`${ROOM[r].name} 門`, `${ROOM[r].name} 破解時間`, `${ROOM[r].name} 答錯`]), '破解順序', '逃出名次', '提示卡', '離開畫面次數']];
      const fin = d.students.filter(s => s.state && s.state.end && s.state.endReason === 'done').sort((a, b) => (a.state.end - a.state.start) - (b.state.end - b.state.start) || a.state.end - b.state.end).map(s => s.seat);
      d.students.forEach(s => {
        const st = s.state || {};
        rows.push([s.seat, s.name, s.email, statusText(st), st.start ? fmtTime(st.start) : '', st.end ? fmtTime(st.end) : '', st.start && st.end ? mmss(st.end - st.start) : '',
          ...rooms.flatMap(r => { const x = (st.solved || {})[r]; return [x ? doorName(x.door) : '', x ? mmss(x.t - st.start) : '', (st.wrong || {})[r] || 0]; }),
          (st.order || []).map(r => ROOM[r].name).join(' → '), fin.indexOf(s.seat) + 1 || '', st.hints || 0, st.leaves || 0]);
      });
      rows.push([], ['事件紀錄'], ['時間', '座號', '姓名', '事件', '房間', '門', '說明']);
      d.log.forEach(l => rows.push([fmtTime(l.time), l.seat, l.name, EV[l.type] || l.type, l.room ? ROOM[l.room].name : '', l.door ? doorName(l.door) : '', l.detail]));
      downloadCsv(rows, `密室測驗_${(teacherClasses().find(c => c.id === cid) || {}).name}_${ED.parts[part].name}.csv`);
    };
    const EV = { start: '開始', door: '選門', pass: '破解', wrong: '答錯', hint: '提示卡', leave: '離開畫面', return: '回到畫面', unlock: '老師解鎖', end: '結束', resume: '繼續作答', reset: '重新開始' };
    const statusText = st => !st || !st.start ? '未開始' : st.end ? ({ done: '✔ 逃出', time: '⏰ 時間到', leave: '🚨 離開過多', teacher: '老師結束' }[st.endReason] || '結束') : st.locked ? '🔒 鎖定中' : '作答中';
    const drawCfg = () => {
      const c = data.cfg;
      $('#escCfg').innerHTML = `<div class="esc-cfg-grid">
        <label class="big"><input type="checkbox" data-c="open" ${c.open ? 'checked' : ''}> <b>開放正式測驗</b></label>
        <label class="big"><input type="checkbox" data-c="practice" ${c.practice ? 'checked' : ''}> <b>開放練習模式</b>（不計分，測驗結束後再開）</label>
        <label>⏰ 開放時間（台灣時間）<input type="datetime-local" data-c="openAt" value="${twInput(c.openAt)}"> <span class="muted small">空白＝勾了就立刻開放</span></label>
        <label>時間 <input type="number" data-c="minutes" min="5" max="180" value="${c.minutes}" style="width:64px"> 分鐘</label>
        <label><input type="checkbox" data-c="lock" ${c.lock ? 'checked' : ''}> 🖥 鎖畫面（全螢幕；離開會鎖住）</label>
        <label>離開後：<select data-c="unlockBy" ${c.lock ? '' : 'disabled'}><option value="self" ${c.unlockBy === 'self' ? 'selected' : ''}>學生自己按「回到測驗」</option><option value="teacher" ${c.unlockBy === 'teacher' ? 'selected' : ''}>要老師解鎖</option></select></label>
        <label>離開 <input type="number" data-c="endAfter" min="0" max="20" value="${c.endAfter}" style="width:56px"> 次自動結束（0 = 不會）</label></div>
        <div class="row" style="margin-top:8px"><span class="muted small">不管有沒有鎖畫面，離開畫面的次數都會記錄。正式測驗和練習模式同時開放時，以正式測驗為準。</span><span class="spacer"></span><button class="btn primary" id="escSave">儲存設定</button></div>`;
      $('[data-c="lock"]').onchange = e => { $('[data-c="unlockBy"]').disabled = !e.target.checked; };
      $('#escSave').onclick = async () => {
        const cls = teacherClasses().find(x => x.id === cid) || {};
        const all = Object.assign({}, cls.escape || {});
        const g = k => $(`[data-c="${k}"]`);
        const at = twParse(g('openAt').value);
        if (g('openAt').value && at <= Date.now() && g('open').checked && !(c.openAt && at === c.openAt)) { toast('開放時間已經過了，請重新選（或清空＝立刻開放）', 4000); return; }
        all[part] = { openAt: at || 0, open: g('open').checked, practice: g('practice').checked, lock: g('lock').checked, unlockBy: g('unlockBy').value, endAfter: +g('endAfter').value || 0, minutes: +g('minutes').value || 45 };
        try {
          const r = await api('/api/class/update', { cid, escape: all });
          const k = S.classes.findIndex(x => x.id === cid); if (k >= 0) S.classes[k] = r.cls; saveState();
          toast(all[part].open ? (at > Date.now() ? `已排定：${twFmt(at)}（台灣時間）開放` : '已開放測驗，學生按 🔄 或重新整理就會看到') : '已儲存'); data = null; load();
        } catch (e) { toast(e.message); }
      };
    };
    async function load() {
      try {
        const first = !data;
        data = await apiGet('/api/escape/board', { cid, part, log: showLog ? 1 : '' });
        if (first) drawCfg();
        const rooms = data.rooms, now = data.now;
        $('#escUpd').textContent = '更新於 ' + fmtTime(Date.now(), true) + '（每 10 秒）';
        const started = data.students.filter(s => s.state && s.state.start), done = started.filter(s => s.state.end && s.state.endReason === 'done');
        const rankOf = {};   // 逃出名次：依花費時間（和學生看到的一樣）
        done.slice().sort((a, b) => (a.state.end - a.state.start) - (b.state.end - b.state.start) || a.state.end - b.state.end).forEach((s, i) => rankOf[s.seat] = i + 1);
        $('#escBoard').innerHTML = `<div class="esc-sum">開始 ${started.length} / ${data.students.length} 人・逃出 ${done.length} 人・🔒 鎖定 ${started.filter(s => s.state.locked && !s.state.end).length} 人</div>
          <div class="table-wrap"><table class="list esc-board"><thead><tr><th>座號</th><th>姓名</th><th>狀態</th>${rooms.map((r, i) => `<th>${i + 1}. ${esc(ROOM[r].name)}</th>`).join('')}<th>用時</th><th>名次</th><th>🃏</th><th>離開</th><th></th></tr></thead><tbody>
          ${data.students.map(s => {
            const st = s.state || {}, cur = st.start && !st.end ? rooms.find(r => !(st.solved || {})[r]) : null;
            return `<tr class="${st.locked && !st.end ? 'locked' : ''}"><td>${seat2(s.seat)}</td><td>${esc(s.name)}</td><td>${statusText(st)}</td>
              ${rooms.map(r => { const x = (st.solved || {})[r], w = (st.wrong || {})[r] || 0;
                return `<td class="${x ? 'ok' : r === cur ? 'cur' : ''}">${x ? `✔ ${mmss(x.t - st.start)}<br><small>${doorName(x.door)}${w ? `・錯 ${w}` : ''}</small>` : r === cur ? `⋯ 作答中${w ? `<br><small>錯 ${w} 次</small>` : ''}` : ''}</td>`; }).join('')}
              <td>${st.start ? mmss((st.end || now) - st.start) : ''}</td><td>${rankOf[s.seat] ? (rankOf[s.seat] <= 3 ? ['🥇', '🥈', '🥉'][rankOf[s.seat] - 1] : '') + rankOf[s.seat] : ''}</td><td>${st.hints || ''}</td><td class="${st.leaves ? 'warnc' : ''}">${st.leaves ? '⚠ ' + st.leaves : ''}</td>
              <td class="esc-acts">${st.start ? `${st.locked && !st.end ? `<button class="btn sm primary" data-act="unlock" data-seat="${s.seat}">解鎖</button>` : ''}
                ${st.end ? `<button class="btn sm" data-act="resume" data-seat="${s.seat}">繼續</button>` : `<button class="btn sm" data-act="end" data-seat="${s.seat}">結束</button>`}
                <button class="btn sm danger" data-act="reset" data-seat="${s.seat}">重來</button>` : ''}</td></tr>`;
          }).join('')}</tbody></table></div>`;
        $$('[data-act]').forEach(b => b.onclick = async () => {
          const act = b.dataset.act;
          if (act === 'reset' && !confirm('確定要讓這位學生重新開始嗎？之前的作答進度會清除（事件紀錄會保留）。')) return;
          try { await api('/api/escape/manage', { cid, part, seat: +b.dataset.seat, action: act }); toast('完成'); load(); } catch (e) { toast(e.message); }
        });
        $('#escLog').innerHTML = showLog ? `<h4>事件紀錄（${data.log.length} 筆）</h4><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="list"><tbody>
          ${data.log.slice().reverse().map(l => `<tr class="ev-${l.type}"><td class="small">${fmtTime(l.time, true)}</td><td>${seat2(l.seat)} ${esc(l.name)}</td><td>${EV[l.type] || esc(l.type)}</td>
            <td>${l.room ? esc(ROOM[l.room] ? ROOM[l.room].name : l.room) : ''}${l.door ? '・' + doorName(l.door) : ''}</td><td class="small">${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div>` : '';
      } catch (e) { $('#escBoard').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    }
    load();
    pageTimers.push(setInterval(() => { if (!G && location.hash.startsWith('#/escape')) load(); }, 10000));
  }

  window.CJ_VIEWS = Object.assign(window.CJ_VIEWS || {}, { escape: viewEscape });
})();
