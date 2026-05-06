/**
 * Shared simulated route paths for R1–R3 (San José area stops).
 * Persisted in localStorage so index.html, simulation.js, and livemap.html stay in sync.
 */
(function () {
  const STORAGE_KEY = 'bustap-sim-routes';
  /** Limits OSRM / map work per route and keeps simulated paths realistic. */
  const MAX_STOPS_PER_ROUTE = 10;

  const ROUTE_META = [
    { id: 'R1', name: 'Route 1 (simulated)', color: '#00e5a0' },
    { id: 'R2', name: 'Route 2 (simulated)', color: '#00b8d4' },
    { id: 'R3', name: 'Route 3 (simulated)', color: '#ffb830' },
  ];

  const FALLBACK_STOPS = [
    { name: 'San José Diridon Station', lat: 37.3297, lon: -121.9028 },
    { name: 'Santa Clara St & 4th St', lat: 37.3389, lon: -121.8863 },
    { name: 'Santa Clara St & 1st St', lat: 37.3374, lon: -121.8932 },
    { name: 'E Santa Clara St & N 6th St', lat: 37.3492, lon: -121.8681 },
    { name: 'SJSU — San Carlos at 4th', lat: 37.3354, lon: -121.8814 },
    { name: 'Alum Rock Av & King Rd', lat: 37.3521, lon: -121.8448 },
    { name: 'Bascom Av & Union Av', lat: 37.3246, lon: -121.9521 },
    { name: 'Stevens Creek & Winchester', lat: 37.3233, lon: -121.9502 },
    { name: 'Santana Row / Stevens Creek', lat: 37.3217, lon: -121.9478 },
    { name: 'Winchester Transit Center', lat: 37.3089, lon: -121.9501 },
    { name: 'Monterey & Cochrane', lat: 37.3035, lon: -121.9774 },
    { name: 'Lightston & Branham', lat: 37.2531, lon: -121.8586 },
    { name: 'Capitol Expwy & Quimby', lat: 37.2654, lon: -121.8138 },
    { name: 'Berryessa BART / Mabury', lat: 37.3717, lon: -121.8756 },
    { name: 'Hostetter Rd & Penitencia Creek', lat: 37.3921, lon: -121.8811 },
    { name: 'Milpitas BART area', lat: 37.4104, lon: -121.891 },
    { name: 'Great Mall / Montague', lat: 37.4136, lon: -121.9324 },
    { name: 'N First St & Charcot Av', lat: 37.4012, lon: -121.9281 },
    { name: 'Mineta SJC — Terminal A', lat: 37.3639, lon: -121.9288 },
    { name: 'Curtner & Canoas Garden', lat: 37.2879, lon: -121.8648 },
    { name: 'Almaden Expwy & Camden', lat: 37.2538, lon: -121.8778 },
    { name: 'Willow Glen — Lincoln & Minnesota', lat: 37.3062, lon: -121.9027 },
    { name: 'Rose Garden — The Alameda & Naglee', lat: 37.3324, lon: -121.9152 },
    { name: 'Japantown — Jackson & 6th', lat: 37.3487, lon: -121.8945 },
    { name: 'Evergreen — Aborn & White', lat: 37.323, lon: -121.8112 },
    { name: 'Silver Creek — Capitol & Murillo', lat: 37.302, lon: -121.8108 },
    { name: 'Communications Hill', lat: 37.2885, lon: -121.8447 },
    { name: 'Coyote Creek trailhead — Capitol', lat: 37.2795, lon: -121.8274 },
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function orderStopsForPath(stops) {
    if (stops.length <= 2) return stops.slice();
    const remaining = stops.slice();
    const path = [remaining.shift()];
    while (remaining.length) {
      const last = path[path.length - 1];
      let bestI = 0;
      let bestD = Infinity;
      remaining.forEach((p, i) => {
        const dx = p.lat - last.lat;
        const dy = p.lon - last.lon;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      });
      path.push(remaining.splice(bestI, 1)[0]);
    }
    return path;
  }

  function assignRandomRoutes(pool) {
    const minPer = 3;
    const shuffled = shuffle(pool);
    const perRoute = Math.min(
      MAX_STOPS_PER_ROUTE,
      Math.max(minPer, Math.floor(shuffled.length / ROUTE_META.length))
    );
    const out = {};
    let offset = 0;
    ROUTE_META.forEach((meta) => {
      const chunk = shuffled.slice(offset, offset + perRoute);
      offset += perRoute;
      const ordered = orderStopsForPath(chunk);
      out[meta.id] = ordered.slice(0, MAX_STOPS_PER_ROUTE);
    });
    return out;
  }

  function makeStopId(name, index) {
    const base = String(name || '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 28);
    return base || 'STOP_' + index;
  }

  async function fetchOsmBusStopsSanJose() {
    const south = 37.29;
    const west = -122.02;
    const north = 37.39;
    const east = -121.84;
    const query =
      '[out:json][timeout:28];\n(\n  node["highway"="bus_stop"](' +
      south +
      ',' +
      west +
      ',' +
      north +
      ',' +
      east +
      ');\n);\nout body 500;\n';
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
    const data = await res.json();
    const stops = [];
    const seen = new Set();
    for (const el of data.elements || []) {
      if (el.type !== 'node' || el.lat == null || el.lon == null) continue;
      const name =
        (el.tags && (el.tags.name || el.tags['ref:name'] || el.tags.ref)) || 'Bus stop';
      const key = el.lat.toFixed(5) + ',' + el.lon.toFixed(5);
      if (seen.has(key)) continue;
      seen.add(key);
      stops.push({ lat: el.lat, lon: el.lon, name, osmName: name });
    }
    return stops;
  }

  async function loadStopPool() {
    let pool = [];
    try {
      pool = await fetchOsmBusStopsSanJose();
    } catch (_) {}
    if (pool.length < 15) {
      pool = FALLBACK_STOPS.map((s) => ({
        lat: s.lat,
        lon: s.lon,
        name: s.name,
        osmName: s.name,
      }));
    }
    return pool;
  }

  /**
   * Build random R1–R3 paths, normalize stops (stop_id), persist, return payload.
   */
  async function buildSimulationRoutes() {
    const pool = await loadStopPool();
    const raw = assignRandomRoutes(pool);
    const routes = {};
    ROUTE_META.forEach((meta) => {
      const path = raw[meta.id] || [];
      routes[meta.id] = {
        color: meta.color,
        name: meta.name,
        stops: path.map((s, i) => {
          const label = s.osmName || s.name || 'Stop';
          return {
            lat: s.lat,
            lon: s.lon,
            name: label,
            osmName: s.osmName || label,
            stop_id: makeStopId(label, i),
          };
        }),
      };
    });
    const payload = {
      version: 2,
      maxStopsPerRoute: MAX_STOPS_PER_ROUTE,
      updatedAt: new Date().toISOString(),
      poolSource: pool.length >= 15 ? 'osm' : 'fallback',
      routes,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('bustap-sim-routes-updated'));
    } catch (_) {}
    return payload;
  }

  function loadStoredRoutes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.routes) return null;
      return d;
    } catch (_) {
      return null;
    }
  }

  function clearStoredRoutes() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('bustap-sim-routes-updated'));
    } catch (_) {}
  }

  /** Flat map routeId -> stop[] for Leaflet (same shape as old livemap). */
  function storedToStopsByRoute(stored) {
    const out = {};
    if (!stored || !stored.routes) return out;
    ROUTE_META.forEach((m) => {
      const r = stored.routes[m.id];
      const stops = (r && r.stops) || [];
      out[m.id] = stops.slice(0, MAX_STOPS_PER_ROUTE);
    });
    return out;
  }

  /* ── Index overlay ─────────────────────────────────────── */
  let overlayBound = false;

  function ensureOverlayStyles() {
    if (document.getElementById('bustap-route-overlay-styles')) return;
    const st = document.createElement('style');
    st.id = 'bustap-route-overlay-styles';
    st.textContent = `
      .route-detail-backdrop {
        position: fixed; inset: 0; z-index: 99990;
        background: rgba(10,15,20,.72);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        opacity: 0; pointer-events: none; transition: opacity .2s;
      }
      .route-detail-backdrop.is-open { opacity: 1; pointer-events: auto; }
      .route-detail-panel {
        background: var(--surface, #131920);
        border: 1px solid var(--border, #222d3a);
        border-radius: var(--card-radius, 14px);
        max-width: 420px; width: 100%; max-height: min(80vh, 520px);
        overflow: auto;
        padding: 20px 22px 18px;
        box-shadow: 0 20px 50px rgba(0,0,0,.5);
        position: relative;
      }
      .route-detail-close {
        position: absolute; top: 12px; right: 12px;
        width: 36px; height: 36px; border: none; border-radius: 8px;
        background: var(--surface2, #1a2230); color: var(--muted, #5a6a7a);
        font-size: 1.25rem; line-height: 1; cursor: pointer;
      }
      .route-detail-close:hover { color: var(--accent, #00e5a0); }
      .route-detail-panel h2 {
        font-family: var(--mono, monospace);
        font-size: 1rem; margin: 0 36px 6px 0;
        letter-spacing: -0.3px;
      }
      .route-detail-meta { font-size: 0.78rem; color: var(--muted); margin: 0 0 14px 0; }
      .route-detail-stops {
        margin: 0; padding-left: 1.15rem;
        font-size: 0.85rem; line-height: 1.55;
        color: var(--text, #e8edf3);
      }
      .route-detail-stops li { margin-bottom: 6px; }
      .route-detail-stops li::marker { font-weight: 600; }
      .route-detail-stops code {
        font-family: var(--mono, monospace);
        font-size: 0.72rem;
        color: var(--accent2, #00b8d4);
      }
      .route-detail-empty { font-size: 0.85rem; color: var(--muted); margin: 0; }
      button.dep-route {
        font: inherit; border: none; background: rgba(0,184,212,.12);
        border: 1px solid rgba(0,184,212,.25);
        padding: 2px 8px; border-radius: 4px;
        cursor: pointer; color: var(--accent2, #00b8d4);
        letter-spacing: 1px; text-transform: uppercase;
        font-size: 0.72rem; font-weight: 600;
      }
      button.dep-route:hover { border-color: var(--accent, #00e5a0); color: var(--accent); }
      .route-detail-panel .hidden { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  function ensureOverlayDom() {
    if (document.getElementById('route-detail-backdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'route-detail-backdrop';
    bd.className = 'route-detail-backdrop';
    bd.setAttribute('aria-hidden', 'true');
    bd.innerHTML = `
      <div class="route-detail-panel" role="dialog" aria-modal="true" aria-labelledby="route-detail-title">
        <button type="button" class="route-detail-close" aria-label="Close route details">&times;</button>
        <h2 id="route-detail-title">Route</h2>
        <p class="route-detail-meta" id="route-detail-meta"></p>
        <ol class="route-detail-stops" id="route-detail-stops"></ol>
        <p class="route-detail-empty hidden" id="route-detail-empty">No simulation route data yet. Use <strong>Simulation Mode</strong> on this page to generate paths.</p>
      </div>`;
    document.body.appendChild(bd);
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeRouteOverlay();
    });
    bd.querySelector('.route-detail-close').addEventListener('click', closeRouteOverlay);
  }

  function openRouteOverlay(routeId) {
    ensureOverlayStyles();
    ensureOverlayDom();
    const bd = document.getElementById('route-detail-backdrop');
    const titleEl = document.getElementById('route-detail-title');
    const metaEl = document.getElementById('route-detail-meta');
    const listEl = document.getElementById('route-detail-stops');
    const emptyEl = document.getElementById('route-detail-empty');
    const stored = loadStoredRoutes();
    const meta = ROUTE_META.find((m) => m.id === routeId);
    titleEl.textContent = meta ? `${meta.id} — ${meta.name}` : routeId;
    titleEl.style.color = meta ? meta.color : '';
    if (!stored || !stored.routes || !stored.routes[routeId] || !stored.routes[routeId].stops.length) {
      listEl.innerHTML = '';
      listEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      metaEl.textContent = '';
    } else {
      emptyEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      const stops = stored.routes[routeId].stops;
      metaEl.textContent =
        stops.length + ' stop' + (stops.length === 1 ? '' : 's') + ' · simulated path (San José area)';
      listEl.innerHTML = stops
        .map(
          (s) =>
            `<li>${escapeHtml(s.name)} <code>${escapeHtml(s.stop_id)}</code></li>`
        )
        .join('');
    }
    bd.classList.add('is-open');
    bd.setAttribute('aria-hidden', 'false');
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function closeRouteOverlay() {
    const bd = document.getElementById('route-detail-backdrop');
    if (!bd) return;
    bd.classList.remove('is-open');
    bd.setAttribute('aria-hidden', 'true');
  }

  function onRouteSelectChange(selectedRoute) {
    if (selectedRoute === 'R1' || selectedRoute === 'R2' || selectedRoute === 'R3') {
      openRouteOverlay(selectedRoute);
    } else {
      closeRouteOverlay();
    }
  }

  function bindIndexOverlayKeys() {
    if (overlayBound) return;
    overlayBound = true;
    document.addEventListener('keydown', (e) => {
      const bd = document.getElementById('route-detail-backdrop');
      if (e.key === 'Escape' && bd && bd.classList.contains('is-open')) closeRouteOverlay();
    });
  }

  window.BustapRouteSim = {
    STORAGE_KEY,
    ROUTE_META,
    MAX_STOPS_PER_ROUTE,
    buildSimulationRoutes,
    loadStoredRoutes,
    clearStoredRoutes,
    storedToStopsByRoute,
    openRouteOverlay,
    closeRouteOverlay,
    onRouteSelectChange,
    bindIndexOverlayKeys,
    makeStopId,
  };
})();
