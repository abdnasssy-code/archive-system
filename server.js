const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قراءة الملفات الثابتة من نفس مجلد المشروع مباشرة
app.use(express.static(__dirname));

// إعداد مجلد لرفع الملفات إذا لم يكن موجوداً
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const upload = multer({ dest: 'uploads/' });

// تهيئة قاعدة بيانات SQLite
const dbFile = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة بيانات SQLite بنجاح.');
        initDB();
    }
});

// إنشاء الجداول الافتراضية وحساب المسؤول
function initDB() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`, () => {
        db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            }
        });
    });

    db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        doc_number TEXT,
        date TEXT,
        category TEXT,
        description TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        }
        if (user) {
            res.json({ success: true, role: user.role, username: user.username });
        } else {
            res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// جلب جميع المستندات (يدعم المسارين)
app.get(['/api/documents', '/api/mails'], (req, res) => {
    db.all(`SELECT * FROM documents ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// إضافة مستند جديد (يدعم المسارين لضمان توافق الواجهة القديمة والجديدة)
app.post(['/api/documents', '/api/mails'], upload.single('file'), (req, res) => {
    // التقاط الحقول بغض النظر عن تسميتها في الواجهة (title أو subject وغيرها)
    const title = req.body.title || req.body.subject || 'بدون عنوان';
    const doc_number = req.body.doc_number || req.body.mail_number || '';
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const category = req.body.category || req.body.mail_type || 'عام';
    const description = req.body.description || req.body.summary || '';
    
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    const query = `INSERT INTO documents (title, doc_number, date, category, description, file_path) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [title, doc_number, date, category, description, filePath], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, id: this.lastID, message: 'تم الحفظ بنجاح' });
    });
});

// حذف مستند
app.delete(['/api/documents/:id', '/api/mails/:id'], (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM documents WHERE id = ?`, id, function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true });
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`الخادم يعمل بنجاح على المنفذ ${PORT}`);
});