(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const DATA_KEY = 'myyear-data-v1';
const ROOM_KEY = 'myyear-room-name';
const NOW = new Date();
const THIS_YEAR = NOW.getFullYear();
const THIS_MONTH = NOW.getMonth() + 1;
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------------- 데이터 ---------------- */
function blank() {
  return { kind: 'myyear', version: 1, years: [0,1,2,3,4].map((i) => THIS_YEAR + i), plans: {} };
}
function validate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const years = Array.isArray(raw.years) ? [...new Set(raw.years.filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2200))].sort((a, b) => a - b) : [];
  const plans = {};
  const src = raw.plans && typeof raw.plans === 'object' ? raw.plans : {};
  for (const [y, p] of Object.entries(src)) {
    if (!/^\d{4}$/.test(y) || !p || typeof p !== 'object') continue;
    const out = { goal: typeof p.goal === 'string' ? p.goal.slice(0, 2000) : '', months: {}, memos: {} };
    for (const m of MONTHS) {
      const list = Array.isArray(p.months?.[m]) ? p.months[m] : [];
      const items = list.filter((it) => it && typeof it.text === 'string').slice(0, 200)
        .map((it) => ({ id: typeof it.id === 'string' ? it.id : uid(), text: it.text.slice(0, 200), done: !!it.done }));
      if (items.length) out.months[m] = items;
      const memo = p.memos?.[m];
      if (typeof memo === 'string' && memo) out.memos[m] = memo.slice(0, 2000);
    }
    plans[y] = out;
  }
  if (!years.length) return null;
  return { kind: 'myyear', version: 1, years, plans };
}
let data = blank();
const plan = (y) => (data.plans[y] ||= { goal: '', months: {}, memos: {} });
const items = (y, m) => (plan(y).months[m] ||= []);
const yearCount = (y) => {
  const p = data.plans[y]; let total = 0, done = 0;
  if (p) for (const m of MONTHS) for (const it of p.months[m] || []) { total++; if (it.done) done++; }
  return { total, done };
};
function tidy() {
  for (const p of Object.values(data.plans)) for (const m of MONTHS) {
    if (p.months[m] && !p.months[m].length) delete p.months[m];
    if (p.memos[m] === '') delete p.memos[m];
  }
}

/* ---------------- 화면: 연도별 한눈에 ---------------- */
function renderOverview() {
  const ys = data.years;
  $('range-label').textContent = ys.length > 1 ? `${ys[0]}–${String(ys[ys.length - 1]).slice(2)}` : String(ys[0]);
  let html = '<colgroup><col class="mcol-c">' + ys.map(() => '<col class="ycol">').join('') + '</colgroup>';
  html += '<thead><tr><th class="mcol" scope="col"><span class="sr-only">월</span></th>' + ys.map((y) => {
    const c = yearCount(y);
    return `<th scope="col" class="${y === THIS_YEAR ? 'now' : ''}"><button type="button" class="year-link" data-year="${y}" aria-label="${y}년 상세 보기">${y}${c.total ? `<span class="cnt">${c.done}/${c.total}</span>` : ''}</button></th>`;
  }).join('') + '</tr></thead><tbody>';
  for (const m of MONTHS) {
    html += `<tr class="${m === THIS_MONTH ? 'now-month' : ''}"><th scope="row">${m}<small>월</small></th>`;
    for (const y of ys) {
      const list = data.plans[y]?.months[m] || [];
      const memo = data.plans[y]?.memos[m] || '';
      const shown = list.slice(0, 4);
      let inner = '';
      if (shown.length) inner += '<ul>' + shown.map((it) => `<li class="${it.done ? 'done' : ''}">${esc(it.text)}</li>`).join('') + '</ul>';
      if (list.length > 4) inner += `<span class="more">+${list.length - 4}개 더</span>`;
      if (memo) inner += `<span class="memo-dot">메모 · ${esc(memo.split('\n')[0])}</span>`;
      if (!inner) inner = '<span class="plus" aria-hidden="true">+</span>';
      const now = y === THIS_YEAR && m === THIS_MONTH;
      html += `<td><button type="button" class="cell${now ? ' now' : ''}" data-y="${y}" data-m="${m}" aria-label="${y}년 ${m}월 계획 ${list.length}개, 편집">${inner}</button></td>`;
    }
    html += '</tr>';
  }
  $('overview').innerHTML = html + '</tbody>';
  $('overview').style.setProperty('--n', ys.length);
}

/* ---------------- 화면: 연도 상세 ---------------- */
let curYear = data.years.includes(THIS_YEAR) ? THIS_YEAR : data.years[0];
function itemHtml(it, y, m) {
  return `<li class="item${it.done ? ' done' : ''}" data-id="${esc(it.id)}" data-y="${y}" data-m="${m}">
    <input type="checkbox" ${it.done ? 'checked' : ''} aria-label="${esc(it.text)} 완료">
    <input type="text" class="txt" value="${esc(it.text)}" maxlength="200" aria-label="계획 내용">
    <button type="button" class="del" aria-label="${esc(it.text)} 삭제">×</button></li>`;
}
function renderYear() {
  const y = curYear, p = data.plans[y];
  $('year-num').textContent = y;
  const i = data.years.indexOf(y);
  $('year-prev').disabled = i <= 0;
  $('year-next').disabled = i >= data.years.length - 1;
  $('year-remove').disabled = data.years.length <= 1;
  if (document.activeElement !== $('year-goal-text')) $('year-goal-text').value = p?.goal || '';
  const c = yearCount(y);
  $('year-progress').innerHTML = c.total
    ? `<span>완료 ${c.done} / ${c.total}</span><span class="bar" aria-hidden="true"><i style="width:${Math.round(c.done / c.total * 100)}%"></i></span><span>${Math.round(c.done / c.total * 100)}%</span>`
    : '<span>각 달에 계획을 추가해 보세요.</span>';
  $('months').innerHTML = MONTHS.map((m) => {
    const list = p?.months[m] || [];
    const done = list.filter((it) => it.done).length;
    const now = y === THIS_YEAR && m === THIS_MONTH;
    return `<section class="month${now ? ' now' : ''}" aria-label="${m}월">
      <div class="month-head"><b>${m}</b><span>월</span>${list.length ? `<small>${done}/${list.length}</small>` : ''}</div>
      <ul class="items">${list.map((it) => itemHtml(it, y, m)).join('')}</ul>
      <form class="item-add" data-y="${y}" data-m="${m}"><input type="text" maxlength="200" placeholder="계획 추가" aria-label="${m}월 계획 추가"><button class="btn" type="submit">추가</button></form>
      <textarea data-memo-y="${y}" data-memo-m="${m}" rows="2" placeholder="메모" aria-label="${m}월 메모">${esc(p?.memos[m] || '')}</textarea>
    </section>`;
  }).join('');
}

/* ---------------- 칸 편집 팝업 ---------------- */
let modal = null;
function openCell(y, m) {
  modal = { y, m, back: document.activeElement };
  $('cell-title').textContent = `${y}년 ${m}월`;
  renderCell();
  $('cell-memo').value = data.plans[y]?.memos[m] || '';
  $('cell-modal').hidden = false;
  setTimeout(() => $('cell-input').focus(), 30);
}
function renderCell() {
  if (!modal) return;
  const { y, m } = modal;
  $('cell-items').innerHTML = (data.plans[y]?.months[m] || []).map((it) => itemHtml(it, y, m)).join('');
}
function closeCell() {
  if (!modal) return;
  const back = modal.back; modal = null;
  $('cell-modal').hidden = true;
  renderAll();
  const again = back && back.dataset && document.querySelector(`.cell[data-y="${back.dataset.y}"][data-m="${back.dataset.m}"]`);
  (again || back)?.focus?.();
}

/* ---------------- 공통 편집 동작 ---------------- */
function findItem(li) {
  const list = data.plans[li.dataset.y]?.months[li.dataset.m] || [];
  return { list, idx: list.findIndex((it) => it.id === li.dataset.id) };
}
function bindItems(root, rerender) {
  root.addEventListener('change', (e) => {
    const li = e.target.closest('.item');
    if (!li) return;
    const { list, idx } = findItem(li);
    if (idx < 0) return;
    if (e.target.type === 'checkbox') { list[idx].done = e.target.checked; li.classList.toggle('done', e.target.checked); commit(); rerender(); }
    else if (e.target.classList.contains('txt')) {
      const v = e.target.value.trim();
      if (!v) { list.splice(idx, 1); commit(); rerender(); }
      else { list[idx].text = v; commit(); }
    }
  });
  root.addEventListener('input', (e) => {
    if (!e.target.classList.contains('txt')) return;
    const li = e.target.closest('.item'); const { list, idx } = findItem(li);
    if (idx >= 0 && e.target.value.trim()) { list[idx].text = e.target.value.trim(); commit(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('txt')) { e.preventDefault(); e.target.blur(); }
  });
  root.addEventListener('click', (e) => {
    const del = e.target.closest('.del');
    if (!del) return;
    const li = del.closest('.item'); const { list, idx } = findItem(li);
    if (idx < 0) return;
    const [removed] = list.splice(idx, 1);
    lastRemoved = { y: li.dataset.y, m: li.dataset.m, idx, item: removed };
    commit(); rerender();
    toast(`"${removed.text}" 삭제됨 · 되돌리려면 Ctrl+Z`);
  });
}
let lastRemoved = null;
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && lastRemoved && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
    const r = lastRemoved; lastRemoved = null;
    items(r.y, r.m).splice(r.idx, 0, r.item); commit(); renderAll(); renderCell(); toast('되돌렸어요');
  }
  if (e.key === 'Escape' && modal) closeCell();
});

/* ---------------- 화면 전환 ---------------- */
function show(view, year) {
  if (year && data.years.includes(year)) curYear = year;
  if (!data.years.includes(curYear)) curYear = data.years.includes(THIS_YEAR) ? THIS_YEAR : data.years[0];
  const all = view !== 'year';
  $('view-all').hidden = !all; $('view-year').hidden = all;
  $('tab-all').setAttribute('aria-selected', String(all));
  $('tab-year').setAttribute('aria-selected', String(!all));
  $('tab-year').textContent = all ? '연도 상세' : `${curYear}년 상세`;
  const hash = all ? '#all' : '#y' + curYear;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  renderAll();
}
function route() {
  const m = /^#y(\d{4})$/.exec(location.hash);
  if (m) show('year', Number(m[1])); else show('all');
}
function renderAll() { renderOverview(); if (!$('view-year').hidden) renderYear(); }
function goYear(y) { history.pushState(null, '', '#y' + y); show('year', y); window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ---------------- 저장 (이 기기 + 클라우드) ---------------- */
// 바꿀 때마다: 이 기기에 저장(오프라인 대비) → 잠시 뒤 클라우드 저장
function commit() {
  tidy();
  const json = JSON.stringify(data);
  try { localStorage.setItem(DATA_KEY, json); const k = cloud.cacheKey(); if (k) localStorage.setItem(k, json); } catch {}
  cloud.queue();
}

const cloud = (() => {
  const cfg = window.MYPLAN_CONFIG || {};
  let key = null, revision = 0, dirty = false, saving = false, blocked = false, timer = null, loaded = false;
  let mode = localStorage.getItem('myyear-cloud-mode') === 'alt' ? 'alt' : 'main';
  const status = (t) => { $('cloud-status').textContent = t; };
  async function rpc(name, args) {
    const c = new AbortController(), to = setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: c.signal });
      const text = await r.text(); let d = null;
      try { d = text ? JSON.parse(text) : null; } catch { throw Error('서버 응답 오류 (HTTP ' + r.status + ')'); }
      if (!r.ok) throw Error((d?.code || r.status) + ': ' + (d?.message || text));
      return d;
    } catch (e) {
      if (e.name === 'AbortError') throw Error('서버 응답이 15초 이상 지연됐어요.');
      if (/Failed to fetch|Load failed/.test(e.message)) throw Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하세요.');
      throw e;
    } finally { clearTimeout(to); }
  }
  async function hash(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('myplan-year-v1:' + s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 주간 플래너와 같은 저장 함수를 쓰되, 이름 앞에 다른 값을 붙여 별도 칸에 저장 (주간 플래너 기록과 섞이지 않음)
  function pack() {
    const json = JSON.stringify(data);
    const base = { 'myplan-data-v2': null, 'myplan-meals-v1': null, 'myplan-habits-v1': null };
    return mode === 'alt' ? { ...base, 'myplan-data-v2': json } : { ...base, 'myplan-year-v1': json };
  }
  function unpack(payload) {
    if (!payload) return null;
    for (const k of ['myplan-year-v1', 'myplan-data-v2']) {
      const v = payload[k];
      if (typeof v !== 'string') continue;
      try { const d = JSON.parse(v); if (d?.kind === 'myyear') { if (k === 'myplan-data-v2') { mode = 'alt'; } return validate(d); } } catch {}
    }
    return null;
  }
  async function save() {
    if (!dirty || !loaded || blocked || saving) return;
    saving = true; status('클라우드 저장 중…');
    const snapshot = JSON.stringify(data);
    try {
      let rev;
      try { rev = await rpc('save_shared_planner', { p_key: key, p_payload: pack(), p_expected: revision }); }
      catch (e) {
        if (e.message.includes('CONFLICT') || mode === 'alt') throw e;
        mode = 'alt'; localStorage.setItem('myyear-cloud-mode', 'alt');
        rev = await rpc('save_shared_planner', { p_key: key, p_payload: pack(), p_expected: revision });
      }
      revision = rev;
      dirty = snapshot !== JSON.stringify(data);
      status(dirty ? '추가 변경 저장 대기 중…' : '클라우드 저장 완료');
      if (dirty) timer = setTimeout(save, 800);
    } catch (e) {
      if (e.message.includes('CONFLICT')) { blocked = true; $('cloud-reload').hidden = false; status('다른 기기에서 먼저 바뀌었어요. 최신 기록을 불러오세요.'); }
      else status('저장 실패: ' + e.message + ' · 백업 파일을 저장해 두세요.');
    } finally { saving = false; }
  }
  function queue() { if (!loaded) return; dirty = true; status('저장 대기 중…'); clearTimeout(timer); timer = setTimeout(save, 700); }
  async function read() {
    const d = await rpc('read_shared_planner', { p_key: key });
    return { revision: d ? d.revision : 0, data: d ? unpack(d.payload) : null };
  }
  async function open(name) {
    name = name.normalize('NFC').trim();
    if (name.length < 2 || name.length > 80) { $('login-status').textContent = '기록방 이름은 2~80자로 입력하세요.'; return; }
    if (!cfg.url || !cfg.key) { $('login-status').textContent = 'supabase-config.js 설정이 없어요.'; return; }
    const btn = $('room-form').querySelector('button'); btn.disabled = true;
    $('login-status').textContent = '기록방 불러오는 중…';
    try {
      key = await hash(name);
      const r = await read();
      revision = r.revision;
      let local = null;
      try { local = validate(JSON.parse(localStorage.getItem('myyear-cache-' + key) || 'null')); } catch {}
      data = r.data || local || blank();
      if (!r.data && local) dirty = true;
      localStorage.setItem(ROOM_KEY, name);
      $('title-room').textContent = name; $('title-room').title = '기록방: ' + name; $('title-room').hidden = false;
      $('login').hidden = true; $('app').hidden = false; $('more-tools').hidden = false;
      loaded = true;
      status(name.length < 8 ? '연결됨 · 이름이 짧아 남이 짐작하기 쉬워요.' : '클라우드 연결됨');
      route();
      if (dirty) save();
    } catch (e) {
      $('login-status').textContent = '열지 못했어요: ' + e.message;
    } finally { btn.disabled = false; }
  }
  async function refresh(force) {
    if (!loaded || saving || (dirty && !force)) return;
    try {
      const r = await read();
      if (force || r.revision > revision) {
        revision = r.revision; data = r.data || blank(); blocked = false; dirty = false;
        $('cloud-reload').hidden = true; try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch {}
        renderAll(); renderCell(); status(force ? '최신 기록을 불러왔어요' : '다른 기기의 변경을 반영했어요');
      }
    } catch (e) { if (force) status('불러오기 실패: ' + e.message); }
  }
  const cacheKey = () => key && 'myyear-cache-' + key;
  return { open, queue, refresh, cacheKey, get loaded() { return loaded; } };
})();


/* ---------------- 이벤트 ---------------- */
$('room-form').addEventListener('submit', (e) => { e.preventDefault(); cloud.open($('room-name').value); });
$('tab-all').addEventListener('click', () => { history.pushState(null, '', '#all'); show('all'); });
$('tab-year').addEventListener('click', () => goYear(curYear));
window.addEventListener('popstate', route);

$('overview').addEventListener('click', (e) => {
  const yl = e.target.closest('.year-link'); if (yl) return goYear(Number(yl.dataset.year));
  const c = e.target.closest('.cell'); if (c) openCell(Number(c.dataset.y), Number(c.dataset.m));
});
$('year-add-next').addEventListener('click', () => { const y = data.years[data.years.length - 1] + 1; data.years.push(y); commit(); renderAll(); toast(`${y}년을 추가했어요`); const s = document.querySelector('.overview-scroll'); s.scrollTo({ left: s.scrollWidth, behavior: 'smooth' }); });
$('year-add-prev').addEventListener('click', () => { const y = data.years[0] - 1; data.years.unshift(y); commit(); renderAll(); toast(`${y}년을 추가했어요`); document.querySelector('.overview-scroll').scrollTo({ left: 0, behavior: 'smooth' }); });

$('year-prev').addEventListener('click', () => { const i = data.years.indexOf(curYear); if (i > 0) goYear(data.years[i - 1]); });
$('year-next').addEventListener('click', () => { const i = data.years.indexOf(curYear); if (i < data.years.length - 1) goYear(data.years[i + 1]); });
$('year-remove').addEventListener('click', () => {
  if (data.years.length <= 1) return;
  const c = yearCount(curYear);
  if (!confirm(`${curYear}년을 표에서 지울까요?${c.total || data.plans[curYear]?.goal ? `\n이 연도의 계획 ${c.total}개와 목표·메모도 함께 지워져요.` : ''}`)) return;
  const y = curYear; data.years = data.years.filter((x) => x !== y); delete data.plans[y];
  commit(); history.pushState(null, '', '#all'); show('all'); toast(`${y}년을 지웠어요`);
});
$('year-goal-text').addEventListener('input', (e) => { plan(curYear).goal = e.target.value; commit(); });

const months = $('months');
bindItems(months, () => { const f = document.activeElement; renderYear(); renderOverview(); restoreFocus(f); });
months.addEventListener('submit', (e) => {
  const f = e.target.closest('.item-add'); if (!f) return; e.preventDefault();
  const input = f.querySelector('input'), v = input.value.trim(); if (!v) return;
  items(f.dataset.y, f.dataset.m).push({ id: uid(), text: v, done: false }); commit();
  renderYear(); renderOverview();
  months.querySelector(`.item-add[data-m="${f.dataset.m}"] input`)?.focus();
});
months.addEventListener('input', (e) => {
  const t = e.target; if (!t.dataset.memoM) return;
  plan(t.dataset.memoY).memos[t.dataset.memoM] = t.value; commit();
});
function restoreFocus(prev) {
  if (!prev || document.body.contains(prev)) return;
  const li = prev.closest?.('.item'); if (!li) return;
  const again = document.querySelector(`.item[data-id="${CSS.escape(li.dataset.id)}"] ${prev.classList.contains('txt') ? '.txt' : 'input[type=checkbox]'}`);
  again?.focus();
}

bindItems($('cell-items'), () => renderCell());
$('cell-add').addEventListener('submit', (e) => {
  e.preventDefault(); if (!modal) return;
  const v = $('cell-input').value.trim(); if (!v) return;
  items(modal.y, modal.m).push({ id: uid(), text: v, done: false }); commit();
  $('cell-input').value = ''; renderCell(); $('cell-input').focus();
});
$('cell-memo').addEventListener('input', (e) => { if (modal) { plan(modal.y).memos[modal.m] = e.target.value; commit(); } });
$('cell-close').addEventListener('click', closeCell);
$('cell-done').addEventListener('click', closeCell);
$('cell-goto').addEventListener('click', () => { const y = modal.y; modal.back = null; closeCell(); goYear(y); });
$('cell-modal').addEventListener('click', (e) => { if (e.target === $('cell-modal')) closeCell(); });

// ⋯ 메뉴
document.addEventListener('click', (e) => { const d = $('more-tools'); if (d.open && !d.contains(e.target)) d.open = false; });
$('backup-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `my-year-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('more-tools').open = false;
});
$('backup-load').addEventListener('click', () => { $('backup-file').click(); $('more-tools').open = false; });
$('backup-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = validate(JSON.parse(await f.text()));
    if (!d) throw Error();
    if (!confirm('백업 파일로 지금 기록을 바꿀까요? 현재 내용은 사라져요.')) return;
    data = d; commit(); renderAll(); toast('백업을 불러왔어요');
  } catch { alert('올바른 연도 계획 백업 파일이 아니에요.'); }
});
$('room-leave').addEventListener('click', () => { if (!confirm('이 기기에서 기록방을 나갈까요? 기록은 클라우드에 그대로 남아요.')) return; localStorage.removeItem(ROOM_KEY); localStorage.removeItem(DATA_KEY); location.hash = ''; location.reload(); });
$('cloud-reload').addEventListener('click', () => {
  if (confirm('최신 기록을 불러오면 이 화면에서 저장되지 않은 변경은 사라져요. 먼저 백업 파일을 저장할까요?')) $('backup-save').click();
  cloud.refresh(true);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloud.refresh(false); });

let toastTimer;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200); }

/* ---------------- 시작 ---------------- */
const saved = localStorage.getItem(ROOM_KEY);
const planRoom = localStorage.getItem('myplan-room-name');   // 주간 플래너에서 쓰던 이름 (같은 사이트 주소라 공유됨)
if (saved) { $('room-name').value = saved; cloud.open(saved); }
else if (planRoom) { $('room-name').value = planRoom; $('login-status').textContent = '주간 플래너에서 쓰던 이름을 미리 넣어 뒀어요. 맞으면 [기록방 열기]를 누르세요.'; }
})();
