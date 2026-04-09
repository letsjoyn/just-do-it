import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB6BZ3TixkZunTAchX3EkWlEW-F-QRDXZY",
  authDomain: "just-do-it-1fa38.firebaseapp.com",
  projectId: "just-do-it-1fa38",
  storageBucket: "just-do-it-1fa38.firebasestorage.app",
  messagingSenderId: "852059679160",
  appId: "1:852059679160:web:e964ac96253e7a4b05074d",
  measurementId: "G-L6QN4NZGZV"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let allSessions = [];
let filteredDate = null; // for heatmap filtering

document.addEventListener("DOMContentLoaded", () => {
    const loginContainer = document.getElementById('login-container');
    const dashContainer = document.getElementById('dashboard-container');
    const siteFooter = document.getElementById('site-footer');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const clearFilterBtn = document.getElementById('clear-filter');

    onAuthStateChanged(auth, (user) => {
        const shiaMeme = document.getElementById('shia-meme');
        if (user) {
            currentUser = user;
            loginContainer.style.display = 'none';
            dashContainer.style.display = 'flex';
            logoutBtn.style.display = 'block';
            if (shiaMeme) shiaMeme.style.display = 'none';
            if (siteFooter) siteFooter.style.display = 'none';
            loadData(currentUser.uid);
        } else {
            currentUser = null;
            loginContainer.style.display = 'block';
            dashContainer.style.display = 'none';
            if (shiaMeme) shiaMeme.style.display = 'block';
            if (siteFooter) siteFooter.style.display = 'flex';
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            loginError.style.display = 'block';
            loginError.textContent = "AUTH FAILED: " + err.message;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        allSessions = [];
        renderDashboard();
    });

    clearFilterBtn.addEventListener('click', () => {
        filteredDate = null;
        document.getElementById('filter-info').style.display = 'none';
        document.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('selected'));
        renderDashboard();
    });
});

async function loadData(userId) {
    const errorEl = document.getElementById('error-msg');
    const statusEl = document.getElementById('status-msg');
    
    statusEl.style.display = 'block';
    statusEl.textContent = 'FETCHING FIREBASE DATA...';
    errorEl.style.display = 'none';

    try {
        const sessionsRef = collection(db, "users", userId, "sessions");
        const q = query(sessionsRef, orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        
        allSessions = [];
        querySnapshot.forEach((doc) => {
            allSessions.push(doc.data());
        });

        allSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        statusEl.style.display = 'none';
        renderDashboard();

    } catch (err) {
        statusEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = "DB ERROR: " + err.message;
    }
}

function formatDuration(seconds) {
    if (!seconds) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    let parts = [];
    if (h > 0) parts.push(h + "h");
    if (m > 0 || (h > 0 && s > 0)) parts.push(m + "m");
    if (s > 0) parts.push(s + "s");
    
    return parts.join(" ") || "0s";
}

function renderDashboard() {
    const tableBody = document.getElementById('session-table-body');
    const totalSessionsEl = document.getElementById('total-sessions');
    const totalDurationEl = document.getElementById('total-duration');
    
    // Calculate KPIs (global, not filtered)
    let totalSecs = 0;
    allSessions.forEach(s => {
        totalSecs += (s.duration_seconds || (s.minutes ? s.minutes * 60 : 0));
    });
    
    totalSessionsEl.textContent = allSessions.length;
    totalDurationEl.textContent = formatDuration(totalSecs);

    drawHeatmap();

    // Render Table (filtered)
    let sessionsToRender = allSessions;
    if (filteredDate) {
        sessionsToRender = allSessions.filter(s => {
            const d = new Date(s.date);
            const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return dStr === filteredDate;
        });
    }

    tableBody.innerHTML = '';
    if (sessionsToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;font-style:italic;">No records found.</td></tr>';
    } else {
        sessionsToRender.forEach(session => {
            const d = new Date(session.date);
            const isValidDate = !Number.isNaN(d.getTime());
            const dateStr = isValidDate
                ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                : 'Unknown date';
            
            const secs = session.duration_seconds || (session.minutes ? session.minutes * 60 : 0);
            const durStr = formatDuration(secs);
            
            const method = session.unlock_method || 'math';
            
            let early = session.early_terminated ? "Yes" : "No";
            let earlyBadge = early === "Yes" ? '<span class="badge yes">Yes</span>' : '<span class="badge no">No</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: bold; color: #333;">${dateStr}</td>
                <td style="font-family: monospace; font-size: 1.1rem; color: #000;">${durStr}</td>
                <td><span class="badge" style="background:#f0f0f0; border: 1px solid #ccc; color:#000;">${method}</span></td>
                <td>${earlyBadge}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

function drawHeatmap() {
    const heatmapEl = document.getElementById('heatmap');
    document.getElementById('heatmap-wrapper').style.display = 'flex';
    heatmapEl.innerHTML = '';

    const dailySecs = {};
    allSessions.forEach(s => {
        if (!s.date) return;
        const d = new Date(s.date);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const secs = s.duration_seconds || (s.minutes ? s.minutes * 60 : 0);
        dailySecs[k] = (dailySecs[k] || 0) + secs;
    });

    // Calculate start date to align with Sunday so rows match M, W, F grid
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const weeksToShow = 24;
    const daysToLookBack = (weeksToShow - 1) * 7 + end.getDay();
    
    let days = [];
    for (let i = daysToLookBack; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
        days.push({
            dateObj: d,
            dateStr: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        });
    }

    const monthsLabelEl = document.getElementById('months-label');
    if (monthsLabelEl) {
        monthsLabelEl.innerHTML = '';
        let lastMonth = -1;
        days.forEach((day, index) => {
            // First day of column is Sunday (index % 7 === 0)
            if (index % 7 === 0 && day.dateObj.getDate() <= 7 && day.dateObj.getMonth() !== lastMonth) {
                lastMonth = day.dateObj.getMonth();
                const colIndex = Math.floor(index / 7);
                const monthSpan = document.createElement('div');
                monthSpan.style.position = 'absolute';
                monthSpan.style.left = `${colIndex * 17}px`;
                monthSpan.textContent = day.dateObj.toLocaleString('en-US', { month: 'short' });
                monthsLabelEl.appendChild(monthSpan);
            }
        });
    }

    days.forEach(dayInfo => {
        const dayStr = dayInfo.dateStr;
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        
        let val = dailySecs[dayStr] || 0;
        let cClass = 'color-0';
        if (val > 0) {
            if (val <= 1800) cClass = 'color-1'; // <= 30m
            else if (val <= 3600) cClass = 'color-2'; // <= 1h
            else if (val <= 7200) cClass = 'color-3'; // <= 2h
            else if (val <= 14400) cClass = 'color-4'; // <= 4h
            else cClass = 'color-5'; // > 4h
        }
        
        cell.classList.add(cClass);
        if (dayStr === filteredDate) cell.classList.add('selected');
        
        let durLabel = formatDuration(val);
        cell.title = `${dayStr}: ${durLabel}`;

        cell.addEventListener('click', () => {
            if (filteredDate === dayStr) {
                // toggle off
                filteredDate = null;
                document.getElementById('filter-info').style.display = 'none';
            } else {
                filteredDate = dayStr;
                document.getElementById('filter-info').style.display = 'flex';
                document.getElementById('filter-text').textContent = `Filtered focus sessions for ${dayStr}`;
            }
            renderDashboard();
        });

        heatmapEl.appendChild(cell);
    });
}
