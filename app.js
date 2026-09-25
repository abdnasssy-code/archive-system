let allMails = [];

document.addEventListener('DOMContentLoaded', function () {
    loadMails();

    const form = document.getElementById('mailForm');
    if (form) {
        form.addEventListener('submit', saveMail);
    }

    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', loadMails);
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function (e) {
            filterMails(e.target.value);
        });
    }
});

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active-tab'));

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(b => b.classList.remove('active'));

    if (tabName === 'add') {
        document.getElementById('tab-add').classList.add('active-tab');
        event.currentTarget.classList.add('active');
    } else if (tabName === 'archive') {
        document.getElementById('tab-archive').classList.add('active-tab');
        event.currentTarget.classList.add('active');
        loadMails();
    }
}

function loadMails() {
    const tbody = document.getElementById('mail-list');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-row">جاري مزامنة بيانات السجلات الرسمية...</td></tr>';
    }

    fetch('/api/mails')
        .then(res => res.json())
        .then(data => {
            allMails = data || [];
            updateStats(allMails);
            renderTable(allMails);
        })
        .catch(err => {
            console.error(err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="loading-row" style="color:red">حدث خطأ في الاتصال بقاعدة البيانات.</td></tr>';
            }
        });
}

function updateStats(data) {
    const totalEl = document.getElementById('stat-total');
    const outEl = document.getElementById('stat-out');
    const inEl = document.getElementById('stat-in');
    const internalEl = document.getElementById('stat-internal');

    if (totalEl) totalEl.textContent = data.length;
    if (outEl) outEl.textContent = data.filter(m => m.mail_type === 'صادر').length;
    if (inEl) inEl.textContent = data.filter(m => m.mail_type === 'وارد').length;
    if (internalEl) internalEl.textContent = data.filter(m => m.mail_type === 'داخلي').length;
}

function renderTable(data) {
    const tbody = document.getElementById('mail-list');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-row">لا توجد سجلات مسجلة حتى الآن.</td></tr>';
        return;
    }

    data.forEach(mail => {
        const tr = document.createElement('tr');
        const secretClass = mail.secrecy_level && mail.secrecy_level.includes('سري') ? 'badge-secret' : 'badge-normal';

        // التحقق من وجود كتاب مرتبط (رد) للبحث المشترك أو العرض
        let replyHtml = '<span style="color:#94a3b8; font-size:11px;">كتاب رئيسي</span>';
        if (mail.reply_to) {
            replyHtml = `<span class="reply-badge">↩ رد على: ${escapeHtml(mail.reply_to)}</span>`;
        }

        tr.innerHTML = `
            <td><strong>${escapeHtml(mail.mail_number)}</strong></td>
            <td>${escapeHtml(mail.mail_type)}</td>
            <td>${escapeHtml(mail.subject)}</td>
            <td>${replyHtml}</td>
            <td><small>${escapeHtml(mail.sender_dept)} ← ${escapeHtml(mail.receiver_dept)}</small></td>
            <td>
                <span class="badge ${secretClass}">${escapeHtml(mail.secrecy_level)}</span><br>
                <span class="badge badge-status">${escapeHtml(mail.status)}</span>
            </td>
            <td>${mail.pdf_path ? `<a href="${mail.pdf_path}" target="_blank" class="btn-pdf">📄 عرض الملف المرفق</a>` : '<span style="color:#cbd5e1; font-size:11px;">بدون مرفق</span>'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filterMails(query) {
    const q = query.toLowerCase().trim();
    const filtered = allMails.filter(m => 
        (m.mail_number && m.mail_number.toLowerCase().includes(q)) ||
        (m.subject && m.subject.toLowerCase().includes(q)) ||
        (m.sender_dept && m.sender_dept.toLowerCase().includes(q)) ||
        (m.receiver_dept && m.receiver_dept.toLowerCase().includes(q)) ||
        (m.reply_to && m.reply_to.toLowerCase().includes(q))
    );
    renderTable(filtered);
}

function saveMail(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = 'جاري توثيق المعاملة والربط الآلي...';

    const formData = new FormData();
    formData.append('mail_number', document.getElementById('m_num').value);
    formData.append('mail_type', document.getElementById('m_type').value);
    formData.append('reply_to', document.getElementById('m_reply_to').value); // حقل الرد الجديد
    formData.append('subject', document.getElementById('m_sub').value);
    formData.append('sender_dept', document.getElementById('m_sender').value);
    formData.append('receiver_dept', document.getElementById('m_receiver').value);
    formData.append('secrecy_level', document.getElementById('m_sec').value);
    formData.append('status', document.getElementById('m_stat').value);
    formData.append('summary', document.getElementById('m_sum').value);

    const fileInput = document.getElementById('m_file');
    if (fileInput.files[0]) {
        formData.append('pdf_file', fileInput.files[0]);
    }

    fetch('/api/mails', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        alert('تم اعتماد وحفظ الكتاب والرد المرتبط بنجاح في الأرشيف!');
        document.getElementById('mailForm').reset();
        loadMails();
    })
    .catch(err => {
        console.error(err);
        alert('حدث خطأ أثناء الحفظ!');
    })
    .finally(() => {
        btn.disabled, (btn.disabled = false);
        btn.textContent = 'حفظ المعاملة وتأكيد الأرشيف';
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}