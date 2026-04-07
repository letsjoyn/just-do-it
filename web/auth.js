import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

window.firebaseDb = getFirestore(app);
window.dbCollection = collection;
window.dbDoc = doc;
window.dbSetDoc = setDoc;
window.dbQuery = query;
window.dbOrderBy = orderBy;
window.dbGetDocs = getDocs;

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("auth-overlay");
    const appContainer = document.getElementById("app-container");
    const emailIn = document.getElementById("auth-email");
    const passIn = document.getElementById("auth-pass");
    const errObj = document.getElementById("auth-error");

    document.getElementById("btn-login").addEventListener("click", () => {
        errObj.textContent = "Logging in...";
        signInWithEmailAndPassword(auth, emailIn.value, passIn.value)
            .then(() => { errObj.textContent = ""; })
            .catch(err => { errObj.textContent = err.message; });
    });

    document.getElementById("btn-signup").addEventListener("click", () => {
        errObj.textContent = "Signing up...";
        createUserWithEmailAndPassword(auth, emailIn.value, passIn.value)
            .then(() => { errObj.textContent = ""; })
            .catch(err => { errObj.textContent = err.message; });
    });

    onAuthStateChanged(auth, user => {
        const loader = document.getElementById("boot-loader");
        if (loader) loader.style.display = "none";

        if (user) {
            overlay.style.display = "none";
            appContainer.style.display = "flex"; // Assuming Flex layout
            appContainer.classList.add("dashboard-wrapper");
            window.currentUser = user;
            // Dispatch event for dashboard to load data
            window.dispatchEvent(new Event('auth-ready'));
        } else {
            overlay.style.display = "flex";
            appContainer.style.display = "none";
            appContainer.classList.remove("dashboard-wrapper");
            window.currentUser = null;
        }
    });

    window.logoutFirebaseUser = () => auth.signOut();
});
