// 老師的「作答檢查」：某一題、某一班所有同學的程式碼，找出
//   ● 程式幾乎一樣的同學（相似度）    ● 註解特別多的程式
//   ● 和上一題通過時間間隔很短的同學  ● 一次貼上大量程式碼、很快寫完、用了課堂沒教的寫法
// 這些都只是「線索」，請老師看過程式、問過學生再判斷。確定違規可以把這位同學這一題的提交「作廢」（可以恢復）。
// 使用 app.js 的共用函式（$、esc、apiGet、api、toast、fmtTime、seat2、vBadge、classSelect、teacherCid、store、DATA、normalize）。
(function () {
  const CPP_WORDS = new Set(('int long short double float char bool void string auto const unsigned signed if else for while do switch case default break continue return ' +
    'include using namespace std main cin cout endl true false sizeof struct class public private new delete vector push_back size').split(' '));
  const ADV = [   // 初學課程少見、AI 或網路範例常見的寫法（只是參考）
    [/\bstd::/, 'std::'], [/bits\/stdc\+\+\.h/, 'bits/stdc++.h'], [/sync_with_stdio|cin\.tie/, '加速輸入'], [/#define\b/, '#define'],
    [/\btypedef\b|\busing\s+\w+\s*=/, 'typedef'], [/\bauto\b/, 'auto'], [/\bsize_t\b/, 'size_t'], [/\bnullptr\b/, 'nullptr'],
    [/for\s*\([^;)]*:\s*[^)]*\)/, '範圍 for'], [/\[\s*[&=]?\s*\]\s*\(/, 'lambda'], [/EXIT_SUCCESS|int\s+main\s*\(\s*void\s*\)/, 'main(void)'],
    [/\bconstexpr\b|\bstatic_cast\b/, 'static_cast'], [/\bprintf\s*\(|\bscanf\s*\(/, 'printf/scanf'],
  ];
  let lessonComments = null;   // 語法說明與程式範本裡的註解（學生複製範例時會帶進來，不算）
  const commentsOf = code => (String(code).match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || []).map(c => c.replace(/^\/\/|^\/\*|\*\/$/g, '').trim()).filter(Boolean);
  function knownComments() {
    if (lessonComments) return lessonComments;
    lessonComments = new Set();
    Object.values(DATA.topics || {}).forEach(t => commentsOf(t.text || '').forEach(c => lessonComments.add(c)));
    (typeof PROBS !== 'undefined' ? PROBS : []).forEach(p => p.template && commentsOf(p.template).forEach(c => lessonComments.add(c)));
    if (typeof TEMPLATE !== 'undefined') commentsOf(TEMPLATE).forEach(c => lessonComments.add(c));
    return lessonComments;
  }
  const stripComments = code => String(code).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  const tokens = code => (stripComments(code).match(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s\w]/g) || []).slice(0, 700);
  // 相似度：兩份程式「最長共同部分」佔的比例（0～100）
  function lcsRatio(a, b) {
    if (!a.length || !b.length) return 0;
    let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      [prev, cur] = [cur, prev];
    }
    return Math.round(200 * prev[b.length] / (a.length + b.length));
  }
  function analyze(code) {
    const known = knownComments();
    const all = commentsOf(code), own = all.filter(c => !known.has(c));
    const lines = String(code).split('\n').filter(l => l.trim()).length || 1;
    const cChars = own.join('').length, chars = String(code).replace(/\s/g, '').length || 1;
    const t = tokens(code);
    return { code, tok: t, shape: t.map(x => /^[A-Za-z_]/.test(x) && !CPP_WORDS.has(x) ? 'ID' : /^\d/.test(x) ? 'N' : x),
      comments: own, cLines: own.length, cRatio: cChars / chars, lines, adv: ADV.filter(([re]) => re.test(code)).map(x => x[1]) };
  }
  const mmss = ms => { const s = Math.round(ms / 1000); return s < 60 ? s + ' 秒' : s < 3600 ? Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒' : s < 172800 ? (s / 3600).toFixed(1) + ' 小時' : Math.round(s / 86400) + ' 天'; };

  // ====== 主畫面（題目頁的「🕵 作答檢查」分頁）======
  window.renderInspect = async function (el, p, isActive) {
    const cid = teacherCid();
    if (!cid) { el.innerHTML = '<p class="muted">你還沒有班級。</p>'; return; }
    el.innerHTML = '<div class="loading">讀取全班的作答…（提交很多時要等十幾秒）</div>';
    let d;
    try { d = await apiGet('/api/inspect/' + p.id, { cid }); } catch (e) { el.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    if (!isActive()) return;
    const opt = Object.assign({ sim: 85, gap: 60 }, (() => { try { return JSON.parse(store.get('cj-insp') || '{}'); } catch { return {}; } })());
    const bySeat = {};
    d.students.forEach(s => bySeat[s.seat] = s);
    const subsOf = {};
    d.subs.forEach(s => { const st = d.students.find(x => x.email === s.email); const seat = st ? st.seat : s.seat; (subsOf[seat] = subsOf[seat] || []).push(s); });
    // 每位同學的代表程式：第一次通過的那一筆，沒有通過就用最後一筆
    const rows = Object.entries(subsOf).map(([seat, list]) => {
      list.sort((a, b) => a.id - b.id);
      const live = list.filter(s => s.verdict !== 'VOID');
      const rep = live.find(s => s.verdict === 'AC') || live[live.length - 1] || list[list.length - 1];
      const metas = list.map(s => s.meta).filter(Boolean);
      const meta = metas.length ? metas.reduce((a, b) => ({ paste: Math.max(a.paste || 0, b.paste || 0), big: Math.max(a.big || 0, b.big || 0), typed: Math.max(a.typed || 0, b.typed || 0), pasteN: Math.max(a.pasteN || 0, b.pasteN || 0), blocked: Math.max(a.blocked || 0, b.blocked || 0) })) : null;
      const acs = d.acs[seat] || [], k = acs.findIndex(x => x[0] === p.id);
      const gap = k > 0 ? acs[k][1] - acs[k - 1][1] : null;
      const repMeta = rep.meta || null;
      return { seat: +seat, st: bySeat[seat] || { seat: +seat, name: '（已不在名單）' }, list, rep, live, voided: !live.length, a: analyze(rep.code), meta, repMeta,
        gap, gapFrom: k > 0 ? acs[k - 1][0] : null, ac: live.some(s => s.verdict === 'AC') };
    }).sort((a, b) => a.seat - b.seat);

    // 兩兩比對相似度
    const pairs = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const x = rows[i], y = rows[j];
      const sim = lcsRatio(x.a.tok, y.a.tok);
      const sameC = x.a.comments.filter(c => c.length >= 6 && y.a.comments.includes(c));
      pairs.push({ x, y, sim, shape: sim >= 60 ? lcsRatio(x.a.shape, y.a.shape) : 0, sameC });
    }
    const sims = pairs.map(q => q.sim).sort((a, b) => a - b), median = sims.length ? sims[Math.floor(sims.length / 2)] : 0;

    function draw() {
      const simTh = Math.max(opt.sim, Math.min(98, median + 10));   // 本題大家本來就很像時，門檻自動提高
      rows.forEach(r => {
        const best = pairs.filter(q => q.x === r || q.y === r).sort((a, b) => b.sim - a.sim)[0];
        r.best = best ? { other: best.x === r ? best.y : best.x, sim: best.sim, sameC: best.sameC } : null;
        r.flags = [];
        if (r.best && (r.best.sim >= simTh || r.best.sameC.length)) r.flags.push(r.best.sameC.length ? '註解相同' : '程式相似');
        if (r.a.cLines >= 4 || (r.a.cLines >= 2 && r.a.cRatio >= 0.25)) r.flags.push('註解多');
        if (r.gap !== null && r.gap < opt.gap * 1000) r.flags.push('間隔短');
        const len = r.rep.code.length;
        if (r.meta && r.meta.big >= 80 && r.meta.big >= len * 0.5) r.flags.push('大量貼上');
        if (r.repMeta && r.repMeta.ms && r.repMeta.ms < 60000 && len > 150 && r.ac && r.live.indexOf(r.rep) === 0) r.flags.push('很快寫完');
        if (r.meta && r.meta.blocked >= 3) r.flags.push('嘗試貼上');
        if (r.a.adv.length) r.flags.push('特殊寫法');
      });
      const flagged = rows.filter(r => r.flags.length && !r.voided).sort((a, b) => b.flags.length - a.flags.length || a.seat - b.seat);
      const hot = pairs.filter(q => q.sim >= simTh || q.sameC.length).sort((a, b) => b.sim - a.sim).slice(0, 20);
      const name = r => `${seat2(r.seat)} ${esc(r.st.name)}`;
      const flagTag = f => `<span class="insp-flag f-${{ 程式相似: 'sim', 註解相同: 'sim', 註解多: 'cmt', 間隔短: 'gap', 大量貼上: 'paste', 很快寫完: 'gap', 特殊寫法: 'adv', 嘗試貼上: 'paste' }[f]}">${f}</span>`;
      el.innerHTML = `<div class="row" style="margin-bottom:8px">班級：${classSelect('clsSel', cid)}
          <label class="small">相似度門檻 <input type="number" id="ispSim" min="50" max="100" value="${opt.sim}" style="width:58px">%</label>
          <label class="small">間隔少於 <input type="number" id="ispGap" min="5" max="600" value="${opt.gap}" style="width:58px"> 秒</label>
          <span class="spacer"></span><button class="btn sm" id="ispAll">📋 全班程式碼一覽</button><button class="btn sm" id="ispReload">🔄 重新讀取</button></div>
        <div class="tips-box"><b>🕵 這些只是線索，不是證據。</b>請先打開程式、和同學聊聊「這行在做什麼」再判斷；初學的題目大家寫得像是正常的。
          本題全班程式相似度中位數 ${median}%，目前標示門檻 ${simTh}%。${d.more ? `<br>⚠ 提交太多，只檢查了最近 ${d.scanned} 筆。` : ''}
          <br><span class="muted small">「貼上／打字」是從這次更新後才開始記錄，之前的提交顯示「—」。複製語法說明的範例程式不算貼上。</span></div>
        <div class="statgrid"><div class="stat"><b>${rows.length}</b><span>有作答的同學</span></div><div class="stat"><b class="${flagged.length ? 'mine-tried' : ''}">${flagged.length}</b><span>有標示的同學</span></div>
          <div class="stat"><b>${hot.length}</b><span>相似的配對</span></div><div class="stat"><b>${rows.filter(r => r.voided).length}</b><span>已作廢</span></div></div>
        ${hot.length ? `<h4>🔗 程式相似的配對</h4><div class="table-wrap"><table class="list"><thead><tr><th>同學</th><th>同學</th><th>相似度</th><th>結構相似</th><th>相同的註解</th><th></th></tr></thead><tbody>
          ${hot.map((q, i) => `<tr><td>${name(q.x)}</td><td>${name(q.y)}</td><td><b class="${q.sim >= 95 ? 'mine-tried' : ''}">${q.sim}%</b></td><td class="muted">${q.shape ? q.shape + '%' : ''}</td>
            <td class="small">${q.sameC.map(c => esc(c.slice(0, 40))).join('<br>')}</td><td><button class="btn sm" data-cmp="${i}">並排比對</button></td></tr>`).join('')}</tbody></table></div>` : ''}
        <h4>👥 每位同學</h4><div class="table-wrap"><table class="list insp-table"><thead><tr><th>座號</th><th>姓名</th><th>狀態</th><th>送出</th><th>最像誰</th><th>註解</th><th title="這一題第一次通過，距離他上一題第一次通過的時間">距上一題通過</th><th title="一次貼上最多幾個字 / 總共打了幾個字">貼上 / 打字</th><th>特殊寫法</th><th>標示</th><th></th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr class="${r.voided ? 'insp-void' : r.flags.length ? 'insp-hot' : ''}"><td>${seat2(r.seat)}</td><td>${esc(r.st.name)}</td>
            <td>${r.voided ? vBadge('VOID') : r.ac ? vBadge('AC') : vBadge(r.rep.verdict)}</td><td>${r.live.length}${r.list.length > r.live.length ? `<span class="muted small">（作廢 ${r.list.length - r.live.length}）</span>` : ''}</td>
            <td>${r.best ? `${r.best.sim}% <span class="small">${name(r.best.other)}</span>` : ''}</td>
            <td>${r.a.cLines ? `${r.a.cLines} 行` : ''}</td>
            <td>${r.gap === null ? '' : `<span class="${r.gap < opt.gap * 1000 ? 'mine-tried' : ''}">${mmss(r.gap)}</span><br><span class="muted small">上一題 ${esc(r.gapFrom)}</span>`}</td>
            <td>${r.meta ? `${r.meta.big} / ${r.meta.typed}${r.meta.blocked ? `<br><span class="small mine-tried">擋下 ${r.meta.blocked} 次</span>` : ''}` : '<span class="muted">—</span>'}</td>
            <td class="small">${r.a.adv.map(esc).join('、')}</td><td>${r.flags.map(flagTag).join(' ')}</td>
            <td class="insp-acts"><button class="btn sm" data-code="${i}">程式碼</button>${r.best ? ` <button class="btn sm" data-cmpr="${i}">比對</button>` : ''}
              ${r.voided || r.list.some(s => s.verdict === 'VOID') ? ` <button class="btn sm" data-restore="${i}">恢復</button>` : ''}${r.voided ? '' : ` <button class="btn sm danger" data-void="${i}">作廢</button>`}</td></tr>
            <tr class="insp-detail" id="ispD${i}" hidden><td colspan="11"></td></tr>`).join('')}</tbody></table></div>
        <div id="ispRapid"></div>`;
      $('#clsSel').onchange = e => { store.set('cj-tcid', e.target.value); renderInspect(el, p, isActive); };
      $('#ispReload').onclick = () => renderInspect(el, p, isActive);
      const saveOpt = () => { opt.sim = Math.max(50, Math.min(100, +$('#ispSim').value || 85)); opt.gap = Math.max(5, Math.min(600, +$('#ispGap').value || 60)); store.set('cj-insp', JSON.stringify(opt)); draw(); };
      $('#ispSim').onchange = saveOpt; $('#ispGap').onchange = saveOpt;
      $$('[data-cmp]').forEach(b => b.onclick = () => compare(hot[+b.dataset.cmp].x, hot[+b.dataset.cmp].y, hot[+b.dataset.cmp]));
      $$('[data-cmpr]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.cmpr]; compare(r, r.best.other, pairs.find(q => (q.x === r && q.y === r.best.other) || (q.y === r && q.x === r.best.other))); });
      $$('[data-code]').forEach(b => b.onclick = () => {
        const r = rows[+b.dataset.code], tr = $('#ispD' + b.dataset.code);
        tr.hidden = !tr.hidden;
        if (!tr.hidden) tr.firstElementChild.innerHTML = detailHtml(r);
      });
      $$('[data-void]').forEach(b => b.onclick = () => doVoid(rows[+b.dataset.void], 'void'));
      $$('[data-restore]').forEach(b => b.onclick = () => doVoid(rows[+b.dataset.restore], 'restore'));
      $('#ispAll').onclick = () => showAll();
      drawRapid();
    }
    // 全班：所有題目中，兩題第一次通過的時間間隔太短
    function drawRapid() {
      const list = d.students.map(s => {
        const acs = d.acs[s.seat] || [], fast = [];
        for (let i = 1; i < acs.length; i++) if (acs[i][1] - acs[i - 1][1] < opt.gap * 1000) fast.push([acs[i - 1][0], acs[i][0], acs[i][1] - acs[i - 1][1], acs[i][1]]);
        return { s, fast, total: acs.length };
      }).filter(x => x.fast.length).sort((a, b) => b.fast.length - a.fast.length);
      $('#ispRapid').innerHTML = `<h4>⏱ 全班：連續兩題通過的間隔少於 ${opt.gap} 秒（所有題目）</h4>
        ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>座號</th><th>姓名</th><th>次數</th><th>通過題數</th><th>哪幾題（前一題 → 這一題，間隔）</th></tr></thead><tbody>
          ${list.map(x => `<tr><td>${seat2(x.s.seat)}</td><td>${esc(x.s.name)}</td><td><b class="${x.fast.length >= 3 ? 'mine-tried' : ''}">${x.fast.length}</b></td><td>${x.total}</td>
            <td class="small">${x.fast.slice(-12).reverse().map(f => `<a href="#/problem/${f[1]}" title="${fmtTime(f[3])}">${esc(f[0])} → ${esc(f[1])}</a>（${mmss(f[2])}）`).join('、')}${x.fast.length > 12 ? ' …' : ''}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted">沒有同學連續兩題在這麼短的時間內通過。</p>'}
        <p class="muted small">間隔是「這一題第一次通過」減去「上一題第一次通過」的時間。很簡單的題目本來就可能很快，請搭配程式碼一起看。</p>`;
    }
    function codeHtml(code, other) {   // 程式碼：註解標色；和另一份完全相同的行標底色
      const same = other ? new Set(String(other).split('\n').map(l => l.trim()).filter(l => l.length > 3)) : null;
      return `<pre class="insp-code">${String(code).split('\n').map((l, i) => {
        const h = esc(l).replace(/(\/\/.*$)/, '<span class="insp-cmt">$1</span>');
        return `<span class="${same && same.has(l.trim()) ? 'insp-same' : ''}"><i>${i + 1}</i>${h || ' '}</span>`;
      }).join('\n')}</pre>`;
    }
    function detailHtml(r) {
      return `<div class="insp-detail-box"><div class="row"><b>代表程式：</b>${r.rep.id ? `<a href="#/submission/${r.rep.id}">#${r.rep.id}</a>` : ''} ${vBadge(r.rep.verdict)} <span class="muted small">${fmtTime(r.rep.time)}</span></div>
        ${codeHtml(r.rep.code)}
        <table class="list small"><thead><tr><th>#</th><th>時間</th><th>結果</th><th>分數</th><th>貼上（最大一次）</th><th>打字</th><th>開始寫到送出</th></tr></thead><tbody>
        ${r.list.slice().reverse().map(s => `<tr><td><a href="#/submission/${s.id}">${s.id}</a></td><td>${fmtTime(s.time)}</td><td>${vBadge(s.verdict)}</td><td>${s.score}</td>
          <td>${s.meta ? `${s.meta.paste}（${s.meta.big}）` : '—'}</td><td>${s.meta ? s.meta.typed : '—'}</td><td>${s.meta && s.meta.ms ? mmss(s.meta.ms) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function compare(x, y, q) {
      const box = document.createElement('div');
      box.className = 'insp-modal';
      box.innerHTML = `<div class="insp-modal-card"><div class="row"><h3 style="margin:0">並排比對：相似度 ${q ? q.sim : '?'}%${q && q.shape ? `（結構 ${q.shape}%）` : ''}</h3><span class="spacer"></span><button class="btn" data-close>關閉</button></div>
        <p class="muted small">底色 = 兩份程式完全一樣的行（不算空白）。${q && q.sameC.length ? `<b>有 ${q.sameC.length} 行註解一模一樣。</b>` : ''}</p>
        <div class="insp-cmp"><div><b>${seat2(x.seat)} ${esc(x.st.name)}</b> <span class="muted small">${fmtTime(x.rep.time)}</span>${codeHtml(x.rep.code, y.rep.code)}</div>
          <div><b>${seat2(y.seat)} ${esc(y.st.name)}</b> <span class="muted small">${fmtTime(y.rep.time)}</span>${codeHtml(y.rep.code, x.rep.code)}</div></div></div>`;
      document.body.appendChild(box);
      box.onclick = e => { if (e.target === box || e.target.hasAttribute('data-close')) box.remove(); };
    }
    function showAll() {
      const box = document.createElement('div');
      box.className = 'insp-modal';
      box.innerHTML = `<div class="insp-modal-card wide"><div class="row"><h3 style="margin:0">📋 ${esc(p.id)} ${esc(p.title)}：全班程式碼（每人的代表程式）</h3><span class="spacer"></span><button class="btn" data-close>關閉</button></div>
        <div class="insp-grid">${rows.map(r => `<div class="${r.flags.length && !r.voided ? 'hot' : ''}"><b>${seat2(r.seat)} ${esc(r.st.name)}</b> ${r.voided ? vBadge('VOID') : r.ac ? vBadge('AC') : vBadge(r.rep.verdict)} ${r.flags.map(f => `<span class="insp-flag">${f}</span>`).join(' ')}${codeHtml(r.rep.code)}</div>`).join('')}</div></div>`;
      document.body.appendChild(box);
      box.onclick = e => { if (e.target === box || e.target.hasAttribute('data-close')) box.remove(); };
    }
    async function doVoid(r, action) {
      let reason = '', notify = false;
      if (action === 'void') {
        reason = prompt(`作廢 ${seat2(r.seat)} ${r.st.name} 在 ${p.id} 的全部 ${r.live.length} 筆提交？\n作廢後這一題等於沒作答（名次讓給其他同學），紀錄會保留，之後可以按「恢復」。\n\n請輸入原因（例如：使用 AI 產生程式碼）：`, '使用 AI 產生程式碼');
        if (reason === null) return;
        notify = confirm('要在他的提交留言通知他嗎？\n（按「確定」= 留言通知；「取消」= 不通知）');
      } else if (!confirm(`恢復 ${seat2(r.seat)} ${r.st.name} 在 ${p.id} 被作廢的提交？`)) return;
      try {
        const x = await api('/api/inspect/void', { cid, pid: p.id, seat: r.seat, action, reason, notify });
        toast(action === 'void' ? `已作廢 ${x.count} 筆提交` : `已恢復 ${x.count} 筆提交`);
        renderInspect(el, p, isActive);
      } catch (e) { toast(e.message); }
    }
    draw();
  };
})();
