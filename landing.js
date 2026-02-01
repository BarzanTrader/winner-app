(function () {
    "use strict";

    const firebaseConfig = {
        apiKey: "AIzaSyCetUZwLUa8bxN1tl9MqyryPlYeD-Y59fQ",
        authDomain: "winner-app-1bd1c.firebaseapp.com",
        projectId: "winner-app-1bd1c",
        storageBucket: "winner-app-1bd1c.firebasestorage.app",
        messagingSenderId: "989056268967",
        appId: "1:989056268967:web:295ca8bfd1c885ae8cb982"
    };

    let db = null;

    function initFirebase() {
        if (typeof firebase === "undefined") {
            console.warn("Firebase SDK not loaded");
            return false;
        }
        try {
            try {
                firebase.app();
            } catch (e) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            return db && typeof db.collection === "function";
        } catch (err) {
            console.error("Firebase init error:", err);
            return false;
        }
    }

    async function saveToWaitlist(email) {
        if (!db || typeof db.collection !== "function") {
            throw new Error("Firestore not available");
        }
        await db.collection("waitlist").add({
            email: email.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            source: "landing page"
        });
    }

    function showMessage(el, text, type) {
        if (!el) return;
        el.textContent = text;
        el.className = "landing-msg " + (type || "");
    }

    function init() {
        initFirebase();

        var form = document.getElementById("waitlistForm");
        var emailInput = document.getElementById("waitlistEmail");
        var msgEl = document.getElementById("waitlistMsg");
        var btn = document.getElementById("joinBtn");

        if (!form || !emailInput || !msgEl) return;

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            var email = emailInput.value.trim();
            if (!email) return;

            if (btn) {
                btn.disabled = true;
            }
            showMessage(msgEl, "", "");

            try {
                await saveToWaitlist(email);
                showMessage(msgEl, "You're on the list. We'll be in touch.", "success");
                emailInput.value = "";
            } catch (err) {
                console.error("Waitlist error:", err);
                showMessage(msgEl, "Something went wrong. Please try again.", "error");
            } finally {
                if (btn) {
                    btn.disabled = false;
                }
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
