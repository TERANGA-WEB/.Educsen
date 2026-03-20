// fonctionnalite.js — Module de fonctionnalités avancées pour Educsen
// IA : Groq (Llama 3.3) — 100% gratuit, disponible au Sénégal

import {
    collection, query, where, getDocs,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// ─────────────────────────────────────────────────────────────
// CONFIG GROQ
// ─────────────────────────────────────────────────────────────
const GROQ_API_KEY  = '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';
const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// ─────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;
const _cache = new Map();
function cacheGet(key) {
    const e = _cache.get(key);
    if (!e || Date.now() - e.time > CACHE_TTL) return null;
    return e.data;
}
function cacheSet(key, data) { _cache.set(key, { data, time: Date.now() }); }
function norm(str) { return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

// ─────────────────────────────────────────────────────────────
// STOCKAGE STRUCTURÉ — données du dernier rapport (pour le PDF)
// ─────────────────────────────────────────────────────────────
let _lastRecoData = null;
export function getLastRecoData() { return _lastRecoData; }

function getAnneeScol() {
    const now = new Date();
    const y   = now.getFullYear();
    return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION — recommandations
// ─────────────────────────────────────────────────────────────
const RECO_KEYWORDS = [
    'recommandation', 'recommandations', 'recommande', 'recommendation',
    'conseil', 'conseils', 'analyse prof', 'analyse professeur',
    'bilan prof', 'bilan professeur', 'performance prof',
    'que faire pour', 'améliorer les profs', 'ameliorer les profs',
    'rapport prof', 'rapport professeur', 'eleves a aider',
    'élèves à aider', 'élèves à féliciter', 'feliciter',
    'donne moi des recommandations', 'génère des recommandations',
    'genere des recommandations',
];
export function isRecommandationRequest(message) {
    const n = norm(message);
    return RECO_KEYWORDS.some(kw => n.includes(norm(kw)));
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION — évolution
// ─────────────────────────────────────────────────────────────
const EVOLUTION_PATTERNS = [
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:de\s+(?:la\s+)?)?classe\s+(.*)/i,           type: 'classe' },
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:classe)\s+(.*)/i,                            type: 'classe' },
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:de\s+(?:l[''`]?)?)?(?:eleve|élève)\s+(.*)/i, type: 'eleve'  },
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:eleve|élève)\s+(.*)/i,                       type: 'eleve'  },
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:du\s+)?(?:prof(?:esseur)?)\s+(.*)/i,         type: 'professeur' },
    { regex: /(?:evolution|évolution|progression|suivi|courbe)\s+(?:prof(?:esseur)?)\s+(.*)/i,                   type: 'professeur' },
];
export function isEvolutionRequest(message) {
    return EVOLUTION_PATTERNS.some(p => p.regex.test(message));
}
export function parseEvolutionRequest(message) {
    for (const p of EVOLUTION_PATTERNS) {
        const m = message.match(p.regex);
        if (m) return { type: p.type, name: m[1].trim() };
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// FETCH — données Firestore
// ─────────────────────────────────────────────────────────────
async function fetchData(db, userId) {
    const cacheKey = `reco_data_${userId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const [classesSnap, evalsSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'),     where('createdBy', '==', userId))),
        getDocs(query(collection(db, 'evaluations'), where('createdBy', '==', userId)))
    ]);

    const classesMap     = new Map();
    const professeursMap = new Map();
    const elevesPromises = [];

    classesSnap.forEach(docSnap => {
        const d  = docSnap.data();
        const id = docSnap.id;
        const nom = d.nomClasse || 'Inconnue';
        classesMap.set(id, { nom, matieres: d.matieres || [] });
        (d.matieres || []).forEach(m => {
            if (m.professeurId) {
                if (!professeursMap.has(m.professeurId))
                    professeursMap.set(m.professeurId, { nom: m.professeurNom || 'Inconnu', matiere: m.nom || 'Inconnue', classes: new Set() });
                professeursMap.get(m.professeurId).classes.add(nom);
            }
        });
        elevesPromises.push(
            getDocs(collection(db, 'classes', id, 'eleves')).then(snap => ({ classeId: id, snap }))
        );
    });

    const [elevesResults, notesResults] = await Promise.all([
        Promise.all(elevesPromises),
        Promise.all(evalsSnap.docs.map(async evalDoc => {
            const d = evalDoc.data();
            const notesSnap = await getDocs(collection(db, 'evaluations', evalDoc.id, 'notes'));
            const notes = [];
            notesSnap.forEach(n => { const nd = n.data(); notes.push({ eleveId: nd.eleveId, note: nd.note }); });
            return { id: evalDoc.id, classeId: d.classeId, matiere: d.matiere || d.matiereNom || d.nomMatiere || 'Inconnue', professeurId: d.professeurId, createdAt: d.createdAt, notes };
        }))
    ]);

    const elevesMap = new Map();
    elevesResults.forEach(({ classeId, snap }) => {
        const classeNom = classesMap.get(classeId)?.nom || 'Inconnue';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            elevesMap.set(docSnap.id, { nom: `${d.prenom || ''} ${d.nom || ''}`.trim() || 'Inconnu', classeId, classeNom });
        });
    });

    const result = { evaluations: notesResults, classesMap, elevesMap, professeursMap };
    cacheSet(cacheKey, result);
    return result;
}

// ─────────────────────────────────────────────────────────────
// CALCUL — stats par professeur
// ─────────────────────────────────────────────────────────────
function buildProfStats(data) {
    const { evaluations, elevesMap, professeursMap } = data;
    const profMap = new Map();

    evaluations.forEach(ev => {
        const { professeurId, matiere, notes } = ev;
        if (!professeurId) return;
        const info = professeursMap.get(professeurId) || { nom: 'Inconnu', matiere, classes: new Set() };
        if (!profMap.has(professeurId)) profMap.set(professeurId, { info, eleves: new Map(), allNotes: [] });
        const entry = profMap.get(professeurId);
        notes.forEach(({ eleveId, note }) => {
            if (!eleveId || note === undefined) return;
            const eleve = elevesMap.get(eleveId);
            if (!eleve) return;
            if (!entry.eleves.has(eleveId)) entry.eleves.set(eleveId, { nom: eleve.nom, classe: eleve.classeNom, notes: [], matiere });
            entry.eleves.get(eleveId).notes.push(note);
            entry.allNotes.push(note);
        });
    });

    const result = [];
    profMap.forEach((entry, profId) => {
        const { info, eleves, allNotes } = entry;
        const profMoy = allNotes.length > 0 ? allNotes.reduce((a, b) => a + b, 0) / allNotes.length : 0;
        const elevesData = [];
        eleves.forEach(ed => {
            const moy = ed.notes.reduce((a, b) => a + b, 0) / ed.notes.length;
            elevesData.push({ nom: ed.nom, classe: ed.classe, matiere: ed.matiere, moyenneEleve: moy });
        });
        const aFeliciter = elevesData.filter(e => e.moyenneEleve > 14).sort((a, b) => b.moyenneEleve - a.moyenneEleve).slice(0, 5);
        const aAider     = elevesData.filter(e => e.moyenneEleve < 10).sort((a, b) => a.moyenneEleve - b.moyenneEleve).slice(0, 5);
        const statut     = profMoy >= 14 ? 'maintenir' : profMoy >= 10 ? 'progresser' : 'ameliorer';
        result.push({ profId, nom: info.nom, matiere: info.matiere, classes: Array.from(info.classes), profMoy, statut, aFeliciter, aAider });
    });

    return result.sort((a, b) => a.profMoy - b.profMoy);
}

// ─────────────────────────────────────────────────────────────
// GROQ — recommandation par prof (existant)
// ─────────────────────────────────────────────────────────────
async function generateRecoForProf(profData) {
    const { nom, matiere, classes, profMoy, statut, aFeliciter, aAider } = profData;
    const feliciterList = aFeliciter.length > 0 ? aFeliciter.map(e => `${e.nom} (${e.moyenneEleve.toFixed(1)}/20, classe ${e.classe})`).join(', ') : 'aucun élève avec une moyenne supérieure à 14';
    const aiderList     = aAider.length > 0     ? aAider.map(e => `${e.nom} (${e.moyenneEleve.toFixed(1)}/20, classe ${e.classe})`).join(', ')     : 'aucun élève en difficulté détecté';
    const statutLabel   = statut === 'ameliorer' ? 'sous performance — moyenne inférieure à 10' : statut === 'progresser' ? 'performance moyenne — entre 10 et 14' : 'bonne performance — supérieure à 14';

    const prompt = `Tu es un conseiller pédagogique pour une école en Afrique francophone.

Données du professeur :
- Nom : ${nom}
- Matière : ${matiere}
- Classes : ${classes.join(', ') || 'non renseignées'}
- Moyenne globale : ${profMoy.toFixed(2)}/20
- Statut : ${statutLabel}
- Élèves à féliciter (moyenne > 14) : ${feliciterList}
- Élèves à accompagner (moyenne < 10) : ${aiderList}

Génère exactement 3 paragraphes séparés uniquement par |||

Paragraphe 1 : Message à l'administrateur — que doit faire l'admin concernant ce professeur, avec des actions concrètes.
Paragraphe 2 : Élèves à féliciter — cite leurs noms et leurs points forts, message valorisant.
Paragraphe 3 : Élèves à aider — cite leurs noms et propose des stratégies pédagogiques concrètes.

Réponds UNIQUEMENT avec les 3 paragraphes séparés par |||. Rien d'autre.`;

    const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
            model: GROQ_MODEL, max_tokens: 900, temperature: 0.65,
            messages: [
                { role: 'system', content: 'Tu es un conseiller pédagogique expert pour les écoles en Afrique francophone. Tu réponds toujours en français, de façon bienveillante, précise et professionnelle. Tu ne génères jamais de markdown, jamais de titres, jamais de numéros. Uniquement des paragraphes séparés par |||.' },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok) { const err = await response.text(); throw new Error(`Groq ${response.status}: ${err}`); }
    const data  = await response.json();
    const text  = data.choices?.[0]?.message?.content?.trim() || '';
    const parts = text.split('|||').map(p => p.trim()).filter(Boolean);
    return { admin: parts[0] || 'Recommandation non disponible.', felicite: parts[1] || 'Aucune donnée.', aider: parts[2] || 'Aucune donnée.' };
}

// ─────────────────────────────────────────────────────────────
// GROQ — analyse générale (NOUVEAU)
// ─────────────────────────────────────────────────────────────
async function generateGlobalAnalysis(profsData, stats) {
    const topProfs  = profsData.filter(p => p.statut === 'maintenir').map(p => `${p.nom} (${p.profMoy.toFixed(1)}/20)`).join(', ') || 'aucun';
    const weakProfs = profsData.filter(p => p.statut === 'ameliorer').map(p => `${p.nom} (${p.profMoy.toFixed(1)}/20)`).join(', ') || 'aucun';

    const prompt = `Tu es un conseiller pédagogique rédigeant un rapport administratif officiel pour un établissement scolaire en Afrique francophone.

Données globales de l'établissement :
- Nombre de professeurs analysés : ${stats.total}
- Moyenne générale de l'établissement : ${stats.moyGlobale.toFixed(2)}/20
- Professeurs performants (moy > 14) : ${stats.nbMaintenir} — ${topProfs}
- Professeurs en développement (10–14) : ${stats.nbProgresser}
- Professeurs en difficulté (moy < 10) : ${stats.nbAmeliorer} — ${weakProfs}

Rédige exactement 3 paragraphes d'analyse générale, sobres et professionnels, à destination du directeur de l'établissement, séparés par |||.
Paragraphe 1 : Bilan objectif de la situation pédagogique globale.
Paragraphe 2 : Identification des forces et des axes d'amélioration.
Paragraphe 3 : Orientation stratégique globale recommandée.
Ton administratif, sans bullet points ni titres. Réponds UNIQUEMENT avec les 3 paragraphes séparés par |||.`;

    const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
            model: GROQ_MODEL, max_tokens: 800, temperature: 0.5,
            messages: [
                { role: 'system', content: 'Conseiller pédagogique expert. Rapports administratifs sobres et professionnels en français. Jamais de markdown.' },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok) throw new Error(`Groq global ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

function fallbackGlobalAnalysis(stats) {
    return [
        `L'analyse pédagogique de l'établissement pour l'année scolaire en cours révèle une moyenne générale de ${stats.moyGlobale.toFixed(2)}/20. Sur les ${stats.total} enseignants évalués, ${stats.nbMaintenir} affichent des résultats satisfaisants supérieurs à 14, ${stats.nbProgresser} se situent dans une dynamique intermédiaire entre 10 et 14, et ${stats.nbAmeliorer} nécessitent un accompagnement pédagogique prioritaire.`,
        `Cette analyse met en lumière un établissement dont le potentiel pédagogique est réel, mais qui requiert une attention particulière sur certains profils d'enseignement. La disparité des résultats entre les différentes matières et classes appelle à une intervention ciblée de l'administration, tant sur le plan de la formation continue que du suivi régulier des pratiques pédagogiques.`,
        `Il est recommandé à la direction de mettre en place un conseil pédagogique mensuel permettant de mutualiser les bonnes pratiques des enseignants performants au bénéfice de ceux en difficulté. Un suivi trimestriel des indicateurs de performance constituera un outil de pilotage essentiel pour mesurer l'impact des actions correctives engagées.`
    ].join('|||');
}

// ─────────────────────────────────────────────────────────────
// GROQ — recommandations prioritaires (NOUVEAU)
// ─────────────────────────────────────────────────────────────
async function generatePriorityReco(profsData, stats) {
    const prompt = `Tu es conseiller pédagogique senior. Données de l'établissement :
- ${stats.nbAmeliorer} enseignant(s) en difficulté, ${stats.nbProgresser} en développement, ${stats.nbMaintenir} performants
- Moyenne générale : ${stats.moyGlobale.toFixed(2)}/20
- Année scolaire : ${getAnneeScol()}

Formule exactement 4 recommandations prioritaires, numérotées, concrètes et actionnables, à destination de l'administration. Chaque recommandation : 2 à 3 phrases maximum. Ton sobre et administratif, sans markdown. Sépare chaque recommandation par |||. Réponds UNIQUEMENT avec les 4 recommandations.`;

    const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
            model: GROQ_MODEL, max_tokens: 700, temperature: 0.5,
            messages: [
                { role: 'system', content: 'Conseiller pédagogique expert. Réponses en français, ton administratif, pas de markdown.' },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok) throw new Error(`Groq priority ${response.status}`);
    const data = await response.json();
    return (data.choices?.[0]?.message?.content?.trim() || '')
        .split('|||').map(s => s.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
}

function fallbackPriorityReco(stats) {
    return [
        `Organiser des séances de formation pédagogique ciblées pour les ${stats.nbAmeliorer} enseignant(s) en difficulté, avec un suivi mensuel des progrès réalisés et des objectifs mesurables définis en concertation avec chaque concerné.`,
        `Mettre en place un système de tutorat interne permettant aux enseignants les plus performants de partager leurs méthodes et approches pédagogiques lors de séances collectives organisées au minimum une fois par trimestre.`,
        `Renforcer le suivi individualisé des élèves en difficulté en impliquant directement les familles dans le processus d'accompagnement, par des réunions régulières et des bilans intermédiaires transmis en cours de trimestre.`,
        `Établir un tableau de bord de suivi des performances pédagogiques mis à jour après chaque séquence d'évaluations, afin de permettre à la direction de prendre des décisions éclairées et d'anticiper les situations à risque avant la fin de l'année scolaire.`
    ];
}

// ─────────────────────────────────────────────────────────────
// FALLBACK par prof (existant)
// ─────────────────────────────────────────────────────────────
function fallbackReco(pd) {
    const { nom, profMoy, statut, aFeliciter, aAider } = pd;
    const adminOptions = {
        ameliorer: [`La moyenne de ${nom} est de ${profMoy.toFixed(2)}/20, en dessous du seuil acceptable. Il est urgent d'organiser un entretien avec ce professeur pour identifier les difficultés rencontrées et mettre en place un plan d'amélioration concret avec des objectifs mensuels mesurables.`, `Avec ${profMoy.toFixed(2)}/20, ${nom} nécessite un accompagnement pédagogique immédiat. L'administration devrait envisager des séances de formation ciblées, un suivi rapproché des évaluations et un soutien méthodologique adapté à sa matière.`],
        progresser: [`La moyenne de ${nom} est de ${profMoy.toFixed(2)}/20, un niveau satisfaisant mais encore perfectible. L'administration peut accompagner cette progression en proposant des ressources pédagogiques supplémentaires.`, `Avec ${profMoy.toFixed(2)}/20, ${nom} est sur une bonne trajectoire. Il serait bénéfique d'encourager la diversification des méthodes pédagogiques.`],
        maintenir:  [`Avec une excellente moyenne de ${profMoy.toFixed(2)}/20, ${nom} démontre un niveau d'enseignement remarquable. L'administration devrait valoriser ces résultats et encourager ce professeur à partager ses bonnes pratiques.`, `La moyenne de ${profMoy.toFixed(2)}/20 de ${nom} reflète un travail pédagogique de très haute qualité. Il convient de maintenir ce niveau en offrant à ce professeur les ressources et la reconnaissance nécessaires.`]
    };
    const idx      = Math.floor(Math.random() * 2);
    const adminMsg = adminOptions[statut][idx];
    const feliciteMsg = aFeliciter.length > 0 ? `Les élèves <strong>${aFeliciter.map(e => `${e.nom} (${e.moyenneEleve.toFixed(1)}/20)`).join('</strong>, <strong>')}</strong> se distinguent par leurs excellentes performances dans cette matière.` : `Aucun élève n'a atteint une moyenne supérieure à 14 pour cette période.`;
    const aiderMsg    = aAider.length > 0 ? `Les élèves <strong>${aAider.map(e => `${e.nom} (${e.moyenneEleve.toFixed(1)}/20)`).join('</strong>, <strong>')}</strong> nécessitent un soutien urgent et personnalisé.` : `Aucun élève n'est en situation d'échec pour cette période.`;
    return { admin: adminMsg, felicite: feliciteMsg, aider: aiderMsg };
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES HTML
// ─────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatParagraph(text) {
    if (text.includes('<strong>')) return text;
    return escHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// ─────────────────────────────────────────────────────────────
// RENDU — carte HTML d'un professeur (inchangé)
// ─────────────────────────────────────────────────────────────
function renderRecoCard(profData, paragraphs) {
    const { nom, matiere, classes, profMoy, statut, aFeliciter, aAider } = profData;
    const statusConf = {
        ameliorer:  { color: '#b91c1c', bg: '#fee2e2', icon: '📉', label: 'À améliorer'  },
        progresser: { color: '#92400e', bg: '#fef3c7', icon: '📊', label: 'À progresser' },
        maintenir:  { color: '#15803d', bg: '#dcfce7', icon: '📈', label: 'À maintenir'  },
    };
    const sc         = statusConf[statut];
    const classesTxt = classes.length > 0 ? classes.join(', ') : 'Classes non renseignées';
    return `
<div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <div>
      <div style="font-weight:700;font-size:15px;color:#0f172a;">${escHtml(nom)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${escHtml(matiere)} · ${escHtml(classesTxt)} · Moy. <strong>${profMoy.toFixed(2)}/20</strong></div>
    </div>
    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:30px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color};">${sc.icon} ${sc.label}</span>
  </div>
  <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px;">
    <div style="background:linear-gradient(135deg,#eff6ff,#f8faff);border-left:4px solid #3b82f6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#2563eb;margin-bottom:8px;">🔷 Message à l'administration</div>
      <div style="font-size:13px;line-height:1.85;color:#334155;">${formatParagraph(paragraphs.admin)}</div>
    </div>
    <div style="background:linear-gradient(135deg,#f0fdf4,#f8fffe);border-left:4px solid #10b981;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#059669;margin-bottom:8px;">⭐ Élèves à féliciter (${aFeliciter.length})</div>
      <div style="font-size:13px;line-height:1.85;color:#334155;">${formatParagraph(paragraphs.felicite)}</div>
    </div>
    <div style="background:linear-gradient(135deg,#fef9f0,#fffbf0);border-left:4px solid #f59e0b;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#d97706;margin-bottom:8px;">🤝 Élèves à accompagner (${aAider.length})</div>
      <div style="font-size:13px;line-height:1.85;color:#334155;">${formatParagraph(paragraphs.aider)}</div>
    </div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE — RECOMMANDATIONS
// ─────────────────────────────────────────────────────────────
export async function handleRecommandations(db, userId, addMessageFn) {
    if (!userId) return '❌ Utilisateur non connecté.';

    addMessageFn(
        `<div style="display:flex;align-items:center;gap:8px;color:#3b82f6;font-weight:600;"><span>✨</span> Analyse en cours… Récupération des données Firestore.</div>`,
        'assistant'
    );

    try {
        const rawData   = await fetchData(db, userId);
        const profsData = buildProfStats(rawData);

        if (profsData.length === 0) return `😕 Aucun professeur trouvé. Vérifiez que des évaluations ont bien été saisies.`;

        // ── Stats globales (avant la boucle pour les appels parallèles) ──
        const stats = {
            total:       profsData.length,
            nbAmeliorer: profsData.filter(p => p.statut === 'ameliorer').length,
            nbProgresser:profsData.filter(p => p.statut === 'progresser').length,
            nbMaintenir: profsData.filter(p => p.statut === 'maintenir').length,
            moyGlobale:  profsData.length > 0 ? profsData.reduce((s, p) => s + p.profMoy, 0) / profsData.length : 0
        };

        // ── Lancer analyse globale et recommandations en parallèle ──
        const globalPromise   = generateGlobalAnalysis(profsData, stats)
            .catch(err => { console.warn('Fallback global:', err.message); return fallbackGlobalAnalysis(stats); });
        const priorityPromise = generatePriorityReco(profsData, stats)
            .catch(err => { console.warn('Fallback priority:', err.message); return fallbackPriorityReco(stats); });

        // ── Construction HTML + accumulation données ──
        let html = `
<div style="margin-bottom:20px;">
  <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px;">📋 Recommandations pédagogiques</div>
  <div style="font-size:12px;color:#94a3b8;">${profsData.length} professeur(s) analysé(s) · ⚡ Groq IA (Llama 3.3) · ${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</div>
</div>`;

        const profsParags = [];
        for (let i = 0; i < profsData.length; i++) {
            const pd = profsData[i];
            addMessageFn(
                `<span style="color:#94a3b8;font-size:13px;">⏳ Génération pour <strong>${escHtml(pd.nom)}</strong> (${i + 1}/${profsData.length})…</span>`,
                'assistant'
            );
            let paragraphs;
            try { paragraphs = await generateRecoForProf(pd); }
            catch (err) { console.warn(`Fallback prof ${pd.nom}:`, err.message); paragraphs = fallbackReco(pd); }
            html += renderRecoCard(pd, paragraphs);
            profsParags.push({ pd, paragraphs });
        }

        // ── Attendre les appels parallèles ──
        const [globalAnalyse, priorityRecos] = await Promise.all([globalPromise, priorityPromise]);

        // ── Résumé HTML ──
        html += `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;font-size:13px;color:#475569;display:flex;gap:20px;flex-wrap:wrap;margin-top:4px;">
  <span>📉 <strong style="color:#b91c1c;">${stats.nbAmeliorer}</strong> à améliorer</span>
  <span>📊 <strong style="color:#92400e;">${stats.nbProgresser}</strong> à progresser</span>
  <span>📈 <strong style="color:#15803d;">${stats.nbMaintenir}</strong> à maintenir</span>
  <span style="margin-left:auto;font-size:11px;color:#cbd5e1;">⚡ Groq · Llama 3.3 · 70B</span>
</div>`;

        // ── Agréger les élèves (dédoublonnés) ──
        const felMap  = new Map();
        const aiderMap = new Map();
        profsParags.forEach(({ pd }) => {
            pd.aFeliciter.forEach(e => {
                if (!felMap.has(e.nom) || felMap.get(e.nom).moyenneEleve < e.moyenneEleve) felMap.set(e.nom, e);
            });
            pd.aAider.forEach(e => {
                if (!aiderMap.has(e.nom) || aiderMap.get(e.nom).moyenneEleve > e.moyenneEleve) aiderMap.set(e.nom, e);
            });
        });

        // ── Stocker les données structurées pour le PDF ──
        _lastRecoData = {
            anneeScol: getAnneeScol(),
            date:      new Date(),
            stats,
            globalAnalyse,
            priorityRecos: Array.isArray(priorityRecos) ? priorityRecos : fallbackPriorityReco(stats),
            profs: {
                ameliorer:  profsParags.filter(p => p.pd.statut === 'ameliorer'),
                progresser: profsParags.filter(p => p.pd.statut === 'progresser'),
                maintenir:  profsParags.filter(p => p.pd.statut === 'maintenir'),
            },
            elevesAFeliciter: Array.from(felMap.values()).sort((a, b) => b.moyenneEleve - a.moyenneEleve),
            elevesAAider:     Array.from(aiderMap.values()).sort((a, b) => a.moyenneEleve - b.moyenneEleve),
        };

        return html;

    } catch (err) {
        console.error('handleRecommandations error:', err);
        return `❌ Erreur : ${err.message}`;
    }
}

// ═════════════════════════════════════════════════════════════
// FONCTIONNALITÉ 2 — SUIVI DE PROGRESSION DANS LE TEMPS
// ═════════════════════════════════════════════════════════════

async function fetchEvolutionData(db, userId) {
    const cacheKey = `evolution_data_${userId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const [classesSnap, evalsSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'),     where('createdBy', '==', userId))),
        getDocs(query(collection(db, 'evaluations'), where('createdBy', '==', userId)))
    ]);

    const classesMap     = new Map();
    const elevesPromises = [];
    classesSnap.forEach(docSnap => {
        const d = docSnap.data();
        classesMap.set(docSnap.id, { nom: d.nomClasse || 'Inconnue', matieres: d.matieres || [] });
        elevesPromises.push(getDocs(collection(db, 'classes', docSnap.id, 'eleves')).then(snap => ({ classeId: docSnap.id, snap })));
    });

    const elevesMap     = new Map();
    const elevesResults = await Promise.all(elevesPromises);
    elevesResults.forEach(({ classeId, snap }) => {
        const classeNom = classesMap.get(classeId)?.nom || 'Inconnue';
        snap.forEach(d => { const data = d.data(); elevesMap.set(d.id, { nom: `${data.prenom || ''} ${data.nom || ''}`.trim() || 'Inconnu', classeId, classeNom }); });
    });

    const evaluations = await Promise.all(evalsSnap.docs.map(async evalDoc => {
        const d = evalDoc.data();
        const notesSnap = await getDocs(collection(db, 'evaluations', evalDoc.id, 'notes'));
        const notes = [];
        notesSnap.forEach(n => { const nd = n.data(); if (nd.eleveId && nd.note !== undefined) notes.push({ eleveId: nd.eleveId, note: Number(nd.note) }); });
        let date = null;
        if (d.createdAt) date = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
        return { id: evalDoc.id, classeId: d.classeId, matiere: d.matiere || d.matiereNom || d.nomMatiere || 'Inconnue', professeurId: d.professeurId, professeurNom: d.professeurNom || 'Inconnu', date, notes };
    }));
    evaluations.sort((a, b) => { if (!a.date) return 1; if (!b.date) return -1; return a.date - b.date; });

    const result = { classesMap, elevesMap, evaluations };
    cacheSet(cacheKey, result);
    return result;
}

function sparkline(values) {
    if (values.length === 0) return '';
    const blocks = ['▁','▂','▃','▄','▅','▆','▇','█'];
    const mn = Math.min(...values), mx = Math.max(...values);
    const range = mx - mn || 1;
    return values.map(v => blocks[Math.round(((v - mn) / range) * 7)]).join('');
}

function tendanceIcon(values) {
    if (values.length < 2) return { icon: '➡️', color: '#64748b', label: 'Stable' };
    const first = values.slice(0, Math.ceil(values.length / 2)).reduce((a,b) => a+b,0) / Math.ceil(values.length/2);
    const last  = values.slice(-Math.ceil(values.length / 2)).reduce((a,b) => a+b,0) / Math.ceil(values.length/2);
    const diff  = last - first;
    if (diff > 1.5)  return { icon: '📈', color: '#15803d', label: `+${diff.toFixed(1)} pts` };
    if (diff < -1.5) return { icon: '📉', color: '#b91c1c', label: `${diff.toFixed(1)} pts` };
    return { icon: '➡️', color: '#92400e', label: 'Stable' };
}

function renderProgressPoints(points) {
    if (points.length === 0) return '<em style="color:#94a3b8">Aucune donnée</em>';
    const max = 20, barW = 160;
    return points.map(p => {
        const pct   = Math.min(100, (p.moyenne / max) * 100);
        const color = p.moyenne >= 14 ? '#10b981' : p.moyenne >= 10 ? '#f59e0b' : '#ef4444';
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><div style="font-size:11px;color:#64748b;width:90px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.label)}</div><div style="flex:1;background:#f1f5f9;border-radius:4px;height:10px;max-width:${barW}px;"><div style="width:${pct.toFixed(1)}%;background:${color};height:10px;border-radius:4px;"></div></div><div style="font-size:12px;font-weight:700;color:${color};width:36px;text-align:right;">${p.moyenne.toFixed(1)}</div></div>`;
    }).join('');
}

async function evolutionClasse(db, userId, classeNom) {
    const { classesMap, elevesMap, evaluations } = await fetchEvolutionData(db, userId);
    let classeId = null, classeNomOfficiel = '';
    for (const [id, cl] of classesMap.entries()) {
        if (norm(cl.nom).includes(norm(classeNom)) || norm(classeNom).includes(norm(cl.nom))) { classeId = id; classeNomOfficiel = cl.nom; break; }
    }
    if (!classeId) return `😕 Classe "<strong>${escHtml(classeNom)}</strong>" introuvable.`;

    const evalsClasse = evaluations.filter(ev => ev.classeId === classeId && ev.date);
    if (evalsClasse.length === 0) return `😕 Aucune évaluation datée pour la classe <strong>${escHtml(classeNomOfficiel)}</strong>.`;

    const byMonth = new Map();
    evalsClasse.forEach(ev => {
        const key = ev.date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        if (!byMonth.has(key)) byMonth.set(key, []);
        ev.notes.forEach(n => byMonth.get(key).push(n.note));
    });
    const points = [];
    byMonth.forEach((notes, label) => { points.push({ label, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    const toutesNotes = evalsClasse.flatMap(ev => ev.notes.map(n => n.note));
    const moyGlobale  = toutesNotes.reduce((a,b) => a+b,0) / toutesNotes.length;
    const moyVals     = points.map(p => p.moyenne);
    const tend        = tendanceIcon(moyVals);
    const spark       = sparkline(moyVals);
    const best        = [...points].sort((a,b) => b.moyenne - a.moyenne)[0];
    const worst       = [...points].sort((a,b) => a.moyenne - b.moyenne)[0];

    const elevesClasse = Array.from(elevesMap.values()).filter(e => e.classeId === classeId);
    const elevesEvo = elevesClasse.map(eleve => {
        let eleveId = null;
        for (const [id, el] of elevesMap.entries()) { if (el === eleve) { eleveId = id; break; } }
        const notesE = evalsClasse.flatMap(ev => { const found = ev.notes.find(n => n.eleveId === eleveId); return found ? [found.note] : []; });
        const moy    = notesE.length > 0 ? notesE.reduce((a,b) => a+b,0) / notesE.length : null;
        const t      = notesE.length >= 2 ? tendanceIcon(notesE) : null;
        return { nom: eleve.nom, moy, tend: t, spark: sparkline(notesE) };
    }).filter(e => e.moy !== null).sort((a,b) => b.moy - a.moy);

    const topEleves    = elevesEvo.slice(0, 3);
    const bottomEleves = elevesEvo.slice(-3).reverse();

    return `<div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <div><div style="font-weight:700;font-size:16px;color:#0f172a;">📊 Évolution — Classe ${escHtml(classeNomOfficiel)}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">${evalsClasse.length} évaluation(s) · ${points.length} période(s) · ${elevesEvo.length} élève(s)</div></div>
    <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:30px;background:#f1f5f9;"><span style="font-size:18px;">${tend.icon}</span><span style="font-weight:700;font-size:13px;color:${tend.color};">${tend.label}</span></div>
  </div>
  <div style="padding:18px 20px;display:flex;flex-direction:column;gap:18px;">
    <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📈 Tendance générale</div>
      <div style="font-family:monospace;font-size:22px;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">${spark}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:#475569;"><span>Moyenne : <strong style="color:#0f172a;">${moyGlobale.toFixed(2)}/20</strong></span><span>Meilleur mois : <strong style="color:#10b981;">${best.label} (${best.moyenne.toFixed(1)})</strong></span><span>Mois difficile : <strong style="color:#ef4444;">${worst.label} (${worst.moyenne.toFixed(1)})</strong></span></div>
    </div>
    <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📅 Moyenne par période</div>${renderProgressPoints(points)}</div>
    ${topEleves.length > 0 ? `<div style="background:linear-gradient(135deg,#f0fdf4,#f8fffe);border-left:4px solid #10b981;border-radius:10px;padding:14px 16px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#059669;margin-bottom:10px;">⭐ Meilleurs élèves</div>${topEleves.map(e => `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #dcfce7;"><span style="font-size:13px;font-weight:600;color:#0f172a;">${escHtml(e.nom)}</span><div style="display:flex;align-items:center;gap:8px;"><span style="font-family:monospace;font-size:13px;color:#10b981;">${e.spark}</span><span style="font-size:12px;font-weight:700;color:#15803d;">${e.moy.toFixed(1)}/20</span>${e.tend ? `<span title="${e.tend.label}">${e.tend.icon}</span>` : ''}</div></div>`).join('')}</div>` : ''}
    ${bottomEleves.length > 0 ? `<div style="background:linear-gradient(135deg,#fef9f0,#fffbf0);border-left:4px solid #f59e0b;border-radius:10px;padding:14px 16px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#d97706;margin-bottom:10px;">🤝 Élèves à suivre</div>${bottomEleves.map(e => `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #fef3c7;"><span style="font-size:13px;font-weight:600;color:#0f172a;">${escHtml(e.nom)}</span><div style="display:flex;align-items:center;gap:8px;"><span style="font-family:monospace;font-size:13px;color:#f59e0b;">${e.spark}</span><span style="font-size:12px;font-weight:700;color:#92400e;">${e.moy.toFixed(1)}/20</span>${e.tend ? `<span title="${e.tend.label}">${e.tend.icon}</span>` : ''}</div></div>`).join('')}</div>` : ''}
  </div>
</div>`;
}

async function evolutionEleve(db, userId, eleveNom) {
    const { elevesMap, evaluations } = await fetchEvolutionData(db, userId);
    let eleveId = null, eleveData = null;
    for (const [id, el] of elevesMap.entries()) {
        if (norm(el.nom).includes(norm(eleveNom)) || norm(eleveNom).includes(norm(el.nom).split(' ')[0])) { eleveId = id; eleveData = el; break; }
    }
    if (!eleveId) return `😕 Élève "<strong>${escHtml(eleveNom)}</strong>" introuvable.`;

    const notesChronos = [];
    evaluations.forEach(ev => {
        const n = ev.notes.find(n => n.eleveId === eleveId);
        if (n && ev.date) notesChronos.push({ date: ev.date, label: ev.date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' }), note: n.note, matiere: ev.matiere });
    });
    if (notesChronos.length === 0) return `😕 Aucune note datée pour <strong>${escHtml(eleveData.nom)}</strong>.`;

    const byMatiere = new Map();
    notesChronos.forEach(n => { if (!byMatiere.has(n.matiere)) byMatiere.set(n.matiere, []); byMatiere.get(n.matiere).push(n.note); });
    const matierePoints = [];
    byMatiere.forEach((notes, matiere) => { matierePoints.push({ label: matiere, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    const allNotes   = notesChronos.map(n => n.note);
    const moyGlobale = allNotes.reduce((a,b) => a+b,0) / allNotes.length;
    const tend       = tendanceIcon(allNotes);
    const spark      = sparkline(allNotes);
    const best       = [...notesChronos].sort((a,b) => b.note - a.note)[0];
    const worst      = [...notesChronos].sort((a,b) => a.note - b.note)[0];

    const byMonth = new Map();
    notesChronos.forEach(n => { const key = n.date.toLocaleDateString('fr-FR', { month:'short', year:'2-digit' }); if (!byMonth.has(key)) byMonth.set(key, []); byMonth.get(key).push(n.note); });
    const chronoPoints = [];
    byMonth.forEach((notes, label) => { chronoPoints.push({ label, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    return `<div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <div><div style="font-weight:700;font-size:16px;color:#0f172a;">🎓 Évolution — ${escHtml(eleveData.nom)}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">Classe ${escHtml(eleveData.classeNom)} · ${notesChronos.length} note(s) · ${byMatiere.size} matière(s)</div></div>
    <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:30px;background:#f1f5f9;"><span style="font-size:18px;">${tend.icon}</span><span style="font-weight:700;font-size:13px;color:${tend.color};">${tend.label}</span></div>
  </div>
  <div style="padding:18px 20px;display:flex;flex-direction:column;gap:18px;">
    <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📈 Courbe de progression</div>
      <div style="font-family:monospace;font-size:22px;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">${spark}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:#475569;"><span>Moyenne : <strong style="color:#0f172a;">${moyGlobale.toFixed(2)}/20</strong></span><span>Meilleure note : <strong style="color:#10b981;">${best.note}/20 en ${best.matiere}</strong></span><span>Note la plus basse : <strong style="color:#ef4444;">${worst.note}/20 en ${worst.matiere}</strong></span></div>
    </div>
    <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📅 Moyenne par mois</div>${renderProgressPoints(chronoPoints)}</div>
    <div style="background:linear-gradient(135deg,#eff6ff,#f8faff);border-left:4px solid #3b82f6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#2563eb;margin-bottom:10px;">📚 Performance par matière</div>
      ${renderProgressPoints(matierePoints.sort((a,b) => b.moyenne - a.moyenne))}
    </div>
  </div>
</div>`;
}

async function evolutionProfesseur(db, userId, profNom) {
    const { classesMap, evaluations } = await fetchEvolutionData(db, userId);
    const profEvals = evaluations.filter(ev => ev.professeurNom && norm(ev.professeurNom).includes(norm(profNom)));
    if (profEvals.length === 0) return `😕 Professeur "<strong>${escHtml(profNom)}</strong>" introuvable.`;

    const profNomOfficiel = profEvals[0].professeurNom;
    const byMonth = new Map();
    profEvals.forEach(ev => { if (!ev.date) return; const key = ev.date.toLocaleDateString('fr-FR', { month:'short', year:'2-digit' }); if (!byMonth.has(key)) byMonth.set(key, []); ev.notes.forEach(n => byMonth.get(key).push(n.note)); });
    const points = [];
    byMonth.forEach((notes, label) => { points.push({ label, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    const byMatiere = new Map();
    profEvals.forEach(ev => { if (!byMatiere.has(ev.matiere)) byMatiere.set(ev.matiere, []); ev.notes.forEach(n => byMatiere.get(ev.matiere).push(n.note)); });
    const matierePoints = [];
    byMatiere.forEach((notes, matiere) => { matierePoints.push({ label: matiere, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    const byClasse = new Map();
    profEvals.forEach(ev => { const nom = classesMap.get(ev.classeId)?.nom || 'Inconnue'; if (!byClasse.has(nom)) byClasse.set(nom, []); ev.notes.forEach(n => byClasse.get(nom).push(n.note)); });
    const classePoints = [];
    byClasse.forEach((notes, classe) => { classePoints.push({ label: classe, moyenne: notes.reduce((a,b) => a+b,0) / notes.length }); });

    const allNotes   = profEvals.flatMap(ev => ev.notes.map(n => n.note));
    const moyGlobale = allNotes.reduce((a,b) => a+b,0) / allNotes.length;
    const tend       = tendanceIcon(points.map(p => p.moyenne));
    const spark      = sparkline(points.map(p => p.moyenne));

    return `<div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <div><div style="font-weight:700;font-size:16px;color:#0f172a;">👨‍🏫 Évolution — ${escHtml(profNomOfficiel)}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">${profEvals.length} évaluation(s) · ${byClasse.size} classe(s) · ${byMatiere.size} matière(s)</div></div>
    <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:30px;background:#f1f5f9;"><span style="font-size:18px;">${tend.icon}</span><span style="font-weight:700;font-size:13px;color:${tend.color};">${tend.label}</span></div>
  </div>
  <div style="padding:18px 20px;display:flex;flex-direction:column;gap:18px;">
    <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📈 Tendance globale</div>
      <div style="font-family:monospace;font-size:22px;letter-spacing:2px;color:#3b82f6;margin-bottom:8px;">${spark}</div>
      <div style="font-size:13px;color:#475569;">Moyenne globale : <strong style="color:#0f172a;">${moyGlobale.toFixed(2)}/20</strong></div>
    </div>
    <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;margin-bottom:10px;">📅 Moyenne par période</div>${renderProgressPoints(points)}</div>
    <div style="background:linear-gradient(135deg,#eff6ff,#f8faff);border-left:4px solid #3b82f6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#2563eb;margin-bottom:10px;">🏫 Performance par classe</div>${renderProgressPoints(classePoints.sort((a,b) => b.moyenne - a.moyenne))}
    </div>
    ${matierePoints.length > 1 ? `<div style="background:linear-gradient(135deg,#f0fdf4,#f8fffe);border-left:4px solid #10b981;border-radius:10px;padding:14px 16px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#059669;margin-bottom:10px;">📚 Performance par matière</div>${renderProgressPoints(matierePoints.sort((a,b) => b.moyenne - a.moyenne))}</div>` : ''}
  </div>
</div>`;
}

export async function handleEvolution(db, userId, type, name) {
    if (!userId) return '❌ Utilisateur non connecté.';
    if (!name || !name.trim()) return `❓ Précisez un nom. Ex : <em>evolution classe 5eA</em> · <em>evolution eleve Moussa</em> · <em>evolution prof Diop</em>`;
    try {
        switch (type) {
            case 'classe':     return await evolutionClasse(db, userId, name);
            case 'eleve':      return await evolutionEleve(db, userId, name);
            case 'professeur': return await evolutionProfesseur(db, userId, name);
            default:           return `❓ Type non reconnu. Utilisez : classe, eleve ou prof.`;
        }
    } catch (err) {
        console.error('handleEvolution error:', err);
        return `❌ Erreur : ${err.message}`;
    }
}
