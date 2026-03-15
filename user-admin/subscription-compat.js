/**
 * subscription-compat.js — EduMetrics
 * Version COMPAT — pour les pages Firebase compat (bulletin.html)
 * Usage : <script src="subscription-compat.js"></script> avant </body>
 * Nécessite firebase-app-compat, firebase-firestore-compat, firebase-auth-compat chargés avant.
 */

(function () {
    const RENEWAL_PAGE      = "abonnement.html";
    const GRACE_PERIOD_DAYS = 3;

    const firebaseConfig = {
        apiKey: "AIzaSyD7B-0O9mOdbIDQV-g6hsZx07G2ZvzKoxo",
        authDomain: "real-educsen.firebaseapp.com",
        projectId: "real-educsen",
        storageBucket: "real-educsen.firebasestorage.app",
        messagingSenderId: "80660233362",
        appId: "1:80660233362:web:5edf5060254170056eba4b"
    };

    // Réutilise l'instance existante si déjà initialisée
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const auth = firebase.auth();
    const db   = firebase.firestore();

    auth.onAuthStateChanged(async function (user) {

        if (!user) {
            window.location.href = "connexion.html";
            return;
        }

        try {
            const snap = await db.collection("abonnements").doc(user.uid).get();

            if (!snap.exists) {
                console.warn("[Subscription] Aucun abonnement pour", user.uid);
                return redirectToRenewal("inexistant");
            }

            const data            = snap.data();
            const statut          = data.statut;
            const dateExpiration  = data.dateExpiration ? data.dateExpiration.toDate() : null;

            if (statut === "suspendu") {
                return redirectToRenewal("suspendu");
            }

            if (!dateExpiration) {
                return redirectToRenewal("inexistant");
            }

            const now       = new Date();
            const graceDate = new Date(dateExpiration);
            graceDate.setDate(graceDate.getDate() + GRACE_PERIOD_DAYS);

            if (now > graceDate) {
                return redirectToRenewal("expire");
            }

            if (now > dateExpiration && now <= graceDate) {
                var joursRestants = Math.ceil((graceDate - now) / (1000 * 60 * 60 * 24));
                showBanner(joursRestants, dateExpiration);
            }

            // ✅ Abonnement valide

        } catch (err) {
            console.error("[Subscription] Erreur:", err);
            // Fail-open : en cas d'erreur réseau on laisse passer
        }
    });

    function redirectToRenewal(raison) {
        var params = new URLSearchParams({ raison: raison, redirect: window.location.pathname });
        window.location.href = RENEWAL_PAGE + "?" + params.toString();
    }

    function showBanner(joursRestants, dateExpiration) {
        var dateStr = dateExpiration.toLocaleDateString("fr-FR");
        var banner  = document.createElement("div");
        banner.id   = "subscription-banner";
        banner.innerHTML =
            '<span>⚠️ Votre abonnement a expiré le ' + dateStr + '. ' +
            'Il vous reste <strong>' + joursRestants + ' jour(s)</strong> pour renouveler.</span>' +
            '<a href="' + RENEWAL_PAGE + '" style="color:#fff;font-weight:600;text-decoration:underline;margin-left:16px;">' +
                'Renouveler maintenant →' +
            '</a>' +
            '<button onclick="this.parentElement.remove()" ' +
                'style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;margin-left:12px;">✕</button>';

        banner.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99999;' +
            'background:linear-gradient(90deg,#f59e0b,#ef4444);color:white;' +
            'padding:12px 24px;display:flex;align-items:center;justify-content:center;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'font-size:0.875rem;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

        document.body.prepend(banner);
    }

})();
