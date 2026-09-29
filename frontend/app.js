'use strict';

const API_URL = '/api/accounts';
const POLL_MS = 10000;
const FETCH_TIMEOUT = 8000;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
    accounts: [],
    filter: 'all',
    query: '',
    sortKey: 'status',
    sortDir: 'desc',
    loading: true,
    error: false,
    busy: false,
    failures: 0,
    timer: null,
    sig: '',
    changed: new Map(),
    animateRows: true
};

const $ = (id) => document.getElementById(id);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isAdmin = () => !!Store.get('adminToken');

/* ---------- ฟอร์แมต ---------- */
function formatHours(seconds) {
    if (!seconds || seconds <= 0) return '0 นาที';
    
    // ถ้ายังไม่ถึง 1 ชั่วโมง (น้อยกว่า 3600 วินาที) ให้แสดงเป็น นาที
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} นาที`;
    }
    
    // ถ้าเกิน 1 ชั่วโมงขึ้นไป ให้แสดงเป็น ชม.
    return `${(seconds / 3600).toFixed(1)} ชม.`;
}
function formatMoney(amount) {
    return '$' + Math.round(amount || 0).toLocaleString('en-US');
}

function normalize(a) {
    const lv = a.levels || {};
    const vehicles = Array.isArray(a.vehicles)
        ? a.vehicles.map(String)
        : String(a.vehicles || '').split(',');
    return {
        username: String(a.username ?? ''),
        isOnline: !!a.isOnline,
        farmSeconds: num(a.farmSeconds),
        bank: num(a.bank),
        fishing: num(lv.fishing),
        farming: num(lv.farming),
        shelfStocker: num(lv.shelfStocker),
        vehicles: vehicles.map(s => s.trim()).filter(s => s && !/^none$/i.test(s))
    };
}

/* ---------- ตัวเลขนับขึ้น ---------- */
function countUp(el, to, fmt = (v) => String(Math.round(v))) {
    if (!el) return;
    const from = el._v ?? 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (REDUCE || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
}

/* ---------- สถานะการเชื่อมต่อ ---------- */
function setConn(s) {
    const el = $('conn');
    if (!el) return;
    el.dataset.state = s;
    $('conn-text').textContent = s === 'live' ? 'เชื่อมต่อแล้ว' : s === 'error' ? 'ขาดการเชื่อมต่อ' : 'กำลังเชื่อมต่อ';
}

function restartBar(delay) {
    const b = $('refresh-bar');
    if (!b) return;
    b.style.setProperty('--poll', delay + 'ms');
    b.classList.remove('run');
    void b.offsetWidth;
    b.classList.add('run');
}

/* ---------- ดึงข้อมูล ---------- */
async function fetchAccounts(manual = false) {
    if (state.busy) return;
    state.busy = true;
    clearTimeout(state.timer);
    $('refresh-btn')?.classList.add('spin');

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

    try {
        const res = await fetch(API_URL, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.accounts) ? data.accounts : null);
        if (!list) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');

        applyData(list.map(normalize));
        state.failures = 0;
        state.error = false;
        setConn('live');
        if (manual === true) toast('รีเฟรชข้อมูลแล้ว', 'success', 1800);
    } catch (err) {
        console.error('Error fetching data:', err);
        state.failures++;
        state.error = true;
        setConn('error');
        if (state.failures === 1 || manual === true) {
            toast('ดึงข้อมูลไม่สำเร็จ กำลังลองใหม่อัตโนมัติ', 'error');
        }
    } finally {
        clearTimeout(to);
        state.busy = false;
        state.loading = false;
        $('refresh-btn')?.classList.remove('spin');
        if (state.error && !state.accounts.length) renderTable();
        scheduleNext();
    }
}

function scheduleNext() {
    clearTimeout(state.timer);
    if (document.hidden) return;
    const delay = Math.min(POLL_MS * Math.pow(2, state.failures), 60000);
    restartBar(delay);
    state.timer = setTimeout(fetchAccounts, delay);
}

function applyData(list) {
    // หาช่องที่ค่าเปลี่ยน เพื่อทำไฮไลต์
    const old = new Map(state.accounts.map(a => [a.username, a]));
    const changed = new Map();
    if (state.accounts.length) {
        for (const a of list) {
            const o = old.get(a.username);
            if (!o) continue;
            const keys = ['isOnline', 'farmSeconds', 'bank', 'fishing', 'farming', 'shelfStocker']
                .filter(k => o[k] !== a[k]);
            if (keys.length) changed.set(a.username, new Set(keys));
        }
    }

    const sig = JSON.stringify(list);
    const dirty = sig !== state.sig;
    state.sig = sig;
    state.accounts = list;
    state.changed = changed;

    $('last-update').textContent = new Date().toLocaleTimeString('th-TH');
    updateOverview();
    if (dirty || state.loading) renderTable();
}

/* ---------- สรุปภาพรวม ---------- */
function updateOverview() {
    let on = 0, off = 0, sec = 0, money = 0;
    for (const a of state.accounts) {
        if (a.isOnline) on++; else off++;
        sec += a.farmSeconds;
        money += a.bank;
    }
    const total = state.accounts.length;

    countUp($('online-count'), on);
    countUp($('offline-count'), off);
    countUp($('total-hours'), sec, formatHours);
    countUp($('total-bank'), money, formatMoney);

    $('online-ratio').style.width = total ? (on / total * 100) + '%' : '0%';
    $('online-sub').textContent = total ? `${Math.round(on / total * 100)}% จาก ${total} ไอดี` : 'ยังไม่มีไอดี';
    $('offline-sub').textContent = total ? `${off} ไอดีที่ไม่ได้ทำงาน` : 'ยังไม่มีไอดี';
    $('hours-sub').textContent = total ? `เฉลี่ย ${formatHours(sec / total)} ต่อไอดี` : '\u00a0';
    $('bank-sub').textContent = total ? `เฉลี่ย ${formatMoney(money / total)} ต่อไอดี` : '\u00a0';

    $('cnt-all').textContent = total;
    $('cnt-online').textContent = on;
    $('cnt-offline').textContent = off;
}

/* ---------- กรอง + เรียง ---------- */
const SORTERS = {
    status: (a, b) => Number(a.isOnline) - Number(b.isOnline),
    username: (a, b) => a.username.localeCompare(b.username, 'th', { numeric: true, sensitivity: 'base' }),
    farmSeconds: (a, b) => a.farmSeconds - b.farmSeconds,
    bank: (a, b) => a.bank - b.bank,
    fishing: (a, b) => a.fishing - b.fishing,
    farming: (a, b) => a.farming - b.farming,
    shelfStocker: (a, b) => a.shelfStocker - b.shelfStocker,
    vehicles: (a, b) => a.vehicles.length - b.vehicles.length
};

function getView() {
    const q = state.query.toLowerCase();
    const list = state.accounts.filter(a => {
        if (state.filter === 'online' && !a.isOnline) return false;
        if (state.filter === 'offline' && a.isOnline) return false;
        if (!q) return true;
        return a.username.toLowerCase().includes(q) || a.vehicles.join(' ').toLowerCase().includes(q);
    });
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const cmp = SORTERS[state.sortKey] || SORTERS.status;
    return list.sort((a, b) => cmp(a, b) * dir || SORTERS.username(a, b));
}

function setSort(key) {
    if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortKey = key; state.sortDir = (key === 'username' || key === 'vehicles') ? 'asc' : 'desc'; }
    renderTable();
}

function syncSortUI() {
    const sel = $('sort-select'), dir = $('sort-dir');
    if (sel) sel.value = state.sortKey;
    if (dir) {
        const asc = state.sortDir === 'asc';
        dir.innerHTML = `<i class="fa-solid ${asc ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short'}"></i>`;
        dir.title = dir.ariaLabel = asc ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย';
    }
    document.querySelectorAll('thead th[data-sort]').forEach(th => {
        if (th.dataset.sort === state.sortKey) {
            th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
        } else {
            th.removeAttribute('aria-sort');
        }
    });
}

/* ---------- วาดตาราง ---------- */
function skeletonRows(cols) {
    const widths = [70, 110, 80, 90, 60, 60, 60, 100, 60];
    let html = '';
    for (let r = 0; r < 6; r++) {
        html += '<tr class="sk-row">';
        for (let c = 0; c < cols; c++) {
            html += `<td><span class="skel" style="width:${widths[c % widths.length]}px;margin:0 ${c > 1 && c < 7 ? 'auto' : '0'}"></span></td>`;
        }
        html += '</tr>';
    }
    return html;
}

function stateRow(cols, inner) {
    return `<tr class="state-row"><td colspan="${cols}"><div class="state ${inner.cls || ''}">${inner.html}</div></td></tr>`;
}

function levelCell(kind, value, max) {
    const pct = Math.max(value > 0 ? 6 : 0, Math.min(100, value / max * 100));
    return `<div class="lvl ${kind}"><b class="mono">${value}</b><span class="bar"><i style="--w:${pct.toFixed(1)}%"></i></span></div>`;
}

function renderTable() {
    const tbody = $('account-table-body');
    if (!tbody) return;

    const admin = isAdmin();
    const cols = admin ? 9 : 8;
    $('action-header').hidden = !admin;
    syncSortUI();

    // กำลังโหลดครั้งแรก
    if (state.loading && !state.accounts.length) {
        tbody.innerHTML = skeletonRows(cols);
        return;
    }
    // เชื่อมต่อไม่ได้และยังไม่มีข้อมูล
    if (state.error && !state.accounts.length) {
        tbody.innerHTML = stateRow(cols, {
            cls: 'error',
            html: `<i class="fa-solid fa-triangle-exclamation big"></i>
                   <h3>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</h3>
                   <p>ตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่ แล้วลองใหม่อีกครั้ง</p>
                   <button type="button" class="btn btn-ghost" data-act="retry"><i class="fa-solid fa-rotate"></i> ลองใหม่</button>`
        });
        return;
    }

    const rows = getView();

    if (!rows.length) {
        const filtering = state.query || state.filter !== 'all';
        tbody.innerHTML = stateRow(cols, filtering
            ? { html: `<i class="fa-solid fa-magnifying-glass big"></i>
                       <h3>ไม่พบไอดีที่ตรงกับเงื่อนไข</h3>
                       <p>ลองเปลี่ยนคำค้นหา หรือล้างตัวกรอง</p>
                       <button type="button" class="btn btn-ghost" data-act="clear">ล้างตัวกรอง</button>` }
            : { html: `<i class="fa-solid fa-cube big"></i>
                       <h3>ยังไม่มีไอดีในระบบ</h3>
                       <p>เมื่อสคริปต์ฟาร์มส่งข้อมูลเข้ามา ไอดีจะแสดงที่นี่อัตโนมัติ</p>` });
        return;
    }

    const maxOf = (k) => Math.max(10, ...state.accounts.map(a => a[k]));
    const max = { fishing: maxOf('fishing'), farming: maxOf('farming'), shelfStocker: maxOf('shelfStocker') };
    const anim = state.animateRows && !REDUCE;

    tbody.innerHTML = rows.map((a, i) => {
        const ch = state.changed.get(a.username);
        const fl = (k, html) => (ch && ch.has(k)) ? `<span class="flash">${html}</span>` : html;

        const vehicles = a.vehicles.length
            ? a.vehicles.slice(0, 3).map(v => `<span>${escapeHtml(v)}</span>`).join('') +
              (a.vehicles.length > 3 ? `<span class="more">+${a.vehicles.length - 3}</span>` : '')
            : '<span class="none">ไม่มี</span>';

        return `<tr class="row${anim ? ' enter' : ''}" style="--i:${Math.min(i, 20)}">
            <td class="cell-status">${fl('isOnline', a.isOnline
                ? '<span class="badge on">ออนไลน์</span>'
                : '<span class="badge off">ออฟไลน์</span>')}</td>
            <td class="name">${escapeHtml(a.username)}</td>
            <td class="c mono" data-label="เวลาฟาร์ม">${fl('farmSeconds', formatHours(a.farmSeconds))}</td>
            <td class="r mono money" data-label="เงิน ATM">${fl('bank', formatMoney(a.bank))}</td>
            <td data-label="Fishing">${levelCell('fish', a.fishing, max.fishing)}</td>
            <td data-label="Farming">${levelCell('farm', a.farming, max.farming)}</td>
            <td class="wide" data-label="Shelf Stocker Lv">${levelCell('shelf', a.shelfStocker, max.shelfStocker)}</td>
            <td class="wide" data-label="รถที่มี"><div class="veh">${vehicles}</div></td>
            ${admin ? `<td class="c act"><button type="button" class="btn-delete" data-username="${encodeURIComponent(a.username)}"><i class="fa-regular fa-trash-can"></i> ลบ</button></td>` : ''}
        </tr>`;
    }).join('');

    state.animateRows = false;
    state.changed = new Map();
}

/* ---------- Modal ยืนยัน ---------- */
function confirmDialog({ title, body, okText }) {
    return new Promise((resolve) => {
        const back = $('modal'), ok = $('modal-ok'), cancel = $('modal-cancel');
        const prevFocus = document.activeElement;

        $('modal-title').textContent = title;
        $('modal-body').textContent = body;
        ok.textContent = okText;

        back.hidden = false;
        requestAnimationFrame(() => back.classList.add('open'));
        cancel.focus();

        const close = (val) => {
            back.classList.remove('open');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => { back.hidden = true; }, 200);
            prevFocus?.focus?.();
            resolve(val);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === cancel) { e.preventDefault(); ok.focus(); }
                else if (!e.shiftKey && document.activeElement === ok) { e.preventDefault(); cancel.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        ok.onclick = () => close(true);
        cancel.onclick = () => close(false);
        back.onclick = (e) => { if (e.target === back) close(false); };
    });
}

/* ---------- Auth ---------- */
function logout(expired = false) {
    Store.remove('adminToken');
    Store.remove('adminUser');
    updateUIState();
    toast(expired ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'ออกจากระบบแล้ว', expired ? 'error' : 'info');
}

function handleAuthAction(e) {
    if (e) e.preventDefault();
    if (isAdmin()) logout();
    else window.location.href = '/login.html';
}

async function deleteAccount(username) {
    const token = Store.get('adminToken');
    if (!token) { updateUIState(); return; }

    const ok = await confirmDialog({
        title: 'ลบไอดีนี้?',
        body: `ข้อมูลของ "${username}" จะถูกลบออกจากระบบและกู้คืนไม่ได้`,
        okText: 'ลบไอดี'
    });
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });
        if (res.status === 401 || res.status === 403) { logout(true); return; }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'ลบข้อมูลไม่สำเร็จ');

        toast(`ลบไอดี ${username} แล้ว`, 'success');
        state.accounts = state.accounts.filter(a => a.username !== username);
        state.sig = '';
        updateOverview();
        renderTable();
        fetchAccounts();
    } catch (err) {
        toast(err.message || 'เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
}

function updateUIState() {
    const badge = $('role-badge'), btn = $('auth-btn');
    if (isAdmin()) {
        badge.className = 'role admin';
        badge.innerHTML = `<i class="fa-solid fa-user-shield"></i> Admin (${escapeHtml(Store.get('adminUser') || 'admin')})`;
        btn.className = 'btn btn-ghost';
        btn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> ออกจากระบบ';
    } else {
        badge.className = 'role';
        badge.innerHTML = '<i class="fa-solid fa-user"></i> ผู้ชม';
        btn.className = 'btn btn-primary';
        btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> เข้าสู่ระบบ Admin';
    }
    renderTable();
}

/* ---------- เริ่มทำงาน ---------- */
function init() {
    // ไฟสปอตไลต์ตามเมาส์บนการ์ด
    document.querySelectorAll('.spot').forEach(el => {
        el.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
    });

    // ค้นหา (debounce)
    let t;
    const search = $('search');
    search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { state.query = search.value.trim(); renderTable(); }, 120);
    });
    search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { search.value = ''; state.query = ''; renderTable(); search.blur(); }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
            e.preventDefault(); search.focus();
        }
    });

    // ตัวกรอง
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.filter = chip.dataset.filter;
            document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
            renderTable();
        });
    });

    // เรียงตามหัวคอลัมน์
    document.querySelectorAll('thead th[data-sort]').forEach(th => {
        th.querySelector('button').addEventListener('click', () => setSort(th.dataset.sort));
    });

    // ตัวเลือกเรียงลำดับสำหรับมือถือ (ที่หัวตารางถูกซ่อน)
    $('sort-select').addEventListener('change', (e) => {
        state.sortKey = e.target.value;
        state.sortDir = (state.sortKey === 'username' || state.sortKey === 'vehicles') ? 'asc' : 'desc';
        renderTable();
    });
    $('sort-dir').addEventListener('click', () => {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        renderTable();
    });

    // ปุ่มในตาราง (ลบ / ลองใหม่ / ล้างตัวกรอง)
    $('account-table-body').addEventListener('click', (e) => {
        const del = e.target.closest('.btn-delete');
        if (del) { deleteAccount(decodeURIComponent(del.dataset.username)); return; }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'retry') fetchAccounts(true);
        if (act === 'clear') {
            state.query = ''; state.filter = 'all'; search.value = '';
            document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
            renderTable();
        }
    });

    $('refresh-btn').addEventListener('click', () => fetchAccounts(true));
    $('auth-btn').addEventListener('click', handleAuthAction);

    // หยุดดึงข้อมูลตอนซ่อนแท็บ กลับมาแล้วดึงทันที
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearTimeout(state.timer);
        else fetchAccounts();
    });

    // ถ้าล็อกอิน/ออกจากระบบจากแท็บอื่น ให้ซิงก์
    window.addEventListener('storage', (e) => { if (e.key === 'adminToken') updateUIState(); });

    setConn('loading');
    updateUIState();
    fetchAccounts();
}

init();