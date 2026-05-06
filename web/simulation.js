/**
 * BusTap Simulation Mode: sample POSTs + guided tour (index → driver).
 * Refresh ends simulation; refreshing driver.html redirects to index.html.
 */
(function () {
  const SIM_ACTIVE = 'bustap-simulation-active';
  const SIM_STEP = 'bustap-simulation-step';

  const host = window.location.hostname;
  const API = `http://${host}:8000`;

  function isReloadNavigation() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav && nav.type === 'reload';
    } catch (_) {
      return false;
    }
  }

  const path = window.location.pathname || '';

  if (isReloadNavigation()) {
    sessionStorage.removeItem(SIM_ACTIVE);
    sessionStorage.removeItem(SIM_STEP);
    if (/driver\.html$/i.test(path)) {
      window.location.replace('index.html');
      return;
    }
  }

  /* Leaving driver (e.g. Back) should not leave a stale flag that retriggers the driver tour. */
  if (!/driver\.html$/i.test(path) && sessionStorage.getItem(SIM_ACTIVE) === 'driver') {
    sessionStorage.removeItem(SIM_ACTIVE);
    sessionStorage.removeItem(SIM_STEP);
  }

  function rnd(max) {
    return Math.floor(Math.random() * max);
  }
  function rndHex(n) {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[rnd(chars.length)];
    return s;
  }

  function buildSamplePayload(routeId) {
    const drivers = ['Chen', 'Patel', 'Martinez', 'Nguyen', 'Okafor'];
    const fallbackStops = ['DOWNTOWN', 'MALL', 'CAMPUS', 'AIRPORT'];
    const statuses = ['leaving', 'arriving'];
    let stop_id = undefined;
    try {
      const stored =
        window.BustapRouteSim && typeof window.BustapRouteSim.loadStoredRoutes === 'function'
          ? window.BustapRouteSim.loadStoredRoutes()
          : null;
      const path = stored && stored.routes && stored.routes[routeId] && stored.routes[routeId].stops;
      if (path && path.length) {
        stop_id = path[rnd(path.length)].stop_id;
      }
    } catch (_) {}
    if (!stop_id) stop_id = fallbackStops[rnd(fallbackStops.length)];
    return {
      driver_id: `DRV-${drivers[rnd(drivers.length)]}-${rnd(90) + 10}`,
      bus_id: `BUS-${100 + rnd(900)}`,
      status: statuses[rnd(statuses.length)],
      route_id: routeId,
      stop_id,
      uid: rndHex(8),
    };
  }

  function payloadToCurl(url, body) {
    const json = JSON.stringify(body);
    const escaped = json.replace(/'/g, `'\"'\"'`);
    return `curl -sS -X POST '${url}' -H 'Content-Type: application/json' -d '${escaped}'`;
  }

  async function postSampleEventsAndLogCurls() {
    try {
      if (window.BustapRouteSim && typeof window.BustapRouteSim.buildSimulationRoutes === 'function') {
        await window.BustapRouteSim.buildSimulationRoutes();
      }
    } catch (_) {}
    const routes = ['R1', 'R2', 'R3'];
    const curls = [];
    for (const routeId of routes) {
      const body = buildSamplePayload(routeId);
      curls.push(payloadToCurl(`${API}/events`, body));
      try {
        await fetch(`${API}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (_) {}
    }
    console.info('[BusTap Simulation] Example cURL commands (one POST per route R1, R2, R3):');
    curls.forEach((c, i) => console.info(`${i + 1}. ${c}`));
    window.__bustapSimulationCurls = curls;
    return curls;
  }

  function injectStyles() {
    if (document.getElementById('bustap-sim-styles')) return;
    const style = document.createElement('style');
    style.id = 'bustap-sim-styles';
    style.textContent = `
      #bustap-sim-spotlight {
        position: fixed; z-index: 100000;
        pointer-events: none;
        border-radius: 12px;
        box-shadow: 0 0 0 4px rgba(0,229,160,.55), 0 0 0 9999px rgba(10,15,20,.82);
        transition: top .2s, left .2s, width .2s, height .2s, opacity .2s;
        opacity: 0;
      }
      #bustap-sim-tooltip {
        position: fixed; z-index: 100001;
        max-width: min(420px, calc(100vw - 40px));
        background: var(--surface, #131920);
        border: 1px solid var(--border, #222d3a);
        border-radius: 12px;
        padding: 16px 18px;
        font-family: var(--sans, system-ui);
        color: var(--text, #e8edf3);
        box-shadow: 0 12px 40px rgba(0,0,0,.45);
      }
      #bustap-sim-tooltip h3 {
        font-family: var(--mono, monospace);
        font-size: 0.72rem;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--accent, #00e5a0);
        margin: 0 0 8px 0;
      }
      #bustap-sim-tooltip p { margin: 0; font-size: 0.9rem; line-height: 1.45; color: var(--text, #e8edf3); }
      #bustap-sim-tooltip .hint { margin-top: 12px; font-size: 0.78rem; color: var(--muted, #5a6a7a); }
      #bustap-sim-end {
        position: fixed; z-index: 100002;
        top: 16px; right: 16px;
        font-family: var(--mono, monospace);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 10px 16px;
        border-radius: 10px;
        cursor: pointer;
        background: rgba(248,113,113,.15);
        border: 1px solid rgba(248,113,113,.45);
        color: #fca5a5;
      }
      #bustap-sim-end:hover { background: rgba(248,113,113,.28); }
    `;
    document.head.appendChild(style);
  }

  const INDEX_STEPS = [
    {
      title: 'Simulation started',
      target: 'header',
      body: 'Three sample tap events were sent to the API (one each for routes R1, R2, and R3). The same simulated stop sequences are saved for the San José live map. Open the developer console to copy ready-to-run cURL commands.',
      hint: 'Sample tap stop_ids match the simulated path for each route. Pick a route in the Departures filter to see the full stop list.',
    },
    {
      title: 'Title & clock',
      target: 'header',
      body: 'BusTap shows live departures for your stop. The clock stays local so riders can compare times at a glance.',
      hint: '',
    },
    {
      title: 'Languages',
      target: '#sim-tour-lang',
      body: 'Riders can switch languages instantly. Strings ship with the page—no extra requests when you change language.',
      hint: '',
    },
    {
      title: "Today's stats",
      target: '#sim-tour-stats',
      body: 'Departures today, how many routes have appeared, and the most recent tap summarize activity without digging into the list.',
      hint: '',
    },
    {
      title: 'Live feed & route filter',
      target: '#sim-tour-controls',
      body: 'The green dot means the WebSocket is connected—new RFID taps appear in real time. Use the dropdown to focus on one route.',
      hint: '',
    },
    {
      title: 'Departure cards',
      target: '#departures',
      body: 'Each card is one tap: bus, driver, route, optional stop, time, and whether the bus is leaving or arriving.',
      hint: '',
    },
    {
      title: 'API status',
      target: '#sim-tour-footer',
      body: 'The footer shows whether the backend API is reachable, so you know if the screen is stale because of a network issue.',
      hint: '',
    },
    {
      title: 'Driver dashboard',
      target: '#sim-tour-driver-link',
      body: 'Drivers get a focused view of routes assigned to them. Next, we will open the Driver Dashboard and walk through it.',
      hint: 'Click anywhere to continue to driver.html.',
      preferBottom: true,
    },
  ];

  const DRIVER_STEPS = [
    {
      title: 'Driver Dashboard',
      target: 'header',
      body: 'This page is for operators: it highlights assigned routes, filters events to those routes, and surfaces the same live WebSocket stream in a driver-centric layout.',
      hint: '',
    },
    {
      title: 'Profile & routes',
      target: '#sim-tour-d-profile',
      body: 'Your profile and route pills reflect assignments from the API so drivers only see what matters to their shift.',
      hint: '',
    },
    {
      title: 'Route metrics',
      target: '#sim-tour-d-stats',
      body: 'Counts for assigned routes, taps on those routes, and last activity help supervisors and drivers verify the line is moving.',
      hint: '',
    },
    {
      title: 'Route activity',
      target: '#sim-tour-d-controls',
      body: 'Filter by an assigned route and watch the live indicator—same event stream as the public board, scoped to this driver.',
      hint: '',
    },
    {
      title: 'Your events',
      target: '#departures',
      body: 'Only departures on your routes appear here, which cuts noise when many lines share one depot.',
      hint: '',
    },
    {
      title: 'Connection & footer',
      target: '#sim-tour-d-footer',
      body: 'Health and last-updated mirror the main site so you can trust the dashboard when troubleshooting.',
      hint: '',
    },
    {
      title: 'Done',
      target: null,
      body: 'That is the Driver Dashboard in simulation mode. Use End simulation any time, or refresh any page to exit and return to the main departures experience.',
      hint: 'Click anywhere to finish.',
      preferBottom: true,
    },
  ];

  function getEl(sel) {
    if (!sel) return null;
    return typeof sel === 'string' ? document.querySelector(sel) : sel;
  }

  function createTourUi(steps, options) {
    const { onAfterLastClick, onEndEarly } = options;
    injectStyles();
    let index = 0;
    const spotlight = document.createElement('div');
    spotlight.id = 'bustap-sim-spotlight';
    document.body.appendChild(spotlight);
    const tooltip = document.createElement('div');
    tooltip.id = 'bustap-sim-tooltip';
    document.body.appendChild(tooltip);
    const endBtn = document.createElement('button');
    endBtn.id = 'bustap-sim-end';
    endBtn.type = 'button';
    endBtn.textContent = 'End simulation';
    document.body.appendChild(endBtn);

    function removeUi() {
      spotlight.remove();
      tooltip.remove();
      endBtn.remove();
    }

    function positionSpotlight(el) {
      if (!el || !el.getBoundingClientRect) {
        spotlight.style.opacity = '0';
        return;
      }
      const pad = 10;
      const r = el.getBoundingClientRect();
      spotlight.style.top = `${r.top - pad}px`;
      spotlight.style.left = `${r.left - pad}px`;
      spotlight.style.width = `${r.width + pad * 2}px`;
      spotlight.style.height = `${r.height + pad * 2}px`;
      spotlight.style.opacity = '1';
    }

    function placeTooltip(el, preferBottom) {
      tooltip.style.opacity = '0';
      requestAnimationFrame(() => {
        const margin = 16;
        const tw = tooltip.offsetWidth || 360;
        const th = tooltip.offsetHeight || 140;
        let left = margin + (window.innerWidth - tw) / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
        let top;
        if (el && el.getBoundingClientRect) {
          const r = el.getBoundingClientRect();
          if (preferBottom || r.top < window.innerHeight * 0.38) {
            top = Math.min(r.bottom + margin, window.innerHeight - th - margin) + window.scrollY;
          } else {
            top = Math.max(margin + window.scrollY, r.top + window.scrollY - th - margin);
          }
        } else {
          top = window.innerHeight + window.scrollY - th - margin * 2;
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.opacity = '1';
      });
    }

    function renderStep() {
      const step = steps[index];
      if (!step) return;
      sessionStorage.setItem(SIM_STEP, String(index));
      const el = getEl(step.target);
      positionSpotlight(el);
      tooltip.innerHTML = `
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        <p class="hint">${step.hint || 'Click or tap anywhere to continue.'}</p>
      `;
      placeTooltip(el, step.preferBottom);
      try {
        el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {}
    }

    function onResizeScroll() {
      const step = steps[index];
      const el = step ? getEl(step.target) : null;
      positionSpotlight(el);
      placeTooltip(el, step && step.preferBottom);
    }

    function teardownListeners() {
      window.removeEventListener('resize', onResizeScroll);
      window.removeEventListener('scroll', onResizeScroll, true);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey);
    }

    function onDocClick(e) {
      if (e.target === endBtn || endBtn.contains(e.target)) return;
      index++;
      if (index >= steps.length) {
        teardownListeners();
        removeUi();
        if (typeof onAfterLastClick === 'function') onAfterLastClick();
        return;
      }
      renderStep();
    }

    function onKey(e) {
      if (e.key === 'Escape') endEarly();
    }

    function endEarly() {
      teardownListeners();
      removeUi();
      sessionStorage.removeItem(SIM_ACTIVE);
      sessionStorage.removeItem(SIM_STEP);
      try {
        if (window.BustapRouteSim && typeof window.BustapRouteSim.clearStoredRoutes === 'function') {
          window.BustapRouteSim.clearStoredRoutes();
        }
      } catch (_) {}
      if (typeof onEndEarly === 'function') onEndEarly();
    }

    endBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      endEarly();
    });

    window.addEventListener('resize', onResizeScroll);
    window.addEventListener('scroll', onResizeScroll, true);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    renderStep();
  }

  async function startIndexSimulation(simBtn) {
    if (simBtn) simBtn.disabled = true;
    sessionStorage.setItem(SIM_ACTIVE, 'index');
    await postSampleEventsAndLogCurls();

    setTimeout(() => {
      createTourUi(INDEX_STEPS, {
        onAfterLastClick: () => {
          sessionStorage.removeItem(SIM_STEP);
          sessionStorage.setItem(SIM_ACTIVE, 'driver');
          window.location.href = 'driver.html';
        },
        onEndEarly: () => {
          if (simBtn) simBtn.disabled = false;
        },
      });
    }, 0);
  }

  function startDriverTourFromSession() {
    if (sessionStorage.getItem(SIM_ACTIVE) !== 'driver') return;

    createTourUi(DRIVER_STEPS, {
      onAfterLastClick: () => {
        sessionStorage.removeItem(SIM_ACTIVE);
        sessionStorage.removeItem(SIM_STEP);
      },
      onEndEarly: () => {
        window.location.href = 'index.html';
      },
    });
  }

  const simBtn = document.getElementById('simulation-mode-btn');
  if (simBtn) {
    simBtn.addEventListener('click', () => startIndexSimulation(simBtn));
  }

  if (/\/driver\.html$/i.test(window.location.pathname || '')) {
    startDriverTourFromSession();
  }
})();
