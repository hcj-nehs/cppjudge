/* 嘉科程式知識王：全班即時問答遊戲
 *   #/quiz           老師：開新的一場、場次紀錄、題庫；學生：加入遊戲作答
 *   #/quizhost/<id>  投影畫面（碼哥主持，會自動公布答案）
 *   #/quizctl/<id>   控制台（可以開在手機或另一個分頁：改暱稱、按住 👁 看真實姓名）
 *   #/quizgrades     知識王成績（和解題成績分開）
 * 使用 app.js 的共用工具：$、$$、esc、api、apiGet、S、toast、isTeacher、teacherClasses、teacherCid、store、fmtTime、seat2、downloadCsv、app */
'use strict';
(function () {
  const COLORS = [['#e21b3c', '▲'], ['#1368ce', '◆'], ['#d89e00', '●'], ['#26890c', '■']];
  const TF = [['#1368ce', '⭕ 對'], ['#e21b3c', '❌ 錯']];
  const EMOJIS = ['😂', '😮', '👍', '🔥', '😭', '🤯'];
  const GRACE = 3000;
  const pick = a => a && a.length ? a[Math.floor(Math.random() * a.length)] : '';
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ============ 碼哥（原創主持人：打領結、拿麥克風的小公雞） ============
  const MAGE = `<svg viewBox="0 0 160 190" class="mage-svg">
    <g class="mage-body">
      <path class="mage-comb" d="M62 34 q-4 -22 12 -16 q4 -16 16 -6 q10 -12 16 4 q8 8 -4 18 z"/>
      <ellipse cx="80" cy="70" rx="42" ry="40" fill="#fff6dc" stroke="#c9a24a" stroke-width="3"/>
      <ellipse cx="80" cy="140" rx="50" ry="42" fill="#ffe9a8" stroke="#c9a24a" stroke-width="3"/>
      <path class="mage-wing l" d="M32 128 q-22 10 -14 34 q16 -4 24 -18 z" fill="#ffd36b" stroke="#c9a24a" stroke-width="3"/>
      <g class="mage-wing r"><path d="M128 126 q24 -2 22 22 q-16 2 -26 -10 z" fill="#ffd36b" stroke="#c9a24a" stroke-width="3"/>
        <rect x="140" y="112" width="8" height="22" rx="3" fill="#444" transform="rotate(20 144 123)"/><circle cx="150" cy="106" r="9" fill="#666" stroke="#333" stroke-width="2"/></g>
      <g class="mage-eyes"><ellipse cx="64" cy="62" rx="7" ry="9" fill="#222"/><ellipse cx="96" cy="62" rx="7" ry="9" fill="#222"/>
        <circle cx="66" cy="59" r="2.5" fill="#fff"/><circle cx="98" cy="59" r="2.5" fill="#fff"/></g>
      <g class="mage-beak"><path d="M68 76 L92 76 L80 90 z" fill="#ff9f1c" stroke="#c46a00" stroke-width="2"/><path class="mage-beak-low" d="M71 84 L89 84 L80 94 z" fill="#f08400"/></g>
      <path d="M76 94 q4 14 8 0" fill="#e63946"/>
      <g class="mage-tie"><path d="M80 112 L58 100 L58 124 z" fill="#d62828"/><path d="M80 112 L102 100 L102 124 z" fill="#d62828"/><circle cx="80" cy="112" r="6" fill="#9d0208"/></g>
      <path d="M62 178 v8 M54 186 h16 M98 178 v8 M90 186 h16" stroke="#ff9f1c" stroke-width="5" stroke-linecap="round"/>
    </g></svg>`;

  // ============ 音效（WebAudio，不用載檔案） ============
  let actx = null;
  const muted = () => store.get('cj-qz-mute') === '1';
  function beep(freq, dur, type, vol, delay) {
    if (muted()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + (delay || 0);
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur);
    } catch (e) { }
  }
  const SFX = {
    pop: () => beep(660, 0.12, 'triangle', 0.12),
    tick: () => beep(1000, 0.05, 'square', 0.05),
    start: () => [523, 659, 784].forEach((f, i) => beep(f, 0.18, 'triangle', 0.15, i * 0.12)),
    right: () => [784, 988, 1319].forEach((f, i) => beep(f, 0.2, 'sine', 0.15, i * 0.1)),
    wrong: () => [300, 220].forEach((f, i) => beep(f, 0.25, 'sawtooth', 0.08, i * 0.18)),
    fanfare: () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.16, i * 0.16)),
  };

  // ============ 共用小元件 ============
  const tile = (i, label, extra) => { const [c, s] = COLORS[i]; return `<div class="qz-tile" style="--c:${c}" ${extra || ''}><span class="qz-shape">${s}</span><span class="qz-lbl">${label}</span></div>`; };
  const tfTile = (i, extra) => `<div class="qz-tile" style="--c:${TF[i][0]}" ${extra || ''}><span class="qz-lbl big">${TF[i][1]}</span></div>`;
  const codeBox = code => code ? `<pre class="qz-code">${esc(code)}</pre>` : '';
  const unitName = (units, u) => (units || {})[u] || '';

  // =====================================================================
  //  老師：後台（開新的一場、場次紀錄、題庫）
  // =====================================================================
  async function viewQuizTeacher() {
    app().innerHTML = '<div class="loading">載入中…</div>';
    const [b, gl] = await Promise.all([apiGet('/api/quiz/bank'), apiGet('/api/quiz/games')]);
    const units = b.units, bank = b.bank;
    const cfg = Object.assign({ units: Object.keys(units), count: 10, order: 'easy', secChoice: 20, secFill: 30, projectorOnly: false, floor: 60, cids: [teacherCid()].filter(Boolean) },
      (() => { try { return JSON.parse(store.get('cj-qz-cfg') || '{}'); } catch { return {}; } })());
    const classes = teacherClasses().filter(c => !c.archived);
    const live = new Set(gl.live || []);
    app().innerHTML = `<div class="card qz-hero"><div class="qz-hero-mage">${MAGE}</div><div><h2 style="margin:0">🎮 嘉科程式知識王</h2>
        <p class="muted" style="margin:4px 0 0">全班同時搶答！開場後把「投影畫面」投到螢幕上，學生打開網站 → 導覽列「🎮 知識王」→ 輸入暱稱就能加入。</p>
        <p class="small" style="margin:4px 0 0"><a href="#/quizgrades">📊 知識王成績（和解題成績分開計算）</a></p></div></div>
      ${gl.list.filter(g => live.has(g.gid)).map(g => `<div class="card qz-live"><b>🔴 進行中：${esc(g.title)}</b> <span class="muted small">${fmtTime(g.time)}・${esc(g.cids.map(c => (classes.find(x => x.id === c) || {}).name || c).join('、'))}</span><span class="spacer"></span>
        <a class="btn primary" href="#/quizhost/${g.gid}">📺 投影畫面</a> <a class="btn" href="#/quizctl/${g.gid}" target="_blank">📱 控制台</a></div>`).join('')}
      <div class="card"><h3 style="margin-top:0">開新的一場</h3>
        <div class="qz-form">
          <label>名稱</label><input type="text" id="qzTitle" placeholder="嘉科程式知識王" value="${esc(cfg.title || '')}" style="width:260px">
          <label>參加的班級</label><div>${classes.map(c => `<label class="qz-chk"><input type="checkbox" data-qcid="${esc(c.id)}" ${cfg.cids.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}（${c.count} 人）</label>`).join('') || '<span class="muted">還沒有班級</span>'}
            <div class="muted small">可以同時勾兩個班一起玩（例如合班上課）。</div></div>
          <label>題目單元</label><div>${Object.entries(units).map(([k, n]) => `<label class="qz-chk"><input type="checkbox" data-qunit="${k}" ${cfg.units.includes(k) ? 'checked' : ''}> ${esc(n)}（${bank.filter(q => q.unit === k).length}）</label>`).join('')}</div>
          <label>題數</label><div><input type="number" id="qzCount" min="1" max="50" value="${cfg.count}" style="width:70px"> 題，順序
            <select id="qzOrder"><option value="easy" ${cfg.order === 'easy' ? 'selected' : ''}>由易到難（隨機抽題）</option><option value="random" ${cfg.order === 'random' ? 'selected' : ''}>完全隨機</option></select></div>
          <label>作答時間</label><div>選擇／是非 <input type="number" id="qzSecC" min="5" max="120" value="${cfg.secChoice}" style="width:64px"> 秒，填空 <input type="number" id="qzSecF" min="5" max="180" value="${cfg.secFill}" style="width:64px"> 秒</div>
          <label>題目顯示</label><label><input type="checkbox" id="qzProj" ${cfg.projectorOnly ? 'checked' : ''}> 題目只顯示在投影幕（學生畫面只有 A/B/C/D 色塊，防止把題目貼去問 AI）</label>
          <label>成績換算</label><div>本場最高分 = 100 分，其他人依比例；有參加的保底 <input type="number" id="qzFloor" min="0" max="100" value="${cfg.floor}" style="width:64px"> 分</div>
        </div>
        <div class="row" style="margin-top:10px"><span class="muted small">計分：答對 500 分＋速度分（最多 500）＋連勝加成（第 2 題起每題 +100，最多 +500）。</span><span class="spacer"></span><button class="btn primary" id="qzGo">🎬 開場</button></div></div>
      <div class="card"><h3 style="margin-top:0">場次紀錄</h3><div id="qzHist">${gl.list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>時間</th><th>名稱</th><th>班級</th><th>狀態</th><th></th></tr></thead><tbody>
        ${gl.list.map(g => `<tr><td class="small">${fmtTime(g.time)}</td><td>${esc(g.title)}</td><td class="small">${esc(g.cids.map(c => (classes.find(x => x.id === c) || {}).name || c).join('、'))}</td>
          <td>${live.has(g.gid) ? '🔴 進行中' : g.status === 'end' ? '已結算' : '<span class="muted">未完成</span>'}</td>
          <td>${live.has(g.gid) ? `<a class="btn sm" href="#/quizhost/${g.gid}">投影畫面</a> ` : ''}<button class="btn sm" data-qres="${g.gid}">看結果</button></td></tr><tr id="qzR${g.gid}" hidden><td colspan="5"></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有玩過。</p>'}</div></div>
      <div class="card"><details id="qzBankBox"><summary><b>📚 題庫（${bank.length} 題）</b> <span class="muted small">可以新增、修改、刪除；預設題目改過之後仍可恢復</span></summary><div id="qzBank"></div></details></div>`;
    const readCfg = () => {
      const c = { title: $('#qzTitle').value.trim(), cids: $$('[data-qcid]').filter(x => x.checked).map(x => x.dataset.qcid), units: $$('[data-qunit]').filter(x => x.checked).map(x => x.dataset.qunit),
        count: +$('#qzCount').value || 10, order: $('#qzOrder').value, secChoice: +$('#qzSecC').value || 20, secFill: +$('#qzSecF').value || 30, projectorOnly: $('#qzProj').checked, floor: $('#qzFloor').value === '' ? 60 : +$('#qzFloor').value };
      store.set('cj-qz-cfg', JSON.stringify(c));
      return c;
    };
    $('#qzGo').onclick = async () => {
      const c = readCfg();
      if (!c.cids.length) { toast('請勾選參加的班級'); return; }
      if (!c.units.length) { toast('請勾選題目單元'); return; }
      $('#qzGo').disabled = true;
      try { const r = await api('/api/quiz/create', c); location.hash = '#/quizhost/' + r.gid; }
      catch (e) { toast(e.message); $('#qzGo').disabled = false; }
    };
    $$('[data-qres]').forEach(btn => btn.onclick = async () => {
      const tr = $('#qzR' + btn.dataset.qres);
      tr.hidden = !tr.hidden;
      if (tr.hidden) return;
      tr.firstElementChild.innerHTML = '<div class="loading">載入中…</div>';
      try { tr.firstElementChild.innerHTML = await resultHtml(btn.dataset.qres, units, tr); } catch (e) { tr.firstElementChild.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
    $('#qzBankBox').ontoggle = () => { if ($('#qzBankBox').open) drawBank(bank, units); };
  }
  // 某一場的結果
  async function resultHtml(gid, units, tr) {
    const d = await apiGet('/api/quiz/game/' + gid), g = d.game, rows = d.rows.sort((a, b) => a.rank - b.rank);
    setTimeout(() => {
      const b = tr.querySelector('[data-csv]');
      if (b) b.onclick = () => downloadCsv([['名次', '班級代號', '座號', '姓名', '暱稱', '總分', '答對', '題數', '換算成績', ...g.qs.map((q, i) => `第${i + 1}題 ${q.id}`)],
        ...rows.map(r => [r.rank, r.cid, r.seat, r.name, r.nick, r.score, r.correct, r.total, r.pct, ...g.qs.map((q, i) => { const x = r.detail[i]; return x ? (x.ok ? `✔ ${(x.ms / 1000).toFixed(1)}秒 +${x.pts}` : '✘') : '未答'; })])], `知識王_${g.title}_${fmtTime(g.created)}.csv`);
    }, 0);
    return `<div class="qz-res">${g.awards.length ? `<div class="qz-awards-row">${g.awards.map(a => `<span class="tag">${esc(a.t)}：${esc(a.nick)}</span>`).join(' ')}</div>` : ''}
      <h4>每一題的答對率</h4><div class="table-wrap"><table class="list small"><thead><tr><th>#</th><th>單元</th><th>題目</th><th>答案</th><th>答對率</th></tr></thead><tbody>
      ${g.qs.map((q, i) => { const h = g.hist[i]; return `<tr><td>${i + 1}</td><td>${esc(unitName(units, q.unit))}</td><td>${esc(q.text)}${q.code ? `<br><code class="small">${esc(q.code.split('\n')[0])}${q.code.includes('\n') ? ' …' : ''}</code>` : ''}</td>
        <td>${esc(q.type === 'choice' ? q.options[q.answer] : q.type === 'tf' ? (q.answer ? '對' : '錯') : q.accept[0])}</td><td>${h && h.n ? `<b class="${h.right / h.n < 0.5 ? 'mine-tried' : 'mine-ac'}">${Math.round(h.right / h.n * 100)}%</b>（${h.right}/${h.n}）` : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="row"><h4 style="margin:8px 0">每位同學</h4><span class="spacer"></span><button class="btn sm" data-csv>⬇ 下載 CSV</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>名次</th><th>暱稱</th><th>座號</th><th>姓名</th><th>總分</th><th>答對</th><th>換算成績</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r.rank}</td><td>${esc(r.nick)}</td><td>${seat2(r.seat)}</td><td>${esc(r.name)}</td><td>${r.score}</td><td>${r.correct} / ${r.total}</td><td><b>${r.pct}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">這一場還沒有結算。</p>'}</div>`;
  }
  // 題庫編輯
  function drawBank(bank, units) {
    const el = $('#qzBank');
    const typeName = { choice: '四選一', tf: '是非', fill: '填空' };
    const ans = q => q.type === 'choice' ? q.options[q.answer] : q.type === 'tf' ? (q.answer ? '對' : '錯') : (q.accept || []).join(' / ');
    el.innerHTML = `<div class="row" style="margin:8px 0"><button class="btn primary" id="qbNew">＋ 新增題目</button></div><div id="qbForm"></div>
      ${Object.entries(units).map(([k, n]) => `<h4>${esc(n)}</h4><div class="table-wrap"><table class="list small"><tbody>
        ${bank.filter(q => q.unit === k).map(q => `<tr><td style="width:60px"><b>${esc(q.id)}</b>${q.edited ? '<br><span class="tag">改過</span>' : ''}</td><td style="width:60px">${typeName[q.type]}<br>${'★'.repeat(q.d || 1)}</td>
          <td>${esc(q.text)}${q.code ? `<pre class="qz-mini">${esc(q.code)}</pre>` : ''}</td><td style="width:140px">✔ ${esc(ans(q))}</td>
          <td style="width:120px"><button class="btn sm" data-qbe="${esc(q.id)}">修改</button> <button class="btn sm danger" data-qbd="${esc(q.id)}">刪除</button></td></tr>`).join('')}</tbody></table></div>`).join('')}`;
    const form = q => {
      q = q || { unit: 'var', type: 'choice', d: 1, text: '', code: '', options: ['', '', '', ''], answer: 0, accept: [''], explain: '' };
      $('#qbForm').innerHTML = `<div class="qz-edit"><h4 style="margin-top:0">${q.id ? '修改 ' + esc(q.id) : '新增題目'}</h4>
        <div class="qz-form">
          <label>單元</label><select id="qbUnit">${Object.entries(units).map(([k, n]) => `<option value="${k}" ${q.unit === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <label>題型</label><div><select id="qbType">${Object.entries(typeName).map(([k, n]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            難度 <select id="qbD"><option value="1" ${q.d !== 2 ? 'selected' : ''}>★ 基本</option><option value="2" ${q.d === 2 ? 'selected' : ''}>★★ 要想一下</option></select></div>
          <label>題目</label><input type="text" id="qbText" value="${esc(q.text)}" style="width:100%">
          <label>程式碼（可空白）</label><textarea id="qbCode" rows="5" style="font-family:var(--mono)">${esc(q.code || '')}</textarea>
          <label>答案</label><div id="qbAns"></div>
          <label>說明（公布答案時顯示）</label><input type="text" id="qbExp" value="${esc(q.explain || '')}" style="width:100%">
        </div><div class="row" style="margin-top:8px"><span class="muted small">「印出什麼」的題目請自己執行一次確認答案。</span><span class="spacer"></span><button class="btn" id="qbCancel">取消</button><button class="btn primary" id="qbSave">儲存</button></div></div>`;
      const drawAns = () => {
        const t = $('#qbType').value;
        $('#qbAns').innerHTML = t === 'choice' ? [0, 1, 2, 3].map(i => `<div class="row"><label><input type="radio" name="qbA" value="${i}" ${+q.answer === i ? 'checked' : ''}> 正確</label><input type="text" data-qbo="${i}" value="${esc((q.options || [])[i] || '')}" style="flex:1" placeholder="選項 ${'ABCD'[i]}"></div>`).join('')
          : t === 'tf' ? `<label><input type="radio" name="qbA" value="1" ${q.answer === true ? 'checked' : ''}> 對</label>　<label><input type="radio" name="qbA" value="0" ${q.answer !== true ? 'checked' : ''}> 錯</label>`
          : `<input type="text" id="qbAcc" value="${esc((q.accept || []).join('｜'))}" style="width:100%" placeholder="正確答案，好幾個可以接受的答案用 ｜ 分隔，例如 i+=2｜i=i+2"><div class="muted small">比對時會忽略所有空白；大小寫要一樣。</div>`;
      };
      drawAns();
      $('#qbType').onchange = drawAns;
      $('#qbCancel').onclick = () => { $('#qbForm').innerHTML = ''; };
      $('#qbSave').onclick = async () => {
        const t = $('#qbType').value, a = $$('[name="qbA"]').find(x => x.checked);
        const body = { id: q.id, unit: $('#qbUnit').value, type: t, d: +$('#qbD').value, text: $('#qbText').value, code: $('#qbCode').value, explain: $('#qbExp').value,
          options: t === 'choice' ? $$('[data-qbo]').map(x => x.value) : undefined, answer: t === 'choice' ? +(a ? a.value : 0) : t === 'tf' ? (a ? a.value === '1' : false) : undefined,
          accept: t === 'fill' ? $('#qbAcc').value.split(/[｜|]/).map(s => s.trim()).filter(Boolean) : undefined };
        try { await api('/api/quiz/bank/save', { q: body }); toast('已儲存'); const nb = await apiGet('/api/quiz/bank'); bank.length = 0; bank.push(...nb.bank); drawBank(bank, units); }
        catch (e) { toast(e.message); }
      };
      $('#qbForm').scrollIntoView({ block: 'nearest' });
    };
    $('#qbNew').onclick = () => form(null);
    $$('[data-qbe]').forEach(b => b.onclick = () => form(JSON.parse(JSON.stringify(bank.find(q => q.id === b.dataset.qbe)))));
    $$('[data-qbd]').forEach(b => b.onclick = async () => {
      if (!confirm(`刪除題目 ${b.dataset.qbd}？`)) return;
      try { await api('/api/quiz/bank/delete', { id: b.dataset.qbd }); const nb = await apiGet('/api/quiz/bank'); bank.length = 0; bank.push(...nb.bank); drawBank(bank, units); toast('已刪除'); }
      catch (e) { toast(e.message); }
    });
  }

  // =====================================================================
  //  投影畫面（主持人）與控制台
  // =====================================================================
  function viewQuizHost(gid, ctl) {
    if (!gid) { location.hash = '#/quiz'; return; }
    const H = { gid, d: null, off: 0, rev: -1, phase: '', lines: null, revealedQi: -2, seenEm: new Set(), seenP: new Set(), lastTick: -1, alive: true, names: false, sayUntil: 0, busy: false };
    const root = document.createElement('div');
    root.id = 'qzHost'; root.className = 'qz-host' + (ctl ? ' ctl' : '');
    if (!ctl) { document.body.appendChild(root); document.body.classList.add('qz-open'); app().innerHTML = '<div class="card muted">投影畫面已開啟。</div>'; }
    else app().innerHTML = '', app().appendChild(root);
    const alive = () => H.alive && location.hash.startsWith(ctl ? '#/quizctl/' + gid : '#/quizhost/' + gid);
    const destroy = () => { H.alive = false; clearInterval(H.tick); if (!ctl) { root.remove(); document.body.classList.remove('qz-open'); } };
    const now = () => Date.now() + H.off;
    root.innerHTML = `<div class="qz-bar"><b class="qz-title">🎮 <span id="qhTitle">嘉科程式知識王</span></b><span class="qz-prog" id="qhProg"></span><span class="spacer"></span>
        <span id="qhBtns"></span>
        <button class="qz-b" id="qhPl" title="玩家名單">👥 <span id="qhN">0</span></button>
        ${ctl ? '' : `<button class="qz-b" id="qhMute" title="音效">${muted() ? '🔇' : '🔊'}</button><a class="qz-b" href="#/quizctl/${gid}" target="_blank" title="在另一個分頁或手機開控制台">📱</a>`}
        <button class="qz-b" id="qhQuiet" title="表情開關">😶</button><button class="qz-b" id="qhEnd" title="結束遊戲">🏁</button><button class="qz-b" id="qhExit" title="離開">✕</button></div>
      ${ctl ? '<div id="qhCtl"></div>' : `<div class="qz-stage"><div class="qz-mage" id="qhMage">${MAGE}<div class="qz-bubble" id="qhSay"></div></div><div class="qz-main" id="qhMain"></div></div><div class="qz-emo" id="qhEmo"></div>`}
      <div class="qz-drawer" id="qhDrawer" ${ctl ? '' : 'hidden'}></div>`;
    const act = async (action, extra) => {
      if (H.busy) return; H.busy = true;
      try { const d = await api('/api/quiz/host', Object.assign({ gid, action, names: H.names }, extra || {})); apply(d); }
      catch (e) { toast(e.message); } finally { H.busy = false; }
    };
    $('#qhExit').onclick = () => { destroy(); location.hash = '#/quiz'; };
    $('#qhEnd').onclick = () => { if (confirm('結束遊戲並結算成績嗎？（還沒作答的題目不會再出）')) act('end'); };
    $('#qhQuiet').onclick = () => act('quiet');
    if (!ctl) {
      $('#qhMute').onclick = () => { store.set('cj-qz-mute', muted() ? '' : '1'); $('#qhMute').textContent = muted() ? '🔇' : '🔊'; };
      $('#qhPl').onclick = () => { $('#qhDrawer').hidden = !$('#qhDrawer').hidden; drawDrawer(); };
    } else $('#qhPl').onclick = () => { };
    const say = (text, mood, hold) => {
      if (ctl || !text) return;
      const b = $('#qhSay'); if (!b) return;
      b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      const m = $('#qhMage'); m.className = 'qz-mage talk ' + (mood || '');
      clearTimeout(H.sayT); H.sayT = setTimeout(() => { if ($('#qhMage')) $('#qhMage').className = 'qz-mage ' + (mood || ''); }, 2200);
      H.sayUntil = Date.now() + (hold || 6000);
    };
    const L = k => pick((H.lines || {})[k] || []);

    // 玩家名單（按住 👁 才顯示真實姓名）
    function drawDrawer() {
      const d = H.d, el = $('#qhDrawer');
      if (!d || !el || el.hidden) return;
      el.innerHTML = `<div class="row"><b>玩家 ${d.players.length} 人</b>${d.phase === 'q' ? `<span class="muted small">　已作答 ${d.answered}</span>` : ''}<span class="spacer"></span>
          <button class="qz-b eye" id="qhEye" title="按住才顯示真實姓名">👁 按住看真實姓名</button>${ctl ? '' : '<button class="qz-b" id="qhDrClose">✕</button>'}</div>
        <div class="qz-plist">${d.players.map(p => `<div class="qz-pl ${p.ans ? 'ans' : ''}"><span class="qz-pn">${esc(p.nick)}</span>${H.names && p.name ? `<span class="qz-real">${seat2(p.seat)} ${esc(p.name)}</span>` : ''}
          ${p.ren ? '<span class="muted small">已改名</span>' : `<button class="qz-b sm" data-ren="${esc(p.key)}" title="把暱稱改成「我愛嘉科實中+流水號」">改名</button>`}</div>`).join('') || '<p class="muted">還沒有人加入。</p>'}</div>`;
      const eye = $('#qhEye');
      const on = async () => { H.names = true; if (!ctl) root.classList.add('mask'); const d2 = await api('/api/quiz/host', { gid, names: true }).catch(() => null); if (d2 && H.names) { H.d = d2; drawDrawer(); } };
      const off = () => { H.names = false; root.classList.remove('mask'); drawDrawer(); };
      eye.onmousedown = eye.ontouchstart = e => { e.preventDefault(); on(); };
      eye.onmouseup = eye.onmouseleave = eye.ontouchend = () => { if (H.names) off(); };
      if ($('#qhDrClose')) $('#qhDrClose').onclick = () => { el.hidden = true; };
      $$('[data-ren]').forEach(b => b.onclick = () => { if (confirm('把這個暱稱改成「我愛嘉科實中＋流水號」？改了之後學生不能再改回去。')) act('rename', { key: b.dataset.ren }); });
    }
    function drawButtons() {
      const d = H.d, last = d.qi + 1 >= d.total;
      $('#qhBtns').innerHTML = d.phase === 'lobby' ? `<button class="qz-b go" data-a="next">▶ 開始第一題</button>`
        : d.phase === 'q' ? `<button class="qz-b" data-a="reveal">📢 提早公布</button>`
        : d.phase === 'reveal' ? `<button class="qz-b go" data-a="next">${last ? '🏆 看結算' : '⏭ 下一題'}</button>`
        : `<a class="qz-b" href="#/quiz">← 回後台</a>`;
      $$('#qhBtns [data-a]').forEach(b => b.onclick = () => { if (b.dataset.a === 'next') SFX.start(); act(b.dataset.a); });
      $('#qhQuiet').textContent = d.quiet ? '🤫' : '😶';
      $('#qhQuiet').title = d.quiet ? '安靜模式中（表情關閉），按一下打開' : '表情開放中，按一下開安靜模式';
    }

    // ---- 依階段畫主畫面 ----
    function drawPhase() {
      const d = H.d, m = $('#qhMain');
      if (ctl) { drawCtl(); return; }
      if (d.phase === 'lobby') {
        m.innerHTML = `<div class="qz-lobby"><h1>${esc(d.title)}</h1><div class="qz-join">打開網站 → 導覽列「🎮 知識王」→ 輸入暱稱</div>
          <div class="qz-count"><b id="qhCnt">${d.players.length}</b> 人已進場</div><div class="qz-nicks" id="qhNicks"></div></div>`;
        drawNicks();
      } else if (d.phase === 'q') {
        const q = d.q;
        m.innerHTML = `<div class="qz-q"><div class="qz-qhead"><span class="qz-unit">${esc(unitName(d.units, q.unit))}${q.d === 2 ? ' ★★' : ''}</span><span>第 ${d.qi + 1} / ${d.total} 題</span>
            <span class="spacer"></span><span class="qz-ans">已作答 <b id="qhAns">0</b> / <span id="qhAll">${d.players.length}</span></span><div class="qz-timer" id="qhTimer"></div></div>
          <div class="qz-intro" id="qhIntro">第 ${d.qi + 1} 題</div>
          <div class="qz-qbody" id="qhBody"><div class="qz-text">${esc(q.text)}</div>${codeBox(q.code)}
            ${q.type === 'choice' ? `<div class="qz-tiles">${q.options.map((o, i) => tile(i, esc(o))).join('')}</div>`
              : q.type === 'tf' ? `<div class="qz-tiles two">${[0, 1].map(i => tfTile(i)).join('')}</div>`
              : '<div class="qz-fillhint">✍ 請在自己的電腦輸入答案</div>'}</div></div>`;
        say(L('question'));
      } else if (d.phase === 'reveal') {
        const q = d.q, h = d.hist || { counts: [], right: 0, n: 0 }, max = Math.max(1, ...h.counts);
        const ratio = h.n ? h.right / h.n : 0;
        m.innerHTML = `<div class="qz-q"><div class="qz-qhead"><span class="qz-unit">${esc(unitName(d.units, q.unit))}</span><span>第 ${d.qi + 1} / ${d.total} 題</span><span class="spacer"></span>
            <span class="qz-ans">答對 <b>${h.right}</b> / ${h.n} 人</span></div>
          <div class="qz-rev"><div><div class="qz-text">${esc(q.text)}</div>${codeBox(q.code)}
            ${q.type === 'fill' ? `<div class="qz-fillans">正確答案：<code>${esc(q.answerText)}</code></div><div class="qz-bars two">${['答對', '答錯'].map((t, i) => `<div class="qz-barc"><div class="qz-bar" style="--c:${i ? '#e21b3c' : '#26890c'};height:${8 + 150 * (h.counts[i] || 0) / max}px"><b>${h.counts[i] || 0}</b></div><span>${t}</span></div>`).join('')}</div>`
              : `<div class="qz-bars ${q.type === 'tf' ? 'two' : ''}">${(q.type === 'tf' ? [0, 1] : [0, 1, 2, 3]).map(i => `<div class="qz-barc ${i === q.answer ? 'ok' : 'no'}"><div class="qz-bar" style="--c:${q.type === 'tf' ? TF[i][0] : COLORS[i][0]};height:${8 + 150 * (h.counts[i] || 0) / max}px"><b>${h.counts[i] || 0}</b></div>
                  <span>${q.type === 'tf' ? TF[i][1] : COLORS[i][1] + ' ' + esc(q.options[i])}${i === q.answer ? ' ✔' : ''}</span></div>`).join('')}</div>`}
            ${q.explain ? `<div class="qz-explain">💡 ${esc(q.explain)}</div>` : ''}</div>
            <div class="qz-board"><h3>🏆 排行榜</h3>${(d.board || []).slice(0, 5).map(r => `<div class="qz-row"><span class="qz-rk">${r.rank}</span><span class="qz-nk">${esc(r.nick)}${r.streak >= 3 ? ` <span class="qz-fire">🔥${r.streak}</span>` : ''}</span>
              <span class="qz-sc">${r.score}</span><span class="qz-mv">${r.prev ? (r.prev > r.rank ? `<i class="up">▲${r.prev - r.rank}</i>` : r.prev < r.rank ? `<i class="dn">▼${r.rank - r.prev}</i>` : '') : ''}</span></div>`).join('') || '<p>還沒有人得分</p>'}</div></div></div>`;
        if (ratio >= 0.6) SFX.right(); else SFX.wrong();
        const s = d.streaks && d.streaks[0];
        const line = !h.n ? '' : h.right === h.n ? L('all') : h.right === 0 ? L('none') : d.leaderChanged ? fill(L('newKing'), { name: d.leaderChanged }) : s && Math.random() < 0.6 ? fill(L('streak'), { name: s.nick, n: s.n }) : ratio >= 0.6 ? L('many') : L('few');
        say(line, h.right === h.n ? 'happy' : ratio < 0.3 ? 'shock' : ratio >= 0.6 ? 'happy' : '');
        if (h.n && h.right === h.n) confetti();
      } else if (d.phase === 'end') {
        const f = d.final || [], P = i => f[i] ? `<div class="qz-pod p${i + 1}"><div class="qz-pnick">${esc(f[i].nick)}</div><div class="qz-pscore">${f[i].score} 分</div><div class="qz-pblock">${['🥇', '🥈', '🥉'][i]}</div></div>` : '';
        m.innerHTML = `<div class="qz-end"><h1>🏆 ${esc(d.title)}・結算</h1><div class="qz-podium">${P(1)}${P(0)}${P(2)}</div>
          ${(d.awards || []).length ? `<div class="qz-awards">${d.awards.map(a => `<div class="qz-award"><b>${esc(a.t)}</b><span>${esc(a.nick)}</span><small>${esc(a.v)}</small></div>`).join('')}</div>` : ''}
          <div class="qz-final">${f.slice(3, 15).map(r => `<span>${r.rank}. ${esc(r.nick)} <b>${r.score}</b></span>`).join('')}</div></div>`;
        SFX.fanfare(); confetti(); say(L('end'), 'happy', 15000);
      }
    }
    function drawNicks() {
      const d = H.d, box = $('#qhNicks'); if (!box) return;
      d.players.forEach(p => {
        if (H.seenP.has(p.key + p.nick)) return;
        H.seenP.add(p.key + p.nick);
        const old = box.querySelector(`[data-k="${CSS.escape(p.key)}"]`); if (old) old.remove();
        box.insertAdjacentHTML('beforeend', `<span class="qz-nick" data-k="${esc(p.key)}" style="--h:${(p.nick.length * 47 + p.nick.charCodeAt(0) * 13) % 360}">${esc(p.nick)}</span>`);
        SFX.pop();
      });
      if ($('#qhCnt')) $('#qhCnt').textContent = d.players.length;
    }
    // 控制台（手機／另一個分頁）
    function drawCtl() {
      const d = H.d, el = $('#qhCtl');
      el.innerHTML = `<div class="qz-ctlbox"><h2 style="margin:0">${esc(d.title)}</h2>
        <div class="qz-ctlst">${{ lobby: '⏳ 等待區', q: `❓ 第 ${d.qi + 1} / ${d.total} 題作答中`, reveal: `📢 第 ${d.qi + 1} / ${d.total} 題公布答案`, end: '🏆 已結算' }[d.phase]}
          ${d.phase === 'q' ? `・已作答 ${d.answered} / ${d.players.length}・剩 <b id="qhLeft"></b> 秒` : ''}</div>
        ${d.q && d.phase !== 'lobby' ? `<div class="small muted">${esc(d.q.text)}${d.q.answerText ? `<br>答案：<b>${esc(d.q.answerText)}</b>` : ''}</div>` : ''}
        <p class="muted small">控制台不會自動公布答案（投影畫面會）；改名、看真實姓名請用下面的名單。</p></div>`;
      drawDrawer();
    }
    // 彩帶
    function confetti() {
      if (ctl) return;
      for (let i = 0; i < 60; i++) {
        const c = document.createElement('i');
        c.className = 'qz-conf'; c.style.left = Math.random() * 100 + 'vw'; c.style.background = `hsl(${Math.random() * 360},90%,60%)`;
        c.style.animationDelay = Math.random() * 0.8 + 's'; c.style.animationDuration = 2 + Math.random() * 2 + 's';
        root.appendChild(c); setTimeout(() => c.remove(), 5000);
      }
    }
    // 收到伺服器的狀態
    function apply(d) {
      if (!alive()) return;
      H.d = d; H.off = d.now - Date.now();
      if (d.lines) H.lines = d.lines;
      $('#qhTitle').textContent = d.title; $('#qhN').textContent = d.players.length;
      $('#qhProg').textContent = d.phase === 'lobby' ? '等待區' : d.phase === 'end' ? '結算' : `第 ${d.qi + 1} / ${d.total} 題`;
      const changed = d.rev !== H.rev || d.phase !== H.phase;
      if (changed) {
        const first = H.rev === -1;
        H.rev = d.rev; H.phase = d.phase;
        drawButtons(); drawPhase();
        if (first && d.phase === 'lobby') say(L('open'), 'happy');
        if (d.renamed && Date.now() - d.renamed.t < 5000 && d.renamed.t !== H.renT) { H.renT = d.renamed.t; say(fill(L('rename'), { name: d.renamed.nick }), 'happy'); }
      } else if (ctl) drawCtl();
      if (d.phase === 'lobby') { drawNicks(); if (Date.now() > H.sayUntil + 8000 && d.players.length) say(fill(L('lobby'), { n: d.players.length })); }
      if (d.phase === 'q' && $('#qhAns')) { $('#qhAns').textContent = d.answered; $('#qhAll').textContent = d.players.length; }
      if (!$('#qhDrawer').hidden) drawDrawer();
      // 表情
      (d.emojis || []).forEach(e => {
        const k = e.nick + '|' + e.t;
        if (H.seenEm.has(k) || ctl) return;
        H.seenEm.add(k);
        const box = $('#qhEmo'); if (!box) return;
        const s = document.createElement('div');
        s.className = 'qz-float'; s.style.left = 5 + Math.random() * 85 + '%';
        s.innerHTML = `<span>${e.e}</span><small>${esc(e.nick)}</small>`;
        box.appendChild(s); setTimeout(() => s.remove(), 4000);
      });
    }
    // 計時與自動公布（只有投影畫面會自動公布）
    H.tick = setInterval(() => {
      if (!alive()) { destroy(); return; }
      const d = H.d; if (!d || d.phase !== 'q') return;
      const t = now(), left = Math.ceil((d.qEnd - t) / 1000), before = d.qStart - t;
      const intro = $('#qhIntro'), body = $('#qhBody');
      if (intro) { intro.style.display = before > 0 ? '' : 'none'; if (body) body.style.visibility = before > 0 ? 'hidden' : ''; }
      const tm = $('#qhTimer') || $('#qhLeft');
      if (tm && before <= 0) {
        const total = (d.q.limit || 20000) / 1000, l = Math.max(0, left);
        if ($('#qhTimer')) { tm.textContent = l; tm.style.setProperty('--p', l / total); tm.classList.toggle('hurry', l <= 5); } else tm.textContent = l;
        if (l <= 5 && l > 0 && l !== H.lastTick) { H.lastTick = l; SFX.tick(); if (l === 5) say(L('hurry'), 'shock', 3000); }
      }
      if (!ctl && H.revealedQi !== d.qi && before <= 0 && (t > d.qEnd + GRACE || (d.players.length && d.answered >= d.players.length && t > d.qStart + 800))) {
        H.revealedQi = d.qi; act('reveal');
      }
    }, 250);
    // 輪詢：投影畫面每秒一次，控制台每 2 秒
    (async function loop() {
      let delay = ctl ? 2000 : 1000, first = true;
      while (alive()) {
        try { const d = await api('/api/quiz/host', { gid, names: H.names, withLines: first && !ctl }); first = false; apply(d); delay = ctl ? 2000 : 1000; }
        catch (e) { delay = Math.min(10000, delay * 2); if (/找不到|不是你的/.test(e.message)) { toast(e.message); destroy(); location.hash = '#/quiz'; return; } }
        await wait(delay);
      }
      destroy();
    })();
  }

  // =====================================================================
  //  學生：加入遊戲作答
  // =====================================================================
  function viewQuizStudent() {
    const P = { d: null, off: 0, rev: -1, phase: '', qi: -2, alive: true, shownAt: 0, sending: false, sent: null, err: 0, timer: null, lastJoin: '' };
    app().innerHTML = `<div class="qz-stu"><div class="qz-stu-main" id="qsMain"><div class="loading">連線中…</div></div><div class="qz-stu-emo" id="qsEmo" hidden>${EMOJIS.map(e => `<button data-emo="${e}">${e}</button>`).join('')}</div><div class="qz-net" id="qsNet"></div></div>`;
    const alive = () => P.alive && location.hash.split('?')[0] === '#/quiz';
    const now = () => Date.now() + P.off;
    const net = t => { const el = $('#qsNet'); if (el) { el.textContent = t || ''; el.classList.toggle('show', !!t); } };
    $$('[data-emo]').forEach(b => b.onclick = async () => {
      try { await api('/api/quiz/play', { cid: S.cid, action: 'emoji', e: b.dataset.emo }); b.classList.add('sent'); setTimeout(() => b.classList.remove('sent'), 600); } catch (e) { toast(e.message, 1500); }
    });
    const encourage = r => {
      if (!r || !r.last) return '';
      if (r.last.ok && r.streak >= 3) return `🔥 ${r.streak} 連勝！停不下來！`;
      if (r.last.ok && r.prev && r.prev > r.rank) return `📈 進步了 ${r.prev - r.rank} 名！`;
      if (r.last.ok) return pick(['答得好！', '太神啦！', '碼哥給你按讚 👍', '腦袋在發光！']);
      if (!r.last.answered) return '這題來不及作答，下一題加油！';
      return pick(['沒關係，下一題扳回來！', '錯了才記得住！', '碼哥相信你下一題會對！']);
    };
    function draw() {
      const d = P.d, m = $('#qsMain'); if (!m) return;
      $('#qsEmo').hidden = !(d && !d.none && d.me && !d.quiet);
      if (!d || d.none || (d.phase === 'end' && !d.me)) { m.innerHTML = `<div class="qz-wait"><div class="qz-mini-mage">${MAGE}</div><h2>目前沒有進行中的遊戲</h2><p class="muted">等老師開場後，這個畫面會自動進入遊戲。</p></div>`; return; }
      if (!d.me || d.phase === 'lobby') {
        m.innerHTML = `<div class="qz-wait"><div class="qz-mini-mage">${MAGE}</div><h2>${esc(d.title)}</h2>
          ${d.me ? `<p>你的暱稱：<b class="qz-mynick">${esc(d.me.nick)}</b></p>${d.me.ren ? '<p class="muted small">（主持人幫你改了名字，不能再改囉）</p>' : ''}<p class="muted">${d.phase === 'lobby' ? '等主持人開始…看投影幕上有沒有你的名字！' : '遊戲已經開始，下一題就會加入！'}</p>` : ''}
          ${!d.me || !d.me.ren ? `<div class="row" style="justify-content:center"><input type="text" id="qsNick" maxlength="12" placeholder="輸入暱稱（最多 12 字）" value="${esc(d.me ? d.me.nick : P.lastJoin)}" style="font-size:18px;width:240px">
            <button class="btn primary" id="qsJoin">${d.me ? '改暱稱' : '加入遊戲'}</button></div><p class="muted small">同學和投影幕只會看到暱稱。請取文明的名字，不然碼哥會幫你改名 😏</p>` : ''}</div>`;
        if ($('#qsJoin')) $('#qsJoin').onclick = async () => {
          const nick = $('#qsNick').value.trim(); if (!nick) { toast('請輸入暱稱'); return; }
          P.lastJoin = nick;
          try { const r = await api('/api/quiz/play', { cid: S.cid, action: 'join', nick }); got(r, true); toast('已加入！'); } catch (e) { toast(e.message, 3000); }
        };
        return;
      }
      const q = d.q, r = d.result || {};
      if (d.phase === 'q') {
        const before = d.qStart - now();
        if (before > 0) { m.innerHTML = `<div class="qz-wait"><h1>第 ${d.qi + 1} 題</h1><p>準備…</p></div>`; return; }
        if (!P.shownAt) P.shownAt = Date.now();
        if (d.answered || (P.sent && P.sent.qi === d.qi)) {
          const ok = d.answered;
          m.innerHTML = `<div class="qz-wait"><h1>${ok ? '✅ 已送出' : '⏳ 排隊送出中…'}</h1><p class="muted">${ok ? '看投影幕，等公布答案！' : '人很多，答案在排隊，不會不見，也不會扣速度分。'}</p><div class="qz-sbar"><i id="qsBar"></i></div></div>`;
          return;
        }
        const head = `<div class="qz-sq-head"><span>第 ${d.qi + 1} / ${d.total} 題</span><span class="spacer"></span><b id="qsLeft"></b></div><div class="qz-sbar"><i id="qsBar"></i></div>`;
        const text = q.text ? `<div class="qz-text sm">${esc(q.text)}</div>${codeBox(q.code)}` : '<p class="muted">👀 看投影幕上的題目</p>';
        if (q.type === 'fill') {
          m.innerHTML = `${head}${text}<div class="row" style="justify-content:center;margin-top:16px"><input type="text" id="qsFill" maxlength="100" placeholder="輸入答案" style="font-size:22px;width:280px;font-family:var(--mono)" autocomplete="off">
            <button class="btn primary" id="qsFillGo" style="font-size:20px">送出</button></div>`;
          const go = () => { const v = $('#qsFill').value.trim(); if (!v) { toast('請輸入答案'); return; } send(v); };
          $('#qsFillGo').onclick = go; $('#qsFill').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#qsFill').focus();
        } else {
          const n = q.type === 'tf' ? 2 : 4;
          m.innerHTML = `${head}${text}<div class="qz-tiles stu ${n === 2 ? 'two' : ''}">${Array.from({ length: n }, (_, i) => q.type === 'tf' ? tfTile(i, `data-c="${i}"`) : tile(i, q.options ? esc(q.options[i]) : 'ABCD'[i], `data-c="${i}"`)).join('')}</div>`;
          $$('[data-c]').forEach(t => t.onclick = () => send(q.type === 'tf' ? t.dataset.c === '0' : +t.dataset.c));
        }
        return;
      }
      if (d.phase === 'reveal') {
        const ok = r.last && r.last.ok;
        m.innerHTML = `<div class="qz-wait ${ok ? 'good' : 'bad'}"><h1>${ok ? '✔ 答對了！' : r.last && r.last.answered ? '✘ 答錯了' : '⌛ 沒有作答'}</h1>
          ${ok ? `<div class="qz-pts">+${r.last.pts}</div>` : ''}<p>正確答案：<b>${esc(q.answerText || '')}</b></p>
          <p class="qz-enc">${esc(encourage(r))}</p>
          <div class="qz-mystat"><div><b>${r.score || 0}</b><span>總分</span></div><div><b>${r.rank || '-'}</b><span>名次（共 ${r.of || 0} 人）</span></div><div><b>${r.streak || 0}</b><span>連勝</span></div></div></div>`;
        return;
      }
      if (d.phase === 'end') {
        const aw = (d.awards || []).filter(a => d.me && a.nick === d.me.nick);
        m.innerHTML = `<div class="qz-wait good"><h1>🏆 遊戲結束</h1>${r.rank ? `<div class="qz-pts">第 ${r.rank} 名</div><p>總分 <b>${r.score}</b>，答對 ${r.correct} / ${d.total} 題</p>` : '<p>你這場沒有作答。</p>'}
          ${aw.map(a => `<p class="qz-enc">🎖 你得到「${esc(a.t)}」！</p>`).join('')}
          <div class="qz-board stu"><h3>前 5 名</h3>${(d.board || []).map(b => `<div class="qz-row ${d.me && b.nick === d.me.nick ? 'me' : ''}"><span class="qz-rk">${b.rank}</span><span class="qz-nk">${esc(b.nick)}</span><span class="qz-sc">${b.score}</span></div>`).join('')}</div></div>`;
      }
    }
    // 送出答案：失敗就排隊重送（作答時間在送出前就記好了，重送不會被扣分）
    async function send(c) {
      const d = P.d;
      if (P.sending) return;
      P.sent = { qi: d.qi, c, ms: Date.now() - P.shownAt };
      P.sending = true; draw();
      for (let i = 0; alive() && P.sent && P.sent.qi === P.d.qi; i++) {
        try {
          const r = await api('/api/quiz/play', { cid: S.cid, action: 'answer', qi: P.sent.qi, c: P.sent.c, ms: P.sent.ms });
          net(''); got(r, true); break;
        } catch (e) {
          if (/結束|時間到|請先/.test(e.message)) { toast(e.message, 2500); P.sent = null; poll(); break; }
          net(`⏳ 排隊送出中…（第 ${i + 1} 次重試）`);
          await wait(1200 + Math.random() * 1500);
        }
      }
      P.sending = false;
    }
    function got(d, redraw) {
      if (!alive()) return;
      P.d = d; P.off = d.now - Date.now();
      if (d.qi !== P.qi) { P.qi = d.qi; P.shownAt = 0; P.sent = null; }
      if (redraw || d.rev !== P.rev || d.phase !== P.phase || d.none) { P.rev = d.rev; P.phase = d.phase; draw(); }
    }
    // 輪詢：不同階段問的頻率不同，而且隨機錯開，避免全班同一秒擠進來
    async function poll() {
      clearTimeout(P.timer);
      if (!alive()) return;
      let next = 3000;
      try {
        const d = await api('/api/quiz/play', { cid: S.cid, action: 'state' });
        P.err = 0; net('');
        got(d);
        if (d.none) next = 5000;
        else if (d.phase === 'lobby') next = 2500;
        else if (d.phase === 'q') next = d.answered ? 2000 : Math.max(1500, d.qEnd - d.now + 600);   // 作答中不用一直問，時間到再問
        else if (d.phase === 'reveal') next = 2500;
        else next = 6000;
      } catch (e) {
        P.err++; next = Math.min(15000, 2000 * 2 ** Math.min(P.err, 3));
        net(P.err > 1 ? '⏳ 連線排隊中，稍等一下…' : '');
      }
      P.timer = setTimeout(poll, next + Math.random() * 900);
    }
    const tick = setInterval(() => {
      if (!alive()) { clearInterval(tick); clearTimeout(P.timer); P.alive = false; return; }
      const d = P.d; if (!d || d.phase !== 'q') return;
      if (d.qStart - now() <= 0 && !P.shownAt && !d.answered) draw();
      const left = Math.max(0, (d.qEnd - now()) / 1000), bar = $('#qsBar');
      if (bar) bar.style.width = Math.min(100, left / ((d.q.limit || 20000) / 1000) * 100) + '%';
      if ($('#qsLeft')) $('#qsLeft').textContent = Math.ceil(left) + ' 秒';
    }, 200);
    pageTimers.push(tick);
    poll();
  }

  // =====================================================================
  //  知識王成績（和解題成績分開）
  // =====================================================================
  async function viewQuizGrades() {
    const cid = teacherCid();
    if (!cid) { app().innerHTML = '<div class="card">你還沒有班級。</div>'; return; }
    app().innerHTML = '<div class="loading">載入中…</div>';
    const d = await apiGet('/api/quiz/results', { cid });
    const games = d.games.sort((a, b) => a.time - b.time);
    const cls = teacherClasses().find(c => c.id === cid) || {};
    const mem = await apiGet('/api/class/members', { cid }).then(x => x.members).catch(() => []);
    const by = {};
    d.rows.forEach(r => (by[r.email] = by[r.email] || {})[r.gid] = r);
    const rows = mem.map(m => { const g = by[m.email] || {}; const ps = games.map(x => g[x.gid] ? g[x.gid].pct : null); const got = ps.filter(x => x !== null);
      return { m, ps, n: got.length, avg: got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length * 10) / 10 : null }; });
    app().innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">📊 知識王成績</h2><span class="spacer"></span>${classSelect('qgCls', cid)}<button class="btn" id="qgCsv">⬇ 下載 CSV</button><a class="btn" href="#/quiz">← 知識王後台</a></div>
      <p class="muted small">和解題成績分開計算。每場「換算成績」= 本場最高分當 100 分、其他人依比例（有參加有保底分）；平均只算有參加的場次，沒參加的留空。</p>
      ${games.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>座號</th><th>姓名</th>${games.map(g => `<th title="${esc(g.title)}">${esc(g.title)}<br><span class="small muted">${fmtTime(g.time)}</span></th>`).join('')}<th>參加場數</th><th>平均</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${seat2(r.m.seat)}</td><td>${esc(r.m.name)}</td>${r.ps.map(p => `<td>${p === null ? '<span class="muted">—</span>' : p}</td>`).join('')}<td>${r.n}</td><td><b>${r.avg ?? ''}</b></td></tr>`).join('')}</tbody></table></div>`
        : `<p class="muted">${esc(cls.name || '')} 還沒有知識王的成績。</p>`}</div>`;
    $('#qgCls').onchange = e => { store.set('cj-tcid', e.target.value); viewQuizGrades(); };
    $('#qgCsv').onclick = () => downloadCsv([['座號', '姓名', ...games.map(g => `${g.title} ${fmtTime(g.time)}`), '參加場數', '平均'], ...rows.map(r => [r.m.seat, r.m.name, ...r.ps.map(p => p ?? ''), r.n, r.avg ?? ''])], `知識王成績_${cls.name || cid}.csv`);
  }

  const viewQuiz = () => isTeacher() ? viewQuizTeacher() : viewQuizStudent();
  window.CJ_VIEWS = Object.assign(window.CJ_VIEWS || {}, { quiz: viewQuiz, quizhost: gid => viewQuizHost(gid, false), quizctl: gid => viewQuizHost(gid, true), quizgrades: viewQuizGrades });
})();
