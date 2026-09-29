(() => {
    'use strict';

    // ล็อกอินอยู่แล้ว ไม่ต้องกรอกซ้ำ
    if (Store.get('adminToken')) { location.replace('/'); return; }

    const $ = (id) => document.getElementById(id);
    const form = $('login-form'), card = $('card'), submit = $('submit');
    const errBox = $('error-msg'), pass = $('password');
    let busy = false;

    function showError(msg) {
        errBox.textContent = msg;
        errBox.hidden = false;
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
    }

    function setBusy(v) {
        busy = v;
        submit.disabled = v;
        submit.innerHTML = v ? '<span class="spinner"></span> กำลังตรวจสอบ' : 'เข้าสู่ระบบ';
    }

    $('eye').addEventListener('click', () => {
        const show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        $('eye').innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        $('eye').setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        pass.focus();
    });

    pass.addEventListener('keyup', (e) => {
        $('caps').hidden = !(e.getModifierState && e.getModifierState('CapsLock'));
    });
    pass.addEventListener('blur', () => { $('caps').hidden = true; });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;

        const username = $('username').value.trim();
        const password = pass.value; // ไม่ trim รหัสผ่าน
        errBox.hidden = true;

        if (!username || !password) {
            showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ');
            return;
        }

        setBusy(true);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                signal: ctrl.signal
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.token) {
                Store.set('adminToken', data.token);
                Store.set('adminUser', data.username || username);
                submit.innerHTML = '<i class="fa-solid fa-check"></i> สำเร็จ';
                setTimeout(() => { location.href = '/'; }, 400);
                return;
            }

            const fallback = res.status === 401 || res.status === 403
                ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
                : `เซิร์ฟเวอร์ตอบกลับผิดปกติ (HTTP ${res.status})`;
            showError(data.error || fallback);
            setBusy(false);
        } catch (err) {
            showError(err.name === 'AbortError'
                ? 'เซิร์ฟเวอร์ตอบสนองช้าเกินไป ลองใหม่อีกครั้ง'
                : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
            setBusy(false);
        } finally {
            clearTimeout(timer);
        }
    });
})();