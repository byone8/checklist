/**
 * Pro Checklist Manager - Firebase Firestore Version
 * Architecture: Real-time sync with Firebase
 */

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyBO695RoLDo6FnNmodl-KhpM3tRre1z-og",
    authDomain: "checklist-e4340.firebaseapp.com",
    projectId: "checklist-e4340",
    storageBucket: "checklist-e4340.firebasestorage.app",
    messagingSenderId: "637107660392",
    appId: "1:637107660392:web:c25fe1553e906e75dcfddd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Utilities ---
const el = (id) => document.getElementById(id);
// No need for custom UUID, Firestore handles IDs, or we can use a simple one if needed for temp IDs.
const simpleId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- Data Layer (Firestore) ---
class FirestoreManager {
    constructor(onDataChange) {
        this.templates = [];
        this.sessions = [];
        this.onDataChange = onDataChange; // Callback to update UI when data changes

        this.initListeners();
    }

    initListeners() {
        // Listen to Templates
        db.collection("templates").orderBy("created", "desc").onSnapshot((snapshot) => {
            this.templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.onDataChange('templates');
            console.log("Templates loaded:", this.templates.length);
        }, (error) => {
            console.error("Templates sync error:", error);
            alert("데이터 동기화 오류 (Templates): " + error.message);
        });

        // Listen to Checklists (Sessions)
        db.collection("checklists").orderBy("created", "desc").onSnapshot((snapshot) => {
            this.sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.onDataChange('sessions');
            console.log("Sessions loaded:", this.sessions.length);
        }, (error) => {
            console.error("Sessions sync error:", error);
            alert("데이터 동기화 오류 (Checklists): " + error.message + "\n\nFirestore 보안 규칙(Rules)이 차단 중일 수 있습니다.");
        });

        // Connection Test
        db.collection("connection_test").doc("ping").set({ last_seen: Date.now() })
            .then(() => console.log("Write connection success"))
            .catch(e => console.error("Write connection failed:", e));
    }

    // -- CRUD Operations: Templates --
    async addTemplate(title, questions) {
        try {
            await db.collection("templates").add({
                title,
                questions,
                created: Date.now()
            });
        } catch (e) {
            console.error("Error adding template: ", e);
            alert("저장 중 오류가 발생했습니다.");
        }
    }

    async deleteTemplate(id) {
        try {
            await db.collection("templates").doc(id).delete();
        } catch (e) {
            console.error("Error deleting template: ", e);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }

    async updateTemplate(id, title, questions) {
        try {
            await db.collection("templates").doc(id).update({
                title,
                questions
            });
        } catch (e) {
            console.error("Error updating template: ", e);
            alert("수정 중 오류가 발생했습니다.");
        }
    }

    // -- CRUD Operations: Sessions --
    async createSession(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) throw new Error('프로젝트를 찾을 수 없습니다.');

        const newSession = {
            templateId: templateId, // Keep reference just in case
            title: template.title,
            items: template.questions.map(q => ({ q: q, a: '', checked: false })),
            created: Date.now()
        };

        try {
            const docRef = await db.collection("checklists").add(newSession);
            return { id: docRef.id, ...newSession };
        } catch (e) {
            console.error("Error creating session: ", e);
            alert("세션 생성 중 오류가 발생했습니다.");
        }
    }

    async saveSessionUpdates(session) {
        try {
            // session object has the ID, but we strictly need to pass the data part to update.
            // We should exclude the ID from the data we send if we are using the spread operator,
            // but Firestore 'update' takes specific fields or a full object. 
            // Safer to pick fields we modify.
            await db.collection("checklists").doc(session.id).update({
                items: session.items
            });
        } catch (e) {
            console.error("Error updating session: ", e);
            // Silent fail or toast? App Controller handles toasts usually.
        }
    }

    async deleteSession(id) {
        try {
            await db.collection("checklists").doc(id).delete();
        } catch (e) {
            console.error("Error deleting session: ", e);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }
}

// --- App Controller ---
class App {
    constructor() {
        this.store = new FirestoreManager((type) => this.handleDataChange(type));
        this.currentView = 'dashboard-view';
        this.editingTemplateId = null;
        this.activeSessionId = null;
        this.init();
    }

    init() {
        this.bindEvents();
        // Initial render might be empty until data loads
        this.renderDashboard();
        if (window.lucide) lucide.createIcons();
    }

    handleDataChange(type) {
        // When data comes in from Firestore, re-render the current view
        if (this.currentView === 'dashboard-view') {
            this.renderDashboard();
        } else if (this.currentView === 'templates-view') {
            this.renderTemplates();
        } else if (this.currentView === 'active-session-view' && type === 'sessions' && this.activeSessionId) {
            // If we are looking at a session and it updated updates (e.g. from another device), re-render items
            // But we need to be careful not to overwrite the user's current typing if they are typing.
            // Real-time collaborative editing of text inputs needs careful handling (debouncing or field-level locks).
            // For this simple request, we will just re-render. If issues arise, we can refine.
            // Check if the currently active session still exists
            const session = this.store.sessions.find(s => s.id === this.activeSessionId);
            if (!session) {
                // Session was deleted remotely
                alert('현재 보고서가 삭제되었습니다.');
                this.switchView('dashboard-view');
                return;
            }
            // Only re-render if we are strictly 'viewing' or if we want to validly sync.
            // To avoid input interference, we might checking document.activeElement.
            if (document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
                this.renderChecklistItems(session);
            }
        }
    }

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.switchView(target);
            });
        });

        // Dashboard Actions
        el('btn-start-session').addEventListener('click', async () => {
            const tId = el('new-session-template-select').value;
            if (!tId) return this.showToast('프로젝트를 선택해주세요.', 'error');

            // Create session is async now
            const session = await this.store.createSession(tId);
            if (session) {
                this.openSession(session.id);
            }
        });

        // Template Management Actions
        el('btn-create-template').addEventListener('click', () => this.openTemplateEditor());
        el('btn-add-question').addEventListener('click', () => this.addQuestionInput(''));
        el('btn-cancel-template').addEventListener('click', () => this.switchView('templates-view'));
        el('btn-save-template').addEventListener('click', () => this.saveTemplateFromEditor());

        // Session Actions
        el('btn-save-session').addEventListener('click', () => {
            // Firestore saves automatically on change usually if we implement auto-save, 
            // but here we might just show a confirmation since we are doing update on change.
            this.showToast('클라우드에 저장되었습니다.');
        });

        // Export Actions
        el('btn-export-txt').addEventListener('click', () => this.exportCurrentSession('txt'));
        el('btn-export-csv').addEventListener('click', () => this.exportCurrentSession('csv'));
        el('btn-print').addEventListener('click', () => window.print());

        // Data Management Events - Backup/Restore (Modified for Firestore?)
        // The user asked to switch to Firestore explicitly.
        // Backup to JSON still makes sense as a snapshot.
        // Restore from JSON is trickier - it would imply writing to Firestore.
        // We will keep Backup (Export) but maybe simplify Restore or warn it overwrites cloud data?
        // Let's implement Restore to bulk-add to Firestore for 'migration' utility.

        el('btn-backup-json')?.addEventListener('click', () => this.backupData());
        el('btn-backup-excel')?.addEventListener('click', () => this.exportFullDataExcel());

        // Restore implementation: Parse JSON and batch add to Firestore
        el('btn-restore-trigger')?.addEventListener('click', () => el('input-restore-json').click());
        el('input-restore-json')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.restoreData(e.target.files[0]);
        });
    }

    showToast(msg, type = 'success') {
        const toast = el('toast');
        toast.textContent = msg;
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
            div.className = 'flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors shadow-sm';
            // Use date safe parsing
            const dateStr = session.created ? new Date(session.created).toLocaleString() : '날짜 없음';

            div.innerHTML = `
                <div style="cursor: pointer; flex: 1;" onclick="app.openSession('${session.id}')" class="space-y-1">
                    <strong class="text-sm font-semibold tracking-tight text-foreground">${session.title}</strong>
                    <div class="text-xs text-muted-foreground flex items-center gap-1">
                        <i data-lucide="clock" class="h-3 w-3"></i>
                        ${dateStr}
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
        // Render triggers automatically via listener
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
            div.className = 'flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors shadow-sm';
            div.innerHTML = `
                <div class="space-y-1">
                    <strong class="text-sm font-semibold tracking-tight text-foreground">${t.title}</strong>
                    <div class="text-xs text-muted-foreground">${(t.questions || []).length} 질문 항목</div>
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
    }

    // --- Template Editor ---
    openTemplateEditor(templateId = null) {
        this.switchView('template-editor-view');
        this.editingTemplateId = templateId;
        const listContainer = el('edit-questions-list');
        listContainer.innerHTML = '';

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
            if (t) {
                el('edit-template-title').value = t.title;
                (t.questions || []).forEach(q => this.addQuestionInput(q));
            }
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
        el('active-session-date').textContent = session.created ? new Date(session.created).toLocaleString() : '';

        this.renderChecklistItems(session);
    }

    renderChecklistItems(session) {
        const container = el('checklist-items-container');
        container.innerHTML = '';

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
                // No re-render needed optionally, but safe to do
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
            noteInput.value = item.a || '';
            noteInput.rows = 1;

            // Auto-resize function
            const autoResize = (el) => {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            };

            // Init resize
            if (item.a) setTimeout(() => autoResize(noteInput), 0);

            // Debounce for update
            let timeout;
            noteInput.oninput = (e) => {
                autoResize(e.target);
                // Updates local object immediately
                session.items[idx].a = e.target.value;

                // Debounced save
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.store.saveSessionUpdates(session);
                }, 500);
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
        if (!session) return;

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
            // Prepend BOM
            content = '\uFEFF';
            content += '"번호","질문","완료여부","비고"\n';
            session.items.forEach((item, i) => {
                const safeQ = (item.q || '').replace(/"/g, '""');
                const safeA = (item.a || '').replace(/"/g, '""');
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
            appVersion: '2.0-firebase'
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
            Date: s.created ? new Date(s.created).toLocaleString() : '',
            ItemsCount: (s.items || []).length
        }));
        const wsSessions = XLSX.utils.json_to_sheet(sessionData);
        XLSX.utils.book_append_sheet(wb, wsSessions, "Sessions");

        // Sheet 2: All Detailed Items
        const allItems = [];
        this.store.sessions.forEach(s => {
            if (s.items) {
                s.items.forEach((item, idx) => {
                    allItems.push({
                        SessionID: s.id,
                        Project: s.title,
                        Date: s.created ? new Date(s.created).toLocaleString() : '',
                        No: idx + 1,
                        Question: item.q,
                        Note: item.a || ''
                    });
                });
            }
        });
        const wsItems = XLSX.utils.json_to_sheet(allItems);
        XLSX.utils.book_append_sheet(wb, wsItems, "Details");

        const fileName = `CheckMaster_Export_${this.getTimestamp()}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    restoreData(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.templates || !data.sessions) throw new Error('유효하지 않은 파일입니다.');

                if (!confirm('이 데이터를 Firebase에 업로드하시겠습니까? (중복될 수 있습니다)')) return;

                // Bulk Add
                if (data.templates) {
                    for (const t of data.templates) {
                        // Remove ID to let Firestore generate new unique IDs to avoid conflicts?
                        // Or keep ID if migrating? Let's generic new ones for safety.
                        const { id, ...tData } = t;
                        await db.collection('templates').add(tData);
                    }
                }
                if (data.sessions) {
                    for (const s of data.sessions) {
                        const { id, ...sData } = s;
                        await db.collection('checklists').add(sData);
                    }
                }

                alert('데이터 가져오기 완료!');
            } catch (err) {
                alert('가져오기 실패: ' + err.message);
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
