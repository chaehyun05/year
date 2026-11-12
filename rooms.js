/* rooms.js — 이 기기에서 열었던 기록방 이름 목록 (plan · mplan · year 공용)
   chaehyun05.github.io 아래 사이트들은 같은 주소(origin)라서 목록을 함께 씁니다.
   사용: <div id="recent-rooms" data-site="year" data-form="room-form" data-input="room-name"></div>
         기록방을 연 뒤 MyRooms.remember(이름) 호출 */
(() => {
  const KEY = 'myplan-recent-rooms';
  const MAX = 12;
  const box = document.getElementById('recent-rooms');
  const site = box?.dataset.site || (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SITE_LABEL = { plan: 'plan', mplan: 'plan', year: 'year' };

  function load() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    if (!Array.isArray(list)) list = [];
    list = list.filter((r) => r && typeof r.name === 'string' && r.name.trim());
    // 처음 한 번: 예전에 쓰던 이름을 목록에 넣어 둠
    if (!list.length) {
      const seed = [['myplan-room-name', 'plan'], ['myyear-room-name', 'year']];
      for (const [k, s] of seed) {
        const n = localStorage.getItem(k);
        if (!n) continue;
        const hit = list.find((r) => r.name === n);
        if (hit) { if (!hit.sites.includes(s)) hit.sites.push(s); }
        else list.push({ name: n, last: 0, sites: [s] });
      }
    }
    return list;
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch {}
  }
  function remember(name) {
    name = String(name || '').normalize('NFC').trim();
    if (!name) return;
    const list = load();
    const s = SITE_LABEL[site] || site || 'plan';
    const i = list.findIndex((r) => r.name === name);
    const item = i >= 0 ? list.splice(i, 1)[0] : { name, sites: [] };
    item.last = Date.now();
    item.sites = Array.isArray(item.sites) ? item.sites : [];
    if (!item.sites.includes(s)) item.sites.push(s);
    list.unshift(item);
    save(list);
    render();
  }
  // 한 사이트에서 기록방을 완전 삭제했을 때: 그 사이트 표시만 빼고, 남은 사이트가 없으면 목록에서 뺌
  function dropSite(name, s) {
    const list = load();
    const r = list.find((x) => x.name === name);
    if (!r) return;
    r.sites = (r.sites || []).filter((x) => x !== (SITE_LABEL[s] || s));
    save(r.sites.length ? list : list.filter((x) => x !== r));
    render();
  }
  function forget(name) {
    save(load().filter((r) => r.name !== name));
    render();
  }
  function when(t) {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return '오늘';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  function render() {
    if (!box) return;
    const list = load().sort((a, b) => (b.last || 0) - (a.last || 0));
    if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<div class="recent-head"><span>최근 연 기록방</span><small>이 기기에서 열었던 이름만 보여요</small></div>
      <ul class="recent-list">${list.map((r, i) => `
        <li><button type="button" class="recent-open" data-i="${i}" aria-label="${esc(r.name)} 기록방 열기">
              <b>${esc(r.name)}</b>
              <small>${(r.sites || []).map((s) => `<span class="recent-tag">${esc(s)}</span>`).join('')}${when(r.last) ? `<span>${when(r.last)}</span>` : ''}</small>
            </button>
            <button type="button" class="recent-del" data-i="${i}" aria-label="${esc(r.name)} 목록에서 빼기" title="목록에서 빼기 (기록은 그대로)">×</button></li>`).join('')}
      </ul>`;
    box._list = list;
  }
  box?.addEventListener('click', (e) => {
    const list = box._list || [];
    const del = e.target.closest('.recent-del');
    if (del) {
      const r = list[Number(del.dataset.i)];
      if (r && confirm(`"${r.name}"을(를) 이 목록에서 뺄까요?\n기록방과 기록은 지워지지 않아요.`)) forget(r.name);
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
  window.MyRooms = { remember, forget, dropSite, render };
  render();
})();
