(() => {
    const canvas = document.getElementById('fx');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STAR_COLORS = ['255,244,200', '255,214,235', '200,235,255'];
    const GIFT_SETS = [['#d9304f', '#ffd98a'], ['#2f9e6a', '#ffe1e8'], ['#3d7bd9', '#f4faff'], ['#f4faff', '#d9304f']];
    const BAUBLES = ['#d9304f', '#ffcf6e', '#3d7bd9', '#2f9e6a'];
    let W = 0, H = 0, parts = [], bursts = [], raf = 0, last = performance.now();
    const mouse = { x: -9999, y: -9999 };
    const rand = (a, b) => a + Math.random() * (b - a);

    // ภาพหิมะก้อนนุ่ม (วาดครั้งเดียว ใช้ซ้ำ เพื่อไม่ให้เครื่องหนัก)
    const puff = document.createElement('canvas');
    puff.width = puff.height = 64;
    {
        const c = puff.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(235,246,255,.85)');
        g.addColorStop(1, 'rgba(200,228,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
    }

    function make(type, fromTop = false) {
        const depth = rand(0.4, 1); // ไกล -> ใกล้
        const p = {
            type, depth,
            x: rand(0, W), y: fromTop ? rand(-40, -10) : rand(0, H),
            ph: rand(0, 6.28), sp: rand(0.5, 1.4),
            rot: rand(0, 6.28), vr: rand(-0.012, 0.012)
        };
        if (type === 'puff')    { p.r = 2 + depth * 5;  p.vy = 0.25 + depth * 0.8;  p.a = 0.35 + depth * 0.5; }
        if (type === 'crystal') { p.r = 6 + depth * 8;  p.vy = 0.2 + depth * 0.45;  p.a = 0.45 + depth * 0.4; }
        if (type === 'star')    { p.r = 3 + depth * 4;  p.vy = 0.12 + depth * 0.3;  p.c = STAR_COLORS[(Math.random() * 3) | 0]; }
        if (type === 'snowman') { p.r = 9 + depth * 5;  p.vy = 0.18 + depth * 0.25; p.a = 0.95; p.vr = 0; }
        if (type === 'santa')   { p.r = 11 + depth * 6; p.vy = 0.18 + depth * 0.25; p.a = 0.97; p.vr = 0; }
        if (type === 'stocking'){ p.r = 12 + depth * 6; p.vy = 0.2 + depth * 0.28;  p.a = 0.97; p.vr = 0; }
        if (type === 'gift')    { p.r = 8 + depth * 5;  p.vy = 0.2 + depth * 0.3;   p.a = 0.95; p.vr = 0; p.set = GIFT_SETS[(Math.random() * GIFT_SETS.length) | 0]; }
        if (type === 'cane')    { p.r = 9 + depth * 5;  p.vy = 0.2 + depth * 0.3;   p.a = 0.95; p.vr = rand(-0.01, 0.01); }
        if (type === 'bauble')  { p.r = 6 + depth * 4;  p.vy = 0.22 + depth * 0.3;  p.a = 0.95; p.vr = 0; p.col = BAUBLES[(Math.random() * BAUBLES.length) | 0]; }
        return p;
    }

    function populate() {
        const total = Math.min(130, Math.max(40, Math.round((W * H) / 14000)));
        const snowmen = Math.min(3, Math.round(total / 35));
        const santas = Math.min(4, Math.max(1, Math.round(total / 28)));
        const stockings = Math.min(5, Math.max(2, Math.round(total / 24)));
        const gifts = Math.min(4, Math.max(1, Math.round(total / 30)));
        const canes = Math.min(4, Math.max(1, Math.round(total / 30)));
        const baubles = Math.min(5, Math.max(2, Math.round(total / 24)));
        const crystals = Math.round(total * 0.3);
        const stars = Math.round(total * 0.2);
        const puffs = Math.max(10, total - snowmen - santas - stockings - gifts - canes - baubles - crystals - stars);
        parts = [];
        for (let i = 0; i < santas; i++) parts.push(make('santa'));
        for (let i = 0; i < stockings; i++) parts.push(make('stocking'));
        for (let i = 0; i < gifts; i++) parts.push(make('gift'));
        for (let i = 0; i < canes; i++) parts.push(make('cane'));
        for (let i = 0; i < baubles; i++) parts.push(make('bauble'));
        for (let i = 0; i < puffs; i++) parts.push(make('puff'));
        for (let i = 0; i < crystals; i++) parts.push(make('crystal'));
        for (let i = 0; i < stars; i++) parts.push(make('star'));
        for (let i = 0; i < snowmen; i++) parts.push(make('snowman'));
        parts.sort((a, b) => a.depth - b.depth);
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const oldW = W, oldH = H;
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // มือถือ: แถบ URL ซ่อน/โผล่ตอนเลื่อนทำให้ความสูงเปลี่ยนเล็กน้อย ไม่ต้องสุ่มอนุภาคใหม่ (กันภาพกระพริบ)
        if (!parts.length || W !== oldW || Math.abs(H - oldH) > 200) populate();
    }

    /* ---------- วาด ---------- */
    function drawSparkle(x, y, s, c, a) {
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.quadraticCurveTo(x, y, x + s, y);
        ctx.quadraticCurveTo(x, y, x, y + s);
        ctx.quadraticCurveTo(x, y, x - s, y);
        ctx.quadraticCurveTo(x, y, x, y - s);
        ctx.fillStyle = `rgba(${c},${a})`;
        ctx.shadowColor = `rgba(${c},.9)`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawCrystal(p) {
        const r = p.r;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.strokeStyle = `rgba(225,242,255,${p.a})`;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(150,210,255,.8)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
            ctx.moveTo(0, 0);
            ctx.lineTo(ca * r, sa * r);
            const bx = ca * r * 0.55, by = sa * r * 0.55;
            for (const off of [-0.9, 0.9]) {
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(a + off) * r * 0.32, by + Math.sin(a + off) * r * 0.32);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawSnowman(p, t) {
        const r = p.r;
        const circ = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.stroke(); };
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(t * p.sp + p.ph) * 0.18);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#f4faff';
        ctx.strokeStyle = 'rgba(150,190,235,.9)';
        ctx.lineWidth = 1;
        circ(0, 0, r);                 // ตัว
        circ(0, -r * 1.5, r * 0.68);   // หัว
        ctx.fillStyle = '#ff8fab';     // ผ้าพันคอ
        ctx.fillRect(-r * 0.6, -r * 1.02, r * 1.2, r * 0.24);
        ctx.fillStyle = '#27324d';     // ตา + กระดุม
        for (const ex of [-0.24, 0.24]) { ctx.beginPath(); ctx.arc(ex * r, -r * 1.58, Math.max(0.9, r * 0.07), 0, 6.283); ctx.fill(); }
        for (const by of [0.2, 0.55]) { ctx.beginPath(); ctx.arc(0, by * r, Math.max(0.8, r * 0.07), 0, 6.283); ctx.fill(); }
        ctx.fillStyle = '#ffb35c';     // จมูกแครอท
        ctx.beginPath();
        ctx.moveTo(r * 0.05, -r * 1.5);
        ctx.lineTo(r * 0.5, -r * 1.42);
        ctx.lineTo(r * 0.05, -r * 1.36);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,143,171,.5)'; // แก้มแดง
        for (const bx of [-0.4, 0.4]) { ctx.beginPath(); ctx.arc(bx * r, -r * 1.4, r * 0.11, 0, 6.283); ctx.fill(); }
        ctx.restore();
    }


    /* ---------- ของตกแต่งคริสต์มาส ---------- */
    function drawSanta(p, t) {
        const r = p.r;
        const circ = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.stroke(); };
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(t * p.sp + p.ph) * 0.16);
        ctx.globalAlpha = p.a;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(70,10,25,.85)';
        ctx.fillStyle = '#e0334f';                 // ตัว
        circ(0, 0, r);
        ctx.fillStyle = '#17171d';                 // เข็มขัด
        ctx.fillRect(-r * 0.97, r * 0.12, r * 1.94, r * 0.3);
        ctx.fillStyle = '#ffcf6e';                 // หัวเข็มขัด
        ctx.fillRect(-r * 0.2, r * 0.1, r * 0.4, r * 0.34);
        ctx.fillStyle = '#ffdcc4';                 // หน้า
        ctx.strokeStyle = 'rgba(120,60,40,.7)';
        circ(0, -r * 1.45, r * 0.6);
        ctx.fillStyle = '#ffffff';                 // เครา
        ctx.beginPath();
        ctx.arc(0, -r * 1.32, r * 0.62, 0.05, Math.PI - 0.05);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.3, r * 0.34, r * 0.13, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#27324d';                 // ตา
        for (const ex of [-0.22, 0.22]) { ctx.beginPath(); ctx.arc(ex * r, -r * 1.58, Math.max(0.9, r * 0.07), 0, 6.283); ctx.fill(); }
        ctx.fillStyle = '#ff8fab';                 // จมูก
        ctx.beginPath(); ctx.arc(0, -r * 1.43, r * 0.09, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#e0334f';                 // หมวก
        ctx.strokeStyle = 'rgba(70,10,25,.85)';
        ctx.beginPath();
        ctx.moveTo(-r * 0.64, -r * 1.78);
        ctx.quadraticCurveTo(-r * 0.35, -r * 2.7, r * 0.55, -r * 2.5);
        ctx.lineTo(r * 0.64, -r * 1.78);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';                 // ขอบหมวก + ปอม
        ctx.fillRect(-r * 0.72, -r * 1.98, r * 1.44, r * 0.28);
        ctx.beginPath(); ctx.arc(r * 0.55, -r * 2.5, r * 0.18, 0, 6.283); ctx.fill();
        ctx.restore();
    }

    function drawStocking(p, t) {
        const s = p.r, w = s * 0.9;
        ctx.save();
        ctx.translate(p.x - s * 0.2, p.y);
        ctx.rotate(Math.sin(t * p.sp + p.ph) * 0.2);
        ctx.globalAlpha = p.a;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(80,10,25,.9)';
        ctx.fillStyle = '#d9304f';
        ctx.beginPath();
        ctx.moveTo(-w / 2, -s);
        ctx.lineTo(w / 2, -s);
        ctx.lineTo(w / 2, s * 0.3);
        ctx.quadraticCurveTo(w / 2 + s * 0.95, s * 0.35, w / 2 + s * 0.9, s * 0.95);
        ctx.quadraticCurveTo(w / 2 + s * 0.6, s * 1.3, -w / 2 - s * 0.05, s * 1.05);
        ctx.quadraticCurveTo(-w / 2 - s * 0.15, s * 0.8, -w / 2, s * 0.4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';                 // ปลายเท้า + ส้น
        ctx.beginPath(); ctx.ellipse(w / 2 + s * 0.55, s * 0.98, s * 0.38, s * 0.24, -0.25, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-w / 2 + s * 0.1, s * 0.82, s * 0.2, s * 0.22, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';   // ลายทาง
        ctx.fillRect(-w / 2, -s * 0.35, w, s * 0.16);
        ctx.fillRect(-w / 2, s * 0.05, w, s * 0.16);
        ctx.fillStyle = '#ffffff';                 // ขอบขนสัตว์
        ctx.strokeStyle = 'rgba(150,190,235,.9)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-w / 2 - s * 0.12, -s * 1.28, w + s * 0.24, s * 0.4, s * 0.16) : ctx.rect(-w / 2 - s * 0.12, -s * 1.28, w + s * 0.24, s * 0.4);
        ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    function drawGift(p, t) {
        const s = p.r * 1.6, [box, rib] = p.set;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(t * p.sp + p.ph) * 0.22);
        ctx.globalAlpha = p.a;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.fillStyle = box;
        ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = rib;
        ctx.fillRect(-s * 0.09, -s / 2, s * 0.18, s);
        ctx.fillRect(-s / 2, -s * 0.09, s, s * 0.18);
        for (const d of [-1, 1]) {                 // โบว์
            ctx.beginPath();
            ctx.ellipse(d * s * 0.2, -s * 0.6, s * 0.2, s * 0.12, d * -0.5, 0, 6.283);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawCane(p) {
        const r = p.r;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.15);
        ctx.globalAlpha = p.a;
        ctx.lineWidth = Math.max(3, r * 0.34);
        ctx.lineCap = 'butt';
        const path = () => {
            ctx.beginPath();
            ctx.moveTo(0, r);
            ctx.lineTo(0, -r * 0.55);
            ctx.arc(r * 0.42, -r * 0.55, r * 0.42, Math.PI, 0);
        };
        ctx.strokeStyle = '#ffffff'; path(); ctx.stroke();
        ctx.strokeStyle = '#d9304f'; ctx.setLineDash([r * 0.26, r * 0.3]); path(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawBauble(p, t) {
        const r = p.r;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(t * p.sp + p.ph) * 0.15);
        ctx.globalAlpha = p.a;
        ctx.shadowColor = p.col; ctx.shadowBlur = 10;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.55)';   // แสงสะท้อน
        ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#ffcf6e';                 // ฝา
        ctx.fillRect(-r * 0.22, -r * 1.18, r * 0.44, r * 0.26);
        ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, -r * 1.3, r * 0.16, 0, 6.283); ctx.stroke();
        ctx.restore();
    }

    /* ---------- เฟรม ---------- */
    function frame(now) {
        const dt = Math.min(2.5, (now - last) / 16.67 || 1);
        last = now;
        const t = now / 1000;
        const wind = Math.sin(t * 0.25) * 0.18;
        ctx.clearRect(0, 0, W, H);

        for (const p of parts) {
            if (!reduce) {
                p.y += p.vy * dt;
                p.x += (Math.sin(t * p.sp + p.ph) * 0.35 + wind * p.depth) * dt;
                p.rot += p.vr * dt;

                const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
                if (d < 120 && d > 0.1) {
                    const f = (1 - d / 120) * 2.5 * dt;
                    p.x += (dx / d) * f;
                    p.y += (dy / d) * f * 0.5;
                }
                if (p.y > H + 30) { p.y = -30; p.x = rand(0, W); }
                if (p.x < -30) p.x = W + 30;
                if (p.x > W + 30) p.x = -30;
            }

            if (p.type === 'puff') {
                ctx.globalAlpha = p.a;
                ctx.drawImage(puff, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
                ctx.globalAlpha = 1;
            } else if (p.type === 'crystal') {
                drawCrystal(p);
            } else if (p.type === 'star') {
                const tw = 0.5 + 0.5 * Math.sin(t * 3 * p.sp + p.ph);
                drawSparkle(p.x, p.y, p.r * (0.6 + 0.6 * tw), p.c, 0.4 + 0.6 * tw);
            } else if (p.type === 'santa') {
                drawSanta(p, t);
            } else if (p.type === 'stocking') {
                drawStocking(p, t);
            } else if (p.type === 'gift') {
                drawGift(p, t);
            } else if (p.type === 'cane') {
                drawCane(p);
            } else if (p.type === 'bauble') {
                drawBauble(p, t);
            } else {
                drawSnowman(p, t);
            }
        }

        // ประกายตอนคลิก
        bursts = bursts.filter(b => b.life > 0);
        for (const b of bursts) {
            b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 0.06 * dt; b.life -= 0.018 * dt;
            const a = Math.max(0, b.life);
            if (b.kind === 'star') drawSparkle(b.x, b.y, b.s * (0.5 + a * 0.5), b.c, a);
            else { ctx.globalAlpha = a; ctx.drawImage(puff, b.x - b.s, b.y - b.s, b.s * 2, b.s * 2); ctx.globalAlpha = 1; }
        }

        if (!reduce) raf = requestAnimationFrame(frame);
    }

    function start() {
        cancelAnimationFrame(raf);
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }

    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); if (reduce) start(); }, 200); });
    window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
    // จอสัมผัส: ยกนิ้วแล้วเลิกผลักอนุภาค
    const clearMouse = () => { mouse.x = mouse.y = -9999; };
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') clearMouse(); });
    window.addEventListener('pointercancel', clearMouse);
    window.addEventListener('pointerdown', e => {
        if (reduce) return;
        for (let i = 0; i < 10; i++) {
            const a = rand(0, 6.283), v = rand(1, 3.4);
            bursts.push({ kind: 'star', x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
                          life: 1, s: rand(3, 7), c: STAR_COLORS[(Math.random() * 3) | 0] });
        }
        for (let i = 0; i < 8; i++) {
            const a = rand(0, 6.283), v = rand(0.5, 2);
            bursts.push({ kind: 'puff', x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1,
                          life: 1, s: rand(4, 9) });
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf); else if (!reduce) start();
    });

    resize();
    start();
})();