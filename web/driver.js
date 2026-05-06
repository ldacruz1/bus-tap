/**
 * BusTap driver dashboard — matches API routes from GET /routes (same ids as POST /events).
 */
const host = window.location.hostname;
const API = `http://${host}:8000`;
const WS = `ws://${host}:8000/ws`;

const FIRST_NAMES = [
  "Jordan", "Alex", "Sam", "Riley", "Casey", "Morgan", "Taylor", "Jamie",
  "Avery", "Quinn", "Drew", "Reese", "Skyler", "Rowan", "Blake", "Cameron",
];
const LAST_NAMES = [
  "Nguyen", "Patel", "Garcia", "Okafor", "Silva", "Martinez", "Johnson",
  "Kim", "Hernandez", "Brown", "Davis", "Wilson", "Clark", "Rivera", "Murphy",
  "Singh",
];

let myRouteIds = [];
let routeDetails = new Map();
let allEvents = [];
let selectedFilter = "";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDriverName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function avatarUrl(seed) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

/** Pick 1 or 2 distinct routes from the API catalog (same pool as badge-scan POSTs). */
function assignOneOrTwoRoutes(routes) {
  myRouteIds = [];
  routeDetails = new Map();
  if (!routes.length) return;

  const count =
    routes.length === 1 ? 1 : Math.random() < 0.5 ? 1 : 2;
  const cap = Math.min(count, routes.length);
  const shuffled = [...routes].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, cap);

  chosen.forEach((r) => {
    myRouteIds.push(r.route_id);
    routeDetails.set(r.route_id, r.name || r.route_id);
  });
}

function routeSet() {
  return new Set(myRouteIds);
}

function matchesMyRoutes(ev) {
  const rs = routeSet();
  return ev.route_id && rs.has(ev.route_id);
}

// ── FORMAT ────────────────────────────────────────────────
function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ── DOM ─────────────────────────────────────────────────────
const depList = document.getElementById("departures");
const emptyState = document.getElementById("empty-state");
const routeSel = document.getElementById("routeFilter");
const wsDot = document.getElementById("ws-dot");
const wsLabelEl = document.getElementById("ws-label");
const statRoutes = document.getElementById("stat-routes");
const statEvents = document.getElementById("stat-events");
const statLast = document.getElementById("stat-last");
const statLastSub = document.getElementById("stat-last-sub");
const lastUpEl = document.getElementById("last-updated");
const driverNameEl = document.getElementById("driver-name");
const driverPhotoEl = document.getElementById("driver-photo");
const routePillsEl = document.getElementById("route-pills");

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  document.getElementById("clock-date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function updateStats() {
  statRoutes.textContent = myRouteIds.length ? String(myRouteIds.length) : "—";
  const mine = allEvents.filter(matchesMyRoutes);
  statEvents.textContent = mine.length ? String(mine.length) : "—";
  if (mine.length > 0) {
    statLast.textContent = mine[0].bus_id;
    statLastSub.textContent = timeAgo(mine[0].ts);
  } else {
    statLast.textContent = "—";
    statLastSub.textContent = "No taps yet on your routes";
  }
}

function makeCard(ev, isNew = false) {
  const card = document.createElement("div");
  card.className = "dep-card" + (isNew ? " new-flash" : "");
  card.setAttribute("role", "listitem");

  const status = (ev.status || "leaving").toLowerCase();
  const badgeCls =
    status === "leaving"
      ? "leaving"
      : status === "arriving"
        ? "arriving"
        : "default";
  const routeTag = ev.route_id
    ? `<span class="dep-route">${ev.route_id}</span>`
    : "";
  const stopBit = ev.stop_id
    ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>${ev.stop_id}</span>`
    : "";

  card.innerHTML = `
    <div class="dep-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="3"/><path d="M2 10h20M7 18v2M17 18v2"/>
        <circle cx="7" cy="14" r="1" fill="var(--accent)" stroke="none"/>
        <circle cx="17" cy="14" r="1" fill="var(--accent)" stroke="none"/>
      </svg>
    </div>
    <div class="dep-info">
      <div class="dep-top">
        <span class="dep-busid">${ev.bus_id}</span>${routeTag}
      </div>
      <div class="dep-bottom">
        <span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          ${ev.driver_id}
        </span>${stopBit}
      </div>
    </div>
    <div class="dep-right">
      <span class="dep-time">${fmtTime(ev.ts)}</span>
      <span class="dep-badge ${badgeCls}">${ev.status || "leaving"}</span>
    </div>`;
  return card;
}

function renderCards() {
  Array.from(depList.children).forEach((c) => {
    if (c !== emptyState) c.remove();
  });

  const mine = allEvents.filter(matchesMyRoutes);
  const filtered = selectedFilter
    ? mine.filter((e) => e.route_id === selectedFilter)
    : mine;

  if (filtered.length === 0) {
    emptyState.style.display = "";
    emptyState.querySelector("p").textContent = myRouteIds.length
      ? "No events on your assigned route(s) yet."
      : "No routes available from the API.";
    return;
  }

  emptyState.style.display = "none";
  filtered.forEach((ev) => depList.appendChild(makeCard(ev, false)));
  lastUpEl.textContent = `Last updated: ${fmtTime(filtered[0].ts)}`;
  updateStats();
}

async function loadEvents() {
  try {
    const res = await fetch(`${API}/events?limit=80`);
    const d = await res.json();
    allEvents = d.items || [];
    renderCards();
  } catch {
    emptyState.querySelector("p").textContent = "Could not reach the API.";
  }
}

async function fetchRoutes() {
  const res = await fetch(`${API}/routes`);
  const d = await res.json();
  return d.items || [];
}

function renderDriverProfile(name) {
  driverNameEl.textContent = name;
  driverPhotoEl.src = avatarUrl(name);
  driverPhotoEl.alt = `Avatar for ${name}`;

  routePillsEl.innerHTML = "";
  if (!myRouteIds.length) {
    const span = document.createElement("span");
    span.className = "lang-pill";
    span.style.cursor = "default";
    span.textContent = "No routes assigned";
    routePillsEl.appendChild(span);
    return;
  }
  myRouteIds.forEach((id) => {
    const pill = document.createElement("span");
    pill.className = "lang-pill";
    pill.style.cursor = "default";
    const nm = routeDetails.get(id) || id;
    pill.textContent = `${id} — ${nm}`;
    routePillsEl.appendChild(pill);
  });
}

function buildRouteFilter() {
  routeSel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent =
    myRouteIds.length > 1 ? "All my routes" : "My route";
  routeSel.appendChild(all);

  if (!myRouteIds.length) {
    routeSel.disabled = true;
    return;
  }

  myRouteIds.forEach((id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${id} — ${routeDetails.get(id) || id}`;
    routeSel.appendChild(o);
  });
  routeSel.disabled = myRouteIds.length <= 1;

  routeSel.onchange = () => {
    selectedFilter = routeSel.value;
    renderCards();
  };
}

function connectWS() {
  const ws = new WebSocket(WS);
  ws.onopen = () => {
    wsDot.classList.add("live");
    wsLabelEl.textContent = "Live";
  };
  ws.onclose = () => {
    wsDot.classList.remove("live");
    wsLabelEl.textContent = "Reconnecting…";
    setTimeout(connectWS, 1500);
  };
  ws.onmessage = ({ data }) => {
    try {
      const payload = JSON.parse(data);
      if (payload?.type === "event" && payload.data) {
        const ev = payload.data;
        allEvents.unshift(ev);
        updateStats();
        if (!matchesMyRoutes(ev)) return;
        lastUpEl.textContent = `Last updated: ${fmtTime(ev.ts)}`;
        if (selectedFilter && ev.route_id !== selectedFilter) return;
        emptyState.style.display = "none";
        const card = makeCard(ev, true);
        depList.insertBefore(
          card,
          depList.firstChild === emptyState ? emptyState.nextSibling : depList.firstChild
        );
      }
    } catch (_) {}
  };
}

// ── THEME (match index localStorage) ──────────────────────
const themeBtn = document.getElementById("theme-btn");
const themeIcon = document.getElementById("theme-icon");

const ICON_LIGHT = `<circle cx="12" cy="12" r="5"/>
  <line x1="12" y1="1"  x2="12" y2="3"/>
  <line x1="12" y1="21" x2="12" y2="23"/>
  <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
  <line x1="1"  y1="12" x2="3"  y2="12"/>
  <line x1="21" y1="12" x2="23" y2="12"/>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
  <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>`;

const ICON_DARK = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

let isLight = false;

function applyTheme() {
  document.documentElement.classList.toggle("light", isLight);
  themeIcon.innerHTML = isLight ? ICON_DARK : ICON_LIGHT;
  themeBtn.setAttribute(
    "aria-label",
    isLight ? "Switch to dark mode" : "Switch to light mode"
  );
  themeBtn.classList.toggle("active", isLight);
  localStorage.setItem("bustap-theme", isLight ? "light" : "dark");
}

isLight = localStorage.getItem("bustap-theme") === "light";
applyTheme();

themeBtn.addEventListener("click", () => {
  isLight = !isLight;
  applyTheme();
});

// ── API HEALTH ────────────────────────────────────────────
const healthDot = document.getElementById("health-dot");
const healthLabel = document.getElementById("health-label");

async function checkHealth() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API}/events?limit=1`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      healthDot.className = "health-dot ok";
      healthLabel.textContent = "API Online";
    } else throw new Error("non-ok");
  } catch {
    healthDot.className = "health-dot err";
    healthLabel.textContent = "API Offline";
  }
}

// ── BOOT ──────────────────────────────────────────────────
async function init() {
  const name = randomDriverName();
  try {
    const routes = await fetchRoutes();
    assignOneOrTwoRoutes(routes);
  } catch (e) {
    console.error(e);
  }

  renderDriverProfile(name);
  buildRouteFilter();

  updateClock();
  setInterval(updateClock, 1000);

  await loadEvents();
  connectWS();
  checkHealth();
  setInterval(checkHealth, 15_000);
  setInterval(updateStats, 30_000);
}

init();
