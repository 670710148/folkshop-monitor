'use strict';

const Store = {
    get(key) {
        try {
            const v = localStorage.getItem(key);
            if (!v || v === 'null' || v === 'undefined') return null;
            return v;
        } catch (_) { return null; }
    },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
};

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toast(message, type = 'info', duration = 3600) {
    let box = document.getElementById('toasts');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toasts';
        box.className = 'toasts';
        box.setAttribute('role', 'status');
        box.setAttribute('aria-live', 'polite');
        document.body.appendChild(box);
    }
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    box.appendChild(el);
    const remove = () => el.remove();
    setTimeout(() => {
        el.classList.add('out');
        el.addEventListener('animationend', remove, { once: true });
        setTimeout(remove, 600);
    }, duration);
}