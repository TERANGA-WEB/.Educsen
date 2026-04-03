
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <link rel="icon" href="/images/icon-192x192.png" type="image/png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Educsen IA · Assistant pédagogique</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-body:#0f172a; --bg-chat:#0f172a; --bg-header:#0f172a; --bg-input:#1e293b;
            --bg-user-message:#1e293b; --bg-assistant-message:#2d3748;
            --text-primary:#f1f5f9; --text-secondary:#cbd5e1; --text-muted:#94a3b8;
            --border-subtle:#334155; --accent:#3b82f6; --accent-hover:#2563eb;
            --shadow-md:0 4px 20px rgba(0,0,0,0.5); --shadow-sm:0 2px 8px rgba(0,0,0,0.3);
            --transition:background-color 0.3s ease,border-color 0.2s,box-shadow 0.2s;
        }
        body.light-theme {
            --bg-body:#ffffff; --bg-chat:#f9f9f9; --bg-header:#ffffff; --bg-input:#ffffff;
            --bg-user-message:#e5efff; --bg-assistant-message:#f0f0f0;
            --text-primary:#1e293b; --text-secondary:#334155; --text-muted:#64748b;
            --border-subtle:#e2e8f0; --shadow-md:0 4px 20px rgba(0,0,0,0.08); --shadow-sm:0 2px 8px rgba(0,0,0,0.05);
        }
        body { font-family:'Inter',sans-serif; background-color:var(--bg-body); color:var(--text-primary); height:100vh; display:flex; transition:var(--transition); overflow:hidden; }

        .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.52); z-index:999; opacity:0; transition:opacity 0.3s ease; pointer-events:none; }
        .sidebar-overlay.active { opacity:1; pointer-events:auto; }

        .sidebar { width:280px; background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%); color:white; display:flex; flex-direction:column; transition:width 0.3s ease; box-shadow:4px 0 20px rgba(0,0,0,0.15); height:100vh; position:fixed; left:0; top:0; overflow-y:auto; z-index:1000; }
        .sidebar.collapsed { width:80px; }
        .sidebar-header { padding:20px 16px; border-bottom:1px solid #334155; }
        .logo-header { display:flex; align-items:center; justify-content:space-between; width:100%; }
        .logo-area { display:flex; align-items:center; gap:12px; overflow:hidden; }
        .sidebar .logo-icon { width:42px; height:42px; background:linear-gradient(135deg,#3b82f6,#8b5cf6); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:600; color:white; flex-shrink:0; }
        .sidebar .logo-text { font-size:1.3rem; font-weight:600; white-space:nowrap; overflow:hidden; transition:opacity 0.2s; color:white; }
        .sidebar.collapsed .logo-text { opacity:0; width:0; }
        .sidebar .logo-text span { color:#3b82f6; }
        .toggle-btn { background:rgba(255,255,255,0.1); border:1px solid #4b5563; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; color:#e2e8f0; flex-shrink:0; }
        .toggle-btn:hover { background:rgba(255,255,255,0.2); border-color:#3b82f6; color:white; }
        .nav-menu { flex:1; padding:20px 0; display:flex; flex-direction:column; gap:4px; }
        .nav-item { display:flex; align-items:center; gap:16px; padding:14px 24px; margin:0 12px; border-radius:12px; color:#cbd5e1; text-decoration:none; transition:all 0.2s; white-space:nowrap; }
        .nav-item .nav-icon { font-size:1.5rem; width:24px; text-align:center; }
        .nav-item span:last-child { transition:opacity 0.2s; }
        .sidebar.collapsed .nav-item span:last-child { opacity:0; width:0; display:none; }
        .sidebar.collapsed .nav-item { padding:14px 0; margin:0 8px; justify-content:center; gap:0; }
        .sidebar.collapsed .nav-item .nav-icon { width:24px; text-align:center; }
        .nav-item.active { background:#3b82f6; color:white; box-shadow:0 8px 16px -4px rgba(59,130,246,0.3); }
        .nav-item:hover:not(.active) { background:#334155; color:white; }
        .sidebar-footer { padding:20px; border-top:1px solid #334155; }
        .user-info { display:flex; align-items:center; gap:12px; white-space:nowrap; margin-bottom:12px; }
        .user-avatar { width:42px; height:42px; background:#3b82f6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:1.2rem; flex-shrink:0; }
        .user-details { overflow:hidden; }
        .user-name { font-weight:500; font-size:0.95rem; }
        .user-role { font-size:0.8rem; color:#94a3b8; text-transform:capitalize; }
        .sidebar.collapsed .user-details { opacity:0; width:0; }
        .logout-btn { width:100%; padding:10px; background-color:rgba(255,255,255,0.1); color:#94a3b8; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; font-size:14px; transition:all 0.2s; white-space:nowrap; text-decoration:none; }
        .logout-btn:hover { background-color:rgba(255,255,255,0.2); color:white; }

        .mobile-topbar { display:none; position:sticky; top:0; z-index:998; background:#1e293b; border-bottom:1px solid #334155; padding:0 16px; height:60px; align-items:center; justify-content:space-between; box-shadow:0 2px 8px rgba(0,0,0,.2); }
        .topbar-logo { display:flex; align-items:center; gap:10px; }
        .topbar-logo .logo-icon { width:34px; height:34px; background:linear-gradient(135deg,#3b82f6,#8b5cf6); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.05rem; font-weight:700; color:#fff; }
        .topbar-logo-text { font-size:1.1rem; font-weight:700; color:#f1f5f9; }
        .topbar-logo-text em { color:#3b82f6; font-style:normal; }
        .topbar-menu-btn { background:none; border:none; width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#cbd5e1; border-radius:8px; transition:background .2s; }
        .topbar-menu-btn:hover { background:#334155; }

        .page-wrapper { flex:1; margin-left:280px; transition:margin-left 0.3s ease; min-width:0; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
        .sidebar.collapsed ~ .page-wrapper { margin-left:80px; }

        .app-header { padding:20px 32px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; background-color:var(--bg-header); transition:var(--transition); flex-shrink:0; }
        .header-left { display:flex; align-items:center; gap:12px; }
        .app-header h1 { font-weight:500; font-size:1.6rem; letter-spacing:-0.02em; }
        .theme-toggle { background:transparent; border:1px solid var(--border-subtle); color:var(--text-secondary); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:var(--transition); font-size:1.2rem; }
        .theme-toggle:hover { background-color:var(--bg-input); color:var(--accent); border-color:var(--accent); }

        .chat-container { flex:1; overflow-y:auto; padding:24px 0; display:flex; flex-direction:column; align-items:center; background-color:var(--bg-chat); transition:var(--transition); }
        .messages-wrapper { width:100%; max-width:800px; display:flex; flex-direction:column; gap:20px; padding:0 24px; }
        .message-row { display:flex; width:100%; animation:fadeIn 0.3s ease; }
        .message-row.user { justify-content:flex-end; }
        .message-row.assistant { justify-content:flex-start; }
        .message-content { max-width:85%; display:flex; flex-direction:column; }
        .message-bubble { padding:16px 20px; font-size:1rem; line-height:1.6; border-radius:18px; color:var(--text-primary); white-space:pre-wrap; word-break:break-word; box-shadow:var(--shadow-sm); transition:var(--transition); }
        .message-bubble.html-content { white-space:normal; }
        .message-row.user .message-bubble { background-color:var(--bg-user-message); border-bottom-right-radius:4px; }
        .message-row.assistant .message-bubble { background-color:var(--bg-assistant-message); border-bottom-left-radius:4px; }
        .message-time { font-size:0.7rem; color:var(--text-muted); margin-top:4px; padding-left:4px; }
        .message-row.user .message-time { text-align:right; }

        .typing-indicator { display:flex; gap:6px; padding:16px 0; }
        .typing-indicator span { width:8px; height:8px; background-color:var(--text-muted); border-radius:50%; display:inline-block; animation:typing 1.4s infinite ease-in-out both; }
        .typing-indicator span:nth-child(1) { animation-delay:0s; }
        .typing-indicator span:nth-child(2) { animation-delay:0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay:0.4s; }
        @keyframes typing { 0%,80%,100% { transform:scale(0.6); opacity:0.6; } 40% { transform:scale(1); opacity:1; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

        .input-area { padding:24px 32px 32px; border-top:1px solid var(--border-subtle); background-color:var(--bg-header); transition:var(--transition); flex-shrink:0; }
        .input-container { max-width:800px; margin:0 auto; display:flex; align-items:flex-end; gap:12px; background-color:var(--bg-input); border:1px solid var(--border-subtle); border-radius:999px; padding:8px 8px 8px 20px; box-shadow:var(--shadow-md); transition:var(--transition); }
        .input-container:focus-within { box-shadow:0 4px 28px rgba(59,130,246,0.2); border-color:var(--accent); }
        textarea { flex:1; background:transparent; border:none; resize:none; padding:12px 0; max-height:150px; font-family:'Inter',sans-serif; font-size:1rem; color:var(--text-primary); outline:none; line-height:1.5; }
        textarea::placeholder { color:var(--text-muted); font-weight:400; }
        .send-btn { background:var(--accent); border:none; color:white; width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.3rem; cursor:pointer; transition:background-color 0.2s,transform 0.1s,box-shadow 0.2s; box-shadow:0 2px 8px rgba(59,130,246,0.4); }
        .send-btn:hover { background-color:var(--accent-hover); }
        .send-btn:active { transform:scale(0.96); }
        .send-btn:disabled { opacity:0.5; cursor:not-allowed; box-shadow:none; }

        /* MODALS */
        .modal-overlay { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.65); justify-content:center; align-items:center; }
        .modal-box { background:#1e293b; border:1px solid #334155; border-radius:18px; position:relative; animation:fadeIn 0.3s ease; color:#f1f5f9; }
        body.light-theme .modal-box { background:#ffffff; border-color:#e2e8f0; color:#1e293b; }
        .modal-close { position:absolute; top:14px; right:18px; font-size:20px; cursor:pointer; color:#64748b; background:none; border:none; line-height:1; }
        .modal-close:hover { color:#ef4444; }

        .classe-modal-box { padding:28px 32px; width:460px; }
        .classe-modal-title { font-size:16px; font-weight:700; margin-bottom:6px; }
        .classe-modal-sub { font-size:12px; color:#94a3b8; margin-bottom:20px; }
        .classe-select { width:100%; padding:12px 14px; background:#0f172a; border:1px solid #334155; border-radius:10px; color:#f1f5f9; font-size:14px; font-family:'Inter',sans-serif; margin-bottom:16px; cursor:pointer; outline:none; }
        body.light-theme .classe-select { background:#f8fafc; border-color:#e2e8f0; color:#1e293b; }
        .classe-select:focus { border-color:#3b82f6; }
        .classe-analyse-btn { width:100%; padding:13px; background:linear-gradient(135deg,#3b82f6,#2563eb); color:white; border:none; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; font-family:'Inter',sans-serif; transition:all 0.2s; }
        .classe-analyse-btn:hover { background:linear-gradient(135deg,#2563eb,#1d4ed8); }
        .classe-analyse-btn:disabled { opacity:0.5; cursor:not-allowed; }

        .pdf-modal-box { padding:30px; width:420px; text-align:center; }
        .pdf-download-btn { margin-top:20px; padding:12px 24px; background:linear-gradient(135deg,#3b82f6,#2563eb); color:white; border:none; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; font-family:'Inter',sans-serif; }
        .pdf-download-btn:hover { background:linear-gradient(135deg,#2563eb,#1d4ed8); }

        @media (max-width:768px) {
            .sidebar { transform:translateX(-100%); width:280px !important; transition:transform 0.3s ease; position:fixed; }
            .sidebar.mobile-open { transform:translateX(0); }
            .sidebar.collapsed { width:280px !important; transform:translateX(-100%); }
            .sidebar.collapsed.mobile-open { transform:translateX(0); }
            .sidebar-overlay { display:block; }
            .mobile-topbar { display:flex; }
            .page-wrapper { margin-left:0 !important; width:100%; height:100dvh; }
            .app-header { padding:16px 20px; }
            .input-area { padding:16px 20px 24px; padding-bottom:max(24px,env(safe-area-inset-bottom)); }
            .input-container { border-radius:32px; padding:6px 6px 6px 18px; }
            textarea { font-size:16px; padding:10px 0; }
            .send-btn { width:44px; height:44px; font-size:1.2rem; }
            .chat-container { padding:16px 0; }
            .messages-wrapper { padding:0 16px; gap:16px; }
            .classe-modal-box { width:90%; padding:22px 20px; }
            .pdf-modal-box { width:90%; }
        }
    </style>
</head>
<body>

<div class="sidebar-overlay" id="sidebarOverlay"></div>

<aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <div class="logo-header">
            <div class="logo-area">
                <div class="logo-icon">E</div>
                <span class="logo-text">Educ<span>sen</span></span>
            </div>
            <button class="toggle-btn" id="toggleSidebar">
                <span class="material-icons" id="toggleIcon">chevron_left</span>
            </button>
        </div>
    </div>
    <nav class="nav-menu">
        <a href="/userdashboard.html" class="nav-item"><span class="nav-icon material-icons">dashboard</span><span>Dashboard</span></a>
        <a href="/user-admin/assistant.html" class="nav-item active"><span class="nav-icon material-icons">smart_toy</span><span>Assistant</span></a>
        <a href="/user-admin/rapport.html" class="nav-item"><span class="nav-icon material-icons">assessment</span><span>Rapport</span></a>
        <a href="/user-admin/classes.html" class="nav-item"><span class="nav-icon material-icons">school</span><span>Classes</span></a>
        <a href="/user-admin/professeurs.html" class="nav-item"><span class="nav-icon material-icons">person</span><span>Professeurs</span></a>
        <a href="/user-admin/notes.html" class="nav-item"><span class="nav-icon material-icons">assignment</span><span>Notes</span></a>
        <a href="/user-admin/bulletin.html" class="nav-item"><span class="nav-icon material-icons">receipt_long</span><span>Bulletins</span></a>
        <a href="/user-admin/parametres.html" class="nav-item"><span class="nav-icon material-icons">settings</span><span>Paramètres</span></a>
    </nav>
    <div class="sidebar-footer">
        <div class="user-info">
            <div class="user-avatar" id="userAvatar">AD</div>
            <div class="user-details">
                <div class="user-name" id="userNameDisplay">Administrateur</div>
                <div class="user-role" id="userRole">admin</div>
            </div>
        </div>
        <a href="/index.html" class="logout-btn"><span class="material-icons">logout</span><span>Déconnexion</span></a>
    </div>
</aside>

<div class="page-wrapper" id="pageWrapper">
    <header class="mobile-topbar" id="mobileTopbar">
        <div class="topbar-logo">
            <div class="logo-icon">E</div>
            <span class="topbar-logo-text">Educ<em>sen</em></span>
        </div>
        <button class="topbar-menu-btn" id="mobileMenuBtn" aria-label="Menu">
            <span class="material-icons">menu</span>
        </button>
    </header>
    <header class="app-header">
        <div class="header-left">
            <h1><strong>Educsen </strong><span style="color:var(--accent);">IA</span></h1>
        </div>
        <button class="theme-toggle" id="themeToggle" aria-label="Changer le thème">
            <i class="fas fa-moon"></i>
        </button>
    </header>
    <main class="chat-container" id="chatContainer">
        <div class="messages-wrapper" id="messagesWrapper"></div>
    </main>
    <div class="input-area">
        <div class="input-container">
            <textarea id="userInput" placeholder="Posez votre question à Educsen IA…" rows="1"></textarea>
            <button class="send-btn" id="sendBtn" disabled>
                <i class="fas fa-arrow-up"></i>
            </button>
        </div>
    </div>
</div>

<!-- MODAL SÉLECTEUR DE CLASSE -->
<div id="classeModal" class="modal-overlay">
    <div class="modal-box classe-modal-box">
        <button class="modal-close" id="closeClasseModal">&times;</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <span style="font-size:26px;">📊</span>
            <div>
                <div class="classe-modal-title">Analyse de performance</div>
                <div class="classe-modal-sub">Sélectionnez la classe à analyser</div>
            </div>
        </div>
        <select id="classeSelect" class="classe-select">
            <option value="">— Choisir une classe —</option>
        </select>
        <button id="lancerAnalyseBtn" class="classe-analyse-btn" disabled>✨ Lancer l'analyse IA</button>
    </div>
</div>

<!-- MODAL PDF -->
<div id="pdfModal" class="modal-overlay">
    <div class="modal-box pdf-modal-box">
        <button class="modal-close" id="closePdfModal">&times;</button>
        <div style="font-size:38px;margin-bottom:12px;">📄</div>
        <h2 style="font-size:16px;font-weight:700;margin-bottom:8px;">Télécharger l'analyse</h2>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:4px;">Votre analyse est prête. Le PDF contient 2 pages :</p>
        <p style="color:#64748b;font-size:12px;">📋 Analyse performance &nbsp;·&nbsp; 🚨 Élèves à accompagner</p>
        <button id="downloadPdfBtn" class="pdf-download-btn">⬇️ Télécharger le PDF</button>
    </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

<script type="module">
    import { initializeApp }               from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
    import { getFirestore }                from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

    import assistantJs from './assistant.js';
    import {
        isAnalyseRequest, handleAnalyse, fetchClassesForUser, exportAnalysePdf,
        isEvolutionRequest, parseEvolutionRequest, handleEvolution,
    } from './fonctionnalite.js';
    import { checkSubscription } from './subscription.js';
    await checkSubscription();

    const firebaseConfig = {
        apiKey:"AIzaSyD7B-0O9mOdbIDQV-g6hsZx07G2ZvzKoxo",
        authDomain:"real-educsen.firebaseapp.com",
        projectId:"real-educsen",
        storageBucket:"real-educsen.firebasestorage.app",
        messagingSenderId:"80660233362",
        appId:"1:80660233362:web:5edf5060254170056eba4b"
    };
    const app  = initializeApp(firebaseConfig);
    const db   = getFirestore(app);
    const auth = getAuth(app);

    const messagesWrapper  = document.getElementById('messagesWrapper');
    const userInput        = document.getElementById('userInput');
    const sendBtn          = document.getElementById('sendBtn');
    const chatContainer    = document.getElementById('chatContainer');
    const classeModal      = document.getElementById('classeModal');
    const classeSelect     = document.getElementById('classeSelect');
    const lancerAnalyseBtn = document.getElementById('lancerAnalyseBtn');
    const pdfModal         = document.getElementById('pdfModal');

    let isTyping = false, userId = null;

    onAuthStateChanged(auth, user => {
        if (!user) { window.location.replace('/index.html'); return; }
        userId = user.uid;
        const name = user.displayName || user.email || 'Administrateur';
        document.getElementById('userNameDisplay').textContent = name;
        document.getElementById('userAvatar').textContent      = name[0].toUpperCase();
        document.getElementById('userRole').textContent        = 'admin';
    });

    function addMessage(text, sender, isHtml = false, isTemp = false) {
        if (!isTemp) removeTemp();
        const row = document.createElement('div');
        row.classList.add('message-row', sender);
        if (isTemp) row.setAttribute('data-temp', 'true');
        const content = document.createElement('div');
        content.classList.add('message-content');
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble');
        if (isHtml) { bubble.classList.add('html-content'); bubble.innerHTML = text; }
        else          { bubble.innerHTML = text; }
        const time = document.createElement('span');
        time.classList.add('message-time');
        const now = new Date();
        time.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
        content.appendChild(bubble);
        if (!isTemp) content.appendChild(time);
        row.appendChild(content);
        messagesWrapper.appendChild(row);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return bubble;
    }
    function removeTemp()  { document.querySelectorAll('[data-temp="true"]').forEach(el => el.remove()); }
    function showTyping()  { const el = document.createElement('div'); el.classList.add('message-row','assistant'); el.id='typingIndicator'; el.innerHTML='<div class="typing-indicator"><span></span><span></span><span></span></div>'; messagesWrapper.appendChild(el); chatContainer.scrollTop = chatContainer.scrollHeight; }
    function removeTyping(){ const el = document.getElementById('typingIndicator'); if (el) el.remove(); }

    async function openClasseModal() {
        classeModal.style.display = 'flex';
        classeSelect.innerHTML    = '<option value="">⏳ Chargement…</option>';
        lancerAnalyseBtn.disabled = true;
        try {
            const classes = await fetchClassesForUser(db, userId);
            classeSelect.innerHTML = '<option value="">— Choisir une classe —</option>';
            if (classes.length === 0) {
                classeSelect.innerHTML = '<option value="">Aucune classe disponible</option>';
            } else {
                classes.forEach(cl => {
                    const opt = document.createElement('option');
                    opt.value = cl.id; opt.textContent = cl.nom;
                    classeSelect.appendChild(opt);
                });
            }
        } catch { classeSelect.innerHTML = '<option value="">Erreur de chargement</option>'; }
    }

    classeSelect.addEventListener('change', () => { lancerAnalyseBtn.disabled = !classeSelect.value; });
    document.getElementById('closeClasseModal').addEventListener('click', () => { classeModal.style.display = 'none'; });
    classeModal.addEventListener('click', e => { if (e.target === classeModal) classeModal.style.display = 'none'; });

    lancerAnalyseBtn.addEventListener('click', async () => {
        const classeId  = classeSelect.value;
        const classeNom = classeSelect.options[classeSelect.selectedIndex]?.text || 'la classe';
        if (!classeId) return;
        classeModal.style.display = 'none';
        addMessage(`📊 Analyse demandée pour la classe <strong>${classeNom}</strong>`, 'user', true);
        isTyping = true; sendBtn.disabled = true;
        try {
            const statusFn = (txt, sndr) => { removeTyping(); removeTemp(); addMessage(txt, sndr, true, true); };
            showTyping();
            const html = await handleAnalyse(db, userId, classeId, statusFn);
            removeTyping(); removeTemp();
            addMessage(html, 'assistant', true);
            setTimeout(() => { pdfModal.style.display = 'flex'; }, 500);
        } catch (err) {
            console.error(err); removeTyping(); removeTemp();
            addMessage('❌ Une erreur est survenue lors de l\'analyse. Veuillez réessayer.', 'assistant');
        } finally {
            isTyping = false; sendBtn.disabled = userInput.value.trim() === '';
        }
    });

    document.getElementById('downloadPdfBtn').addEventListener('click', () => { exportAnalysePdf('analyse_performance_educsen.pdf'); pdfModal.style.display = 'none'; });
    document.getElementById('closePdfModal').addEventListener('click', () => { pdfModal.style.display = 'none'; });
    pdfModal.addEventListener('click', e => { if (e.target === pdfModal) pdfModal.style.display = 'none'; });

    async function handleSend() {
        const message = userInput.value.trim();
        if (!message || isTyping) return;
        if (!auth.currentUser) { window.location.replace('/index.html'); return; }
        if (!userId) userId = auth.currentUser.uid;
        addMessage(message, 'user');
        userInput.value = ''; userInput.style.height = 'auto';
        sendBtn.disabled = true; isTyping = true;
        try {
            if (isAnalyseRequest(message)) {
                removeTemp();
                await openClasseModal();
                isTyping = false; sendBtn.disabled = userInput.value.trim() === '';
                return;
            }
            if (isEvolutionRequest(message)) {
                showTyping();
                const parsed = parseEvolutionRequest(message);
                const html   = await handleEvolution(db, userId, parsed.type, parsed.name);
                removeTyping();
                addMessage(html, 'assistant', true);
            } else {
                showTyping();
                const response = await assistantJs(message, userId, db);
                removeTyping();
                addMessage(response, 'assistant');
            }
        } catch (err) {
            console.error(err); removeTyping(); removeTemp();
            addMessage('Une erreur technique est survenue. Veuillez réessayer.', 'assistant');
        } finally {
            isTyping = false; sendBtn.disabled = userInput.value.trim() === '';
        }
    }

    userInput.addEventListener('input', function () {
        this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
        sendBtn.disabled = this.value.trim() === '' || isTyping;
    });
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });

    addMessage(
        'Bonjour, je suis votre assistant pédagogique <strong>Educsen IA</strong>.<br><br>' +
        'Tapez <strong>aide</strong> pour découvrir toutes les commandes disponibles.<br>' +
        'Tapez <strong>analyse</strong> pour générer une analyse de performance par classe.',
        'assistant', true
    );

    const themeToggle = document.getElementById('themeToggle');
    const themeIcon   = themeToggle.querySelector('i');
    if (localStorage.getItem('theme') === 'light') { document.body.classList.add('light-theme'); themeIcon.className = 'fas fa-sun'; }
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeIcon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });

    const sidebar = document.getElementById('sidebar'), toggleBtn = document.getElementById('toggleSidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn'), toggleIcon = document.getElementById('toggleIcon');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const openMobile  = () => { sidebar.classList.add('mobile-open'); sidebarOverlay.classList.add('active'); };
    const closeMobile = () => { sidebar.classList.remove('mobile-open'); sidebarOverlay.classList.remove('active'); };
    toggleBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) { sidebar.classList.contains('mobile-open') ? closeMobile() : openMobile(); }
        else { sidebar.classList.toggle('collapsed'); toggleIcon.textContent = sidebar.classList.contains('collapsed') ? 'chevron_right' : 'chevron_left'; }
    });
    mobileMenuBtn.addEventListener('click', () => sidebar.classList.contains('mobile-open') ? closeMobile() : openMobile());
    sidebarOverlay.addEventListener('click', closeMobile);
    document.addEventListener('click', e => { if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) closeMobile(); });
    window.addEventListener('resize', () => { if (window.innerWidth <= 768) { sidebar.classList.remove('collapsed'); toggleIcon.textContent = 'chevron_left'; closeMobile(); } else closeMobile(); });
</script>
</body>
</html>
