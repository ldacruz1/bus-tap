const departures = document.getElementById("departures-container");
const loading = document.getElementById("loading-message");
const currentTimeEl = document.getElementById("current-time");
const lastUpdatedEl = document.getElementById("last-updated");
const routeSelect = document.getElementById("routeSelect");

let selectedRoute = "";

const host = window.location.hostname;
const API_BASE = `http://${host}:8000`;
const WS_URL = `ws://${host}:8000/ws`;

function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function setLastUpdated(ts = new Date()) {
  const d = ts instanceof Date ? ts : new Date(ts);
  lastUpdatedEl.textContent = `Last updated: ${d.toLocaleTimeString()}`;
}

function setClock() {
  currentTimeEl.textContent = new Date().toLocaleString();
}
setClock();
setInterval(setClock, 1000);

function makeDepartureCard(ev) {
  const div = document.createElement("div");
  div.className =
    "bg-gray-50 border border-gray-200 rounded-xl p-4 flex justify-between items-center";

  const left = document.createElement("div");
  left.className = "flex flex-col";

  const title = document.createElement("div");
  title.className = "text-lg font-semibold text-gray-800";
  title.textContent = `Bus ${ev.bus_id} is ${ev.status}`;

  const meta = document.createElement("div");
  meta.className = "text-sm text-gray-500";

  // include route if present
  const routeBit = ev.route_id ? ` • Route: ${ev.route_id}` : "";
  meta.textContent = `${fmtTime(ev.ts)} • Driver: ${ev.driver_id}${routeBit}`;

  left.appendChild(title);
  left.appendChild(meta);

  const badge = document.createElement("div");
  badge.className =
    "text-sm font-medium px-3 py-1 rounded-full " +
    (ev.status === "leaving"
      ? "bg-green-100 text-green-800"
      : "bg-gray-200 text-gray-700");
  badge.textContent = ev.status;

  div.appendChild(left);
  div.appendChild(badge);
  return div;
}

function clearDepartures() {
  departures.innerHTML = "";
  // re-add loading message placeholder
  if (loading) departures.appendChild(loading);
}

function addEventToUI(ev, { prepend = true } = {}) {
  if (loading && loading.parentNode) loading.remove();

  const card = makeDepartureCard(ev);
  if (prepend) departures.prepend(card);
  else departures.appendChild(card);

  setLastUpdated(ev.ts);
}

async function loadRecent() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    const data = await res.json();
    const items = data.items || [];

    clearDepartures();

    const filtered = selectedRoute
      ? items.filter((ev) => ev.route_id === selectedRoute)
      : items;

    // show oldest -> newest so it reads like a timeline
    filtered.reverse().forEach((ev) => addEventToUI(ev, { prepend: false }));

    if (filtered.length === 0) {
      if (loading) loading.textContent = "No departures yet. Tap a card to create one.";
      setLastUpdated(new Date());
    }
  } catch (e) {
    console.error("Failed to load events:", e);
    if (loading) loading.textContent = "Failed to load departure times.";
  }
}

async function loadRoutes() {
  if (!routeSelect) return;

  routeSelect.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All routes";
  routeSelect.appendChild(optAll);

  try {
    const res = await fetch(`${API_BASE}/routes`);
    const data = await res.json();
    const routes = data.items || [];

    routes.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.route_id;
      opt.textContent = `${r.route_id} - ${r.name}`;
      routeSelect.appendChild(opt);
    });

    routeSelect.value = selectedRoute;
  } catch (e) {
    console.error("Failed to load routes:", e);
  }

  routeSelect.addEventListener("change", () => {
    selectedRoute = routeSelect.value;
    loadRecent();
  });
}

function connectWS() {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (msg) => {
    try {
      const payload = JSON.parse(msg.data);
      if (payload && payload.type === "event" && payload.data) {
        const ev = payload.data;

        // only show if route matches, or no filter
        if (!selectedRoute || ev.route_id === selectedRoute) {
          addEventToUI(ev, { prepend: true });
        }
      }
    } catch (e) {
      console.error("Bad WS message:", e);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1500);
}

// IMPORTANT: actually call routes loader
loadRoutes();
loadRecent();
connectWS();
