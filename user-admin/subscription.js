/**
 * subscription.js — EduMetrics / Educsen
 * ----------------------------------------
 * À inclure dans TOUTES les pages protégées (bulletin, classes, notes, etc.)
 * AVANT le script principal de la page.
 *
 * Usage dans chaque page HTML :
 *   <script type="module">
 *     import { checkSubscription } from './subscription.js';
 *     await checkSubscription();
 *     // ... reste du code de la page
 *   </script>
 *
 * Structure Firestore attendue :
 *   Collection : "abonnements"
 *   Document   : uid de l'utilisateur
 *   Champs     :
 *     - dateExpiration  : Timestamp Firestore
 *     - statut          : "actif" | "expire" | "suspendu"
 *     - ecole           : string (nom de l'école)
 *     - plan            : "mensuel" | "annuel"
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ─── CONFIG FIREBASE (identique à tes autres pages) ───────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyD7B-0O9mOdbIDQV-g6hsZx07G2ZvzKoxo",
    authDomain: "real-educsen.firebaseapp.com",
    projectId: "real-educsen",
    storageBucket: "real-educsen.firebasestorage.app",
    messagingSenderId: "80660233362",
    appId: "1:80660233362:web:5edf5060254170056eba4b"
};

// Évite de ré-initialiser Firebase si déjà fait
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// ─── JOURS DE GRÂCE avant redirection (0 = immédiat) ─────────────────────────
const GRACE_PERIOD_DAYS = 0;

// ─── PAGE DE RENOUVELLEMENT ───────────────────────────────────────────────────
const RENEWAL_PAGE = "abonnement.html";

/**
 * Vérifie l'abonnement de l'utilisateur connecté.
 * Redirige vers abonnement.html si expiré ou absent.
 * @returns {Promise<boolean>} true si abonnement valide
 */
export async function checkSubscription() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            // Non connecté → redirection connexion
            if (!user) {
                window.location.href = "connexion.html";
                return;
            }

            try {
                const abonnementRef = doc(db, "abonnements", user.uid);
                const abonnementSnap = await getDoc(abonnementRef);

                // Aucun document d'abonnement trouvé
                if (!abonnementSnap.exists()) {
                    console.warn("[Subscription] Aucun abonnement trouvé pour", user.uid);
                    redirectToRenewal("inexistant");
                    return;
                }

                const data = abonnementSnap.data();
                const statut = data.statut;
                const dateExpiration = data.dateExpiration?.toDate?.() || null;

                // Abonnement suspendu manuellement
                if (statut === "suspendu") {
                    redirectToRenewal("suspendu");
                    return;
                }

                // Vérification de la date
                if (!dateExpiration) {
                    redirectToRenewal("inexistant");
                    return;
                }

                const now = new Date();
                const graceDate = new Date(dateExpiration);
                graceDate.setDate(graceDate.getDate() + GRACE_PERIOD_DAYS);

                if (now > graceDate) {
                    // Expiré même avec la période de grâce
                    redirectToRenewal("expire");
                    return;
                }

                if (now > dateExpiration && now <= graceDate) {
                    // Dans la période de grâce — affiche une bannière d'avertissement
                    const joursRestants = Math.ceil((graceDate - now) / (1000 * 60 * 60 * 24));
                    showExpirationBanner(joursRestants, dateExpiration);
                }

                // ✅ Abonnement valide
                resolve(true);

            } catch (error) {
                console.error("[Subscription] Erreur Firestore:", error);
                // En cas d'erreur réseau, on laisse passer (fail-open)
                resolve(true);
            }
        });
    });
}

/**
 * Redirige vers la page de renouvellement avec la raison en paramètre URL
 */
function redirectToRenewal(raison) {
    const params = new URLSearchParams({ raison, redirect: window.location.pathname });
    window.location.href = `${RENEWAL_PAGE}?${params.toString()}`;
}

/**
 * Affiche une bannière en haut de page pendant la période de grâce
 */
function showExpirationBanner(joursRestants, dateExpiration) {
    // Attend que le DOM soit prêt
    const inject = () => {
        if (document.body) {
            const banner = document.createElement("div");
            banner.id = "subscription-banner";
            banner.innerHTML = `
                <span>⚠️ Votre abonnement a expiré le ${dateExpiration.toLocaleDateString("fr-FR")}. 
                Il vous reste <strong>${joursRestants} jour(s)</strong> pour renouveler.</span>
                <a href="${RENEWAL_PAGE}" style="color:#fff;font-weight:600;text-decoration:underline;margin-left:16px;">
                    Renouveler maintenant →
                </a>
                <button onclick="this.parentElement.remove()" 
                    style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;margin-left:12px;">✕</button>
            `;
            banner.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0;
                z-index: 99999;
                background: linear-gradient(90deg, #f59e0b, #ef4444);
                color: white;
                padding: 12px 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 0.875rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            document.body.prepend(banner);

            // Décale le contenu principal pour ne pas le masquer
            const main = document.querySelector("main") || document.querySelector(".main-content");
            if (main) main.style.paddingTop = `calc(${main.style.paddingTop || "0px"} + 48px)`;
        } else {
            setTimeout(inject, 50);
        }
    };
    inject();
}

/**
 * Utilitaire : récupère les infos d'abonnement de l'utilisateur courant
 * Peut être utilisé dans les pages pour afficher les infos d'abonnement
 */
export async function getSubscriptionInfo(uid) {
    try {
        const snap = await getDoc(doc(db, "abonnements", uid));
        return snap.exists() ? snap.data() : null;
    } catch {
        return null;
    }
}
