const statusBox = document.getElementById('status');
const list = document.getElementById('events');

function renderEvent(ev) {
  const li = document.createElement('li');
  li.textContent = `${ev.ts} — Bus ${ev.bus_id} (${ev.driver_id}) is ${ev.status}`;
  list.prepend(li);
  statusBox.textContent = `Bus ${ev.bus_id} is ${ev.status}`;
}

async function loadRecent() {
  try {
    const host = window.location.hostname;
    const res = await fetch(`http://${host}:8000/events`);
    const data = await res.json();
    (data.items || []).reverse().forEach(renderEvent);
  } catch (e) {
    console.warn('Failed to load recent', e);
  }
}

function connectWS() {
  const host = window.location.hostname;
  const ws = new WebSocket(`ws://${host}:8000/ws`);
  ws.onmessage = (msg) => {
    const payload = JSON.parse(msg.data);
    if (payload.type === 'event') renderEvent(payload.data);
  };
  ws.onclose = () => setTimeout(connectWS, 1500);
}

loadRecent();
connectWS();
