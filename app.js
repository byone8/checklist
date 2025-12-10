/**
 * Pro Checklist Manager - Offline First App
 * Architecture: Clean Vanilla JS with LocalStorage
 */

// --- Constants & Config ---
const STORAGE_KEYS = {
    TEMPLATES: 'cl_templates',
    SESSIONS: 'cl_sessions'
};

// --- Utilities ---
const uuid = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
const el = (id) => document.getElementById(id);

// --- Data Layer (LocalStorage) ---
class StorageManager {
    constructor() {
        this.templates = this.load(STORAGE_KEYS.TEMPLATES) || [];
        this.sessions = this.load(STORAGE_KEYS.SESSIONS) || [];

        // Seed initial data if empty
        if (this.templates.length === 0) {
            this.seedData();
        }
    }

    load(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            console.error('Data load error', e);
            return null;
        }
    }

    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            alert('저장 공간이 부족합니다! 오래된 기록을 정리해주세요.');
        }
    }

    saveTemplates() {
        this.save(STORAGE_KEYS.TEMPLATES, this.templates);
    }

    saveSessions() {
        this.save(STORAGE_KEYS.SESSIONS, this.sessions);
    }

    seedData() {
        this.templates.push({
            id: uuid(),
            title: '예시: 일일 차량 점검',
            questions: ['타이어 공기압 확인', '엔진 오일 점검', '브레이크 등 확인', '전면 유리 세척'],
            created: Date.now()
        });
        this.saveTemplates();
    }

    // -- CRUD Operations: Templates --
    addTemplate(title, questions) {
        const t = { id: uuid(), title, questions, created: Date.now() };
        this.templates.unshift(t);
        this.saveTemplates();
        return t;
    }

    deleteTemplate(id) {
        this.templates = this.templates.filter(t => t.id !== id);
        this.saveTemplates();
    }

    updateTemplate(id, title, questions) {
        const idx = this.templates.findIndex(t => t.id === id);
        if (idx !== -1) {
            this.templates[idx] = { ...this.templates[idx], title, questions };
            this.saveTemplates();
        }
    }

    // -- CRUD Operations: Sessions --
    createSession(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) throw new Error('프로젝트를 찾을 수 없습니다.');

        const session = {
            id: uuid(),
            templateId: template.id,
            title: template.title,
            items: template.questions.map(q => ({ q: q, a: '', checked: false })),
            created: Date.now()
        };
        this.sessions.unshift(session);
        this.saveSessions();
        return session;
    }

    saveSessionUpdates(session) {
        const idx = this.sessions.findIndex(s => s.id === session.id);
        if (idx !== -1) {
            this.sessions[idx] = session;
            this.saveSessions();
        }
    }

    // Added: Delete Session feature
    deleteSession(id) {
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.saveSessions();
    }
}

// --- App Controller ---
class App {
    constructor() {
        this.store = new StorageManager();
        this.currentView = 'dashboard-view';
        this.editingTemplateId = null;
        this.activeSessionId = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderDashboard();
        if (window.lucide) lucide.createIcons();
    }

    bindEvents() {
        // Navigation
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.switchView(target);
            });
        });

        // Dashboard Actions
        el('btn-start-session').addEventListener('click', () => {
            const tId = el('new-session-template-select').value;
            if (!tId) return this.showToast('프로젝트를 선택해주세요.', 'error');
            const session = this.store.createSession(tId);
            this.openSession(session.id);
        });

        // Template Management Actions
        el('btn-create-template').addEventListener('click', () => this.openTemplateEditor());
        el('btn-add-question').addEventListener('click', () => this.addQuestionInput(''));
        el('btn-cancel-template').addEventListener('click', () => this.switchView('templates-view'));
        el('btn-save-template').addEventListener('click', () => this.saveTemplateFromEditor());

        // Session Actions
        el('btn-save-session').addEventListener('click', () => {
            this.showToast('기록이 저장되었습니다.');
        });

        // Export Actions
        el('btn-export-txt').addEventListener('click', () => this.exportCurrentSession('txt'));
        el('btn-export-csv').addEventListener('click', () => this.exportCurrentSession('csv'));
        el('btn-print').addEventListener('click', () => window.print());

        // Data Management Events
        el('btn-backup-json')?.addEventListener('click', () => this.backupData());
        el('btn-backup-excel')?.addEventListener('click', () => this.exportFullDataExcel());
        el('btn-restore-trigger')?.addEventListener('click', () => el('input-restore-json').click());
        el('input-restore-json')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.restoreData(e.target.files[0]);
        });
    }

    showToast(msg, type = 'success') {
        const toast = el('toast');
        toast.textContent = msg;
        // Tailwind styling handled in HTML, just toggle visibility
        // Reset classes
        toast.className = 'fixed bottom-6 right-6 z-50 rounded-md border px-6 py-3 text-sm font-medium shadow-lg transition-all transform translate-y-0 opacity-100';

        if (type === 'error') {
            toast.classList.add('bg-destructive', 'text-destructive-foreground', 'border-destructive');
        } else {
            toast.classList.add('bg-foreground', 'text-background', 'border-border');
        }

        toast.classList.remove('hidden', 'translate-y-2', 'opacity-0');

        setTimeout(() => {
            toast.classList.add('translate-y-2', 'opacity-0');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

    switchView(viewId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        el(viewId).classList.remove('hidden');
        this.currentView = viewId;

        // Update Nav State
        document.querySelectorAll('.nav-item').forEach(b => {
            b.classList.remove('active', 'bg-accent', 'text-accent-foreground');
            b.classList.add('text-foreground/60');
        });
        const activeBtn = document.querySelector(`.nav-item[data-target="${viewId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('bg-accent', 'text-accent-foreground');
            activeBtn.classList.remove('text-foreground/60');
        }

        if (viewId === 'dashboard-view') this.renderDashboard();
        if (viewId === 'templates-view') this.renderTemplates();

        lucide.createIcons();
    }

    // --- Renderers ---
    renderDashboard() {
        const select = el('new-session-template-select');
        select.innerHTML = '<option value="">프로젝트 선택...</option>';
        this.store.templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            select.appendChild(opt);
        });

        const list = el('session-list');
        list.innerHTML = '';
        if (this.store.sessions.length === 0) {
            list.innerHTML = `<div class="flex h-32 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground text-sm">
                저장된 기록이 없습니다.
            </div>`;
            return;
        }

        this.store.sessions.slice(0, 15).forEach(session => {
            const div = document.createElement('div');
            // Tailwind: list-item -> card style
            div.className = 'flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors shadow-sm';
            div.innerHTML = `
                <div style="cursor: pointer; flex: 1;" onclick="app.openSession('${session.id}')" class="space-y-1">
                    <strong class="text-sm font-semibold tracking-tight text-foreground">${session.title}</strong>
                    <div class="text-xs text-muted-foreground flex items-center gap-1">
                        <i data-lucide="clock" class="h-3 w-3"></i>
                        ${new Date(session.created).toLocaleString()}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3" onclick="app.openSession('${session.id}')">
                        열기
                    </button>
                    <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 px-3" onclick="event.stopPropagation(); app.deleteSession('${session.id}')">
                        삭제
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
        lucide.createIcons();
    }

    deleteSession(id) {
        if (!confirm('이 기록을 완전히 삭제하시겠습니까? 복구할 수 없습니다.')) return;
        this.store.deleteSession(id);
        this.renderDashboard();
        this.showToast('기록이 삭제되었습니다.');
    }

    renderTemplates() {
        const list = el('template-list');
        list.innerHTML = '';
        if (this.store.templates.length === 0) {
            list.innerHTML = `<div class="flex h-32 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground text-sm">
                등록된 프로젝트가 없습니다.
            </div>`;
            return;
        }

        this.store.templates.forEach(t => {
            const div = document.createElement('div');
            // Tailwind style
            div.className = 'flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors shadow-sm';
            div.innerHTML = `
                <div class="space-y-1">
                    <strong class="text-sm font-semibold tracking-tight text-foreground">${t.title}</strong>
                    <div class="text-xs text-muted-foreground">${t.questions.length} 질문 항목</div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3" onclick="app.openTemplateEditor('${t.id}')">수정</button>
                    <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 px-3" onclick="app.deleteTemplate('${t.id}')">삭제</button>
                </div>
            `;
            list.appendChild(div);
        });
        lucide.createIcons();
    }

    deleteTemplate(id) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        this.store.deleteTemplate(id);
        this.renderTemplates();
    }

    // --- Template Editor ---
    openTemplateEditor(templateId = null) {
        this.switchView('template-editor-view');
        this.editingTemplateId = templateId;
        const listContainer = el('edit-questions-list');
        listContainer.innerHTML = '';

        // Init/Refresh Sortable for Template Editor
        if (this.templateSortable) {
            this.templateSortable.destroy();
        }
        this.templateSortable = new Sortable(listContainer, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'bg-accent/50'
        });

        if (templateId) {
            const t = this.store.templates.find(t => t.id === templateId);
            el('edit-template-title').value = t.title;
            t.questions.forEach(q => this.addQuestionInput(q));
        } else {
            el('edit-template-title').value = '';
            this.addQuestionInput('');
        }
    }

    addQuestionInput(value) {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 group';
        div.innerHTML = `
            <div class="drag-handle cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1">
                <i data-lucide="grip-vertical" class="h-5 w-5"></i>
            </div>
            <input type="text" value="${value}" placeholder="체크리스트 질문 입력..." class="question-input flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
            <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-10 w-10 p-0" onclick="this.parentElement.remove()">
                <i data-lucide="trash-2" class="h-4 w-4"></i>
            </button>
        `;
        el('edit-questions-list').appendChild(div);
        lucide.createIcons();
    }

    saveTemplateFromEditor() {
        const title = el('edit-template-title').value.trim();
        if (!title) return alert('프로젝트 제목을 입력해주세요.');

        const questions = Array.from(document.querySelectorAll('.question-input'))
            .map(input => input.value.trim())
            .filter(val => val !== '');

        if (questions.length === 0) return alert('최소 하나의 질문이 필요합니다.');

        if (this.editingTemplateId) {
            this.store.updateTemplate(this.editingTemplateId, title, questions);
            this.showToast('프로젝트 수정 완료');
        } else {
            this.store.addTemplate(title, questions);
            this.showToast('새 프로젝트 생성 완료');
        }

        this.switchView('templates-view');
    }

    // --- Session Logic ---
    openSession(sessionId) {
        const session = this.store.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.activeSessionId = sessionId;
        this.switchView('active-session-view');
        el('active-session-title').value = session.title;
        el('active-session-date').textContent = new Date(session.created).toLocaleString();

        this.renderChecklistItems(session);
    }

    renderChecklistItems(session) {
        const container = el('checklist-items-container');
        container.innerHTML = '';

        // Initialize Sortable if not already done
        if (this.sortable) {
            this.sortable.destroy();
        }

        this.sortable = new Sortable(container, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'bg-accent/50',
            onEnd: (evt) => {
                const itemEl = session.items[evt.oldIndex];
                session.items.splice(evt.oldIndex, 1);
                session.items.splice(evt.newIndex, 0, itemEl);
                this.store.saveSessionUpdates(session);
                // Re-render to update closure indices
                this.renderChecklistItems(session);
            }
        });

        session.items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'flex items-start gap-3 py-4 group bg-card border-b border-border last:border-0';
            row.dataset.id = idx;

            // Drag Handle
            const handleWrapper = document.createElement('div');
            handleWrapper.className = 'drag-handle flex items-center h-6 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground';
            handleWrapper.innerHTML = `<i data-lucide="grip-vertical" class="h-5 w-5"></i>`;

            // Content Wrapper
            const content = document.createElement('div');
            content.className = 'flex-1 space-y-1';

            // Question
            const question = document.createElement('p');
            question.className = 'text-sm font-medium leading-none text-foreground pt-1';
            question.textContent = item.q;

            // Note Input (Textarea)
            const noteInput = document.createElement('textarea');
            noteInput.className = 'flex w-full rounded-md bg-transparent px-0 py-1 text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:text-foreground focus:outline-none focus:border-b-2 focus:border-primary focus:rounded-none transition-colors resize-none overflow-hidden min-h-[2rem]';
            noteInput.placeholder = '비고 입력...';
            noteInput.value = item.a;
            noteInput.rows = 1;

            // Auto-resize function
            const autoResize = (el) => {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            };

            // Init resize if value exists
            if (item.a) setTimeout(() => autoResize(noteInput), 0);

            noteInput.oninput = (e) => {
                autoResize(e.target);
                session.items[idx].a = e.target.value;
                this.store.saveSessionUpdates(session);
            };

            content.appendChild(question);
            content.appendChild(noteInput);
            row.appendChild(handleWrapper);
            row.appendChild(content);
            container.appendChild(row);
        });
        lucide.createIcons();
    }

    // --- Data Export ---
    exportCurrentSession(format) {
        if (!this.activeSessionId) return;
        const session = this.store.sessions.find(s => s.id === this.activeSessionId);
        let content = '';
        let mimeType = 'text/plain';
        let extension = 'txt';

        if (format === 'txt') {
            content = `점검 보고서: ${session.title}\n날짜: ${new Date(session.created).toLocaleString()}\n\n`;
            session.items.forEach((item, i) => {
                content += `${i + 1}. ${item.q}\n`;
                if (item.a) content += `   비고: ${item.a}\n`;
                content += '\n';
            });
        } else if (format === 'csv') {
            mimeType = 'text/csv;charset=utf-8;';
            extension = 'csv';
            // Prepend BOM for Excel to recognize UTF-8
            content = '\uFEFF';
            content += '"번호","질문","완료여부","비고"\n';
            session.items.forEach((item, i) => {
                // Escape quotes for CSV
                const safeQ = item.q.replace(/"/g, '""');
                const safeA = item.a.replace(/"/g, '""');
                content += `"${i + 1}","${safeQ}","${item.checked ? '예' : '아니오'}","${safeA}"\n`;
            });
        }

        this.downloadFile(content, `checklist-${session.created}.${extension}`, mimeType);
    }

    downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- System Backup & Restore ---
    backupData() {
        const data = {
            templates: this.store.templates,
            sessions: this.store.sessions,
            exportedAt: new Date().toISOString(),
            appVersion: '1.0'
        };
        const fileName = `CheckMaster_Backup_${this.getTimestamp()}.json`;
        const content = JSON.stringify(data, null, 2);
        this.downloadFile(content, fileName, 'application/json');
    }

    exportFullDataExcel() {
        if (!window.XLSX) return alert('Excel 라이브러리를 로드하는 중입니다. 잠시 후 다시 시도해주세요.');

        const wb = XLSX.utils.book_new();

        // Sheet 1: Sessions Summary
        const sessionData = this.store.sessions.map(s => ({
            ID: s.id,
            Project: s.title,
            Date: new Date(s.created).toLocaleString(),
            ItemsCount: s.items.length
        }));
        const wsSessions = XLSX.utils.json_to_sheet(sessionData);
        XLSX.utils.book_append_sheet(wb, wsSessions, "Sessions");

        // Sheet 2: All Detailed Items
        const allItems = [];
        this.store.sessions.forEach(s => {
            s.items.forEach((item, idx) => {
                allItems.push({
                    SessionID: s.id,
                    Project: s.title,
                    Date: new Date(s.created).toLocaleString(),
                    No: idx + 1,
                    Question: item.q,
                    Note: item.a || ''
                });
            });
        });
        const wsItems = XLSX.utils.json_to_sheet(allItems);
        XLSX.utils.book_append_sheet(wb, wsItems, "Details");

        const fileName = `CheckMaster_Export_${this.getTimestamp()}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    restoreData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                // Simple validation
                if (!data.templates || !data.sessions) {
                    throw new Error('유효하지 않은 백업 파일입니다.');
                }

                if (!confirm('경고: 현재 앱의 모든 데이터가 삭제되고 백업 파일의 내용으로 덮어쓰기 됩니다. 계속하시겠습니까?')) {
                    // Reset input so user can select same file again if they cancelled
                    el('input-restore-json').value = '';
                    return;
                }

                this.store.templates = data.templates;
                this.store.sessions = data.sessions;
                this.store.saveTemplates();
                this.store.saveSessions();

                alert('데이터 복원이 완료되었습니다. 앱을 새로고침합니다.');
                location.reload();
            } catch (err) {
                alert('복원 실패: ' + err.message);
                el('input-restore-json').value = '';
            }
        };
        reader.readAsText(file);
    }

    getTimestamp() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    }
}

// Initialize
const app = new App();
window.app = app;
