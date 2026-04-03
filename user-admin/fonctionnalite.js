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
// ANNÉE SCOLAIRE DYNAMIQUE
// ─────────────────────────────────────────────────────────────
function getAnneeScol() {
    const now = new Date();
    const y   = now.getFullYear();
    return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ─────────────────────────────────────────────────────────────
// STOCKAGE — dernière analyse (pour le PDF)
// ─────────────────────────────────────────────────────────────
let _lastAnalyseData = null;
export function getLastAnalyseData() { return _lastAnalyseData; }

// ─────────────────────────────────────────────────────────────
// DÉTECTION — analyse
// ─────────────────────────────────────────────────────────────
const ANALYSE_KEYWORDS = [
    'analyse', 'analyser', 'analyze',
    'analyse performance', 'performance classe',
    'analyse classe', 'bilan classe ia',
    'rapport ia', 'analyse ia',
];
export function isAnalyseRequest(message) {
    const n = norm(message);
    return ANALYSE_KEYWORDS.some(kw => n.includes(norm(kw)));
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — classes de l'utilisateur
// ─────────────────────────────────────────────────────────────
export async function fetchClassesForUser(db, userId) {
    const cacheKey = `classes_list_${userId}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return cached;
    const snap = await getDocs(query(collection(db, 'classes'), where('createdBy', '==', userId)));
    const data = snap.docs.map(d => ({ id: d.id, nom: d.data().nomClasse || d.data().classeNom || 'Inconnue' }));
    cacheSet(cacheKey, data);
    return data;
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — données d'une classe pour analyse
// ─────────────────────────────────────────────────────────────
async function fetchAnalyseData(db, userId, classeId) {
    const cacheKey = `analyse_${userId}_${classeId}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return cached;

    const [classesSnap, evalsSnap, elevesSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('createdBy', '==', userId))),
        getDocs(query(collection(db, 'evaluations'), where('createdBy', '==', userId), where('classeId', '==', classeId))),
        getDocs(collection(db, 'classes', classeId, 'eleves')),
    ]);

    const classesMap = new Map();
    classesSnap.forEach(d => classesMap.set(d.id, d.data().nomClasse || d.data().classeNom || 'Inconnue'));

    const elevesMap = new Map();
    elevesSnap.forEach(d => {
        const ed = d.data();
        elevesMap.set(d.id, { nom: `${ed.prenom || ''} ${ed.nom || ''}`.trim() || 'Inconnu' });
    });

    const evaluations = await Promise.all(evalsSnap.docs.map(async evalDoc => {
        const d     = evalDoc.data();
        const nSnap = await getDocs(collection(db, 'evaluations', evalDoc.id, 'notes'));
        const notes = [];
        nSnap.forEach(n => {
            const nd = n.data();
            if (nd.eleveId && nd.note !== undefined) notes.push({ eleveId: nd.eleveId, note: Number(nd.note) });
        });
        return {
            id:            evalDoc.id,
            matiere:       d.matiere || d.matiereNom || d.nomMatiere || 'Inconnue',
            professeurNom: d.professeurNom || 'Inconnu',
            notes,
        };
    }));

    const result = { elevesMap, evaluations, classeNom: classesMap.get(classeId) || 'Inconnue' };
    cacheSet(cacheKey, result);
    return result;
}

// ─────────────────────────────────────────────────────────────
// CALCUL DES STATS
// ─────────────────────────────────────────────────────────────
function computeStats(elevesMap, evaluations) {
    const elevesStats  = new Map();
    const matiereStats = new Map();

    evaluations.forEach(ev => {
        ev.notes.forEach(n => {
            if (!elevesMap.has(n.eleveId)) return;
            const eleve = elevesMap.get(n.eleveId);
            if (!elevesStats.has(n.eleveId))
                elevesStats.set(n.eleveId, { nom: eleve.nom, notesByMatiere: new Map(), allNotes: [] });
            const es = elevesStats.get(n.eleveId);
            if (!es.notesByMatiere.has(ev.matiere)) es.notesByMatiere.set(ev.matiere, []);
            es.notesByMatiere.get(ev.matiere).push(n.note);
            es.allNotes.push(n.note);

            if (!matiereStats.has(ev.matiere)) matiereStats.set(ev.matiere, { notes: [], prof: ev.professeurNom });
            matiereStats.get(ev.matiere).notes.push(n.note);
        });
    });

    const elevesArray = [];
    elevesStats.forEach((es, eleveId) => {
        const moy = es.allNotes.length > 0 ? es.allNotes.reduce((a, b) => a + b, 0) / es.allNotes.length : 0;
        elevesArray.push({ eleveId, nom: es.nom, moy, notesByMatiere: es.notesByMatiere });
    });
    elevesArray.sort((a, b) => b.moy - a.moy);

    const matieresArray = [];
    matiereStats.forEach((ms, matiere) => {
        const moy = ms.notes.reduce((a, b) => a + b, 0) / ms.notes.length;
        matieresArray.push({ matiere, moy, prof: ms.prof });
    });
    matieresArray.sort((a, b) => b.moy - a.moy);

    const moyClasse = elevesArray.length > 0 ? elevesArray.reduce((s, e) => s + e.moy, 0) / elevesArray.length : 0;
    const top3      = elevesArray.slice(0, 3);
    const enRegress = elevesArray.filter(e => e.moy < 10);
    const nbFort    = elevesArray.filter(e => e.moy > 12).length;
    const nbMoyen   = elevesArray.filter(e => e.moy >= 10 && e.moy <= 12).length;
    const nbFaible  = elevesArray.filter(e => e.moy < 10).length;

    // Élèves avec moyenne < 8 dans au moins une matière
    const elevesAAccompagner = [];
    elevesStats.forEach((es) => {
        es.notesByMatiere.forEach((notes, matiere) => {
            const moy = notes.reduce((a, b) => a + b, 0) / notes.length;
            if (moy < 8) elevesAAccompagner.push({ nom: es.nom, matiere, note: moy });
        });
    });
    elevesAAccompagner.sort((a, b) => a.note - b.note);

    return { elevesArray, matieresArray, moyClasse, top3, enRegress, nbFort, nbMoyen, nbFaible, elevesAAccompagner };
}

// ─────────────────────────────────────────────────────────────
// GROQ — génération du texte d'analyse
// ─────────────────────────────────────────────────────────────
async function generateAnalyseTexte(classeNom, stats, anneeScol) {
    const { elevesArray, matieresArray, moyClasse, top3, enRegress, nbFort, nbMoyen, nbFaible } = stats;

    const topEleves   = top3.map(e => `${e.nom} (${e.moy.toFixed(1)}/20)`).join(', ') || 'N/A';
    const regressTxt  = enRegress.length > 0 ? enRegress.slice(0, 5).map(e => `${e.nom} (${e.moy.toFixed(1)}/20)`).join(', ') : 'aucun';
    const matieresTxt = matieresArray.map(m => `${m.matiere}: ${m.moy.toFixed(1)}/20`).join(', ');

    const prompt = `Tu es un conseiller pédagogique rédigeant un rapport officiel pour un établissement scolaire en Afrique francophone.

Données de la classe ${classeNom} — Année scolaire ${anneeScol} :
- Élèves évalués : ${elevesArray.length}
- Moyenne générale : ${moyClasse.toFixed(2)}/20
- Forts (>12) : ${nbFort} · Moyens (10-12) : ${nbMoyen} · En difficulté (<10) : ${nbFaible}
- Meilleurs élèves : ${topEleves}
- Élèves en régression (moy < 10) : ${regressTxt}
- Performances par matière : ${matieresTxt}

Génère exactement 4 blocs de texte séparés uniquement par |||. Chaque bloc : un seul paragraphe dense et bien développé, pas de listes, pas de tirets, pas de markdown. Ton sobre et professionnel. Les paragraphes doivent être substantiels et détaillés.

Bloc 1 : État actuel — résumé objectif en 5-6 lignes denses, couvre la situation globale, le contexte et les tendances observées.
Bloc 2 : Points positifs — environ 9 lignes minimum, développe en détail les points forts, les matières performantes, l'évolution positive, valorise les élèves et les efforts collectifs, analyse les facteurs de réussite.
Bloc 3 : Points négatifs — environ 8 lignes, analyse approfondie des faiblesses, cite les élèves en régression avec leur note, identifie les matières à améliorer et les causes probables des difficultés.
Bloc 4 : Synthèse et recommandations — environ 8 lignes, synthèse globale et conseils concrets et détaillés au professeur : stratégies pédagogiques, actions prioritaires, suivi individualisé.

Réponds UNIQUEMENT avec les 4 blocs séparés par |||. Aucun titre, aucun numéro, aucun markdown.`;

    const response = await fetch(GROQ_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body:    JSON.stringify({
            model: GROQ_MODEL, max_tokens: 1800, temperature: 0.6,
            messages: [
                { role: 'system', content: 'Conseiller pédagogique expert pour les écoles en Afrique francophone. Rapports administratifs sobres, professionnels, sans répétition, en français. Jamais de markdown, jamais de titres, jamais de tirets. Paragraphes séparés par |||.' },
                { role: 'user',   content: prompt }
            ]
        })
    });

    if (!response.ok) { const err = await response.text(); throw new Error(`Groq ${response.status}: ${err}`); }
    const data  = await response.json();
    const text  = data.choices?.[0]?.message?.content?.trim() || '';
    const parts = text.split('|||').map(p => p.trim()).filter(Boolean);

    return {
        etatActuel:    parts[0] || 'Analyse non disponible.',
        pointsPositifs:parts[1] || 'Analyse non disponible.',
        pointsNegatifs:parts[2] || 'Analyse non disponible.',
        syntheseRecos: parts[3] || 'Analyse non disponible.',
    };
}

function fallbackAnalyseTexte(classeNom, stats) {
    const { moyClasse, nbFort, nbMoyen, nbFaible, elevesArray, enRegress, matieresArray } = stats;
    const topMat      = matieresArray[0]?.matiere || 'certaines matières';
    const regressList = enRegress.slice(0, 3).map(e => `${e.nom} (${e.moy.toFixed(1)}/20)`).join(', ');
    return {
        etatActuel:     `La classe ${classeNom} présente pour cette période une moyenne générale de ${moyClasse.toFixed(2)}/20. Sur les ${elevesArray.length} élèves évalués, ${nbFort} affichent des résultats supérieurs à 12, ${nbMoyen} se situent dans la moyenne acceptable et ${nbFaible} se trouvent en situation de difficulté notable nécessitant une attention particulière de l'équipe pédagogique.`,
        pointsPositifs: `La classe démontre des résultats encourageants dans plusieurs disciplines, notamment en ${topMat} où la dynamique de groupe est perceptible. Les élèves les mieux classés témoignent d'un investissement sérieux et d'une bonne assimilation des contenus enseignés. Cette dynamique positive au sein du groupe classe constitue un atout pédagogique à valoriser et à consolider pour entraîner les élèves plus fragiles vers une progression collective. Le taux de participation aux évaluations reflète un engagement satisfaisant de la majorité des apprenants.`,
        pointsNegatifs: `Plusieurs élèves présentent des résultats préoccupants qui appellent à une intervention ciblée : ${regressList || 'certains élèves'}. Ces difficultés se concentrent principalement dans les matières à fort coefficient, fragilisant ainsi leur moyenne générale. Une attention particulière doit être portée à ces profils afin d'éviter un décrochage progressif qui pourrait compromettre leur réussite en fin d'année scolaire.`,
        syntheseRecos:  `Au regard de cette analyse, il est recommandé au professeur d'instaurer des séances de remédiation ciblées pour les élèves en difficulté, en priorisant les notions fondamentales non maîtrisées. La mise en place d'un tutorat par les pairs, associant les élèves performants aux élèves fragiles, permettrait de renforcer la cohésion pédagogique. Un suivi individualisé mensuel et un contact régulier avec les familles concernées sont fortement conseillés pour mesurer les progrès et maintenir la motivation des apprenants.`,
    };
}

// ─────────────────────────────────────────────────────────────
// RENDU HTML — carte d'analyse (affichage dans le chat)
// ─────────────────────────────────────────────────────────────
function renderAnalyseCard(classeNom, stats, textes, anneeScol) {
    const { moyClasse, nbFort, nbMoyen, nbFaible, elevesArray, elevesAAccompagner } = stats;
    const nivLabel = moyClasse >= 14 ? 'Excellent' : moyClasse >= 10 ? 'Moyen' : 'À améliorer';
    const nivIcon  = moyClasse >= 14 ? '📈' : moyClasse >= 10 ? '📊' : '📉';

    return `
<div style="background:#fff;border-radius:16px;border:1px solid #d1d5db;overflow:hidden;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;margin-bottom:4px;">EDUCSEN IA &nbsp;·&nbsp; by GalsenUp &nbsp;·&nbsp; ${anneeScol}</div>
      <div style="font-weight:700;font-size:16px;color:#111827;">ANALYSE PERFORMANCE — ${classeNom.toUpperCase()}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${elevesArray.length} élève(s) évalué(s)</div>
    </div>
    <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:30px;font-size:12px;font-weight:700;background:#f3f4f6;color:#111827;border:1px solid #d1d5db;">${nivIcon} ${nivLabel} · ${moyClasse.toFixed(2)}/20</span>
  </div>

  <div style="display:flex;border-bottom:1px solid #e5e7eb;">
    <div style="flex:1;padding:12px 16px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:20px;font-weight:800;color:#111827;">${nbFort}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Forts &gt;12</div>
    </div>
    <div style="flex:1;padding:12px 16px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:20px;font-weight:800;color:#374151;">${nbMoyen}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Moyens 10-12</div>
    </div>
    <div style="flex:1;padding:12px 16px;text-align:center;">
      <div style="font-size:20px;font-weight:800;color:#4b5563;">${nbFaible}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Difficulté &lt;10</div>
    </div>
  </div>

  <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">

    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;border:1px solid #e5e7eb;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#374151;margin-bottom:8px;">📋 État actuel de la classe</div>
      <div style="font-size:13px;line-height:1.85;color:#1f2937;">${textes.etatActuel}</div>
    </div>

    <div style="background:#f9fafb;border-left:3px solid #374151;border-radius:10px;padding:14px 16px;border:1px solid #e5e7eb;border-left:3px solid #374151;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#374151;margin-bottom:8px;">✅ Points positifs & évolution</div>
      <div style="font-size:13px;line-height:1.85;color:#1f2937;">${textes.pointsPositifs}</div>
    </div>

    <div style="background:#f9fafb;border-left:3px solid #6b7280;border-radius:10px;padding:14px 16px;border:1px solid #e5e7eb;border-left:3px solid #6b7280;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#374151;margin-bottom:8px;">⚠️ Points négatifs & élèves en régression</div>
      <div style="font-size:13px;line-height:1.85;color:#1f2937;">${textes.pointsNegatifs}</div>
    </div>

    <div style="background:#f9fafb;border-left:3px solid #111827;border-radius:10px;padding:14px 16px;border:1px solid #e5e7eb;border-left:3px solid #111827;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#374151;margin-bottom:8px;">🎯 Synthèse & Recommandations au professeur</div>
      <div style="font-size:13px;line-height:1.85;color:#1f2937;">${textes.syntheseRecos}</div>
    </div>

    ${elevesAAccompagner.length > 0 ? `
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;border:1px solid #d1d5db;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#374151;margin-bottom:10px;">🚨 Élèves à accompagner — moyenne matière &lt; 8</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${elevesAAccompagner.map(e => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#fff;border-radius:8px;border:1px solid #d1d5db;">
          <span style="font-size:13px;font-weight:600;color:#111827;">${e.nom}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:11px;color:#6b7280;">${e.matiere}</span>
            <span style="font-size:12px;font-weight:700;color:#111827;">${e.note.toFixed(1)}/20</span>
          </div>
        </div>`).join('')}
      </div>
    </div>` : ''}

  </div>
  <div style="padding:10px 20px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:right;">
    Educsen IA · Groq Llama 3.3 · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// SESSION — mémorise l'état en attente de sélection classe
// ─────────────────────────────────────────────────────────────
const _analyseSession = new Map(); // userId -> { classes: [{id, nom}] }

export function hasAnalyseSession(userId) { return _analyseSession.has(userId); }
export function clearAnalyseSession(userId) { _analyseSession.delete(userId); }

export async function handleAnalyseChoixClasse(db, userId, choix) {
    const session = _analyseSession.get(userId);
    if (!session) return null;

    const idx = parseInt(choix, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= session.classes.length) {
        return `❌ Tapez un numéro entre 1 et ${session.classes.length} (ou "annuler").`;
    }
    const classe = session.classes[idx];
    _analyseSession.delete(userId);
    return { classeId: classe.id, classeNom: classe.nom };
}

// ─────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE — ANALYSE D'UNE CLASSE
// ─────────────────────────────────────────────────────────────
export async function handleAnalyseInit(db, userId) {
    if (!userId) return '❌ Utilisateur non connecté.';
    try {
        const classes = await fetchClassesForUser(db, userId);
        if (classes.length === 0) return '😕 Aucune classe trouvée. Vérifiez que des classes ont bien été créées.';

        _analyseSession.set(userId, { classes });

        const lignes = classes.map((cl, i) => `${i + 1}️⃣ <strong>${cl.nom}</strong>`).join('<br>');
        return `📊 <strong>Analyse de performance</strong><br><br>Pour quelle classe souhaitez-vous générer l'analyse ?<br><br>${lignes}<br><br>Tapez le numéro correspondant.`;
    } catch (err) {
        return `❌ Erreur lors du chargement des classes : ${err.message}`;
    }
}

export async function handleAnalyse(db, userId, classeId, addMessageFn) {
    if (!userId)   return '❌ Utilisateur non connecté.';
    if (!classeId) return '❌ Aucune classe sélectionnée.';

    addMessageFn(
        `<div style="display:flex;align-items:center;gap:8px;color:#6b7280;font-weight:600;"><span>✨</span> Analyse en cours… Récupération des données.</div>`,
        'assistant'
    );

    try {
        const rawData = await fetchAnalyseData(db, userId, classeId);
        const { elevesMap, evaluations, classeNom } = rawData;

        if (evaluations.length === 0)
            return `😕 Aucune évaluation trouvée pour cette classe. Vérifiez que des notes ont bien été saisies.`;
        if (elevesMap.size === 0)
            return `😕 Aucun élève trouvé dans cette classe.`;

        const stats     = computeStats(elevesMap, evaluations);
        const anneeScol = getAnneeScol();

        addMessageFn(
            `<span style="color:#6b7280;font-size:13px;">⏳ Génération de l'analyse IA pour <strong>${classeNom}</strong>…</span>`,
            'assistant'
        );

        let textes;
        try {
            textes = await generateAnalyseTexte(classeNom, stats, anneeScol);
        } catch (err) {
            console.warn('Fallback Groq analyse:', err.message);
            textes = fallbackAnalyseTexte(classeNom, stats);
        }

        _lastAnalyseData = { classeNom, classeId, anneeScol, date: new Date(), stats, textes };

        return renderAnalyseCard(classeNom, stats, textes, anneeScol);

    } catch (err) {
        console.error('handleAnalyse error:', err);
        return `❌ Erreur lors de l'analyse : ${err.message}`;
    }
}

// ─────────────────────────────────────────────────────────────
// EXPORT PDF A4 — 2 pages
// ─────────────────────────────────────────────────────────────
export function exportAnalysePdf(filename) {
    filename = filename || 'analyse_performance_educsen.pdf';
    const data = _lastAnalyseData;
    if (!data) { alert('Aucune analyse disponible. Générez d\'abord une analyse.'); return; }

    const { classeNom, anneeScol, date, stats, textes } = data;
    const { elevesArray, moyClasse, nbFort, nbMoyen, nbFaible, elevesAAccompagner } = stats;

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, MG = 18, TW = PW - MG * 2, CX = PW / 2;
    let y = MG;
    const BOT = PH - 18;

    function np()   { doc.addPage(); y = MG; }
    function chk(h) { if (y + h > BOT) np(); }

    function wL(text, fs, bold, after, indent, rgb) {
        indent = indent || 0; rgb = rgb || [0, 0, 0];
        doc.setFontSize(fs);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        const lh = fs * 0.40;
        doc.splitTextToSize(text, TW - indent).forEach(l => { chk(lh); doc.text(l, MG + indent, y); y += lh; });
        y += (after || 0);
        doc.setTextColor(0, 0, 0);
    }

    function wC(text, fs, bold, after, rgb) {
        rgb = rgb || [0, 0, 0];
        doc.setFontSize(fs);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        const lh = fs * 0.40;
        doc.splitTextToSize(text, TW).forEach(l => { chk(lh); doc.text(l, CX, y, { align: 'center' }); y += lh; });
        y += (after || 0);
        doc.setTextColor(0, 0, 0);
    }

    function hRule(rgb) {
        rgb = rgb || [220, 220, 220];
        doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        doc.setLineWidth(0.25);
        doc.line(MG, y, PW - MG, y);
        y += 5;
    }

    function buildHeader() {
        // Haut gauche : EDUCSEN IA + by GalsenUp
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text('EDUCSEN IA', MG, y);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text('by GalsenUp', MG, y + 5.5);
        // Haut droite : Année scolaire
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text(`Année scolaire ${anneeScol}`, PW - MG, y, { align: 'right' });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), PW - MG, y + 5.5, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y += 16;
        hRule([0, 0, 0]);
    }

    function footers(total) {
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
            doc.text(`Educsen IA  ·  by GalsenUp  ·  Analyse Performance ${classeNom}  ·  Page ${i} / ${total}`, CX, PH - 8, { align: 'center' });
        }
    }

    // ════════════ PAGE 1 — ANALYSE DE PERFORMANCE ════════════
    y = 20;
    buildHeader();

    // Titre — marge augmentée sous la ligne
    y += 6;
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('ANALYSE PERFORMANCE', CX, y, { align: 'center' });
    y += 8;
    doc.setFontSize(14);
    doc.text(classeNom.toUpperCase(), CX, y, { align: 'center' });
    y += 12;
    hRule([180, 180, 180]);

    // État actuel
    wL(textes.etatActuel, 9.5, false, 8, 0, [30, 30, 30]);
    hRule([180, 180, 180]);

    // Points positifs
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    chk(6); doc.text('Points positifs & évolution', MG, y); y += 5;
    wL(textes.pointsPositifs, 9.5, false, 6, 0, [30, 30, 30]);

    y += 3;

    // Points négatifs
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    chk(6); doc.text('Points négatifs & élèves en régression', MG, y); y += 5;
    wL(textes.pointsNegatifs, 9.5, false, 6, 0, [30, 30, 30]);

    y += 3;

    // Synthèse
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    chk(6); doc.text('Synthèse & Recommandations au professeur', MG, y); y += 5;
    wL(textes.syntheseRecos, 9.5, false, 0, 0, [30, 30, 30]);

    // ════════════ PAGE 2 — ÉLÈVES À ACCOMPAGNER ════════════
    np();
    y = 20;
    buildHeader();

    // Titre page 2
    y += 6;
    doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('ÉLÈVES À ACCOMPAGNER', CX, y, { align: 'center' });
    y += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(`Classe ${classeNom}  ·  Moyenne matière inférieure à 8/20`, CX, y, { align: 'center' });
    y += 10; doc.setTextColor(0, 0, 0);
    hRule([180, 180, 180]);

    if (elevesAAccompagner.length === 0) {
        wC('Aucun élève avec une moyenne inférieure à 8 dans une matière.', 10, false, 0, [80, 80, 80]);
    } else {
        const colEleve = MG, colNote = MG + 80, colMat = MG + 100, colCl = MG + 155;

        // En-têtes
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
        doc.text('ÉLÈVE', colEleve, y);
        doc.text('NOTE',  colNote,  y);
        doc.text('MATIÈRE', colMat, y);
        doc.text('CLASSE', colCl,   y);
        y += 4; doc.setTextColor(0, 0, 0);
        hRule([180, 180, 180]);

        elevesAAccompagner.forEach((e, idx) => {
            chk(8);
            if (idx % 2 === 0) {
                doc.setFillColor(245, 245, 245);
                doc.rect(MG - 1, y - 4.5, TW + 2, 7.5, 'F');
            }
            doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
            doc.text(e.nom.substring(0, 28), colEleve, y);

            doc.setTextColor(0, 0, 0);
            doc.text(`${e.note.toFixed(1)}/20`, colNote, y);

            doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
            doc.text(e.matiere.substring(0, 25), colMat, y);
            doc.text(classeNom.substring(0, 18), colCl, y);
            doc.setTextColor(0, 0, 0);
            y += 8;
        });

        y += 6; hRule([180, 180, 180]); y += 2;
        doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
        doc.text(`Total : ${elevesAAccompagner.length} situation(s) identifiée(s)  ·  Seuil : moyenne devoir < 8/20`, MG, y);
        doc.setTextColor(0, 0, 0);
    }

    footers(doc.internal.getNumberOfPages());
    doc.save(filename);
}

// ═════════════════════════════════════════════════════════════
// FONCTIONNALITÉ — SUIVI DE PROGRESSION DANS LE TEMPS
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

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

