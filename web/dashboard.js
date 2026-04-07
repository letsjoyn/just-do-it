/* ══════════════════════════════════════════════════════════════
   JUST DO IT  —  Industry-Grade Focus Dashboard
   Canvas charts · Heatmap · Sparklines · Tables · Export
   ══════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  // ═══ CONFIG ═══
  const COLORS = {
    blue: "#387ED1", blueLt: "#5A9AE6", blueBg: "rgba(56,126,209,.15)",
    green: "#0CB95A", red: "#E5534B", amber: "#E8A735",
    purple: "#8B6CE7", cyan: "#29B6F6",
    grid: "#1E1E2A", gridLt: "#2A2A3A",
    txt2: "#8585A0", txt3: "#50506A", txt4: "#35354A",
    bg3: "#1A1A24",
  };
  const PAGE_SIZE = 12;
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ═══ STATE ═══
  let sessions = [];
  let plannerBlocks = [];
  let activeSection = "overview";
  let timelineRange = 7;
  let sortField = "date", sortDir = -1;
  let currentPage = 1;
  let tooltip = null;
  let refreshTimer = null;

  const $ = id => document.getElementById(id);

  // ═══ INIT ═══
  createTooltip();
  setHeaderDate();
  bindNavigation();
  bindEvents();

  const startDashboardLiveRefresh = () => {
    loadAndRender();
    loadPlanner();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadAndRender, 60000);

    const today = new Date().toISOString().slice(0, 10);
    const pd = $("planner-date");
    if (pd) {
      pd.value = today;
      pd.addEventListener("change", loadPlanner);
    }
  };

  window.addEventListener("auth-ready", startDashboardLiveRefresh);
  if (window.currentUser) startDashboardLiveRefresh();

  // ═══ DATA ═══
  const loadAndRender = window.loadAndRender = async function loadAndRender() {
    if (!window.currentUser) return;
    try {
      // Use raw fetch to avoid complex Firebase v9 imports in auth.js just for getting docs
      const projectId = "just-do-it-1fa38"; // Hardcoded config for raw fetches
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${window.currentUser.uid}/sessions`;

      // Need the Firebase Auth token to access the protected database
      const token = await window.currentUser.getIdToken();

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        const items = json.documents || [];

        const data = [];
        items.forEach(doc => {
          // Parse Firestore Document format
          const fields = doc.fields;
          if (!fields) return;

          let item = {
            date: fields.date?.stringValue || fields.date?.timestampValue || new Date().toISOString(),
            minutes: parseInt(fields.minutes?.integerValue || "0"),
            unlock_method: fields.unlock_method?.stringValue || "Unknown",
            blocked_items: fields.blocked_items?.arrayValue?.values?.map(v => v.stringValue) || [],
          };

          if (fields.screen_time?.mapValue?.fields) {
            item.screen_time = {};
            Object.entries(fields.screen_time.mapValue.fields).forEach(([k, v]) => {
              item.screen_time[k] = parseInt(v.integerValue || "0");
            });
          }

          data.push(item);
        });

        // Sort by date desc manually since we are using raw fetch without queries
        data.sort((a, b) => new Date(b.date) - new Date(a.date));
        sessions = data;
        if (!sessions.length) {
          await loadLocalArchive();
        }
      } else {
        await loadLocalArchive();
      }
    } catch (err) {
      console.error("Failed to load sessions from Firebase:", err);
      await loadLocalArchive();
    }
    render();
  }

  async function loadLocalArchive() {
    try {
      const sources = ["/local_sessions.json", "/sync_payload.json"];
      for (const source of sources) {
        const res = await fetch(source);
        if (!res.ok) continue;
        const localData = await res.json();
        if (Array.isArray(localData) && localData.length) {
          sessions = localData;
          return;
        }
      }
      sessions = [];
    } catch {
      sessions = [];
    }
  }

  loadLocalArchive().then(render);

  // ═══ PLANNER DATA ═══
  // Load Planner handled by fetch lower down

  function render() {
    renderKPIs();
    renderTimeline();
    renderHeatmap();
    renderDonut();
    renderTopApps();
    renderRecentTable();
    renderAllTable();
    renderScreenTimePage();
  }

  // ═══ NAVIGATION ═══
  function bindNavigation() {
    document.querySelectorAll(".sb-link[data-section]").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const sec = link.dataset.section;
        setSection(sec);
      });
    });
    $("link-all-sessions").addEventListener("click", e => { e.preventDefault(); setSection("sessions"); });
  }

  function setSection(name) {
    activeSection = name;
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".sb-link[data-section]").forEach(l => l.classList.remove("active"));
    $("sec-" + name).classList.add("active");
    const navEl = document.querySelector(`.sb-link[data-section="${name}"]`);
    if (navEl) navEl.classList.add("active");
    const titles = { overview: "Overview", planner: "Daily Planner", sessions: "Sessions", screentime: "Screen Time" };
    $("page-title").textContent = titles[name] || "Overview";
  }

  function bindEvents() {
    // Range tabs
    document.querySelectorAll(".rt").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".rt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        timelineRange = parseInt(btn.dataset.range);
        renderTimeline();
      });
    });

    // Refresh
    $("btn-refresh").addEventListener("click", loadAndRender);

    // Export
    $("btn-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `focus_sessions_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });

    // Sidebar Logout
    const btnLogoutSidebar = $("btn-logout-sidebar");
    if (btnLogoutSidebar) {
      btnLogoutSidebar.addEventListener("click", window.logoutFirebaseUser);
    }

    // Search
    const ss = $("session-search");
    if (ss) ss.addEventListener("input", () => { currentPage = 1; renderAllTable(); });

    // Sort
    document.querySelectorAll(".sortable").forEach(th => {
      th.addEventListener("click", () => {
        const f = th.dataset.sort;
        if (sortField === f) sortDir *= -1;
        else { sortField = f; sortDir = -1; }
        renderAllTable();
      });
    });

    // Planner Add
    const btnAdd = $("btn-add-block");
    if (btnAdd) {
      btnAdd.addEventListener("click", () => {
        plannerBlocks.push({ time: "09:00", title: "Deep Work", len: 45 });
        savePlannerLocal();
        renderPlanner();
      });
    }
  }

  function setHeaderDate() {
    const now = new Date();
    $("hdr-date").textContent = now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  // ═══ KPIs ═══
  function renderKPIs() {
    const totalMins = sessions.reduce((s, x) => s + (x.minutes || 0), 0);
    const count = sessions.length;
    const avg = count ? Math.round(totalMins / count) : 0;
    const streak = calcStreak();

    // Score: based on streak, consistency, total
    const score = Math.min(100, Math.round(
      (Math.min(streak, 7) / 7) * 40 +
      (Math.min(count, 30) / 30) * 30 +
      (Math.min(totalMins, 600) / 600) * 30
    ));

    $("val-total").innerHTML = totalMins + "<small>min</small>";
    $("val-sessions").textContent = count;
    $("val-streak").innerHTML = streak + "<small>days</small>";
    $("val-avg").innerHTML = avg + "<small>min</small>";
    $("val-score").textContent = score;

    // Score ring
    const circ = 2 * Math.PI * 20; // r=20
    $("score-ring-fg").style.strokeDashoffset = circ * (1 - score / 100);

    // Trends (compare last 7d vs previous 7d)
    setTrend("trend-total", sumLastN(7), sumLastN(14) - sumLastN(7));
    setTrend("trend-sessions", countLastN(7), countLastN(14) - countLastN(7));
    setTrend("trend-avg", avgLastN(7), avgLastN(14, 7));

    // Sparklines
    drawSparkline("spark-total", dailyMins(14));
    drawSparkline("spark-sessions", dailyCounts(14));
    drawSparkline("spark-avg", dailyAvg(14));

    // Streak dots (last 7 days)
    renderStreakDots();
  }

  function calcStreak() {
    if (!sessions.length) return 0;
    const dates = [...new Set(sessions.map(s => s.date.slice(0, 10)))].sort().reverse();
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < dates.length; i++) {
      const d = new Date(dates[i]); d.setHours(0, 0, 0, 0);
      const exp = new Date(today); exp.setDate(exp.getDate() - i);
      if (d.getTime() === exp.getTime()) streak++; else break;
    }
    return streak;
  }

  function renderStreakDots() {
    const el = $("streak-dots");
    el.innerHTML = "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dates = new Set(sessions.map(s => s.date.slice(0, 10)));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dot = document.createElement("span");
      dot.className = "sd" + (dates.has(key) ? " on" : "");
      dot.title = DAY[d.getDay()] + (dates.has(key) ? " ✓" : "");
      el.appendChild(dot);
    }
  }

  // ═══ TRENDS ═══
  function sumLastN(days) {
    const cutoff = daysAgo(days);
    return sessions.filter(s => new Date(s.date) >= cutoff).reduce((a, s) => a + (s.minutes || 0), 0);
  }
  function countLastN(days) {
    const cutoff = daysAgo(days);
    return sessions.filter(s => new Date(s.date) >= cutoff).length;
  }
  function avgLastN(days, offset = 0) {
    const start = daysAgo(days + offset), end = daysAgo(offset);
    const sub = sessions.filter(s => { const d = new Date(s.date); return d >= start && d < end; });
    return sub.length ? Math.round(sub.reduce((a, s) => a + (s.minutes || 0), 0) / sub.length) : 0;
  }
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; }

  function setTrend(id, current, prev) {
    const el = $(id);
    if (!prev || !current) { el.textContent = ""; el.className = "kpi-trend"; return; }
    const pct = Math.round(((current - prev) / (prev || 1)) * 100);
    if (pct > 0) { el.textContent = "▲ " + pct + "%"; el.className = "kpi-trend up"; }
    else if (pct < 0) { el.textContent = "▼ " + Math.abs(pct) + "%"; el.className = "kpi-trend down"; }
    else { el.textContent = "—"; el.className = "kpi-trend"; }
  }

  // ═══ SPARKLINES ═══
  function dailyMins(days) { return dailyAgg(days, arr => arr.reduce((a, s) => a + (s.minutes || 0), 0)); }
  function dailyCounts(days) { return dailyAgg(days, arr => arr.length); }
  function dailyAvg(days) {
    return dailyAgg(days, arr => arr.length ? Math.round(arr.reduce((a, s) => a + (s.minutes || 0), 0) / arr.length) : 0);
  }
  function dailyAgg(days, fn) {
    const result = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const daySessions = sessions.filter(s => s.date.slice(0, 10) === key);
      result.push(fn(daySessions));
    }
    return result;
  }

  function drawSparkline(canvasId, data) {
    const c = $(canvasId);
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (!data.length || data.every(v => v === 0)) return;

    const max = Math.max(...data, 1);
    const step = W / (data.length - 1 || 1);

    // Fill
    ctx.beginPath();
    ctx.moveTo(0, H);
    data.forEach((v, i) => {
      const x = i * step, y = H - (v / max) * (H - 4);
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(56,126,209,.25)");
    grad.addColorStop(1, "rgba(56,126,209,0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step, y = H - (v / max) * (H - 4);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // End dot
    const lastY = H - (data[data.length - 1] / max) * (H - 4);
    ctx.beginPath();
    ctx.arc(W, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.blue;
    ctx.fill();
  }

  // ═══ TIMELINE CHART ═══
  function renderTimeline() {
    const c = $("chart-timeline");
    if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = c.parentElement.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = 200 * dpr;
    c.style.width = rect.width + "px";
    c.style.height = "200px";
    ctx.scale(dpr, dpr);
    const W = rect.width, H = 200;

    ctx.clearRect(0, 0, W, H);

    const data = dailyMins(timelineRange);
    const labels = [];
    const today = new Date();
    for (let i = timelineRange - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      labels.push({ short: DAY[d.getDay()], full: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), isToday: i === 0 });
    }

    const maxVal = Math.max(...data, 1);
    const padL = 40, padR = 16, padT = 16, padB = 36;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const barW = Math.min((chartW / data.length) * 0.55, 32);
    const gap = chartW / data.length;

    // Y-axis grid
    const ySteps = 4;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "500 10px 'JetBrains Mono'";
    for (let i = 0; i <= ySteps; i++) {
      const y = padT + (chartH / ySteps) * i;
      const val = Math.round(maxVal * (1 - i / ySteps));
      ctx.fillStyle = COLORS.txt4;
      ctx.fillText(val + "m", padL - 8, y);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // Bars
    data.forEach((v, i) => {
      const x = padL + gap * i + (gap - barW) / 2;
      const barH = (v / maxVal) * chartH;
      const y = padT + chartH - barH;

      // Bar gradient
      const grad = ctx.createLinearGradient(x, y, x, padT + chartH);
      grad.addColorStop(0, COLORS.blue);
      grad.addColorStop(1, COLORS.blueLt + "40");
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, barH, 3);

      // Glow for today
      if (labels[i].isToday && v > 0) {
        ctx.shadowColor = COLORS.blue;
        ctx.shadowBlur = 8;
        roundRect(ctx, x, y, barW, barH, 3);
        ctx.shadowBlur = 0;
      }

      // Value on top
      if (v > 0) {
        ctx.fillStyle = COLORS.txt2;
        ctx.font = "600 9px 'JetBrains Mono'";
        ctx.textAlign = "center";
        ctx.fillText(v + "m", x + barW / 2, y - 6);
      }

      // Label
      ctx.fillStyle = labels[i].isToday ? COLORS.blue : COLORS.txt4;
      ctx.font = labels[i].isToday ? "700 10px Inter" : "500 10px Inter";
      ctx.textAlign = "center";
      ctx.fillText(labels[i].short, x + barW / 2, H - 10);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < 1) h = 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // ═══ HEATMAP ═══
  function renderHeatmap() {
    const grid = $("heatmap-grid");
    const months = $("heatmap-months");
    grid.innerHTML = "";
    months.innerHTML = "";

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const totalDays = 91; // ~13 weeks

    // Build date->minutes map
    const dateMap = {};
    sessions.forEach(s => {
      const key = s.date.slice(0, 10);
      dateMap[key] = (dateMap[key] || 0) + (s.minutes || 0);
    });

    const maxMins = Math.max(...Object.values(dateMap), 1);

    // Start from Sunday of 13 weeks ago
    const start = new Date(today);
    start.setDate(start.getDate() - totalDays + 1);
    // Align to Sunday
    start.setDate(start.getDate() - start.getDay());

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay())); // end on Saturday

    let lastMonth = -1;
    const d = new Date(start);
    let colIdx = 0;

    while (d <= endDate) {
      for (let dow = 0; dow < 7; dow++) {
        const curr = new Date(start);
        curr.setDate(start.getDate() + colIdx * 7 + dow);
        if (curr > endDate) break;

        const key = curr.toISOString().slice(0, 10);
        const mins = dateMap[key] || 0;
        let level = 0;
        if (mins > 0) {
          const pct = mins / maxMins;
          level = pct > .75 ? 4 : pct > .5 ? 3 : pct > .25 ? 2 : 1;
        }

        const cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.dataset.level = level;
        cell.title = `${curr.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${mins}min`;
        grid.appendChild(cell);
      }
      colIdx++;
      d.setDate(d.getDate() + 7);
    }

    // Month labels
    $("heatmap-range").textContent = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    // Simple month markers
    const iterDate = new Date(start);
    let prevMonth = -1;
    const totalWeeks = colIdx;
    const cellW = 14; // 11 + 3 gap
    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + w * 7);
      const m = weekStart.getMonth();
      if (m !== prevMonth) {
        const span = document.createElement("span");
        span.textContent = MONTH_SHORT[m];
        span.style.marginLeft = (w > 0 ? (w * cellW - 20) : 0) + "px";
        span.style.position = w === 0 ? "relative" : "absolute";
        span.style.left = w > 0 ? (w * cellW) + "px" : "auto";
        months.appendChild(span);
        prevMonth = m;
      }
    }
  }

  // ═══ DONUT CHART ═══
  function renderDonut() {
    const c = $("chart-donut");
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = 160, H = 160;
    ctx.clearRect(0, 0, W, H);

    const mathCount = sessions.filter(s => (s.unlock_method || "math") === "math").length;
    const qrCount = sessions.filter(s => s.unlock_method === "qr").length;
    const total = mathCount + qrCount;

    const legend = $("donut-legend");
    legend.innerHTML = "";

    if (!total) {
      ctx.fillStyle = COLORS.bg3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 55, 0, Math.PI * 2); ctx.arc(W / 2, H / 2, 35, 0, Math.PI * 2, true); ctx.fill();
      ctx.fillStyle = COLORS.txt4;
      ctx.font = "600 11px Inter";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No data", W / 2, H / 2);
      return;
    }

    const slices = [
      { label: "Hard Math", val: mathCount, color: COLORS.purple },
      { label: "QR Code", val: qrCount, color: COLORS.cyan }
    ].filter(s => s.val > 0);

    let angle = -Math.PI / 2;
    slices.forEach(s => {
      const sweep = (s.val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 55, angle, angle + sweep);
      ctx.arc(W / 2, H / 2, 35, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      angle += sweep;

      const item = document.createElement("div");
      item.className = "dl-item";
      item.innerHTML = `<span class="dl-dot" style="background:${s.color}"></span>
        <span>${s.label}</span>
        <span class="dl-val">${s.val} (${Math.round(s.val / total * 100)}%)</span>`;
      legend.appendChild(item);
    });

    // Center text
    ctx.fillStyle = "#E2E2EA";
    ctx.font = "800 18px 'JetBrains Mono'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(total, W / 2, H / 2 - 6);
    ctx.font = "500 9px Inter";
    ctx.fillStyle = COLORS.txt3;
    ctx.fillText("sessions", W / 2, H / 2 + 10);
  }

  // ═══ TOP APPS ═══
  function renderTopApps() {
    const el = $("topapps-list");
    const emptyEl = $("topapps-empty");
    el.innerHTML = "";

    let screen = null;
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].screen_time && Object.keys(sessions[i].screen_time).length) {
        screen = sessions[i].screen_time; break;
      }
    }

    if (!screen) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");

    const entries = Object.entries(screen).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxSec = entries[0][1];

    entries.forEach(([name, secs], i) => {
      const mins = Math.round(secs / 60);
      const pct = (secs / maxSec) * 100;
      const row = document.createElement("div");
      row.className = "ta-row";
      row.innerHTML = `
        <span class="ta-rank">${i + 1}</span>
        <span class="ta-name" title="${esc(name)}">${esc(name)}</span>
        <div class="ta-bar-wrap"><div class="ta-bar" style="width:0%"></div></div>
        <span class="ta-time">${mins}m</span>
      `;
      el.appendChild(row);
      requestAnimationFrame(() => {
        setTimeout(() => row.querySelector(".ta-bar").style.width = pct + "%", i * 50);
      });
    });
  }

  // ═══ RECENT TABLE (Overview) ═══
  function renderRecentTable() {
    const tbody = $("recent-body");
    const emptyEl = $("recent-empty");
    tbody.innerHTML = "";

    if (!sessions.length) { emptyEl.classList.remove("hidden"); return; }
    emptyEl.classList.add("hidden");

    const recent = [...sessions].reverse().slice(0, 5);
    recent.forEach(s => tbody.appendChild(createSessionRow(s, false)));
  }

  // ═══ ALL SESSIONS TABLE ═══
  function renderAllTable() {
    const tbody = $("all-body");
    const emptyEl = $("all-empty");
    const countEl = $("all-count");
    const pagEl = $("pagination");
    tbody.innerHTML = "";

    const query = ($("session-search").value || "").toLowerCase().trim();
    let filtered = sessions.filter(s => {
      if (!query) return true;
      const d = new Date(s.date);
      const str = [
        d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        s.unlock_method, s.minutes + "min"
      ].join(" ").toLowerCase();
      return str.includes(query);
    });

    // Sort
    filtered.sort((a, b) => {
      let va, vb;
      if (sortField === "date") { va = new Date(a.date).getTime(); vb = new Date(b.date).getTime(); }
      else if (sortField === "mins") { va = a.minutes || 0; vb = b.minutes || 0; }
      else { va = 0; vb = 0; }
      return (va - vb) * sortDir;
    });

    if (!filtered.length) {
      emptyEl.classList.remove("hidden");
      countEl.textContent = "0 sessions";
      pagEl.innerHTML = "";
      return;
    }
    emptyEl.classList.add("hidden");

    // Pagination
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = filtered.slice(start, start + PAGE_SIZE);

    page.forEach(s => tbody.appendChild(createSessionRow(s, true)));

    countEl.textContent = `${filtered.length} session${filtered.length !== 1 ? "s" : ""}`;

    // Pagination buttons
    pagEl.innerHTML = "";
    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement("button");
      btn.textContent = p;
      if (p === currentPage) btn.classList.add("active");
      btn.addEventListener("click", () => { currentPage = p; renderAllTable(); });
      pagEl.appendChild(btn);
    }
  }

  function createSessionRow(s, full) {
    const tr = document.createElement("tr");
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const method = (s.unlock_method || "math").toLowerCase();
    const blocked = (s.blocked_items || []).length;
    const isFull = (s.minutes || 0) >= 25;

    let cells = `
      <td class="td-date"><span>${dateStr}</span><span class="td-sub">${timeStr}</span></td>
      <td class="td-mono">${s.minutes}m</td>
      <td><span class="tag tag-${method}">${method}</span></td>
      <td class="td-mono">${blocked}</td>`;

    if (full) {
      const stEntries = s.screen_time ? Object.keys(s.screen_time).length : 0;
      cells += `<td class="td-mono">${stEntries} apps</td>`;
    }

    cells += `<td><span class="tag ${isFull ? 'tag-full' : 'tag-early'}">${isFull ? 'Full' : 'Early'}</span></td>`;

    tr.innerHTML = cells;
    return tr;
  }

  // ═══ SCREEN TIME PAGE ═══
  function renderScreenTimePage() {
    // Aggregate across all sessions
    const agg = {};
    sessions.forEach(s => {
      if (!s.screen_time) return;
      Object.entries(s.screen_time).forEach(([name, secs]) => {
        agg[name] = (agg[name] || 0) + secs;
      });
    });

    const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    const emptyEl = $("st-empty");
    const stBody = $("st-body");
    const total = entries.reduce((a, e) => a + e[1], 0);

    if (!entries.length) {
      emptyEl.classList.remove("hidden");
      stBody.innerHTML = "";
      return;
    }
    emptyEl.classList.add("hidden");

    // Table
    stBody.innerHTML = "";
    entries.slice(0, 20).forEach(([name, secs], i) => {
      const mins = Math.round(secs / 60);
      const pct = Math.round((secs / total) * 100);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="td-mono">${i + 1}</td>
        <td>${esc(name)}</td>
        <td class="td-mono">${mins}m</td>
        <td class="td-mono">${pct}%</td>
      `;
      stBody.appendChild(tr);
    });

    // Bar chart (canvas)
    renderSTBarChart(entries.slice(0, 10));

    // Donut
    renderSTDonut(entries.slice(0, 5), total);
  }

  function renderSTBarChart(entries) {
    const c = $("chart-screentime");
    if (!c || !entries.length) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = c.parentElement.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = 300 * dpr;
    c.style.width = rect.width + "px";
    c.style.height = "300px";
    ctx.scale(dpr, dpr);
    const W = rect.width, H = 300;

    ctx.clearRect(0, 0, W, H);

    const maxVal = entries[0][1];
    const padL = 160, padR = 60, padT = 10, padB = 10;
    const barH = 20;
    const gap = (H - padT - padB) / entries.length;

    entries.forEach(([name, secs], i) => {
      const y = padT + gap * i + (gap - barH) / 2;
      const barW = ((secs / maxVal) * (W - padL - padR));
      const mins = Math.round(secs / 60);

      // Label
      ctx.fillStyle = COLORS.txt2;
      ctx.font = "500 11px Inter";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      let label = name.length > 22 ? name.slice(0, 20) + "…" : name;
      ctx.fillText(label, padL - 12, y + barH / 2);

      // Bar
      const grad = ctx.createLinearGradient(padL, 0, padL + barW, 0);
      grad.addColorStop(0, COLORS.blue);
      grad.addColorStop(1, COLORS.cyan);
      ctx.fillStyle = grad;
      roundRect(ctx, padL, y, Math.max(barW, 4), barH, 3);

      // Value
      ctx.fillStyle = COLORS.txt3;
      ctx.font = "600 10px 'JetBrains Mono'";
      ctx.textAlign = "left";
      ctx.fillText(mins + "m", padL + barW + 8, y + barH / 2);
    });
  }

  function renderSTDonut(entries, total) {
    const c = $("chart-st-donut");
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = 180, H = 180;
    ctx.clearRect(0, 0, W, H);
    const legend = $("st-donut-legend");
    legend.innerHTML = "";

    if (!entries.length) return;

    const colors = [COLORS.blue, COLORS.cyan, COLORS.purple, COLORS.amber, COLORS.green];
    let angle = -Math.PI / 2;

    entries.forEach(([name, secs], i) => {
      const sweep = (secs / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 65, angle, angle + sweep);
      ctx.arc(W / 2, H / 2, 40, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      angle += sweep;

      const item = document.createElement("div");
      item.className = "dl-item";
      const mins = Math.round(secs / 60);
      const shortName = name.length > 18 ? name.slice(0, 16) + "…" : name;
      item.innerHTML = `<span class="dl-dot" style="background:${colors[i % colors.length]}"></span>
        <span>${esc(shortName)}</span>
        <span class="dl-val">${mins}m</span>`;
      legend.appendChild(item);
    });

    // Center
    const totalMins = Math.round(total / 60);
    ctx.fillStyle = "#E2E2EA";
    ctx.font = "800 16px 'JetBrains Mono'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(totalMins + "m", W / 2, H / 2 - 6);
    ctx.font = "500 9px Inter";
    ctx.fillStyle = COLORS.txt3;
    ctx.fillText("total", W / 2, H / 2 + 10);
  }

  // ═══ TOOLTIP ═══
  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    document.body.appendChild(tooltip);
  }

  // ═══ UTILS ═══
  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ═══ PLANNER LOGIC ═══
  async function loadPlanner() {
    if (!window.currentUser) return;
    const dateStr = document.getElementById("planner-date")?.value || new Date().toISOString().slice(0, 10);
    try {
      // Use standard fetch if specialized DB wasn't exported
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${window.currentUser.uid}/planner/${dateStr}`);
      if (res.ok) {
        const json = await res.json();
        const pArr = json.fields?.blocks?.arrayValue?.values || [];
        plannerBlocks = pArr.map(v => JSON.parse(v.stringValue));
      } else {
        plannerBlocks = [];
      }
    } catch { plannerBlocks = []; }
    renderPlanner();
  }

  async function savePlannerLocal() {
    if (!window.currentUser) return;
    const dateStr = document.getElementById("planner-date")?.value || new Date().toISOString().slice(0, 10);

    // Save stringified blocks map to Firestore Rest API
    const payload = {
      fields: {
        blocks: {
          arrayValue: {
            values: plannerBlocks.map(b => ({ stringValue: JSON.stringify(b) }))
          }
        }
      }
    };
    try {
      // Use auth token if needed, or assume firestore rules allow it briefly for demo
      await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${window.currentUser.uid}/planner/${dateStr}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch { }
  }

  function renderPlanner() {
    const pContainer = document.getElementById("planner-content");
    if (!pContainer) return;

    if (plannerBlocks.length === 0) {
      pContainer.innerHTML = '<p class="empty">No tasks scheduled for this day!</p>';
      return;
    }

    let html = '';
    plannerBlocks.forEach((block, idx) => {
      html += `
        <div class="planner-block" data-idx="${idx}">
            <input type="time" class="pl-time" value="${block.time}" onchange="updateBlock(${idx}, 'time', this.value)"/>
            <input type="text" class="pl-title" placeholder="Focus Goal" value="${block.title}" oninput="updateBlock(${idx}, 'title', this.value)"/>
            <input type="number" class="pl-len" value="${block.len}" style="width: 70px" onchange="updateBlock(${idx}, 'len', this.value)"/> min
            <button class="pl-del" onclick="deleteBlock(${idx})">✕</button>
        </div>`;
    });
    pContainer.innerHTML = html;
  }

  window.updateBlock = (idx, key, val) => { plannerBlocks[idx][key] = val; savePlannerLocal(); };
  window.deleteBlock = (idx) => { plannerBlocks.splice(idx, 1); savePlannerLocal(); renderPlanner(); };

  // Resize handler
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderTimeline();
      renderScreenTimePage();
    }, 200);
  });

})();
