const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// กำหนดบัญชี Admin คนเดียวในระบบ
const ADMIN_USER = 'Folkkyyx';
const ADMIN_PASS = 'Folkza2017';
const ADMIN_TOKEN = 'folkshop-admin-secret-token';

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://folkzaza2548_db_user:EsGG3uPMu1c7C3jG@cluster0.nt0dlnk.mongodb.net/roblox_monitor?retryWrites=true&w=majority";

app.use(cors());
app.use(express.json());

let accountsDB = {};
if (fs.existsSync(DB_FILE)) {
    try {
        accountsDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        accountsDB = {};
    }
}

function saveData() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(accountsDB, null, 2));
    } catch (e) {
        console.error("Error saving DB:", e);
    }
}

// API เข้าสู่ระบบ Admin
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, token: ADMIN_TOKEN, username: ADMIN_USER });
    }
    
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่าน Admin ไม่ถูกต้อง' });
});

// API ลบไอดี (ต้องใช้ Token Admin)
app.delete('/api/accounts/:username', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ในการลบข้อมูล' });
    }

    const { username } = req.params;
    if (accountsDB[username]) {
        delete accountsDB[username];
        saveData();
        return res.json({ success: true, message: `ลบไอดี ${username} เรียบร้อยแล้ว` });
    }

    return res.status(404).json({ error: 'ไม่พบไอดีที่ต้องการลบ' });
});

// API Roblox Script ส่งข้อมูล (POST)
app.post('/api/update', (req, res) => {
    const { username, bank, levels, vehicles } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const now = Math.floor(Date.now() / 1000);
    if (!accountsDB[username]) {
        accountsDB[username] = {
            username,
            farmSeconds: 0,
            lastPing: now,
            bank: 0,
            levels: { fishing: 0, farming: 0, shelfStocker: 0 },
            vehicles: 'None'
        };
    }

    const acc = accountsDB[username];
    const timeDiff = now - acc.lastPing;
    if (timeDiff > 0 && timeDiff <= 120) acc.farmSeconds += timeDiff;

    acc.lastPing = now;
    if (typeof bank === 'number') acc.bank = bank;
    if (levels) acc.levels = { ...acc.levels, ...levels };
    if (vehicles) acc.vehicles = Array.isArray(vehicles) ? vehicles.join(', ') : vehicles;

    saveData();
    res.json({ success: true, farmSeconds: acc.farmSeconds });
});

// API ดึงข้อมูลไอดีทั้งหมด (GET)
app.get('/api/accounts', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const result = Object.values(accountsDB).map(acc => ({
        ...acc,
        isOnline: (now - acc.lastPing) <= 90
    }));
    res.json(result);
});

// ให้หน้าเว็บ Frontend เปิดผ่าน Express ได้
app.use(express.static(path.join(__dirname, '../frontend')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});