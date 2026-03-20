// assistant.js — Module de recherche pédagogique Educsen
// Nettoyé : doublons supprimés, fonctions unifiées, parsing simplifié

import {
    collection, query, where, getDocs,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// ─────────────────────────────────────────────────────────────
// CACHE PAR UTILISATEUR
// ─────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;
const _cache    = new Map();

function getCache(userId) {
    if (!_cache.has(userId)) {
        _cache.set(userId, {
            classes:        null, classesTTL:   0,
            evals:          null, evalsTTL:      0,
            allEleves:      null, elevesTTL:     0,
            elevesByClasse: {},   // { [classeId]: { data, ttl } }
            notesByEval:    {},   // { [evalId]:   { data, ttl } }
        });
    }
    return _cache.get(userId);
}

// ─────────────────────────────────────────────────────────────
// SESSIONS — menu interactif
// ─────────────────────────────────────────────────────────────
const _sessions = new Map();

// ─────────────────────────────────────────────────────────────
// NORMALISATION
// ─────────────────────────────────────────────────────────────
function norm(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Correspondance flexible entre deux chaînes normalisées
function matches(a, b) {
    const na = norm(a), nb = norm(b);
    return na === nb
        || na.replace(/\s/g, '') === nb.replace(/\s/g, '')
        || na.includes(nb)
        || nb.includes(na);
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — CLASSES
// ─────────────────────────────────────────────────────────────
async function getClasses(db, userId) {
    const c = getCache(userId);
    if (c.classes && Date.now() - c.classesTTL < CACHE_TTL) return c.classes;
    const snap = await getDocs(query(collection(db, 'classes'), where('createdBy', '==', userId)));
    c.classes  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    c.classesTTL = Date.now();
    return c.classes;
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — ÉVALUATIONS
// ─────────────────────────────────────────────────────────────
async function getEvaluations(db, userId) {
    const c = getCache(userId);
    if (c.evals && Date.now() - c.evalsTTL < CACHE_TTL) return c.evals;
    const snap = await getDocs(query(collection(db, 'evaluations'), where('createdBy', '==', userId)));
    c.evals    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    c.evalsTTL = Date.now();
    return c.evals;
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — NOTES D'UNE ÉVALUATION
// ─────────────────────────────────────────────────────────────
async function getNotes(db, evalId, userId) {
    const c      = getCache(userId);
    const cached = c.notesByEval[evalId];
    if (cached && Date.now() - cached.ttl < CACHE_TTL) return cached.data;
    const snap = await getDocs(collection(db, 'evaluations', evalId, 'notes'));
    const data = snap.docs.map(d => ({ id: d.id, evalId, ...d.data() }));
    c.notesByEval[evalId] = { data, ttl: Date.now() };
    return data;
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE — ÉLÈVES D'UNE CLASSE
// ─────────────────────────────────────────────────────────────
async function getElevesDeClasse(db, classeId, userId) {
    const c      = getCache(userId);
    const cached = c.elevesByClasse[classeId];
    if (cached && Date.now() - cached.ttl < CACHE_TTL) return cached.data;
    const snap = await getDocs(collection(db, 'classes', classeId, 'eleves'));
    const data = snap.docs.map(d => ({ id: d.id, classeId, ...d.data() }));
    c.elevesByClasse[classeId] = { data, ttl: Date.now() };
    return data;
}

async function getTousLesEleves(db, userId) {
    const c = getCache(userId);
    if (c.allEleves && Date.now() - c.elevesTTL < CACHE_TTL) return c.allEleves;
    const classes = await getClasses(db, userId);
    const all     = [];
    await Promise.all(classes.map(async cl => {
        const eleves = await getElevesDeClasse(db, cl.id, userId);
        all.push(...eleves);
    }));
    c.allEleves  = all;
    c.elevesTTL  = Date.now();
    return all;
}

// ─────────────────────────────────────────────────────────────
// RECHERCHE — ÉLÈVE (retourne TOUS les homonymes)
// ─────────────────────────────────────────────────────────────
async function findEleves(db, terme, userId) {
    const nt     = norm(terme);
    const eleves = await getTousLesEleves(db, userId);
    return eleves.filter(e => {
        const p = norm(e.prenom || '');
        const n = norm(e.nom    || '');
        return matches(p + ' ' + n, nt) || p.includes(nt) || n.includes(nt);
    });
}

// Message de choix quand plusieurs élèves ont le même nom
async function buildDisambigMsg(db, homonymes, userId) {
    const classes = await getClasses(db, userId);
    const lignes  = homonymes.map((e, i) => {
        const cl        = classes.find(c => c.id === e.classeId);
        const classeNom = cl ? (cl.nomClasse || cl.classeNom || 'Classe inconnue') : 'Classe inconnue';
        return `${i + 1}️⃣ <strong>${e.prenom} ${e.nom}</strong> — ${classeNom}`;
    }).join('<br>');
    return `👥 Plusieurs élèves correspondent à ce nom. Lequel souhaitez-vous ?<br><br>${lignes}<br><br>Tapez le numéro correspondant.`;
}

// ─────────────────────────────────────────────────────────────
// RECHERCHE — PROFESSEUR (fonction unique partagée)
// ─────────────────────────────────────────────────────────────
async function findProfesseur(db, terme, userId) {
    const nt      = norm(terme);
    const classes = await getClasses(db, userId);

    // 1. Chercher dans les matieres des classes
    for (const cl of classes) {
        for (const m of (cl.matieres || [])) {
            if (m.professeurNom && norm(m.professeurNom).includes(nt))
                return { professeurId: m.professeurId, professeurNom: m.professeurNom };
        }
    }

    // 2. Chercher dans les évaluations
    const evals = await getEvaluations(db, userId);
    for (const ev of evals) {
        if (ev.professeurNom && norm(ev.professeurNom).includes(nt))
            return { professeurId: ev.professeurId, professeurNom: ev.professeurNom };
    }

    return null;
}

// ─────────────────────────────────────────────────────────────
// NOTES — POUR UN ÉLÈVE
// ─────────────────────────────────────────────────────────────
async function getNotesEleve(db, eleveId, userId) {
    const evals  = await getEvaluations(db, userId);
    const result = [];
    await Promise.all(evals.map(async ev => {
        const notes = await getNotes(db, ev.id, userId);
        const n     = notes.find(n => n.eleveId === eleveId);
        if (n) result.push({
            matiere:       ev.matiereNom || ev.matiere || ev.nomMatiere || 'Matière inconnue',
            note:          Number(n.note || n.valeur),
            professeurNom: ev.professeurNom || 'Inconnu',
            classeId:      ev.classeId || null,
        });
    }));
    return result;
}

// ─────────────────────────────────────────────────────────────
// NOTES — POUR UNE CLASSE ENTIÈRE
// ─────────────────────────────────────────────────────────────
async function getNotesClasse(db, classeId, userId) {
    const evals       = await getEvaluations(db, userId);
    const evalsClasse = evals.filter(ev => ev.classeId === classeId);
    const notesByEleve = {};

    await Promise.all(evalsClasse.map(async ev => {
        const matiere = ev.matiereNom || ev.matiere || ev.nomMatiere || 'Inconnue';
        const notes   = await getNotes(db, ev.id, userId);
        notes.forEach(n => {
            const val = Number(n.note || n.valeur);
            if (!n.eleveId || isNaN(val)) return;
            if (!notesByEleve[n.eleveId]) notesByEleve[n.eleveId] = [];
            notesByEleve[n.eleveId].push({ matiere, note: val, professeurNom: ev.professeurNom || 'Inconnu' });
        });
    }));

    return notesByEleve;
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRE — barre de progression ASCII
// ─────────────────────────────────────────────────────────────
function bar(value, max = 20, len = 20) {
    const filled = Math.round((value / max) * len);
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, len - filled));
}

// ─────────────────────────────────────────────────────────────
// HANDLER — BULLETIN SIMPLE D'UN ÉLÈVE
// ─────────────────────────────────────────────────────────────
async function handleBulletin(db, terme, userId, eleveForce = null) {
    const eleve = eleveForce || await (async () => {
        const list = await findEleves(db, terme, userId);
        if (list.length === 0) return null;
        if (list.length === 1) return list[0];
        // Homonymes — stocker et demander
        _sessions.set(userId, { waitingFor: 'eleve_choice', action: 'bulletin', homonymes: list });
        return 'disambig';
    })();

    if (!eleve)            return `😕 Élève "${terme}" introuvable.`;
    if (eleve === 'disambig') return await buildDisambigMsg(db, _sessions.get(userId).homonymes, userId);

    const notes = await getNotesEleve(db, eleve.id, userId);
    if (notes.length === 0)
        return `🎓 <strong>${eleve.prenom} ${eleve.nom}</strong>\n📭 Aucune note enregistrée.`;

    let total = 0, count = 0;
    const lignes = [];
    notes.forEach(({ matiere, note }) => {
        if (isNaN(note)) return;
        lignes.push(`- <strong>${matiere}</strong> : ${note}/20`);
        total += note; count++;
    });

    if (count === 0) return `🎓 <strong>${eleve.prenom} ${eleve.nom}</strong>\nAucune note valide trouvée.`;

    const moy = (total / count).toFixed(2);
    return `🎓 <strong>Bulletin de ${eleve.prenom} ${eleve.nom}</strong>\n\n`
        + lignes.join('\n')
        + `\n\n📊 <strong>Moyenne Générale : ${moy}/20</strong>`;
}

// ─────────────────────────────────────────────────────────────
// HANDLER — RAPPORT DÉTAILLÉ D'UN ÉLÈVE
// ─────────────────────────────────────────────────────────────
async function handleRapportEleve(db, terme, userId, eleveForce = null) {
    const eleve = eleveForce || await (async () => {
        const list = await findEleves(db, terme, userId);
        if (list.length === 0) return null;
        if (list.length === 1) return list[0];
        _sessions.set(userId, { waitingFor: 'eleve_choice', action: 'rapport', homonymes: list });
        return 'disambig';
    })();

    if (!eleve)            return `😕 Élève "${terme}" introuvable.`;
    if (eleve === 'disambig') return await buildDisambigMsg(db, _sessions.get(userId).homonymes, userId);

    const classes   = await getClasses(db, userId);
    const classe    = classes.find(c => c.id === eleve.classeId);
    const classeNom = classe ? (classe.nomClasse || classe.classeNom || 'Inconnue') : 'Inconnue';

    const notesRaw = await getNotesEleve(db, eleve.id, userId);
    if (notesRaw.length === 0)
        return `📋 <strong>${eleve.prenom} ${eleve.nom}</strong> (${classeNom})\n📭 Aucune note enregistrée.`;

    // Agrégation par matière
    const byMatiere = new Map();
    let totalGen = 0, nbGen = 0;
    notesRaw.forEach(({ matiere, note }) => {
        if (isNaN(note)) return;
        if (!byMatiere.has(matiere)) byMatiere.set(matiere, []);
        byMatiere.get(matiere).push(note);
        totalGen += note; nbGen++;
    });
    if (nbGen === 0) return `📋 <strong>${eleve.prenom} ${eleve.nom}</strong>\nAucune note valide.`;

    const moy = totalGen / nbGen;
    const profil = moy < 10 ? 'faible' : moy <= 12 ? 'moyen' : 'bon';

    const stats  = [], fortes = [], moyennes = [], faibles = [];
    for (const [matiere, notes] of byMatiere.entries()) {
        const m = notes.reduce((a, b) => a + b, 0) / notes.length;
        stats.push({ matiere, moyenne: m, nb: notes.length });
        if (m >= 13)      fortes.push({ matiere, moyenne: m });
        else if (m >= 10) moyennes.push({ matiere, moyenne: m });
        else              faibles.push({ matiere, moyenne: m });
    }

    // Intro aléatoire selon profil
    const intros = {
        faible:   [`${eleve.prenom} présente des résultats préoccupants avec ${moy.toFixed(2)}/20. `, `Avec ${moy.toFixed(2)}/20, ${eleve.prenom} se situe en dessous du seuil de réussite. `],
        moyen:    [`${eleve.prenom} obtient ${moy.toFixed(2)}/20, un niveau correct mais perfectible. `, `Les résultats de ${eleve.prenom} sont satisfaisants (${moy.toFixed(2)}/20) mais des progrès sont possibles. `],
        bon:      [`${eleve.prenom} se distingue avec une excellente moyenne de ${moy.toFixed(2)}/20. `, `Félicitations à ${eleve.prenom} pour sa moyenne de ${moy.toFixed(2)}/20. `],
    };
    const recos = {
        faible:   ['Soutien ciblé dans les matières sous la moyenne.', 'Tutorat par un pair ou un enseignant pour les notions fondamentales.', 'Entretien avec les parents pour définir un plan de remédiation.'],
        moyen:    ['Consolider les acquis par des exercices d\'approfondissement.', 'Encourager la participation orale pour gagner en confiance.', 'Fixer des objectifs progressifs dans les matières faibles.'],
        bon:      ['Proposer des projets avancés ou des défis académiques.', 'Préparer l\'élève à des concours ou options d\'excellence.', 'Approfondissement autonome dans les matières de prédilection.'],
    };
    const conclu = {
        faible: `La situation de ${eleve.prenom} nécessite une intervention rapide. Un accompagnement personnalisé et un dialogue avec la famille sont essentiels.`,
        moyen:  `${eleve.prenom} dispose d'une base solide. Avec plus d'investissement, le cap des 12 peut être dépassé.`,
        bon:    `Félicitations à ${eleve.prenom} pour ces excellents résultats. Il/elle est invité(e) à maintenir cette dynamique.`,
    };

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const maxLen = Math.max(...stats.map(s => s.matiere.length));

    let r = `📋 <strong>Rapport pédagogique – ${eleve.prenom} ${eleve.nom}</strong>\n`;
    r += `Classe : <strong>${classeNom}</strong>\n\n`;
    r += pick(intros[profil]);
    r += `Évalué(e) dans ${stats.length} matière(s). `;
    r += `Fortes (≥13) : ${fortes.length} · Moyennes (10-12) : ${moyennes.length} · Faibles (<10) : ${faibles.length}.\n\n`;

    r += `📚 <strong>Détail par matière</strong>\n`;
    stats.sort((a, b) => b.moyenne - a.moyenne).forEach(s => {
        r += `${s.matiere.padEnd(maxLen)} : ${bar(s.moyenne)} ${s.moyenne.toFixed(2)}/20 (${s.nb} note(s))\n`;
    });
    r += '\n';

    if (fortes.length > 0)  r += `✅ <strong>Points forts</strong> : ${fortes.map(f => `${f.matiere} (${f.moyenne.toFixed(2)})`).join(', ')}\n`;
    if (faibles.length > 0) r += `⚠️ <strong>Points faibles</strong> : ${faibles.map(f => `${f.matiere} (${f.moyenne.toFixed(2)})`).join(', ')}\n`;
    r += '\n';

    r += `🎯 <strong>Recommandations</strong> :\n`;
    [...recos[profil]].sort(() => Math.random() - 0.5).slice(0, 3).forEach(rec => r += `- ${rec}\n`);
    r += '\n';

    r += `📝 <strong>Conclusion</strong> : ${conclu[profil]}`;
    return r;
}

// ─────────────────────────────────────────────────────────────
// HANDLER — RAPPORT COMPLET D'UNE CLASSE
// ─────────────────────────────────────────────────────────────
async function handleRapportClasse(db, terme, userId) {
    const classes = await getClasses(db, userId);
    const classe  = classes.find(c => matches(c.nomClasse || c.classeNom || '', terme));
    if (!classe) return `😕 Classe "${terme}" introuvable. Vérifiez le nom.`;

    const { id: classeId, matieres: matieresInfo = [] } = classe;
    const classeNom = classe.nomClasse || classe.classeNom || terme;

    const eleves = await getElevesDeClasse(db, classeId, userId);
    if (eleves.length === 0)
        return `📚 Classe <strong>${classeNom}</strong>\nAucun élève inscrit.`;

    const notesByEleve = await getNotesClasse(db, classeId, userId);

    // Stats par élève
    const elevesStats = eleves.map(e => {
        const ns = (notesByEleve[e.id] || []).filter(n => !isNaN(n.note));
        const total = ns.reduce((s, n) => s + n.note, 0);
        return { id: e.id, prenom: e.prenom || '', nom: e.nom || '', notes: ns, moyenne: ns.length ? total / ns.length : 0, nb: ns.length };
    }).filter(e => e.nb > 0);

    if (elevesStats.length === 0)
        return `📚 Classe <strong>${classeNom}</strong>\nAucune note enregistrée.`;

    const moyClasse = elevesStats.reduce((s, e) => s + e.moyenne, 0) / elevesStats.length;
    const faible    = elevesStats.filter(e => e.moyenne < 10).length;
    const moyen     = elevesStats.filter(e => e.moyenne >= 10 && e.moyenne <= 12).length;
    const fort      = elevesStats.filter(e => e.moyenne > 12).length;
    const total     = elevesStats.length;

    const sorted  = [...elevesStats].sort((a, b) => b.moyenne - a.moyenne);
    const top3    = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3).reverse();

    // Stats par matière
    const matiereMap = new Map();
    elevesStats.forEach(e => e.notes.forEach(n => {
        if (!matiereMap.has(n.matiere)) {
            const info = matieresInfo.find(m => m.nom === n.matiere || m.matiereNom === n.matiere);
            matiereMap.set(n.matiere, { sum: 0, count: 0, prof: n.professeurNom || info?.professeurNom || 'Inconnu' });
        }
        const entry = matiereMap.get(n.matiere);
        entry.sum += n.note; entry.count++;
    }));

    const matiereStats = [];
    matiereMap.forEach((v, k) => {
        const m = v.sum / v.count;
        matiereStats.push({ matiere: k, moy: m, prof: v.prof, niveau: m < 10 ? 'Faible' : m <= 12 ? 'Suffisant' : 'Très bien' });
    });

    // Intros
    const intros = {
        critique:     [`Classe ${classeNom} : résultats préoccupants, moyenne ${moyClasse.toFixed(2)}/20. `, `Situation critique : seuls ${fort} élèves dépassent la moyenne sur ${total} évalués. `],
        intermediaire:[`Classe ${classeNom} : moyenne de ${moyClasse.toFixed(2)}/20, niveau correct mais perfectible. `, `Avec ${fort} élèves au-dessus de 12 et ${faible} en difficulté, une marge de progression existe. `],
        excellent:    [`Classe ${classeNom} : excellents résultats, moyenne ${moyClasse.toFixed(2)}/20. `, `${fort} élèves dépassent 12/20 — un travail de qualité remarquable. `],
    };
    const niveauCle = moyClasse < 10 ? 'critique' : moyClasse <= 12 ? 'intermediaire' : 'excellent';
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const maxM = matiereStats.length ? Math.max(...matiereStats.map(m => m.matiere.length)) : 0;
    const maxP = matiereStats.length ? Math.max(...matiereStats.map(m => m.prof.length)) : 0;

    let r = `📋 <strong>Rapport pédagogique – Classe ${classeNom}</strong>\n\n`;
    r += pick(intros[niveauCle]);
    r += `Sur ${eleves.length} élève(s), ${total} ont participé aux évaluations. `;
    r += `Répartition : ${faible} sous 10 · ${moyen} entre 10 et 12 · ${fort} au-delà de 12.\n\n`;

    r += `📊 <strong>Répartition visuelle</strong>\n`;
    r += `Faibles (<10)  : ${bar(faible, total)} ${faible}/${total}\n`;
    r += `Moyens (10-12) : ${bar(moyen,  total)} ${moyen}/${total}\n`;
    r += `Forts (>12)    : ${bar(fort,   total)} ${fort}/${total}\n\n`;

    if (top3.length)    r += `🏆 Meilleurs : ${top3.map(e    => `${e.prenom} ${e.nom} (${e.moyenne.toFixed(2)})`).join(', ')}\n`;
    if (bottom3.length) r += `🤝 À soutenir : ${bottom3.map(e => `${e.prenom} ${e.nom} (${e.moyenne.toFixed(2)})`).join(', ')}\n`;
    r += '\n';

    if (matiereStats.length > 0) {
        r += `📚 <strong>Par matière</strong>\n`;
        matiereStats.forEach(m => {
            r += `${m.matiere.padEnd(maxM)} (${m.prof.padEnd(maxP)}) : ${bar(m.moy)} ${m.moy.toFixed(2)}/20 – ${m.niveau}\n`;
        });
        r += '\n';
    }

    // Recommandations
    const recoCritique     = matiereStats.filter(m => m.niveau === 'Faible');
    const recoExcellent    = matiereStats.filter(m => m.niveau === 'Très bien');
    const recos            = [];
    if (recoCritique.length)  recos.push(`Remédiation prioritaire en ${recoCritique.map(m => m.matiere).join(', ')}.`);
    if (recoExcellent.length) recos.push(`Valoriser les résultats en ${recoExcellent.map(m => m.matiere).join(', ')}.`);
    if (faible > total * 0.3) recos.push('Plus de 30% d\'élèves en difficulté : réunion pédagogique recommandée.');
    else if (fort > total * 0.4) recos.push('Dynamique positive : envisager des projets interdisciplinaires.');
    else recos.push('Différencier les activités selon les profils d\'élèves.');

    r += `<strong>Recommandations</strong> : ${recos.join(' ')}\n\n`;

    r += `<strong>Conclusion</strong> : `;
    if (niveauCle === 'critique')     r += `Situation nécessitant une intervention immédiate. Remédiation et suivi individualisé indispensables.`;
    else if (niveauCle === 'intermediaire') r += `Résultats encourageants. Un accompagnement ciblé élèvera le niveau général.`;
    else r += `Résultats remarquables. Maintenez cette dynamique en encourageant l'excellence.`;

    return r;
}

// ─────────────────────────────────────────────────────────────
// HANDLER — BILAN D'UN PROFESSEUR
// ─────────────────────────────────────────────────────────────
async function handleProfesseur(db, terme, userId) {
    const prof = await findProfesseur(db, terme, userId);
    if (!prof) return `😕 Professeur "${terme}" introuvable.`;

    const evals     = await getEvaluations(db, userId);
    const profEvals = evals.filter(ev => ev.professeurId === prof.professeurId);
    if (profEvals.length === 0)
        return `👨‍🏫 Professeur <strong>${prof.professeurNom}</strong> : aucune évaluation enregistrée.`;

    // Moyennes par classe et matière
    const byClasse  = new Map();
    const byMatiere = new Map();
    let sumTotal = 0, countTotal = 0;

    await Promise.all(profEvals.map(async ev => {
        const notes   = await getNotes(db, ev.id, userId);
        const valides = notes.map(n => Number(n.note || n.valeur)).filter(v => !isNaN(v));
        if (!valides.length) return;

        const moy = valides.reduce((a, b) => a + b, 0) / valides.length;
        sumTotal += moy; countTotal++;

        const matiere = ev.matiereNom || ev.matiere || ev.nomMatiere || 'Inconnue';
        if (!byMatiere.has(matiere)) byMatiere.set(matiere, { sum: 0, count: 0 });
        byMatiere.get(matiere).sum += moy;
        byMatiere.get(matiere).count++;

        const classes = await getClasses(db, userId);
        const cl = classes.find(c => c.id === ev.classeId);
        const classeNom = cl ? (cl.nomClasse || cl.classeNom || 'Inconnue') : 'Inconnue';
        if (!byClasse.has(classeNom)) byClasse.set(classeNom, { sum: 0, count: 0 });
        byClasse.get(classeNom).sum += moy;
        byClasse.get(classeNom).count++;
    }));

    if (countTotal === 0) return `👨‍🏫 Professeur <strong>${prof.professeurNom}</strong> : aucune note valide.`;

    const moyGlobale = sumTotal / countTotal;
    const statut     = moyGlobale >= 14 ? '📈 Performant' : moyGlobale >= 10 ? '📊 En développement' : '📉 À accompagner';

    let r = `👨‍🏫 <strong>Bilan – ${prof.professeurNom}</strong>\n\n`;
    r += `Moyenne globale : <strong>${moyGlobale.toFixed(2)}/20</strong>  ${statut}\n`;
    r += `Évaluations : ${profEvals.length}\n\n`;

    if (byMatiere.size > 0) {
        r += `📚 <strong>Par matière</strong>\n`;
        byMatiere.forEach((v, k) => {
            const m = v.sum / v.count;
            r += `- ${k} : ${bar(m)} ${m.toFixed(2)}/20\n`;
        });
        r += '\n';
    }

    if (byClasse.size > 0) {
        r += `🏫 <strong>Par classe</strong>\n`;
        byClasse.forEach((v, k) => {
            const m = v.sum / v.count;
            r += `- ${k} : ${bar(m)} ${m.toFixed(2)}/20\n`;
        });
    }

    return r;
}

// ─────────────────────────────────────────────────────────────
// AIDE
// ─────────────────────────────────────────────────────────────
const AIDE = `📖 <strong>Commandes disponibles</strong>

<strong>Élève</strong>
- <code>eleve [nom]</code> — bulletin de notes
- <code>rapport eleve [nom]</code> — rapport pédagogique détaillé

<strong>Classe</strong>
- <code>rapport classe [nom]</code> — rapport complet d'une classe

<strong>Professeur</strong>
- <code>professeur [nom]</code> — bilan d'un professeur

<strong>Fonctionnalités avancées (IA)</strong>
- <code>recommandations</code> — analyse IA de tous les professeurs
- <code>evolution classe [nom]</code> — courbe de progression d'une classe
- <code>evolution eleve [nom]</code> — courbe de progression d'un élève
- <code>evolution prof [nom]</code> — courbe de progression d'un professeur`;

// ─────────────────────────────────────────────────────────────
// PATTERNS DE ROUTING
// ─────────────────────────────────────────────────────────────
const PATTERNS = [
    {
        re: /(?:rapport|bilan|résultats?|performances?)\s+(?:de\s+)?(?:la\s+)?classe\s+(?:de\s+)?(.*)/i,
        fn: (m, db, uid) => handleRapportClasse(db, m[1].trim(), uid),
    },
    {
        re: /(?:rapport|bilan|suivi|performances?)\s+(?:de\s+)?(?:l'?)?(?:élève|eleve|etudiant)s?\s+(?:de\s+)?(.*)/i,
        fn: (m, db, uid) => handleRapportEleve(db, m[1].trim(), uid),
    },
    {
        re: /(?:notes?|résultats?|bulletin|eleve)\s+(?:de\s+)?(.*)/i,
        fn: (m, db, uid) => handleBulletin(db, m[1].trim(), uid),
    },
    {
        re: /professeur\s+(.*)/i,
        fn: (m, db, uid) => handleProfesseur(db, m[1].trim(), uid),
    },
];

// ─────────────────────────────────────────────────────────────
// EXPORT — FONCTION PRINCIPALE
// ─────────────────────────────────────────────────────────────
export default async function assistant(message, userId, db) {
    const msg = message.trim();
    if (!userId) return '❌ Utilisateur non identifié. Veuillez vous reconnecter.';
    if (!db)     return '❌ Base de données non disponible. Veuillez recharger la page.';

    // Aide
    if (norm(msg) === 'aide' || msg === '/aide') return AIDE;

    // Annulation de session
    if (['annuler', 'cancel', 'quitter'].includes(norm(msg))) {
        _sessions.delete(userId);
        return '❌ Annulé. Tapez <code>aide</code> pour les commandes.';
    }

    // Routing direct par patterns
    for (const p of PATTERNS) {
        const m = msg.match(p.re);
        if (m && m[1]?.trim()) {
            _sessions.delete(userId);
            try { return await p.fn(m, db, userId); }
            catch (err) { console.error(err); return '❌ Une erreur est survenue.'; }
        }
    }

    // Menu interactif — session en cours
    const session = _sessions.get(userId);

    // Disambiguation homonymes
    if (session?.waitingFor === 'eleve_choice') {
        const idx = parseInt(msg, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= session.homonymes.length)
            return `❌ Tapez un numéro entre 1 et ${session.homonymes.length} (ou "annuler").`;
        const eleveChoisi = session.homonymes[idx];
        const action      = session.action;
        _sessions.delete(userId);
        try {
            if (action === 'bulletin') return await handleBulletin(db, '', userId, eleveChoisi);
            if (action === 'rapport')  return await handleRapportEleve(db, '', userId, eleveChoisi);
        } catch (err) { console.error(err); return '❌ Une erreur est survenue.'; }
    }

    if (session?.waitingFor === 'name') {
        _sessions.delete(userId);
        try {
            switch (session.choice) {
                case 1: return await handleBulletin(db, msg, userId);
                case 2: return await handleProfesseur(db, msg, userId);
                case 3: return await handleRapportClasse(db, msg, userId);
                case 4: return await handleRapportEleve(db, msg, userId);
            }
        } catch (err) { console.error(err); return '❌ Une erreur est survenue.'; }
    }

    if (session?.waitingFor === 'choice') {
        const choice = parseInt(msg, 10);
        if (isNaN(choice) || choice < 1 || choice > 4)
            return '❌ Tapez 1, 2, 3 ou 4 (ou "annuler").';
        _sessions.set(userId, { waitingFor: 'name', choice });
        return `📝 ${['Nom de l\'élève :', 'Nom du professeur :', 'Nom de la classe :', 'Nom de l\'élève :'][choice - 1]}`;
    }

    // Nouveau menu
    _sessions.set(userId, { waitingFor: 'choice' });
    return `❓ Commande non reconnue. Choisissez :

1️⃣ Bulletin de notes d'un élève
2️⃣ Bilan d'un professeur
3️⃣ Rapport d'une classe
4️⃣ Rapport pédagogique d'un élève

Tapez 1, 2, 3 ou 4 — ou <code>aide</code> pour toutes les commandes.`;
}
