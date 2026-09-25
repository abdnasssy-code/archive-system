const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد مجلد المرفقات (PDF)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// إعداد قاعدة بيانات SQLite
const dbFile = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة بيانات SQLite بنجاح.');
        
        // جدول المعاملات
        db.run(`CREATE TABLE IF NOT EXISTS mails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mail_number TEXT NOT NULL,
            mail_type TEXT NOT NULL,
            reply_to TEXT,
            subject TEXT NOT NULL,
            sender_dept TEXT NOT NULL,
            receiver_dept TEXT NOT NULL,
            secrecy_level TEXT,
            status TEXT,
            summary TEXT,
            pdf_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // جدول المستخدمين والصلاحيات
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL -- 'admin' للمسؤول أو 'user' لمُدخل البيانات
        )`, () => {
            // إنشاء حساب مسؤول افتراضي وحساب مُدخل بريد افتراضي (للتجربة)
            db.get(`SELECT * FROM users WHERE username = ?`, ['admin'], (err, row) => {
                if (!row) {
                    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', '123456', 'admin']);
                    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['staff', '123456', 'user']);
                }
            });
        });
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. نقطة نهاية تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT username, role FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
        if (row) {
            res.json({ success: true, user: row });
        } else {
            res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// 2. جلب كافة سجلات الأرشيف
app.get('/api/mails', (req, res) => {
    const query = `SELECT * FROM mails ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في جلب البيانات' });
        }
        res.json(rows);
    });
});

// 3. إضافة كتاب أو رد جديد
app.post('/api/mails', upload.single('pdf_file'), (req, res) => {
    const { 
        mail_number, mail_type, reply_to, subject, 
        sender_dept, receiver_dept, secrecy_level, status, summary 
    } = req.body;

    const pdf_path = req.file ? `/uploads/${req.file.filename}` : null;

    const query = `INSERT INTO mails (
        mail_number, mail_type, reply_to, subject, sender_dept, receiver_dept, secrecy_level, status, summary, pdf_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        mail_number, mail_type, reply_to || null, subject, 
        sender_dept, receiver_dept, secrecy_level, status, summary, pdf_path
    ];

    db.run(query, params, function (err) {
        if (err) {
            return res.status(500).json({ error: 'خطأ أثناء حفظ المعاملة' });
        }
        res.json({ success: true, message: 'تم حفظ وتوثيق الكتاب بنجاح' });
    });
});

// 4. حذف معاملة (خاص بالمسؤول حصراً)
app.delete('/api/mails/:id', (req, res) => {
    const mailId = req.params.id;
    db.run(`DELETE FROM mails WHERE id = ?`, [mailId], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: 'خطأ أثناء الحذف' });
        }
        res.json({ success: true, message: 'تم حذف المعاملة بنجاح' });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`الخادم يعمل بنجاح على الرابط: http://localhost:${PORT}`);
});