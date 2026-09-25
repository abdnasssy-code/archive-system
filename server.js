const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // لرفع ملفات الـ PDF

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد التخزين لملفات الـ PDF المرفقة
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

// تهيئة قاعدة بيانات SQLite بأسماء الحقول المتوافقة مع الواجهة
const dbFile = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('خطأ في قاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة البيانات بنجاح.');
        initDB();
    }
});

function initDB() {
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`, () => {
        db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
                db.run(`INSERT INTO users (username, password, role) VALUES ('staff', '123456', 'staff')`);
            }
        });
    });

    // جدول المعاملات والكتب الرسمية مطابقاً تماماً للواجهة الأمامية
    db.run(`CREATE TABLE IF NOT EXISTS mails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mail_number TEXT,
        mail_type TEXT,
        reply_to TEXT,
        subject TEXT,
        sender_dept TEXT,
        receiver_dept TEXT,
        secrecy_level TEXT,
        status TEXT,
        summary TEXT,
        pdf_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        if (user) {
            res.json({ success: true, user: { username: user.username, role: user.role } });
        } else {
            res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// جلب جميع المعاملات
app.get('/api/mails', (req, res) => {
    db.all(`SELECT * FROM mails ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// إضافة معاملة جديدة مع دعم رفع ملف الـ PDF
app.post('/api/mails', upload.single('pdf_file'), (req, res) => {
    try {
        const { mail_number, mail_type, reply_to, subject, sender_dept, receiver_dept, secrecy_level, status, summary } = req.body;
        const pdf_path = req.file ? `/uploads/${req.file.filename}` : null;

        const query = `INSERT INTO mails (mail_number, mail_type, reply_to, subject, sender_dept, receiver_dept, secrecy_level, status, summary, pdf_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.run(query, [mail_number, mail_type, reply_to, subject, sender_dept, receiver_dept, secrecy_level, status, summary, pdf_path], function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, message: 'تم حفظ وتوثيق المعاملة في الأرشيف بنجاح' });
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// حذف معاملة (مخصص للمسؤول)
app.delete('/api/mails/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM mails WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});