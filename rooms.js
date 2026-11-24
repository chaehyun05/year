/* rooms.js — 기록방 이름 목록 (plan · mplan · year 공용)
   - 이 기기에서 연 이름은 바로 목록에 쌓임 (localStorage)
   - '목록 이름'을 한 번 넣어 두면 그 이름으로 서버에도 목록을 저장해서
     회사 노트북·폰·개인 노트북 어디서든 같은 목록이 보임 (기기마다 처음 한 번만 입력)
   사용: <div id="recent-rooms" data-site="year" data-form="room-form" data-input="room-name"></div>
         기록방을 연 뒤 MyRooms.remember(이름) 호출 */
(() => {
  const KEY = 'myplan-recent-rooms';          // 이 기기 목록
  const GONE = 'myplan-recent-removed';       // 목록에서 뺀 이름 (다른 기기에 다시 생기지 않게)
  const SYNC = 'myplan-roomlist-name';        // 목록 이름 (동기화)
  const MODE = 'myplan-roomlist-mode';
  const MAX = 30;
  const box = document.getElementById('recent-rooms');
  const site = box?.dataset.site || (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SITE_LABEL = { plan: 'plan', mplan: 'plan', year: 'year' };
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const del = (k) => { try { localStorage.removeItem(k); } catch {} };

  /* ---------- 이 기기 목록 ---------- */
  function clean(list) {
    return (Array.isArray(list) ? list : []).filter((r) => r && typeof r.name === 'string' && r.name.trim())
      .map((r) => ({ name: r.name.slice(0, 80), last: Number(r.last) || 0, sites: Array.isArray(r.sites) ? r.sites.filter((s) => typeof s === 'string').slice(0, 5) : [] }));
  }
  function load() {
    let list = [];
    try { list = clean(JSON.parse(get(KEY) || '[]')); } catch {}
    if (!list.length) {
      for (const [k, s] of [['myplan-room-name', 'plan'], ['myyear-room-name', 'year']]) {
        const n = get(k); if (!n) continue;
        const hit = list.find((r) => r.name === n);
        if (hit) { if (!hit.sites.includes(s)) hit.sites.push(s); } else list.push({ name: n, last: 0, sites: [s] });
      }
    }
    return list;
  }
  function loadGone() { try { const g = JSON.parse(get(GONE) || '{}'); return g && typeof g === 'object' ? g : {}; } catch { return {}; } }
  function save(list, gone) {
    list.sort((a, b) => (b.last || 0) - (a.last || 0));
    set(KEY, JSON.stringify(list.slice(0, MAX)));
    if (gone) set(GONE, JSON.stringify(gone));
  }
  function remember(name) {
    name = String(name || '').normalize('NFC').trim();
    if (!name) return;
    const list = load(), gone = loadGone();
    const s = SITE_LABEL[site] || site || 'plan';
    const i = list.findIndex((r) => r.name === name);
    const item = i >= 0 ? list.splice(i, 1)[0] : { name, sites: [] };
    item.last = Date.now();
    if (!item.sites.includes(s)) item.sites.push(s);
    list.unshift(item);
    delete gone[name];
    save(list, gone);
    render();
    sync();
  }
  function forget(name) {
    const gone = loadGone(); gone[name] = Date.now();
    save(load().filter((r) => r.name !== name), gone);
    render();
    sync();
  }
  // 기록방을 완전 삭제했을 때: 목록에서 바로 빼고, 동기화 중이면 다른 기기 목록에서도 빠지게 표시
  // (같은 이름을 plan·year 둘 다에서 썼어도 목록에서는 뺌 — 남은 쪽 기록은 이름을 다시 입력하면 열 수 있음)
  function dropSite(name) {
    name = String(name || '').normalize('NFC').trim();
    if (name) forget(name);
  }

  /* ---------- 서버 동기화 ---------- */
  const cfg = () => window.MYPLAN_CONFIG || {};
  async function rpc(fn, args) {
    const c = cfg(); if (!c.url || !c.key) throw Error('설정 없음');
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(c.url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: c.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: ctl.signal });
      const text = await r.text(); let d = null;
      try { d = text ? JSON.parse(text) : null; } catch { throw Error('서버 응답 오류'); }
      if (!r.ok) throw Error((d?.code || r.status) + ': ' + (d?.message || text));
      return d;
    } catch (e) {
      if (e.name === 'AbortError') throw Error('서버 응답이 늦어요');
      if (/Failed to fetch|Load failed/.test(e.message)) throw Error('인터넷 연결을 확인하세요');
      throw e;
    } finally { clearTimeout(to); }
  }
  async function hashOf(name) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('myplan-roomlist-v1:' + name));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 기록방과 같은 저장 함수를 쓰되 다른 칸(목록 이름으로 만든 열쇠)에 저장. 서버가 새 칸 이름을 받지 않으면 기존 칸 이름으로 저장
  function pack(doc) {
    const json = JSON.stringify({ kind: 'myroomlist', ...doc });
    const base = { 'myplan-data-v2': null, 'myplan-meals-v1': null, 'myplan-habits-v1': null };
    return get(MODE) === 'alt' ? { ...base, 'myplan-data-v2': json } : { ...base, 'myplan-roomlist-v1': json };
  }
  function unpack(payload) {
    if (!payload) return null;
    for (const k of ['myplan-roomlist-v1', 'myplan-data-v2']) {
      if (typeof payload[k] !== 'string') continue;
      try { const d = JSON.parse(payload[k]); if (d?.kind === 'myroomlist') return { rooms: clean(d.rooms), gone: d.gone && typeof d.gone === 'object' ? d.gone : {} }; } catch {}
    }
    return null;
  }
  function merge(a, b) {
    const gone = { ...(a.gone || {}) };
    for (const [n, t] of Object.entries(b.gone || {})) gone[n] = Math.max(gone[n] || 0, t);
    const map = new Map();
    for (const r of [...a.rooms, ...b.rooms]) {
      const m = map.get(r.name);
      if (!m) map.set(r.name, { ...r, sites: [...r.sites] });
      else { m.last = Math.max(m.last, r.last); for (const s of r.sites) if (!m.sites.includes(s)) m.sites.push(s); }
    }
    // 뺀 뒤에 다시 연 이름만 살림
    const rooms = [...map.values()].filter((r) => !(gone[r.name] && gone[r.name] >= (r.last || 0)));
    for (const r of rooms) if (gone[r.name]) delete gone[r.name];
    rooms.sort((x, y) => (y.last || 0) - (x.last || 0));
    return { rooms: rooms.slice(0, MAX), gone };
  }
  let syncing = null, again = false, syncMsg = '';
  async function sync() {
    const name = get(SYNC);
    if (!name) return;
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      try {
        const key = await hashOf(name);
        for (let tries = 0; tries < 3; tries++) {
          const row = await rpc('read_shared_planner', { p_key: key });
          const remote = (row && unpack(row.payload)) || { rooms: [], gone: {} };
          const merged = merge({ rooms: load(), gone: loadGone() }, remote);
          save(merged.rooms, merged.gone);
          const same = JSON.stringify(merged) === JSON.stringify(merge(remote, { rooms: [], gone: {} }));
          if ((same && row) || (!row && !merged.rooms.length && !Object.keys(merged.gone).length)) break;
          const expected = row ? row.revision : 0;
          try { await rpc('save_shared_planner', { p_key: key, p_payload: pack(merged), p_expected: expected }); break; }
          catch (e) {
            if (e.message.includes('CONFLICT')) continue;           // 다른 기기가 먼저 저장 → 다시 합치기
            if (get(MODE) !== 'alt') { set(MODE, 'alt'); continue; } // 새 칸 이름을 서버가 안 받으면 예전 칸으로
            throw e;
          }
        }
        syncMsg = '';
      } catch (e) { syncMsg = '목록 동기화 실패: ' + e.message; }
      finally { syncing = null; render(); if (again) { again = false; sync(); } }
    })();
    return syncing;
  }

  /* ---------- 화면 ---------- */
  function when(t) {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return '오늘';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  let showSetup = false;
  function render() {
    if (!box) return;
    const list = load().sort((a, b) => (b.last || 0) - (a.last || 0));
    const syncName = get(SYNC);
    box.hidden = false;
    const head = `<div class="recent-head"><span>${syncName ? '내 기록방 목록' : '최근 연 기록방'}</span>
      <small>${syncName ? `☁ 모든 기기에서 같은 목록${syncing ? ' · 맞추는 중…' : ''}` : '지금은 이 기기에서 연 이름만 보여요'}</small></div>`;
    const items = list.length ? `<ul class="recent-list">${list.map((r, i) => `
        <li><button type="button" class="recent-open" data-i="${i}" aria-label="${esc(r.name)} 기록방 열기">
              <b>${esc(r.name)}</b>
              <small>${r.sites.map((s) => `<span class="recent-tag">${esc(s)}</span>`).join('')}${when(r.last) ? `<span>${when(r.last)}</span>` : ''}</small>
            </button>
            <button type="button" class="recent-del" data-i="${i}" aria-label="${esc(r.name)} 목록에서 빼기" title="목록에서 빼기 (기록은 그대로)">×</button></li>`).join('')}
      </ul>` : `<p class="recent-none">${syncName ? '아직 목록이 비어 있어요. 기록방을 열면 여기에 모여요.' : '아직 연 기록방이 없어요.'}</p>`;
    const syncPart = syncName
      ? `<div class="recent-sync on"><span>목록 이름: <b>${esc(syncName)}</b></span>
          <button type="button" class="recent-link" data-act="resync">지금 맞추기</button><button type="button" class="recent-link" data-act="off">이 기기에서 끄기</button></div>`
      : showSetup
        ? `<form class="recent-sync setup" data-act="form">
            <p><b>모든 기기에서 같은 목록 보기</b><br>회사 노트북·폰·개인 노트북에 <b>똑같은 목록 이름</b>을 한 번씩 넣으면 어디서 연 기록방이든 여기 모여요. 아이디처럼 쓰는 이름이라 남이 짐작하기 어려운 이름이 좋아요.</p>
            <div class="recent-sync-row"><input type="text" name="n" required maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="목록 이름" aria-label="목록 이름"><button type="submit" class="btn primary">연결</button><button type="button" class="btn" data-act="cancel">취소</button></div>
          </form>`
        : `<button type="button" class="recent-sync-btn" data-act="setup">☁ 다른 기기에서도 이 목록 보기</button>`;
    box.innerHTML = head + items + syncPart + (syncMsg ? `<p class="recent-err" role="alert">${esc(syncMsg)}</p>` : '');
    box._list = list;
  }

  box?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'setup') { showSetup = true; render(); box.querySelector('input[name=n]')?.focus(); return; }
    if (act === 'cancel') { showSetup = false; render(); return; }
    if (act === 'resync') { sync(); render(); return; }
    if (act === 'off') {
      if (!confirm('이 기기에서 목록 동기화를 끌까요?\n목록은 이 기기에 그대로 남고, 서버의 목록도 지워지지 않아요.')) return;
      del(SYNC); syncMsg = ''; render(); return;
    }
    const list = box._list || [];
    const d = e.target.closest('.recent-del');
    if (d) {
      const r = list[Number(d.dataset.i)];
      if (r && confirm(`"${r.name}"을(를) 목록에서 뺄까요?\n기록방과 기록은 지워지지 않아요.${get(SYNC) ? '\n다른 기기 목록에서도 빠져요.' : ''}`)) forget(r.name);
      return;
    }
    const open = e.target.closest('.recent-open');
    if (!open) return;
    const r = list[Number(open.dataset.i)];
    const form = document.getElementById(box.dataset.form || 'room-form');
    const input = document.getElementById(box.dataset.input || 'room-name');
    if (!r || !form || !input) return;
    input.value = r.name;
    if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  box?.addEventListener('submit', async (e) => {
    if (!e.target.closest('[data-act=form]')) return;
    e.preventDefault();
    const n = (e.target.elements.n.value || '').normalize('NFC').trim();
    if (!n) { e.target.elements.n.focus(); return; }
    set(SYNC, n); showSetup = false; syncMsg = '';
    render();
    await sync();
  });

  window.MyRooms = { remember, forget, dropSite, render, sync };
  render();
  sync();
})();
