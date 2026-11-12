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
  return { kind: 'myyear', version: 1, years: [0,1,2,3,4].map((i) => THIS_YEAR + i), plans: {}, todos: [], mandals: [] };
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
        .map((it) => ({ id: typeof it.id === 'string' ? it.id : uid(), text: it.text.slice(0, 200), done: !!it.done, ...(typeof it.g === 'string' ? { g: it.g } : {}) }));
      if (items.length) out.months[m] = items;
      const memo = p.memos?.[m];
      if (typeof memo === 'string' && memo) out.memos[m] = memo.slice(0, 2000);
    }
    plans[y] = out;
  }
  if (!years.length) return null;
  const todos = (Array.isArray(raw.todos) ? raw.todos : []).filter((t) => t && typeof t.text === 'string' && t.text.trim()).slice(0, 500)
    .map((t) => ({ id: typeof t.id === 'string' ? t.id : uid(), text: t.text.slice(0, 300), done: !!t.done }));
  const mandals = (Array.isArray(raw.mandals) ? raw.mandals : []).slice(0, 20).map((md) => ({
    id: typeof md?.id === 'string' ? md.id : uid(),
    cells: Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, c) => { const v = md?.cells?.[b]?.[c]; return typeof v === 'string' ? v.slice(0, 100) : ''; })),
  }));
  return { kind: 'myyear', version: 1, years, plans, todos, mandals };
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
    const it = list[idx], y = Number(li.dataset.y), m = Number(li.dataset.m);
    const others = siblingsOf(it);
    if (others.length > 1) return askDelete(it, y, m, others, rerender);
    removeItems([{ y, m, id: it.id }]); rerender();
  });
}
/* 같이 넣은 계획 찾기: 여러 달에 한 번에 넣은 것(묶음)은 묶음으로, 예전에 넣은 것은 같은 이름으로 */
function allItems() {
  const out = [];
  for (const y of data.years) for (const m of MONTHS) for (const it of data.plans[y]?.months[m] || []) out.push({ y, m, it });
  return out;
}
function siblingsOf(it) {
  const all = allItems();
  return it.g ? all.filter((x) => x.it.g === it.g) : all.filter((x) => x.it.text === it.text);
}
// "2026년 1~4월, 6월 · 2027년 3월" 처럼 칸 목록을 짧게
function cellsText(cells) {
  const by = {};
  for (const c of cells) (by[c.y] ||= new Set()).add(c.m);
  return Object.keys(by).sort().map((y) => {
    const ms = [...by[y]].sort((a, b) => a - b), runs = [];
    for (const m of ms) { const r = runs[runs.length - 1]; if (r && m === r[1] + 1) r[1] = m; else runs.push([m, m]); }
    return `${y}년 ` + runs.map(([a, b]) => (a === b ? `${a}월` : `${a}~${b}월`)).join(', ');
  }).join(' · ');
}
let lastRemoved = null;
function removeItems(targets, label) {
  const removed = [];
  for (const t of targets) {
    const list = data.plans[t.y]?.months[t.m]; if (!list) continue;
    const idx = list.findIndex((x) => x.id === t.id); if (idx < 0) continue;
    removed.push({ y: t.y, m: t.m, idx, item: list.splice(idx, 1)[0] });
  }
  if (!removed.length) return;
  lastRemoved = removed;
  commit(); renderOverview(); if (!$('view-year').hidden) renderYear(); renderCell();
  toast(label || `"${removed[0].item.text}" 삭제됨`, '되돌리기', undoRemove);
}
function undoRemove() {
  if (!lastRemoved) return;
  const r = lastRemoved; lastRemoved = null;
  for (const x of [...r].reverse()) items(x.y, x.m).splice(Math.min(x.idx, items(x.y, x.m).length), 0, x.item);
  commit(); renderAll(); renderCell(); toast('되돌렸어요');
}
let pendingDel = null;
function askDelete(it, y, m, others, rerender) {
  pendingDel = { it, y, m, others, rerender, back: document.activeElement };
  $('del-text').textContent = `"${it.text}"`;
  $('del-range').textContent = cellsText(others.map((x) => ({ y: x.y, m: x.m })));
  $('del-all').textContent = `${others.length}칸 모두 지우기`;
  $('del-one').textContent = `${y}년 ${m}월만 지우기`;
  $('del-modal').hidden = false;
  setTimeout(() => $('del-all').focus(), 30);
}
function closeDel() { const b = pendingDel?.back; pendingDel = null; $('del-modal').hidden = true; if (b && document.body.contains(b)) b.focus?.(); }
$('del-one').addEventListener('click', () => { const p = pendingDel; if (!p) return; closeDel(); removeItems([{ y: p.y, m: p.m, id: p.it.id }]); });
$('del-all').addEventListener('click', () => { const p = pendingDel; if (!p) return; closeDel(); removeItems(p.others.map((x) => ({ y: x.y, m: x.m, id: x.it.id })), `"${p.it.text}" ${p.others.length}칸 삭제됨`); });
$('del-cancel').addEventListener('click', closeDel);
$('del-modal').addEventListener('click', (e) => { if (e.target === $('del-modal')) closeDel(); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && lastRemoved && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); undoRemove(); }
  if (e.key === 'Escape' && pendingDel) { closeDel(); return; }
  if (e.key === 'Escape' && modal) closeCell();
  if (e.key === 'Escape' && multi) closeMulti();
});

/* ---------------- 화면 전환 ---------------- */
const VIEWS = ['all', 'year', 'todo', 'mandal'];
let curView = 'all';
function show(view, year) {
  if (!VIEWS.includes(view)) view = 'all';
  curView = view;
  if (year && data.years.includes(year)) curYear = year;
  if (!data.years.includes(curYear)) curYear = data.years.includes(THIS_YEAR) ? THIS_YEAR : data.years[0];
  for (const v of VIEWS) { $('view-' + v).hidden = v !== view; $('tab-' + v).setAttribute('aria-selected', String(v === view)); }
  $('tab-year').textContent = view === 'year' ? `${curYear}년 상세` : '연도 상세';
  const hash = view === 'year' ? '#y' + curYear : '#' + view;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  renderAll();
}
function route() {
  const m = /^#y(\d{4})$/.exec(location.hash);
  if (m) show('year', Number(m[1])); else show(location.hash.slice(1) || 'all');
}
function renderAll() { renderOverview(); if (curView === 'year') renderYear(); if (curView === 'todo') renderTodos(); if (curView === 'mandal') renderMandals(); }
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
      window.MyRooms?.remember(name);
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
  async function remove(password) {
    if (!loaded) throw Error('기록방이 열려 있지 않아요.');
    clearTimeout(timer);
    if (dirty && !blocked) await save();
    await rpc('delete_shared_planner', { p_key: key, p_password: password, p_expected: revision });
    dirty = false; loaded = false;
    try { localStorage.removeItem(cacheKey()); } catch {}
  }
  return { open, queue, refresh, cacheKey, remove, get loaded() { return loaded; } };
})();


/* ---------------- 이벤트 ---------------- */
$('room-form').addEventListener('submit', (e) => { e.preventDefault(); cloud.open($('room-name').value); });
$('tab-all').addEventListener('click', () => { history.pushState(null, '', '#all'); show('all'); });
$('tab-year').addEventListener('click', () => goYear(curYear));
$('tab-todo').addEventListener('click', () => { history.pushState(null, '', '#todo'); show('todo'); });
$('tab-mandal').addEventListener('click', () => { history.pushState(null, '', '#mandal'); show('mandal'); });
window.addEventListener('popstate', route);

$('overview').addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const yl = e.target.closest('.year-link'); if (yl) return goYear(Number(yl.dataset.year));
  const c = e.target.closest('.cell'); if (c) openCell(Number(c.dataset.y), Number(c.dataset.m));
});

/* ---------------- 여러 달 끌어서 선택 ---------------- */
// PC: 마우스로 끌기 · 휴대폰: 칸을 꾹(0.35초) 누른 뒤 끌기 (그냥 밀면 스크롤)
let sel = null, suppressClick = false, selected = [];
const cellOf = (x, y) => document.elementFromPoint(x, y)?.closest?.('#overview .cell');
function selRange(a, b) {
  const ys = data.years, i1 = ys.indexOf(a.y), i2 = ys.indexOf(b.y);
  const years = ys.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
  const m1 = Math.min(a.m, b.m), m2 = Math.max(a.m, b.m);
  const out = []; for (const y of years) for (let m = m1; m <= m2; m++) out.push({ y, m });
  return out;
}
function paintSel() {
  document.querySelectorAll('#overview .cell.sel').forEach((c) => c.classList.remove('sel'));
  if (!sel) return;
  selected = selRange(sel.a, sel.b);
  for (const { y, m } of selected) document.querySelector(`#overview .cell[data-y="${y}"][data-m="${m}"]`)?.classList.add('sel');
  const tip = $('sel-tip');
  tip.textContent = rangeText(selected); tip.hidden = selected.length < 2;
}
function rangeText(list) {
  if (!list.length) return '';
  const ys = [...new Set(list.map((c) => c.y))], ms = list.map((c) => c.m);
  const m1 = Math.min(...ms), m2 = Math.max(...ms);
  const yt = ys.length > 1 ? `${ys[0]}~${ys[ys.length - 1]}년` : `${ys[0]}년`;
  return `${yt} ${m1 === m2 ? m1 + '월' : `${m1}~${m2}월`} · ${list.length}칸`;
}
function startSel(cell) { sel = { a: { y: Number(cell.dataset.y), m: Number(cell.dataset.m) }, moved: false }; sel.b = sel.a; paintSel(); }
function moveSel(cell) {
  if (!sel || !cell) return;
  const b = { y: Number(cell.dataset.y), m: Number(cell.dataset.m) };
  if (b.y === sel.b.y && b.m === sel.b.m) return;
  sel.b = b; sel.moved = true; paintSel();
}
function endSel(force) {
  if (!sel) return;
  const s = sel; sel = null; $('sel-tip').hidden = true;
  if (s.moved || force) { suppressClick = !force; setTimeout(() => { suppressClick = false; }, 400); openMulti(selRange(s.a, s.b)); }
  else { selected = []; paintSel(); }
}
const ov = $('overview');
ov.addEventListener('pointerdown', (e) => {
  suppressClick = false;
  if (e.pointerType === 'touch' || e.button !== 0) return;
  const c = e.target.closest('.cell'); if (!c) return;
  e.preventDefault(); startSel(c);
});
document.addEventListener('pointermove', (e) => { if (sel && e.pointerType !== 'touch') moveSel(cellOf(e.clientX, e.clientY)); });
document.addEventListener('pointerup', (e) => { if (sel && e.pointerType !== 'touch') endSel(false); });
let press = null;
ov.addEventListener('touchstart', (e) => {
  const c = e.target.closest('.cell'); if (!c || e.touches.length > 1) return;
  const t = e.touches[0];
  press = { x: t.clientX, y: t.clientY, timer: setTimeout(() => { if (!press) return; press.active = true; startSel(c); navigator.vibrate?.(15); }, 350) };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!press) return;
  const t = e.touches[0];
  if (!press.active) { if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; } return; }
  e.preventDefault(); moveSel(cellOf(t.clientX, t.clientY));
}, { passive: false });
document.addEventListener('touchend', (e) => {
  if (!press) return;
  clearTimeout(press.timer);
  if (press.active) { e.preventDefault(); endSel(true); }
  press = null;
}, { passive: false });
document.addEventListener('touchcancel', () => { if (press) { clearTimeout(press.timer); press = null; if (sel) { sel = null; selected = []; paintSel(); $('sel-tip').hidden = true; } } });
ov.addEventListener('contextmenu', (e) => { if (press?.active || sel) e.preventDefault(); });

let multi = null;
function openMulti(list) {
  if (list.length === 1) { selected = []; paintSel(); return openCell(list[0].y, list[0].m); }
  multi = list;
  $('multi-range').textContent = rangeText(list);
  $('multi-text').value = '';
  renderMultiExisting();
  $('multi-modal').hidden = false;
  setTimeout(() => $('multi-text').focus(), 30);
}
function multiExisting() {
  const map = new Map();
  for (const { y, m } of multi || []) for (const it of data.plans[y]?.months[m] || []) {
    if (!map.has(it.text)) map.set(it.text, []);
    map.get(it.text).push({ y, m, id: it.id });
  }
  return map;
}
function renderMultiExisting() {
  const map = multiExisting();
  $('multi-existing').hidden = !map.size;
  $('multi-existing-list').innerHTML = [...map].map(([t, cells], i) =>
    `<li><span class="mx-text">${esc(t)}</span><small>${esc(cellsText(cells))}</small><button type="button" class="btn small danger" data-mx="${i}">지우기</button></li>`).join('');
}
$('multi-existing-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mx]'); if (!b) return;
  const [t, cells] = [...multiExisting()][Number(b.dataset.mx)] || [];
  if (!cells) return;
  removeItems(cells, `"${t}" ${cells.length}칸 삭제됨`); renderMultiExisting();
});
$('multi-clear').addEventListener('click', () => {
  const cells = [...multiExisting().values()].flat(); if (!cells.length) return;
  if (!confirm(`선택한 칸의 계획 ${cells.length}개를 모두 지울까요?`)) return;
  removeItems(cells, `계획 ${cells.length}개 삭제됨`); renderMultiExisting();
});
function closeMulti() { multi = null; $('multi-modal').hidden = true; selected = []; paintSel(); }
$('multi-form').addEventListener('submit', (e) => {
  e.preventDefault(); if (!multi) return;
  const lines = $('multi-text').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.slice(0, 200));
  if (!lines.length) { $('multi-text').focus(); return; }
  const gs = lines.map(() => uid());
  for (const { y, m } of multi) lines.forEach((t, i) => items(y, m).push({ id: uid(), text: t, done: false, g: gs[i] }));
  const n = multi.length; commit(); closeMulti(); renderAll();
  toast(`${n}칸에 ${lines.length}개씩 추가했어요`);
});
$('multi-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('multi-form').requestSubmit(); });
$('multi-close').addEventListener('click', closeMulti);
$('multi-cancel').addEventListener('click', closeMulti);
$('multi-modal').addEventListener('click', (e) => { if (e.target === $('multi-modal')) closeMulti(); });
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
// 계획 추가 파일(kind: 'myyear-patch'): 지금 기록은 그대로 두고, 고른 항목만 빼고 새 항목을 더해요.
function applyPatch(p) {
  const rm = Array.isArray(p.removeIf) ? p.removeIf.filter((k) => typeof k === 'string' && k) : [];
  const hit = (t) => rm.some((k) => String(t).includes(k));
  let removed = 0, added = 0;
  const before = JSON.stringify(data);
  if (rm.length) for (const y of Object.keys(data.plans)) {
    const pl = data.plans[y];
    for (const m of MONTHS) {
      const l = pl.months[m];
      if (l) { const keep = l.filter((it) => !hit(it.text)); removed += l.length - keep.length; if (keep.length) pl.months[m] = keep; else delete pl.months[m]; }
      if (pl.memos?.[m] && hit(pl.memos[m])) delete pl.memos[m];
    }
    if (pl.goal && hit(pl.goal)) pl.goal = '';
  }
  for (const [ys, v] of Object.entries(p.add || {})) {
    const y = Number(ys);
    if (!Number.isInteger(y) || !v || typeof v !== 'object') continue;
    if (!data.years.includes(y)) { data.years.push(y); data.years.sort((a, b) => a - b); }
    const pl = plan(y);
    if (typeof v.goal === 'string') pl.goal = v.goal.slice(0, 2000);
    for (const [ms, list] of Object.entries(v.months || {})) {
      const m = Number(ms); if (!MONTHS.includes(m) || !Array.isArray(list)) continue;
      const arr = items(y, m);
      for (const t of list) {
        if (typeof t !== 'string' || !t || arr.some((it) => it.text === t)) continue;
        arr.push({ id: uid(), text: t.slice(0, 200), done: false, g: 'p' + y + ':' + t.slice(0, 60) }); added++;
      }
    }
    for (const [ms, memo] of Object.entries(v.memos || {})) {
      const m = Number(ms); if (MONTHS.includes(m) && typeof memo === 'string') pl.memos[m] = memo.slice(0, 2000);
    }
  }
  const msg = `계획 추가 파일이에요. 기존 항목 ${removed}개를 빼고 새 항목 ${added}개를 더할까요? (나머지 기록은 그대로 둬요)`;
  if (!confirm(msg)) { data = validate(JSON.parse(before)) || data; renderAll(); return; }
  commit(); renderAll(); toast(`${added}개를 추가했어요`);
}
$('backup-load').addEventListener('click', () => { $('backup-file').click(); $('more-tools').open = false; });
$('backup-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    if (raw?.kind === 'myyear-patch') { applyPatch(raw); return; }
    const d = validate(raw);
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
function toast(t, actionLabel, action) {
  const el = $('toast'); el.textContent = t;
  if (actionLabel) { const b = document.createElement('button'); b.type = 'button'; b.textContent = actionLabel; b.addEventListener('click', () => { el.classList.remove('show'); action(); }); el.append(b); }
  el.classList.toggle('has-action', !!actionLabel); el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 5000 : 2200);
}

/* ---------------- 할 일 ---------------- */
let todoFilter = 'all', lastTodos = null;
function renderTodos() {
  const list = data.todos || (data.todos = []);
  const shown = list.filter((t) => todoFilter === 'all' || (todoFilter === 'done' ? t.done : !t.done));
  const done = list.filter((t) => t.done).length;
  $('todo-count').textContent = list.length ? `완료 ${done} / ${list.length}` : '';
  $('todo-items').innerHTML = shown.map((t) => `<li class="item${t.done ? ' done' : ''}" data-tid="${esc(t.id)}">
    <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="${esc(t.text)} 완료">
    <input type="text" class="txt" value="${esc(t.text)}" maxlength="300" aria-label="할 일 내용">
    <button type="button" class="del" aria-label="${esc(t.text)} 삭제">×</button></li>`).join('');
  $('todo-items').dataset.empty = !list.length ? '아직 할 일이 없어요' : (shown.length ? '' : '해당하는 할 일이 없어요');
  $('todo-clear-done').disabled = !done; $('todo-clear-all').disabled = !list.length;
  document.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === todoFilter)));
}
const todoOf = (el) => data.todos.find((t) => t.id === el.closest('[data-tid]')?.dataset.tid);
function removeTodos(pred, label) {
  const before = data.todos.slice();
  const keep = data.todos.filter((t) => !pred(t));
  if (keep.length === before.length) return;
  lastTodos = before; data.todos = keep; commit(); renderTodos();
  toast(label, '되돌리기', () => { if (!lastTodos) return; data.todos = lastTodos; lastTodos = null; commit(); renderTodos(); toast('되돌렸어요'); });
}
$('todo-add').addEventListener('submit', (e) => {
  e.preventDefault(); const v = $('todo-input').value.trim(); if (!v) return;
  data.todos.push({ id: uid(), text: v.slice(0, 300), done: false }); $('todo-input').value = '';
  if (todoFilter === 'done') todoFilter = 'all';
  commit(); renderTodos(); $('todo-input').focus();
});
$('todo-items').addEventListener('change', (e) => {
  const t = todoOf(e.target); if (!t) return;
  if (e.target.type === 'checkbox') { t.done = e.target.checked; commit(); renderTodos(); }
  else if (e.target.classList.contains('txt')) { const v = e.target.value.trim(); if (!v) removeTodos((x) => x === t, `"${t.text}" 삭제됨`); else { t.text = v; commit(); } }
});
$('todo-items').addEventListener('input', (e) => { const t = todoOf(e.target); if (t && e.target.classList.contains('txt') && e.target.value.trim()) { t.text = e.target.value.trim(); commit(); } });
$('todo-items').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('txt')) { e.preventDefault(); e.target.blur(); } });
$('todo-items').addEventListener('click', (e) => { const d = e.target.closest('.del'); if (!d) return; const t = todoOf(d); if (t) removeTodos((x) => x === t, `"${t.text}" 삭제됨`); });
document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { todoFilter = b.dataset.filter; renderTodos(); }));
$('todo-clear-done').addEventListener('click', () => { const n = data.todos.filter((t) => t.done).length; if (n) removeTodos((t) => t.done, `완료한 일 ${n}개 삭제됨`); });
$('todo-clear-all').addEventListener('click', () => { const n = data.todos.length; if (n && confirm(`할 일 ${n}개를 모두 지울까요?`)) removeTodos(() => true, `할 일 ${n}개 삭제됨`); });

/* ---------------- 만다라트 ---------------- */
// cells[블록][칸], 블록·칸 모두 0~8, 4가 가운데. 가운데 블록의 칸 i ↔ 블록 i의 가운데 칸은 같은 내용
const blankMandal = () => ({ id: uid(), cells: Array.from({ length: 9 }, () => Array(9).fill('')) });
let lastMandal = null;
function renderMandals() {
  const ms = data.mandals || (data.mandals = []);
  $('mandal-empty').hidden = ms.length > 0;
  $('mandal-list').innerHTML = ms.map((md, n) => {
    const title = md.cells[4][4].trim();
    let grid = '';
    for (let b = 0; b < 9; b++) {
      grid += `<div class="m-block${b === 4 ? ' core' : ''}">`;
      for (let c = 0; c < 9; c++) {
        const v = md.cells[b][c];
        const cls = ['m-cell', c === 4 ? 'center' : '', b === 4 && c === 4 ? 'main' : '', v.length > 14 ? 'small' : ''].filter(Boolean).join(' ');
        grid += `<div class="${cls}" contenteditable="plaintext-only" spellcheck="false" data-b="${b}" data-c="${c}" role="textbox" aria-label="${b === 4 && c === 4 ? '핵심 목표' : (b === 4 || c === 4) ? '세부 목표' : '실천 항목'}">${esc(v)}</div>`;
      }
      grid += '</div>';
    }
    return `<section class="mandal-wrap" data-mid="${esc(md.id)}">
      <div class="mandal-bar"><b>${title ? esc(title) : `만다라트 ${n + 1}`}</b>
        <span class="mandal-actions"><button type="button" class="btn small" data-mclear>내용 비우기</button><button type="button" class="btn small danger" data-mdel>삭제</button></span></div>
      <div class="mandal">${grid}</div></section>`;
  }).join('');
  document.querySelectorAll('.m-cell').forEach((el) => { if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; });
}
const mandalOf = (el) => data.mandals.find((m) => m.id === el.closest('[data-mid]')?.dataset.mid);
$('mandal-add').addEventListener('click', () => {
  data.mandals.push(blankMandal()); commit(); renderMandals();
  const last = document.querySelector('.mandal-wrap:last-child .m-block.core .m-cell.main');
  last?.scrollIntoView({ behavior: 'smooth', block: 'center' }); last?.focus();
});
$('mandal-list').addEventListener('input', (e) => {
  const el = e.target.closest('.m-cell'); if (!el) return;
  const md = mandalOf(el); if (!md) return;
  const b = Number(el.dataset.b), c = Number(el.dataset.c), v = el.innerText.replace(/\n+/g, ' ').slice(0, 100);
  md.cells[b][c] = v;
  // 세부 목표 자동 연결
  let tb = -1, tc = -1;
  if (b === 4 && c !== 4) { tb = c; tc = 4; } else if (c === 4 && b !== 4) { tb = 4; tc = b; }
  if (tb >= 0) { md.cells[tb][tc] = v; const t = el.closest('.mandal').querySelector(`.m-cell[data-b="${tb}"][data-c="${tc}"]`); if (t) t.textContent = v; }
  if (b === 4 && c === 4) el.closest('.mandal-wrap').querySelector('.mandal-bar b').textContent = v.trim() || '만다라트';
  el.classList.toggle('small', v.length > 14);
  commit();
});
$('mandal-list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.m-cell')) { e.preventDefault(); e.target.blur(); } });
$('mandal-list').addEventListener('paste', (e) => { if (!e.target.closest('.m-cell')) return; e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text') || '').replace(/\s+/g, ' ')); });
$('mandal-list').addEventListener('click', (e) => {
  const del = e.target.closest('[data-mdel]'), clr = e.target.closest('[data-mclear]');
  if (!del && !clr) return;
  const md = mandalOf(e.target); if (!md) return;
  const name = md.cells[4][4].trim() || '이 만다라트';
  const before = JSON.parse(JSON.stringify(data.mandals));
  if (del) { if (!confirm(`"${name}"를 삭제할까요?`)) return; data.mandals = data.mandals.filter((m) => m !== md); }
  else { if (!confirm(`"${name}"의 모든 칸을 비울까요?`)) return; md.cells = blankMandal().cells; }
  lastMandal = before; commit(); renderMandals();
  toast(del ? '만다라트를 삭제했어요' : '모든 칸을 비웠어요', '되돌리기', () => { if (!lastMandal) return; data.mandals = lastMandal; lastMandal = null; commit(); renderMandals(); toast('되돌렸어요'); });
});

/* ---------------- 기록방 나가기 · 완전 삭제 ---------------- */
$('footer-leave').addEventListener('click', () => $('room-leave').click());
function closeRoomDel() { $('room-del-modal').hidden = true; $('room-delete').focus(); }
$('room-delete').addEventListener('click', () => {
  $('room-del-name').textContent = `"${$('title-room').textContent}"`;
  $('room-del-password').value = ''; $('room-del-error').textContent = '';
  $('room-del-submit').disabled = false;
  $('room-del-modal').hidden = false;
  setTimeout(() => $('room-del-password').focus(), 30);
});
$('room-del-backup').addEventListener('click', () => $('backup-save').click());
$('room-del-cancel').addEventListener('click', closeRoomDel);
$('room-del-modal').addEventListener('click', (e) => { if (e.target === $('room-del-modal')) closeRoomDel(); });
$('room-del-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('room-del-password').value; if (!pw) return;
  const name = $('title-room').textContent;
  if (!confirm(`"${name}" 기록방의 연도 계획을 정말 모두 지울까요?`)) return;
  $('room-del-submit').disabled = true; $('room-del-error').textContent = '';
  try {
    await cloud.remove(pw);
    try { localStorage.removeItem(ROOM_KEY); localStorage.removeItem(DATA_KEY); } catch {}
    window.MyRooms?.dropSite?.(name, 'year');
    alert('기록방을 삭제했어요. 같은 이름으로 다시 들어가면 빈 기록으로 시작해요.');
    location.hash = ''; location.reload();
  } catch (err) {
    const m = err.message || '';
    $('room-del-error').textContent = m.includes('WRONG_PASSWORD') ? '비밀번호가 틀렸어요.'
      : m.includes('CONFLICT') ? '다른 기기에서 먼저 바뀌었어요. [최신 기록 불러오기] 후 다시 시도하세요.'
      : '삭제하지 못했어요: ' + m;
    $('room-del-submit').disabled = false;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('room-del-modal').hidden) closeRoomDel(); });

/* ---------------- 시작 ---------------- */
const saved = localStorage.getItem(ROOM_KEY);
const planRoom = localStorage.getItem('myplan-room-name');   // 주간 플래너에서 쓰던 이름 (같은 사이트 주소라 공유됨)
if (saved) { $('room-name').value = saved; cloud.open(saved); }
else if (planRoom && document.getElementById('recent-rooms').hidden) { $('room-name').value = planRoom; $('login-status').textContent = '주간 플래너에서 쓰던 이름을 미리 넣어 뒀어요. 맞으면 [기록방 열기]를 누르세요.'; }
})();
