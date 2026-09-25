const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قراءة الملفات الثابتة من نفس المجلد
app.use(express.static(__dirname));

// مجلد المرفقات
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// تهيئة قاعدة بيانات SQLite
const dbFile = path.join(__dirname, 'archive.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('خطأ في قاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة البيانات بنجاح.');
        initDB();
    }
});

// إنشاء الجداول
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
        type TEXT DEFAULT 'وارد',
        description TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (user) {
            res.json({ success: true, role: user.role, username: user.username });
        } else {
            res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// جلب المستندات مع مطابقة كافة الاحتمالات البرمجية للواجهة (لتفعيل العدادات والجدول والملفات)
app.get(['/api/documents', '/api/mails', '/mails', '/documents'], (req, res) => {
    db.all(`SELECT * FROM documents ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // إعادة صياغة الحقول لتتوافق مع أي كود في الواجهة أياً كانت تسمياته
        const formattedRows = (rows || []).map(row => {
            return {
                ...row,
                // تكرار الحقول بأسماء مختلفة لضمان قراءتها من أي تصميم واجهة
                subject: row.title,
                mail_title: row.title,
                mail_number: row.doc_number,
                number: row.doc_number,
                mail_type: row.category,
                direction: row.type,
                document_type: row.type,
                summary: row.description,
                content: row.description,
                file: row.file_path
            };
        });

        res.json(formattedRows);
    });
});

// إضافة مستند جديد
app.post(['/api/documents', '/api/mails', '/mails', '/documents'], (req, res) => {
    try {
        const title = req.body.title || req.body.subject || req.body.mail_title || 'بدون عنوان';
        const doc_number = req.body.doc_number || req.body.mail_number || req.body.number || '';
        const date = req.body.date || new Date().toISOString().split('T')[0];
        const category = req.body.category || req.body.mail_type || req.body.section || 'عام';
        
        // التقاط نوع المعاملة لتعمل عدادات الصادر والوارد بدقة تامة
        let rawType = req.body.type || req.body.document_type || req.body.mail_direction || req.body.direction || req.body.kind || 'وارد';
        let type = 'وارد';
        if (typeof rawType === 'string' && (rawType.includes('صادر') || rawType.toLowerCase() === 'outgoing')) {
            type = 'صادر';
        }

        const description = req.body.description || req.body.summary || req.body.content || '';
        const filePath = req.body.file_path || req.body.file || null;

        const query = `INSERT INTO documents (title, doc_number, date, category, type, description, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(query, [title, doc_number, date, category, type, description, filePath], function(err) {
            if (err) {
                console.error("DB Insert Error:", err.message);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, id: this.lastID, message: 'تم الحفظ بنجاح' });
        });
    } catch (e) {
        console.error("Server Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// حذف مستند
app.delete(['/api/documents/:id', '/api/mails/:id', '/mails/:id', '/documents/:id'], (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM documents WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
